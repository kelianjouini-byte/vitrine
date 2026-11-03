import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { Body, Button, Card, Chip, Field, Label, Notice, Title } from '../components/ui';
import { BackIcon } from '../components/icons';
import { NetworkCards } from '../components/NetworkCards';
import { IdentityFields, type Identity } from '../components/IdentityFields';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { tradeLabel } from '../lib/business';
import { isBackendConfigured } from '../lib/config';
import { notificationsSupported } from '../lib/notifications';
import { currentUserId, deleteAccountRemote, FriendlyError, saveBusinessRemote, sendLoginCode, signOut, verifyLoginCode } from '../lib/api';

export function Settings() {
  const { business, prefs, setPrefs, back, resetAll, saveBusiness, refreshConnections } = useApp();
  const b = business!;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteEverything() {
    setDeleting(true);
    setDeleteError(null);
    try {
      if (isBackendConfigured && (await currentUserId())) {
        await deleteAccountRemote();
        await signOut();
      }
      await resetAll();
    } catch (e) {
      setDeleteError(e instanceof FriendlyError ? e.message : 'La suppression a échoué. Réessayez.');
      setDeleting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={back} accessibilityLabel="Retour" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <BackIcon color={colors.text} size={20} />
        </Pressable>
        <Title size={26}>Ma boutique</Title>
      </View>

      <Card style={{ gap: 4 }}>
        <Body style={{ fontWeight: '700' }} size={18}>{b.businessName}</Body>
        <Body soft>{tradeLabel(b)} · {b.city} ({b.postalCode})</Body>
        <Body soft size={14}>Ton : {b.tone}</Body>
      </Card>

      <Label>Carte d'identité de la boutique</Label>
      <IdentityCard />

      <Label>Mon compte</Label>
      <Account onLoggedIn={async () => {
        b.id = await saveBusinessRemote(b);
        await saveBusiness({ ...b });
        await refreshConnections();
      }} />

      <Label>Mes réseaux</Label>
      <NetworkCards />

      <Label>Rappels avant les fêtes</Label>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Body style={{ flex: 1, fontWeight: '600' }}>Recevoir les rappels</Body>
          <Switch value={prefs.enabled} onValueChange={(v) => setPrefs({ ...prefs, enabled: v })} trackColor={{ true: colors.green, false: '#D6DBD5' }} thumbColor="#fff" />
        </View>
        {prefs.enabled && (
          <>
            <Body soft size={14}>Combien de jours avant ?</Body>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[3, 7, 14].map((n) => <Chip key={n} label={`${n} jours`} selected={prefs.daysBefore === n} onPress={() => setPrefs({ ...prefs, daysBefore: n })} />)}
            </View>
            <Body soft size={14}>À quelle heure ?</Body>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[8, 9, 12, 18].map((h) => <Chip key={h} label={`${h}h`} selected={prefs.hour === h} onPress={() => setPrefs({ ...prefs, hour: h })} />)}
            </View>
          </>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>Le lundi : 3 idées pour votre semaine</Body>
            <Body soft size={14}>Un petit rappel avec des idées de photos.</Body>
          </View>
          <Switch value={prefs.weeklyIdeas !== false} onValueChange={(v) => setPrefs({ ...prefs, weeklyIdeas: v })} trackColor={{ true: colors.green, false: '#D6DBD5' }} thumbColor="#fff" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>Le 1er du mois : votre bilan</Body>
            <Body soft size={14}>Un petit rappel quand le bilan du mois est prêt.</Body>
          </View>
          <Switch value={prefs.monthlyReport !== false} onValueChange={(v) => setPrefs({ ...prefs, monthlyReport: v })} trackColor={{ true: colors.green, false: '#D6DBD5' }} thumbColor="#fff" />
        </View>
        {!notificationsSupported && <Body soft size={13}>Les rappels fonctionnent dans l'application sur téléphone.</Body>}
      </Card>

      <Label>État des services</Label>
      <Card style={{ gap: 8 }}>
        <ServiceLine name="Compte en ligne" ok={isBackendConfigured} />
        <ServiceLine name="Écriture par l'IA" ok={isBackendConfigured} hint="dépend du serveur" />
        <ServiceLine name="Publication Instagram / Facebook" ok={isBackendConfigured} hint="dépend du serveur et de Meta" />
      </Card>

      <Label>Mes données</Label>
      <Body soft size={14}>Vos photos et textes vous appartiennent. Vous pouvez tout supprimer à tout moment.</Body>
      {!confirmDelete ? (
        <Button title="Supprimer mon compte et mes données" kind="danger" onPress={() => setConfirmDelete(true)} />
      ) : (
        <Card style={{ gap: 12, borderColor: colors.red }}>
          <Body style={{ fontWeight: '700' }}>Tout supprimer ?</Body>
          <Body soft size={14}>Votre boutique, vos posts et vos connexions seront effacés. Les posts déjà en ligne restent sur Instagram et Facebook.</Body>
          {deleteError && <Notice tone="red" title={deleteError} />}
          <Button title="Oui, tout supprimer" kind="danger" loading={deleting} onPress={deleteEverything} />
          <Button title="Annuler" kind="ghost" onPress={() => setConfirmDelete(false)} />
        </Card>
      )}
    </ScrollView>
  );
}

/** Modifier ce que l'IA sait de la boutique (produits, ce qui la rend unique, clients). */
function IdentityCard() {
  const { business, saveBusiness } = useApp();
  const b = business!;
  const initial: Identity = { specialties: b.specialties ?? '', strengths: b.strengths ?? '', audience: b.audience ?? '', description: b.description ?? '' };
  const [form, setForm] = useState<Identity>(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = (Object.keys(initial) as (keyof Identity)[]).some((k) => (form[k] ?? '').trim() !== (initial[k] ?? '').trim());

  async function submit() {
    setSaving(true);
    setStatus(null);
    const next = { ...b, ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v?.trim() || undefined])) };
    try {
      const id = await saveBusinessRemote(next);
      await saveBusiness({ ...next, id: id ?? next.id });
      setStatus({ ok: true, text: "C'est enregistré. L'IA en tient compte dès maintenant." });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof FriendlyError ? e.message : "L'enregistrement a échoué. Réessayez." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={{ gap: 14 }}>
      <Body soft size={14}>Plus l'IA connaît votre boutique, plus ses textes et ses idées vous ressemblent.</Body>
      <IdentityFields value={form} onChange={(v) => { setForm(v); setStatus(null); }} />
      {status && <Notice tone={status.ok ? 'green' : 'red'} title={status.text} />}
      <Button title="Enregistrer" loading={saving} disabled={!changed} onPress={submit} />
    </Card>
  );
}

function ServiceLine({ name, ok, hint }: { name: string; ok: boolean; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ok ? colors.green : colors.orange }} />
      <Body size={15} style={{ flex: 1 }}>{name}</Body>
      <Body soft size={13}>{ok ? 'Branché' : 'Pas encore configuré'}</Body>
    </View>
  );
}

