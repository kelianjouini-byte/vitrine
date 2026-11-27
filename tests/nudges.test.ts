import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_NUDGE_HOUR, NUDGE_HOURS, nudgeCount, nudgeDue, parisDayStart, parisNow, pickNudge, type NudgeContext } from '../supabase/functions/_shared/nudges.ts';
import { encryptPayload, fromB64url, generateVapidKeys, isPushEndpoint, vapidHeader, b64url } from '../supabase/functions/_shared/webpush.ts';

const ctx = (o: Partial<NudgeContext> = {}): NudgeContext => ({
  firstName: 'Christelle', businessName: 'Fleurs de Christelle', businessType: 'fleuriste', city: 'Aix-en-Provence',
  daysSincePost: 1, occasion: null, weekday: 1, seed: 'abc:2026-11-27', recent: [], ...o,
});

test('une grande réserve de textes, sans emoji, sans variable oubliée', () => {
  assert.ok(nudgeCount() >= 100, `seulement ${nudgeCount()} textes`);
  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) {
    for (const type of ['fleuriste', 'boulangerie', 'coiffure', 'caviste', 'boucherie', 'restaurant', 'vetements', 'artisan', 'autre']) {
      const n = pickNudge(ctx({ seed: `s${i}`, businessType: type, weekday: i % 7, daysSincePost: i % 10 }));
      seen.add(n.id);
      assert.doesNotMatch(n.title + n.body, /[{}]/, n.id);
      assert.doesNotMatch(n.title + n.body, /\p{Extended_Pictographic}/u, n.id);
      assert.ok(n.title.length <= 60 && n.body.length <= 140, n.id);
    }
  }
  assert.ok(seen.size >= 45, `seulement ${seen.size} textes différents tirés`);
});

test('même jour = même texte ; jours différents = textes variés', () => {
  assert.deepEqual(pickNudge(ctx()), pickNudge(ctx()));
  const week = new Set(Array.from({ length: 7 }, (_, i) => pickNudge(ctx({ seed: `abc:2026-12-0${i + 1}` })).id));
  assert.ok(week.size >= 5);
});

test('les textes envoyés récemment ne reviennent pas', () => {
  const first = pickNudge(ctx());
  const second = pickNudge(ctx({ recent: [first.id] }));
  assert.notEqual(second.id, first.id);
});

test('une fête toute proche passe en premier', () => {
  const n = pickNudge(ctx({ occasion: { name: 'Noël', inDays: 1 } }));
  assert.equal(n.title, "Noël, c'est demain");
  assert.equal(pickNudge(ctx({ occasion: { name: 'Noël', inDays: 0 } })).title, "C'est Noël aujourd'hui");
});

test('jamais publié : texte de première publication ; long silence : texte doux', () => {
  const never = Array.from({ length: 30 }, (_, i) => pickNudge(ctx({ daysSincePost: null, seed: `n${i}` })).id);
  assert.ok(never.filter((id) => id.startsWith('p-premier')).length >= 10);
  const ids = Array.from({ length: 30 }, (_, i) => pickNudge(ctx({ daysSincePost: 12, seed: `x${i}` })).id);
  assert.ok(ids.some((id) => id === 'p-douceur' || id === 'p-revenir'));
  for (const i of [0, 1, 2]) {
    const n = pickNudge(ctx({ daysSincePost: 4, seed: `y${i}` }));
    if (n.id.startsWith('p-')) assert.match(n.body, /4 jours/);
  }
});

test('sans prénom, jamais de « Bonjour » tout seul', () => {
  for (let i = 0; i < 300; i++) assert.notEqual(pickNudge(ctx({ firstName: '', seed: `z${i}` })).title.trim(), 'Bonjour');
});

test('heure de Paris (hiver et été)', () => {
  assert.deepEqual(parisNow(new Date('2026-11-27T09:30:00Z')), { day: '2026-11-27', weekday: 4, hour: 10 });
  assert.deepEqual(parisNow(new Date('2026-07-05T22:30:00Z')), { day: '2026-07-06', weekday: 0, hour: 0 });
  assert.equal(parisDayStart(new Date('2026-11-27T09:30:00Z')).toISOString(), '2026-11-26T23:00:00.000Z');
  assert.equal(parisDayStart(new Date('2026-07-06T10:00:00Z')).toISOString(), '2026-07-05T22:00:00.000Z');
});

