import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, View } from 'react-native';
import { Body, Button, Card, Chevron, Chip, Field, Label, Notice, Title, BackButton } from '../components/ui';
import { BackIcon } from '../components/icons';
import { NetworkCards } from '../components/NetworkCards';
import { IdentityFields, type Identity } from '../components/IdentityFields';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { toneLabel, tradeLabel } from '../lib/business';
import { isBackendConfigured } from '../lib/config';
import { notificationsSupported } from '../lib/notifications';
import { accountState, FriendlyError, protectAccount, saveBusinessRemote, signOut, type AccountState } from '../lib/api';
import { EmailPasswordForm } from '../components/AccountForms';
import { DeleteAccount } from '../components/DeleteAccount';

/** Pages légales publiques (public/confidentialite, public/conditions), servies par GitHub Pages. */
const LEGAL_SITE = 'https://kelianjouini-byte.github.io/vitrine';

export function Settings() {
  const { business, prefs, setPrefs, back, go, saveBusiness, refreshConnections } = useApp();
  const b = business!;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={back} />
        <Title size={26}>Réglages</Title>
      </View>

      <Label>Ma boutique</Label>
      <Card style={{ gap: 4 }}>
        <Body style={{ fontWeight: '700' }} size={18}>{b.businessName}</Body>
        <Body soft>{tradeLabel(b)} · {b.city} ({b.postalCode})</Body>
        <Body soft size={15}>Ton : {toneLabel(b.tone)}</Body>
      </Card>

      <Label>Mon compte</Label>
      <Account />

      <Label>Mon abonnement</Label>
      <Card onPress={() => go({ name: 'offers' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Body style={{ fontWeight: '700' }}>Voir les offres</Body>
          <Body soft size={15}>15 jours offerts, puis Mensuel 39 € ou Annuel 29 € par mois.</Body>
        </View>
        <Chevron />
      </Card>

      <Label>Mes réseaux</Label>
      <NetworkCards />

      <Label>Carte d'identité de la boutique</Label>
      <IdentityCard />

      <Label>Rappels avant les fêtes</Label>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Body style={{ flex: 1, fontWeight: '600' }}>Recevoir les rappels</Body>
          <Switch value={prefs.enabled} onValueChange={(v) => setPrefs({ ...prefs, enabled: v })} trackColor={{ true: colors.green, false: '#D6DBD5' }} thumbColor="#fff" />
        </View>
        {prefs.enabled && (
          <>
            <Body soft size={15}>Combien de jours avant ?</Body>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[3, 7, 14].map((n) => <Chip key={n} label={`${n} jours`} selected={prefs.daysBefore === n} onPress={() => setPrefs({ ...prefs, daysBefore: n })} />)}
            </View>
            <Body soft size={15}>À quelle heure ?</Body>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[8, 9, 12, 18].map((h) => <Chip key={h} label={`${h}h`} selected={prefs.hour === h} onPress={() => setPrefs({ ...prefs, hour: h })} />)}
            </View>
          </>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>Le lundi : 3 idées pour votre semaine</Body>
            <Body soft size={15}>Un petit rappel avec des idées de photos.</Body>
          </View>
          <Switch value={prefs.weeklyIdeas !== false} onValueChange={(v) => setPrefs({ ...prefs, weeklyIdeas: v })} trackColor={{ true: colors.green, false: '#D6DBD5' }} thumbColor="#fff" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>Le planning : l'idée du jour</Body>
            <Body soft size={15}>Les jours de post ou de story, et quand un post préparé est prêt.</Body>
          </View>
          <Switch value={prefs.planReminders !== false} onValueChange={(v) => setPrefs({ ...prefs, planReminders: v })} trackColor={{ true: colors.green, false: '#D6DBD5' }} thumbColor="#fff" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>Le 1er du mois : votre bilan</Body>
            <Body soft size={15}>Un petit rappel quand le bilan du mois est prêt.</Body>
          </View>
          <Switch value={prefs.monthlyReport !== false} onValueChange={(v) => setPrefs({ ...prefs, monthlyReport: v })} trackColor={{ true: colors.green, false: '#D6DBD5' }} thumbColor="#fff" />
        </View>
        {!notificationsSupported && <Notice tone="orange" title="Sur la version internet, les rappels n'arrivent pas encore" text="Ils arriveront avec l'application Vitrine à installer sur votre téléphone. En attendant, ouvrez Vitrine de temps en temps : l'accueil et le planning vous disent quoi publier." />}
      </Card>

      <Label>Mes données</Label>
      <Body soft size={15}>Vos photos et vos textes vous appartiennent. Vous pouvez tout supprimer à tout moment : votre boutique, vos posts et vos connexions.</Body>
      <DeleteAccount />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button title="Confidentialité" kind="ghost" onPress={() => Linking.openURL(`${LEGAL_SITE}/confidentialite/`)} />
        <Button title="Conditions d'utilisation" kind="ghost" onPress={() => Linking.openURL(`${LEGAL_SITE}/conditions/`)} />
      </View>
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
      <Body soft size={15}>Plus l'IA connaît votre boutique, plus ses textes et ses idées vous ressemblent.</Body>
      <IdentityFields value={form} onChange={(v) => { setForm(v); setStatus(null); }} />
      {status && <Notice tone={status.ok ? 'green' : 'red'} title={status.text} />}
      <Button title="Enregistrer" loading={saving} disabled={!changed} onPress={submit} />
    </Card>
  );
}

/**
 * Mon compte. Un compte « invité » (créé sans e-mail à l'inscription) est protégé en lui ajoutant un e-mail :
 * c'est le MÊME compte, rien n'est perdu. Sans e-mail, on ne propose pas de se déconnecter (le compte serait perdu).
 */
function Account() {
  const { resetAll } = useApp();
  const [state, setState] = useState<AccountState | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  useEffect(() => { accountState().then(setState); }, []);

  if (!isBackendConfigured) {
    return <Notice tone="orange" title="Compte en ligne bientôt disponible" text="Pour l'instant, vos informations restent sur cet appareil." />;
  }
  if (!state) return null;

  if (state.kind === 'email') {
    return (
      <Card style={{ gap: 10 }}>
        <Body style={{ fontWeight: '700' }}>Votre compte est protégé</Body>
        <Body soft size={15}>Adresse : {state.email}. Avec elle et votre mot de passe, vous retrouvez votre boutique sur un autre téléphone.</Body>
        {!confirmOut ? (
          <Button title="Se déconnecter de ce téléphone" kind="ghost" onPress={() => setConfirmOut(true)} />
        ) : (
          <>
            <Body size={15}>Vitrine s'effacera de ce téléphone. Votre boutique et vos posts restent en sécurité : vous les retrouverez avec votre e-mail et votre mot de passe.</Body>
            <Button title="Oui, me déconnecter" kind="secondary" onPress={async () => { await signOut(); await resetAll(); }} />
            <Button title="Annuler" kind="ghost" onPress={() => setConfirmOut(false)} />
          </>
        )}
      </Card>
    );
  }

  return (
    <Card style={{ gap: 12, backgroundColor: 'rgba(252,239,217,0.75)' }}>
      <Body style={{ fontWeight: '700' }} size={18}>Protégez votre compte</Body>
      <EmailPasswordForm
        intro="Ajoutez votre e-mail et un mot de passe : si vous changez de téléphone, vous retrouverez votre boutique, vos posts et vos réseaux."
        submitLabel="Protéger mon compte"
        isNew
        onSubmit={async (email, password) => { await protectAccount(email, password); setState(await accountState()); }}
      />
    </Card>
  );
}