/** Connexion par code reçu par e-mail (pas de mot de passe à retenir). */
function Account({ onLoggedIn }: { onLoggedIn: () => Promise<void> }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { currentUserId().then(setUserId); }, []);

  if (!isBackendConfigured) {
    return <Notice tone="orange" title="Compte en ligne bientôt disponible" text="Pour l'instant, vos informations restent sur cet appareil." />;
  }
  if (userId) {
    return (
      <Card style={{ gap: 10 }}>
        <Body>Vous êtes connecté.</Body>
        <Button title="Se déconnecter" kind="ghost" onPress={async () => { await signOut(); setUserId(null); }} />
      </Card>
    );
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.'); } finally { setBusy(false); }
  }

  return (
    <Card style={{ gap: 12 }}>
      {step === 'email' ? (
        <>
          <Field label="Votre e-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="marie@exemple.fr" />
          <Button title="Recevoir mon code" loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email)} onPress={() => run(async () => { await sendLoginCode(email.trim()); setStep('code'); })} />
        </>
      ) : (
        <>
          <Body soft size={14}>Nous avons envoyé un code à {email}.</Body>
          <Field label="Code reçu" value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="123456" />
          <Button title="Valider" loading={busy} onPress={() => run(async () => { await verifyLoginCode(email.trim(), code); setUserId(await currentUserId()); await onLoggedIn(); })} />
          <Button title="Changer d'e-mail" kind="ghost" onPress={() => setStep('email')} />
        </>
      )}
      {error && <Notice tone="red" title={error} />}
    </Card>
  );
}
