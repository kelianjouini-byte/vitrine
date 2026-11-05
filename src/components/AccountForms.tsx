import React, { useState } from 'react';
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

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.'); } finally { setBusy(false); }
  }

  return (
    <View style={{ gap: 12 }}>
      {step === 'email' ? (
        <>
          {intro ? <Body soft size={15}>{intro}</Body> : null}
          <Field label="Votre e-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="Ex. : marie@exemple.fr" />
          <Button title={sendLabel} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} onPress={() => run(async () => { await onSend(email.trim()); setStep('code'); })} />
        </>
      ) : (
        <>
          <Body size={15}>Nous avons envoyé un code à 6 chiffres à {email.trim()}. Regardez aussi dans les courriers indésirables.</Body>
          <Field label="Code reçu" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" placeholder="Ex. : 123456" />
          <Button title="Valider le code" loading={busy} disabled={code.length < 6} onPress={() => run(() => onVerify(email.trim(), code))} />
          <Button title="Changer d'adresse e-mail" kind="ghost" onPress={() => { setStep('email'); setCode(''); setError(null); }} />
        </>
      )}
      {error && <Notice tone="red" title={error} />}
    </View>
  );
}
