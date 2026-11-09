import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform as RNPlatform, Pressable, ScrollView, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { BackButton, Badge, Body, Button, Card, Field, Label, Notice, Title } from '../components/ui';
import { EmailCodeForm } from '../components/AccountForms';
import { DeleteAccount } from '../components/DeleteAccount';
import { TrialReportCard } from '../components/TrialReportCard';
import { colors, fonts } from '../lib/theme';
import { useApp } from '../lib/store';
import { isBackendConfigured } from '../lib/config';
import {
  accountState, AccountNotProtectedError, billingPortalUrl, billingStatus, checkoutUrl, checkReferralCode, confirmProtectAccount,
  FriendlyError, NotConfiguredError, protectAccount, type AccountState,
} from '../lib/api';
import {
  daysLeft, euros, frenchDate, isLiveStatus, offersFrom, statusText, TRIAL_DAYS, TRIAL_REPORT_DAYS_BEFORE, yearlySaving, type BillingStatus, type Offer, type PlanId,
} from '../lib/billing';
import { loadPendingCode, normalizeCode, REFEREE_DISCOUNT_CENTS, REFEREE_DISCOUNT_MONTHS } from '../lib/referral';

const SITE = 'https://kelianjouini-byte.github.io/vitrine/app';

/** Adresse où Stripe renvoie le commerçant après le paiement. */
function returnUrl(): string {
  if (RNPlatform.OS === 'web' && typeof window !== 'undefined') {
    const base = window.location.pathname.replace(/[^/]*$/, ''); // « /vitrine/app/ »
    return `${window.location.origin}${base}abonnement`;
  }
  return `${SITE}/abonnement`;
}

/** Ouvre une page Stripe : même onglet sur la version web, navigateur intégré dans l'appli. */
async function openStripe(url: string, onBack: () => void) {
  if (RNPlatform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url);
  onBack();
}

/**
 * Mon abonnement : les deux offres, l'essai gratuit de 15 jours, puis le paiement par Stripe.
 * blocked : l'essai est terminé sans abonnement. Cet écran est alors le seul de l'appli (avec « Supprimer mon compte »).
 */
