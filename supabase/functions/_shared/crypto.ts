// Chiffrement AES-256-GCM des jetons Meta au repos.
// TOKEN_ENCRYPTION_KEY = 32 octets encodés en base64 (voir README : `openssl rand -base64 32`).
import { env, HttpError } from './http.ts';

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key(): Promise<CryptoKey> {
  const raw = env('TOKEN_ENCRYPTION_KEY');
  if (!raw) throw new HttpError(503, 'meta_not_configured', 'La connexion Meta n\'est pas encore configurée.');
  return crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(plain)));
  return `v1:${b64(iv)}:${b64(ct)}`;
}

export async function decrypt(blob: string): Promise<string> {
  const [v, iv, ct] = blob.split(':');
  if (v !== 'v1') throw new Error('format de jeton inconnu');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(), unb64(ct));
  return new TextDecoder().decode(pt);
}

/** Signature HMAC (paramètre `state` OAuth, anti-CSRF). */
export async function hmac(data: string, secret: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)));
  return b64(sig).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
