import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, View } from 'react-native';
import { Body, Button, Card, Chevron, Chip, ClosedDaysPicker, Field, IconTile, Label, Notice, Title, BackButton } from '../components/ui';
import { BackIcon, PeopleIcon, PersonIcon, PlusIcon, StoreIcon } from '../components/icons';
import { NetworkCards } from '../components/NetworkCards';
import { IdentityFields, type Identity } from '../components/IdentityFields';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { subscriptionSummary } from '../lib/billing';
import { toneLabel, tradeLabel } from '../lib/business';
import { isBackendConfigured } from '../lib/config';
import { notificationsSupported } from '../lib/notifications';
import { enablePush, nudgeHour, pushState, shopHours, testPush, type PushState } from '../lib/push';
import { nudgeHourChoices } from '../../supabase/functions/_shared/nudges';
import { accountState, FriendlyError, NotConfiguredError, protectAccount, removeShop, saveBusinessRemote, signOut, type AccountState } from '../lib/api';
import { EmailPasswordForm } from '../components/AccountForms';
import { DeleteAccount } from '../components/DeleteAccount';

/** Pages légales publiques (public/confidentialite, public/conditions), servies par GitHub Pages. */
const LEGAL_SITE = 'https://vitrineappli.fr';

export function Settings() {
  const { business, prefs, setPrefs, back, go, saveBusiness, refreshConnections, isPatron, team, billing } = useApp();
  const b = business!;
  const people = team?.teamSize ?? 0;

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

      {isPatron && isBackendConfigured && (
        <>
          <Label>Mon équipe</Label>
          <Card onPress={() => go({ name: 'team' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconTile size={44}><PersonIcon size={24} color={colors.green} /></IconTile>
            <View style={{ flex: 1, gap: 2 }}>
              <Body style={{ fontWeight: '700' }}>{people ? `${people + 1} personnes dans l'équipe` : 'Ajouter un employé'}</Body>
              <Body soft size={15}>Vos employés préparent les posts, vous les validez. Gratuit.</Body>
            </View>
            <Chevron />
          </Card>

          <Label>Mes boutiques</Label>
          <Shops />
        </>
      )}

      <Label>Mon compte</Label>
      <Account />

      {!isPatron && (
        <Body soft size={15}>L'abonnement, les réseaux et la carte d'identité de la boutique sont gérés par votre patron.</Body>
      )}

      {isPatron && <>
      <Label>Mon abonnement</Label>
      <Card onPress={() => go({ name: 'offers' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Body style={{ fontWeight: '700' }}>Voir les offres</Body>
          <Body soft size={15}>{subscriptionSummary(billing)}</Body>
        </View>
        <Chevron />
      </Card>

      <Label>Parler de Vitrine</Label>
      <Card onPress={() => go({ name: 'referral' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconTile size={44}><PeopleIcon size={24} color={colors.green} /></IconTile>
        <View style={{ flex: 1, gap: 2 }}>
          <Body style={{ fontWeight: '700' }}>Recommander Vitrine à un commerçant</Body>
          <Body soft size={15}>À vos collègues commerçants que vous connaissez. Votre code, un message tout prêt et des cartes à donner.</Body>
        </View>
        <Chevron />
      </Card>

      <Label>Mes réseaux</Label>
      <NetworkCards />

      <Label>Carte d'identité de la boutique</Label>
      <IdentityCard />
      </>}

      <DailyNudge />

      <Label>Rappels avant les fêtes</Label>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Body style={{ flex: 1, fontWeight: '600' }}>Recevoir les rappels</Body>
          <Switch value={prefs.enabled} onValueChange={(v) => setPrefs({ ...prefs, enabled: v })} trackColor={{ true: colors.green, false: '#C9D1CB' }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} />
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
          <Switch value={prefs.weeklyIdeas !== false} onValueChange={(v) => setPrefs({ ...prefs, weeklyIdeas: v })} trackColor={{ true: colors.green, false: '#C9D1CB' }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>Le planning : l'idée du jour</Body>
            <Body soft size={15}>Les jours de post ou de story, et quand un post préparé est prêt.</Body>
          </View>
          <Switch value={prefs.planReminders !== false} onValueChange={(v) => setPrefs({ ...prefs, planReminders: v })} trackColor={{ true: colors.green, false: '#C9D1CB' }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>Le 1er du mois : votre bilan</Body>
            <Body soft size={15}>Un petit rappel quand le bilan du mois est prêt.</Body>
          </View>
          <Switch value={prefs.monthlyReport !== false} onValueChange={(v) => setPrefs({ ...prefs, monthlyReport: v })} trackColor={{ true: colors.green, false: '#C9D1CB' }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} />
        </View>
        {people > 0 || !isPatron ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '600' }}>Sons des points</Body>
              <Body soft size={15}>Un petit « ting » quand les points de l'équipe montent.</Body>
            </View>
            <Switch value={prefs.sounds !== false} onValueChange={(v) => setPrefs({ ...prefs, sounds: v })} trackColor={{ true: colors.green, false: '#C9D1CB' }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} accessibilityLabel="Sons des points" />
          </View>
        ) : null}
        {!notificationsSupported && <Notice tone="orange" title="Ces rappels arriveront avec l'application" text="Sur la version internet, seul le petit rappel du jour arrive pour l'instant. Les rappels des fêtes, du planning et du bilan arriveront avec l'application Vitrine à installer." />}
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
  const initial: Identity = { specialties: b.specialties ?? '', strengths: b.strengths ?? '', audience: b.audience ?? '', description: b.description ?? '', employeeCount: b.employeeCount };
  const [form, setForm] = useState<Identity>(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = (Object.keys(initial) as (keyof Identity)[]).some((k) => (form[k] ?? '').trim() !== (initial[k] ?? '').trim()) || form.employeeCount !== initial.employeeCount;

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

/** Les boutiques de l'entreprise : la principale, celles ajoutées (qu'on peut retirer), et « Ajouter une boutique ». */
function Shops() {
  const { team, go, refreshTeam, refreshBilling, business, switchShop } = useApp();
  const shops = team?.shops ?? (business ? [business] : []);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      if (business?.id === id && team?.companyId) await switchShop(team.companyId);
      await removeShop(id);
      await refreshTeam();
      await refreshBilling();
      setConfirm(null);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 4, paddingVertical: 8 }}>
      {shops.map((s, i) => (
        <View key={s.id ?? i} style={{ gap: 8, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(36,51,43,0.08)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconTile size={40}><StoreIcon size={20} color={colors.green} /></IconTile>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '700' }}>{s.businessName}</Body>
              <Body soft size={14}>{s.city}{!s.mainBusinessId && shops.length > 1 ? ' · boutique principale' : ''}</Body>
            </View>
            {s.mainBusinessId && confirm !== s.id && <Button title="Retirer" kind="ghost" onPress={() => setConfirm(s.id!)} />}
          </View>
          {confirm === s.id && (
            <View style={{ gap: 8 }}>
              <Body size={15}>Retirer {s.businessName} ({s.city}) ? Ses posts et ses réglages seront effacés, et elle ne sera plus facturée.</Body>
              <Button title="Oui, retirer cette boutique" kind="danger" loading={busy} onPress={() => remove(s.id!)} />
              <Button title="Annuler" kind="ghost" onPress={() => setConfirm(null)} />
            </View>
          )}
        </View>
      ))}
      {error && <Notice tone="red" title={error} />}
      <Pressable onPress={() => go({ name: 'shopAdd' })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(36,51,43,0.08)' }}>
        <IconTile size={40}><PlusIcon size={20} color={colors.green} /></IconTile>
        <Body style={{ flex: 1, fontWeight: '700', color: colors.green }}>Ajouter une boutique</Body>
        <Chevron />
      </Pressable>
    </Card>
  );
}

/** « Le petit rappel du jour » : oui / non, horaires de la boutique, heure du rappel, et activation sur ce téléphone. */
function DailyNudge() {
  const { business, prefs, setPrefs, saveBusiness, isPatron } = useApp();
  const b = business!;
  const web = !notificationsSupported;
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'green' | 'orange' | 'red'; title: string; text?: string } | null>(null);
  useEffect(() => { if (web) pushState().then(setState).catch(() => setState('unsupported')); }, [web]);

  const on = prefs.dailyNudge !== false;
  const { openHour, closeHour } = shopHours(b);
  const hour = nudgeHour(b, prefs);
  const switchStyle = { trackColor: { true: colors.green, false: '#C9D1CB' }, thumbColor: '#fff', ...({ activeThumbColor: '#fff' } as object) };

  const fail = (e: unknown) => setMsg(e instanceof NotConfiguredError
    ? { tone: 'orange', title: "Le serveur n'est pas encore prêt", text: 'Les notifications ne peuvent pas encore être activées. Réessayez plus tard.' }
    : { tone: 'red', title: "Ça n'a pas marché", text: e instanceof FriendlyError ? e.message : 'Vérifiez votre connexion et réessayez.' });

  const activate = async () => {
    setBusy(true); setMsg(null);
    try {
      const s = await enablePush(b, prefs);
      setState(s);
      if (s === 'on') {
        if (prefs.dailyNudge === false) setPrefs({ ...prefs, dailyNudge: true });
        setMsg({ tone: 'green', title: "C'est activé", text: `Le premier rappel arrivera le prochain jour d'ouverture, vers ${hour} h.` });
      }
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const sendExample = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await testPush();
      setMsg(r ? { tone: 'green', title: 'Exemple envoyé', text: `Regardez vos notifications : « ${r.title} ».` } : { tone: 'orange', title: "Les notifications ne sont pas activées sur ce téléphone" });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <>
      <Label>Le petit rappel du jour</Label>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>Me rappeler de publier</Body>
            <Body soft size={15}>Les jours où vous êtes ouvert, pendant vos horaires. Un message différent chaque jour, avec une idée. Rien si vous avez déjà publié.</Body>
          </View>
          <Switch value={on} onValueChange={(v) => setPrefs({ ...prefs, dailyNudge: v })} {...switchStyle} accessibilityLabel="Me rappeler de publier" />
        </View>
        {on && (
          <>
            {isPatron && (
              <>
                <Body soft size={15}>Vous ouvrez à</Body>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {[7, 8, 9, 10, 11, 14].map((h) => <Chip key={h} label={`${h} h`} selected={openHour === h} onPress={() => saveBusiness({ ...b, openHour: h, closeHour: Math.max(h + 1, closeHour) })} />)}
                </View>
                <Body soft size={15}>Vous fermez à</Body>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {[13, 17, 18, 19, 20, 22].filter((h) => h > openHour).map((h) => <Chip key={h} label={`${h} h`} selected={closeHour === h} onPress={() => saveBusiness({ ...b, openHour, closeHour: h })} />)}
                </View>
                <Body soft size={15}>Vos jours de fermeture</Body>
                <ClosedDaysPicker value={b.closedDays ?? []} onChange={(next) => saveBusiness({ ...b, closedDays: next })} />
              </>
            )}
            <Body soft size={15}>Le rappel arrive à</Body>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {nudgeHourChoices(openHour, closeHour).map((h) => <Chip key={h} label={`${h} h`} selected={hour === h} onPress={() => setPrefs({ ...prefs, nudgeHour: h })} />)}
            </View>
            {web && state === 'off' && <Button title="Activer sur ce téléphone" onPress={activate} loading={busy} />}
            {web && state === 'on' && (
              <>
                <Notice tone="green" title="Activé sur ce téléphone" text={`Prochain rappel vers ${hour} h, un jour où vous êtes ouvert.`} />
                <Button title="M'envoyer un exemple maintenant" kind="secondary" onPress={sendExample} loading={busy} />
              </>
            )}
            {web && state === 'ios-install' && <Notice tone="orange" title="Sur iPhone, une étape avant" text="Dans Safari, touchez le bouton Partager (le carré avec une flèche), puis « Sur l'écran d'accueil ». Ouvrez ensuite Vitrine avec la nouvelle icône et revenez ici." />}
            {web && state === 'denied' && <Notice tone="orange" title="Les notifications sont bloquées" text="Autorisez les notifications pour Vitrine dans les réglages de votre navigateur, puis revenez ici." />}
            {web && state === 'unsupported' && <Notice tone="orange" title="Ce navigateur ne reçoit pas les notifications" text="Ouvrez Vitrine sur votre téléphone, avec Chrome ou Safari." />}
            {msg && <Notice tone={msg.tone} title={msg.title} text={msg.text} />}
          </>
        )}
      </Card>
    </>
  );
}