export function Offers({ payment, blocked }: { payment?: 'ok' | 'annule'; blocked?: boolean }) {
  const { back, refreshBilling } = useApp();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(!isBackendConfigured);
  const [choice, setChoice] = useState<PlanId>('annual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Code de parrainage (facultatif), tapé ici ou reçu par un lien « ?parrain=… ».
  const [code, setCode] = useState('');
  const [referral, setReferral] = useState<{ code: string; by: string } | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => { loadPendingCode().then((c) => c && setCode(c)); }, []);

  /** Vérifie le code auprès du serveur. Renvoie le code bon, undefined s'il n'y en a pas, ou lève une erreur. */
  async function verifyCode(): Promise<string | undefined> {
    const c = normalizeCode(code);
    if (!c) { setReferral(null); return undefined; }
    if (referral?.code === c) return c;
    setChecking(true);
    setCodeError(null);
    try {
      const by = await checkReferralCode(c);
      setReferral({ code: c, by });
      setCode(c);
      return c;
    } catch (e) {
      setReferral(null);
      setCodeError(e instanceof FriendlyError ? e.message : 'Le code n\'a pas pu être vérifié. Réessayez.');
      throw new FriendlyError('Vérifiez le code de parrainage, ou effacez-le pour continuer sans.');
    } finally {
      setChecking(false);
    }
  }

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setAccount(await accountState());
      const s = await billingStatus();
      setStatus(s);
      if (!s.configured) setNotReady(true);
    } catch (e) {
      if (e instanceof NotConfiguredError) setNotReady(true);
      else setLoadError(e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isBackendConfigured) { setLoading(false); return; }
    refresh();
    // Après le paiement, Stripe prévient le serveur en quelques secondes : on relit une fois de plus.
    if (payment === 'ok') {
      const t = setTimeout(() => { refresh(); refreshBilling(); }, 4000);
      return () => clearTimeout(t);
    }
  }, [refresh, refreshBilling, payment]);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      await openStripe(await fn(), refresh);
    } catch (e) {
      if (e instanceof AccountNotProtectedError) setAccount({ kind: 'guest' });
      else if (e instanceof NotConfiguredError) setNotReady(true);
      else setError(e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.');
    } finally {
      setBusy(false);
    }
  }

  const offers = offersFrom(status);
  const sub = status?.subscription ?? null;
  const live = sub && isLiveStatus(sub.status);
  const trialEnd = status?.trialEndsAt ?? null;
  const trialDays = trialEnd ? daysLeft(trialEnd) : null;
  const chosen = offers.find((o) => o.id === choice)!;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}>
      {blocked ? (
        <View style={{ gap: 6 }}>
          <Title size={28}>Votre essai gratuit est terminé</Title>
          <Body soft>Choisissez une offre pour continuer à publier avec Vitrine. Votre boutique et vos posts sont gardés.</Body>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={back} />
          <Title size={26}>Mon abonnement</Title>
        </View>
      )}

      {payment === 'ok' && <Notice tone="green" title="Merci, c'est enregistré !" text="Votre abonnement est en place. Vous recevrez un reçu par e-mail." />}
      {payment === 'annule' && !live && <Notice tone="orange" title="Paiement annulé" text="Rien n'a été prélevé. Vous pouvez choisir une offre quand vous voulez." />}

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={colors.green} size="large" /></View>
      ) : loadError ? (
        <>
          <Notice tone="red" title="Impossible de charger votre abonnement" text={loadError} />
          <Button title="Réessayer" kind="secondary" onPress={() => { setLoading(true); refresh(); }} />
        </>
      ) : live && sub ? (
        <Card style={{ gap: 12 }}>
          <Notice {...statusText(sub, offers)} />
          {sub.plan === 'annual' && sub.commitmentEndsAt && new Date(sub.commitmentEndsAt) > new Date() && (
            <Body soft size={15}>Engagement d'un an jusqu'au {frenchDate(sub.commitmentEndsAt)}. Ensuite, l'abonnement continue au même prix, mois par mois.</Body>
          )}
          <Button title="Gérer mon paiement" kind="secondary" loading={busy} onPress={() => run(() => billingPortalUrl(returnUrl()))} />
          <Body soft size={15}>Changer de carte bancaire, voir vos factures{sub.plan === 'monthly' ? ' ou arrêter votre abonnement' : ''}.</Body>
          {error && <Notice tone="red" title={error} />}
        </Card>
      ) : (
        <>
          {status && (trialDays === 0 || (trialDays ?? 99) <= TRIAL_REPORT_DAYS_BEFORE) && status.access !== 'free' && (
            <TrialReportCard billing={status} ended={trialDays === 0} />
          )}
          {!blocked && (
            <Card style={{ gap: 6, borderColor: colors.green }}>
              <Body style={{ fontWeight: '700' }} size={18}>{TRIAL_DAYS} jours offerts</Body>
              <Body soft size={15}>
                {trialEnd && trialDays ? `Encore ${trialDays} jour${trialDays > 1 ? 's' : ''} gratuit${trialDays > 1 ? 's' : ''}, jusqu'au ${frenchDate(trialEnd)}.` : trialEnd ? 'Votre essai gratuit est terminé.' : 'Pour les deux offres, sans carte bancaire.'}
              </Body>
            </Card>
          )}

          <Label>Choisissez votre offre</Label>
          {offers.map((o) => (
            <OfferCard key={o.id} offer={o} selected={choice === o.id} saving={o.id === 'annual' ? yearlySaving(offers) : 0} onPress={() => setChoice(o.id)} />
          ))}
          <Body soft size={15}>Tout est compris dans les deux offres : les textes écrits par l'IA, la publication sur Instagram et Facebook, les fêtes de votre métier, le planning et le bilan du mois.</Body>

          {notReady ? (
            <Notice tone="orange" title="Le paiement en ligne arrive bientôt" text="Vous pouvez continuer à utiliser Vitrine en attendant. Vous pourrez choisir votre offre ici." />
          ) : account?.kind === 'guest' ? (
            <Card style={{ gap: 12 }}>
              <Body style={{ fontWeight: '700' }}>D'abord, protégez votre compte</Body>
              <EmailCodeForm
                intro="Ajoutez votre e-mail : il sert à vous envoyer vos reçus et à retrouver votre boutique si vous changez de téléphone."
                sendLabel="Recevoir mon code"
                onSend={protectAccount}
                onVerify={async (email, code) => { await confirmProtectAccount(email, code); setAccount(await accountState()); }}
              />
            </Card>
          ) : (
            <>
              <Card style={{ gap: 10 }}>
                <Field
                  label="Code de parrainage (facultatif)"
                  value={code}
                  onChangeText={(t) => { setCode(t); if (normalizeCode(t) !== referral?.code) setReferral(null); setCodeError(null); }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="Par exemple FLEURS-7K4Q9"
                  error={codeError ?? undefined}
                  hint="Un commerçant vous a donné son code ? Tapez-le ici."
                />
                {referral ? (
                  <>
                    <Notice tone="green" title={`Code de ${referral.by}`} text={`${euros(REFEREE_DISCOUNT_CENTS)} de moins pendant vos ${REFEREE_DISCOUNT_MONTHS} premiers mois.`} />
                    <View style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Body soft size={15}>Les {REFEREE_DISCOUNT_MONTHS} premiers mois</Body>
                        <Body size={15} style={{ fontWeight: '700' }}>{euros(chosen.priceCents - REFEREE_DISCOUNT_CENTS)} par mois</Body>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Body soft size={15}>Ensuite</Body>
                        <Body size={15} style={{ fontWeight: '700' }}>{euros(chosen.priceCents)} par mois</Body>
                      </View>
                    </View>
                  </>
                ) : normalizeCode(code) ? (
                  <Button title="Vérifier le code" kind="secondary" loading={checking} onPress={() => { verifyCode().catch(() => {}); }} />
                ) : null}
              </Card>
              <Button title={`Choisir l'offre ${chosen.name}`} loading={busy} onPress={() => run(async () => checkoutUrl(choice, returnUrl(), await verifyCode()))} />
              <Body soft size={15} center>
                {trialEnd && trialDays ? `Vous ne payez rien avant le ${frenchDate(trialEnd)}. ` : ''}Paiement sécurisé par carte bancaire avec Stripe.
              </Body>
              {error && <Notice tone="red" title={error} />}
            </>
          )}
        </>
      )}

      <Body soft size={15} center>TVA non applicable, art. 293 B du CGI.</Body>
      {blocked && <DeleteAccount />}
      <Button title="Conditions d'utilisation" kind="ghost" onPress={() => Linking.openURL(`${SITE}/conditions/`)} />
    </ScrollView>
  );
}

