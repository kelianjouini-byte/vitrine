import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Field, Notice } from './ui';
import { FriendlyError, MIN_PASSWORD, resetPassword, sendPasswordResetCode } from '../lib/api';
import { colors, fonts } from '../lib/theme';

const isEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());

/** Petit lien vert (« Afficher le mot de passe », « Mot de passe oublié ? »). */
function TextLink({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: colors.green, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>{title}</Text>
    </Pressable>
  );
}

/** Champ mot de passe, avec un lien pour l'afficher en clair (moins d'erreurs de frappe). */
function PasswordField({ label, value, onChangeText, isNew }: { label: string; value: string; onChangeText: (v: string) => void; isNew?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <Field
        label={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={isNew ? 'new-password' : 'current-password'}
        hint={isNew ? `Au moins ${MIN_PASSWORD} caractères. Notez-le dans un endroit sûr.` : undefined}
      />
      <TextLink title={visible ? 'Cacher le mot de passe' : 'Afficher le mot de passe'} onPress={() => setVisible((v) => !v)} />
    </View>
  );
}

function useRunner() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.'); } finally { setBusy(false); }
  }
  return { busy, error, setError, run };
}

/**
 * Formulaire e-mail + mot de passe. Sert à créer son compte (1re ouverture), à se connecter
 * (nouveau téléphone) et à protéger un ancien compte « invité » (Réglages, offres).
 */
export function EmailPasswordForm({ intro, submitLabel, onSubmit, isNew, showForgot, onForgotDone }: {
  intro?: string;
  submitLabel: string;
  onSubmit: (email: string, password: string) => Promise<void>;
  /** Création d'un mot de passe (et non saisie d'un mot de passe existant). */
  isNew?: boolean;
  /** Affiche « Mot de passe oublié ? » ; onForgotDone est appelé une fois le nouveau mot de passe enregistré. */
  showForgot?: boolean;
  onForgotDone?: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgot, setForgot] = useState(false);
  const { busy, error, run } = useRunner();
  const tooShort = isNew && password.length < MIN_PASSWORD;

  if (forgot) {
    return <ForgotPasswordForm initialEmail={email} onCancel={() => setForgot(false)} onDone={async () => { await onForgotDone?.(); }} />;
  }

  return (
    <View style={{ gap: 12 }}>
      {intro ? <Body soft size={15}>{intro}</Body> : null}
      <Field label="Votre e-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="Ex. : marie@exemple.fr" />
      <PasswordField label={isNew ? 'Choisissez un mot de passe' : 'Votre mot de passe'} value={password} onChangeText={setPassword} isNew={isNew} />
      <Button title={submitLabel} loading={busy} disabled={!isEmail(email) || !password || tooShort} onPress={() => run(() => onSubmit(email.trim(), password))} />
      {showForgot ? <TextLink title="Mot de passe oublié ?" onPress={() => setForgot(true)} /> : null}
      {error && <Notice tone="red" title={error} />}
    </View>
  );
}

/** Mot de passe oublié : un code à 6 chiffres arrive par e-mail, puis on choisit un nouveau mot de passe. */
function ForgotPasswordForm({ initialEmail, onCancel, onDone }: { initialEmail: string; onCancel: () => void; onDone: () => Promise<void> }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [info, setInfo] = useState<string | null>(null);
  const { busy, error, setError, run } = useRunner();
  // « Renvoyer le code » : une minute d'attente entre deux envois (les e-mails sont limités).
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  return (
    <View style={{ gap: 12 }}>
      <Body style={{ fontWeight: '700' }}>Mot de passe oublié</Body>
      {step === 'email' ? (
        <>
          <Body soft size={15}>Écrivez votre e-mail : vous recevrez un code pour choisir un nouveau mot de passe.</Body>
          <Field label="Votre e-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="Ex. : marie@exemple.fr" />
          <Button title="Recevoir mon code" loading={busy} disabled={!isEmail(email)} onPress={() => run(async () => { await sendPasswordResetCode(email.trim()); setStep('code'); setWait(60); })} />
        </>
      ) : (
        <>
          <Body size={15}>Nous avons envoyé un code à 6 chiffres à {email.trim()}. Regardez aussi dans les courriers indésirables.</Body>
          <Field label="Code reçu" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" placeholder="Ex. : 123456" />
          <PasswordField label="Nouveau mot de passe" value={password} onChangeText={setPassword} isNew />
          <Button
            title="Enregistrer le mot de passe"
            loading={busy}
            disabled={code.length < 6 || password.length < MIN_PASSWORD}
            onPress={() => run(async () => { await resetPassword(email.trim(), code, password); await onDone(); })}
          />
          <Button
            title={wait > 0 ? `Renvoyer le code (dans ${wait} s)` : 'Renvoyer le code'}
            kind="secondary"
            disabled={wait > 0 || busy}
            onPress={() => run(async () => { await sendPasswordResetCode(email.trim()); setWait(60); setInfo('Un nouveau code vient de partir. Regardez aussi dans les courriers indésirables.'); })}
          />
        </>
      )}
      <Button title="Retour" kind="ghost" onPress={() => { setError(null); onCancel(); }} />
      {info && <Notice tone="green" title={info} />}
      {error && <Notice tone="red" title={error} />}
    </View>
  );
}