test("envoi : jours d'ouverture, à l'heure choisie, une fois, et pas si déjà publié", () => {
  const h = { hour: 10, closedDays: [6], closedDates: ['2026-12-25'] };
  const free = { sentToday: false, postedToday: false };
  // Vendredi 27 novembre 2026, heures de Paris (UTC+1).
  assert.equal(nudgeDue(h, new Date('2026-11-27T08:05:00Z'), free), 'not_yet'); // 9 h
  assert.equal(nudgeDue(h, new Date('2026-11-27T09:05:00Z'), free), true); // 10 h
  assert.equal(nudgeDue(h, new Date('2026-11-27T10:05:00Z'), free), true); // 11 h : passage manqué, on rattrape
  assert.equal(nudgeDue(h, new Date('2026-11-27T11:05:00Z'), free), 'too_late'); // 12 h : trop tard (boutique peut-être fermée)
  assert.equal(nudgeDue(h, new Date('2026-11-27T09:05:00Z'), { sentToday: true, postedToday: false }), 'already_sent');
  assert.equal(nudgeDue(h, new Date('2026-11-27T09:05:00Z'), { sentToday: false, postedToday: true }), 'already_posted');
  assert.equal(nudgeDue(h, new Date('2026-11-29T09:05:00Z'), free), 'closed_day'); // dimanche fermé
  assert.equal(nudgeDue(h, new Date('2026-12-25T09:05:00Z'), free), 'closed_day'); // Noël fermé
});

test('heure du rappel : 10 h par défaut, choix simples', () => {
  assert.equal(DEFAULT_NUDGE_HOUR, 10);
  assert.ok(NUDGE_HOURS.includes(DEFAULT_NUDGE_HOUR));
});

test('surtout des rappels courts « postez » : au moins 6 jours sur 10', () => {
  let short = 0;
  for (let i = 0; i < 1000; i++) if (pickNudge(ctx({ seed: `k${i}` })).id.startsWith('s-')) short++;
  assert.ok(short >= 600, `${short} / 1000`);
});

test('web push : le message chiffré se déchiffre avec les clés du navigateur (RFC 8291)', async () => {
  // Le « navigateur » : une paire de clés ECDH + un secret.
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const message = JSON.stringify({ title: 'Ça sort du four ?', body: 'Le pain tout juste sorti, c\'est la photo préférée.' });
  const body = await encryptPayload({ endpoint: 'https://fcm.googleapis.com/x', p256dh: b64url(uaPublic), auth: b64url(auth) }, message);

  // Déchiffrement côté navigateur, à la main, selon la norme.
  const salt = body.slice(0, 16);
  assert.equal(new DataView(body.buffer, body.byteOffset).getUint32(16), 4096);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const h = async (k: Uint8Array, d: Uint8Array) => new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), d));
  const te = new TextEncoder();
  const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
  const ikm = await h(await h(auth, shared), cat(te.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await h(salt, ikm);
  const cek = (await h(prk, cat(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await h(prk, cat(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher));
  assert.equal(plain[plain.length - 1], 2);
  assert.equal(new TextDecoder().decode(plain.slice(0, -1)), message);
});

test('web push : la signature VAPID est valide', async () => {
  const keys = await generateVapidKeys();
  assert.equal(fromB64url(keys.publicKey).length, 65);
  const header = await vapidHeader('https://fcm.googleapis.com/fcm/send/abc', keys, 'mailto:contact@vitrineappli.fr', Date.UTC(2026, 10, 27));
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
  assert.ok(m);
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[2])));
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, 'mailto:contact@vitrineappli.fr');
  const pub = await crypto.subtle.importKey('raw', fromB64url(m[4]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
  assert.ok(ok);
});

test("web push : seules les adresses des vrais services de notification sont acceptées", () => {
  assert.ok(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(isPushEndpoint('https://web.push.apple.com/QK0'));
  assert.ok(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'));
  assert.ok(!isPushEndpoint('http://fcm.googleapis.com/x'));
  assert.ok(!isPushEndpoint('https://evil.example.com/googleapis.com'));
  assert.ok(!isPushEndpoint('https://fcm.googleapis.com.evil.com/x'));
});

test("« d'Aix » et « de Marseille »", () => {
  const find = (city: string) => {
    for (let i = 0; i < 500; i++) { const n = pickNudge(ctx({ city, seed: `v${i}`, businessType: 'autre' })); if (n.id === 'g-une-minute') return n.body; }
    return '';
  };
  assert.match(find('Aix-en-Provence'), /hashtags d'Aix-en-Provence/);
  assert.match(find('Marseille'), /hashtags de Marseille/);
});