function OfferCard({ offer, selected, saving, onPress }: { offer: Offer; selected: boolean; saving: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      <Card style={{ gap: 6, borderWidth: selected ? 2.5 : 1, borderColor: selected ? colors.green : 'rgba(36,51,43,0.12)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: selected ? colors.green : colors.textSoft, alignItems: 'center', justifyContent: 'center' }}>
            {selected && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.green }} />}
          </View>
          <Body style={{ fontWeight: '700', flex: 1 }} size={20}>{offer.name}</Body>
          {saving > 0 && <Badge tone="orange" text={`${euros(saving)} d'économie par an`} />}
        </View>
        <Text style={{ fontFamily: fonts.title, fontSize: 32, fontWeight: '600', color: colors.text }}>
          {euros(offer.priceCents)}<Text style={{ fontFamily: fonts.body, fontSize: 17, fontWeight: '500', color: colors.textSoft }}> par mois</Text>
        </Text>
        <Body soft size={15}>
          {offer.commitmentMonths ? `Engagement ${offer.commitmentMonths === 12 ? "d'un an" : `de ${offer.commitmentMonths} mois`}, payé chaque mois.` : 'Sans engagement. Vous arrêtez quand vous voulez.'}
        </Body>
      </Card>
    </Pressable>
  );
}
