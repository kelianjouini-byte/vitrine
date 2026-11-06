import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Field, Notice } from './ui';
import { FriendlyError } from '../lib/api';

/**
 * Formulaire en 2 temps (e-mail, puis code à 6 chiffres reçu par e-mail), sans mot de passe.
 * Sert à protéger un compte invité (Réglages) et à retrouver son compte sur un nouveau téléphone (inscription).
 */
export function EmailCodeForm({ sendLabel, onSend, onVerify, intro }: {
  sendLabel: string;
  onSend: (email: string) => Promise<void>;
  onVerify: (email: string, code: string) => Promise<void>;
  intro?: string;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // « Renvoyer le code » : une minute d'attente entre deux envois (les e-mails sont limités).
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try { await fn(); } catch (e) { setError(e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.'); } finally { setBusy(false); }
  }

  return (
    <View style={{ gap: 12 }}>
      {step === 'email' ? (
        <>
          {intro ? <Body soft size={15}>{intro}</Body> : null}
          <Field label="Votre e-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="Ex. : marie@exemple.fr" />
          <Button title={sendLabel} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} onPress={() => run(async () => { await onSend(email.trim()); setStep('code'); setWait(60); })} />
        </>
      ) : (
        <>
          <Body size={15}>Nous avons envoyé un code à 6 chiffres à {email.trim()}. Regardez aussi dans les courriers indésirables.</Body>
          <Field label="Code reçu" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" placeholder="Ex. : 123456" />
          <Button title="Valider le code" loading={busy} disabled={code.length < 6} onPress={() => run(() => onVerify(email.trim(), code))} />
          <Button
            title={wait > 0 ? `Renvoyer le code (dans ${wait} s)` : 'Renvoyer le code'}
            kind="secondary"
            disabled={wait > 0 || busy}
            onPress={() => run(async () => { await onSend(email.trim()); setWait(60); setInfo('Un nouveau code vient de partir. Regardez aussi dans les courriers indésirables.'); })}
          />
          <Button title="Changer d'adresse e-mail" kind="ghost" onPress={() => { setStep('email'); setCode(''); setError(null); setInfo(null); }} />
        </>
      )}
      {info && <Notice tone="green" title={info} />}
      {error && <Notice tone="red" title={error} />}
    </View>
  );
}
