// Notifications « web push » (navigateur, appli web installée sur l'écran d'accueil).
// Écrit avec le seul WebCrypto (aucune librairie extérieure) en suivant les normes :
//   RFC 8291 (chiffrement du message, « aes128gcm ») et RFC 8292 (signature VAPID du serveur).
// Fichier pur : fonctionne dans Deno (Edge Functions) et dans Node (tests).

export interface PushSubscriptionKeys {
  endpoint: string;
  /** Clé publique du navigateur (base64url, 65 octets). */
  p256dh: string;
  /** Secret d'authentification du navigateur (base64url, 16 octets). */
  auth: string;
}

export interface VapidKeys {
  /** Clé publique brute (base64url, 65 octets) : donnée au navigateur à l'abonnement. */
  publicKey: string;
  /** Clé privée (JWK) : reste sur le serveur. */
  privateJwk: JsonWebKey;
}

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

// deno-lint-ignore no-explicit-any
const buf = (u: Uint8Array): any => u;

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', buf(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, buf(data)));
}

/** Nouvelle paire de clés VAPID (créée une seule fois, gardée dans la base). */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { publicKey: b64url(raw), privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey) };
}

/** En-tête Authorization VAPID : un jeton signé valable 12 h pour le service de notification visé. */
export async function vapidHeader(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const { d, x, y } = keys.privateJwk;
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d, x, y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, buf(enc.encode(`${header}.${claims}`))));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}

/** Chiffre le message pour un navigateur (RFC 8291). Retourne le corps à envoyer. */
export async function encryptPayload(sub: PushSubscriptionKeys, payload: string, opts?: { salt?: Uint8Array; serverKeys?: CryptoKeyPair }): Promise<Uint8Array> {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('bad_subscription_keys');
  const server = opts?.serverKeys ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', server.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', buf(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, server.privateKey, 256));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0 || ua_public || as_public, 32)
  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const salt = opts?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  // Un seul enregistrement : le message suivi du délimiteur 0x02 (dernier enregistrement).
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  if (plain.length > 3900) throw new Error('payload_too_large');
  const aes = await crypto.subtle.importKey('raw', buf(cek), { name: 'AES-GCM' }, false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, aes, buf(plain)));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

export type PushResult = 'ok' | 'gone' | 'failed';

/** Envoie une notification. « gone » = l'abonnement n'existe plus (à supprimer). */
export async function sendWebPush(sub: PushSubscriptionKeys, message: Record<string, unknown>, keys: VapidKeys, opts: { subject: string; ttlSeconds?: number; topic?: string }): Promise<{ result: PushResult; status: number }> {
  const body = await encryptPayload(sub, JSON.stringify(message));
  const headers: Record<string, string> = {
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opts.ttlSeconds ?? 4 * 3600),
    Urgency: 'normal',
    Authorization: await vapidHeader(sub.endpoint, keys, opts.subject),
  };
  if (opts.topic) headers.Topic = opts.topic;
  const res = await fetch(sub.endpoint, { method: 'POST', headers, body: buf(body) });
  await res.body?.cancel();
  if (res.status === 404 || res.status === 410) return { result: 'gone', status: res.status };
  return { result: res.ok ? 'ok' : 'failed', status: res.status };
}

/** Adresses de services de notification acceptées (pour ne jamais faire appeler n'importe quelle adresse au serveur). */
export function isPushEndpoint(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return /(^|\.)(googleapis\.com|push\.apple\.com|mozilla\.com|mozaws\.net|notify\.windows\.com)$/.test(u.hostname);
  } catch {
    return false;
  }
}
