import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { BackButton, Body, Button, Card, IconTile, Notice, Title } from '../components/ui';
import { MailIcon, RefreshIcon } from '../components/icons';
import { DeleteAccount } from '../components/DeleteAccount';
import { TrialReportCard } from '../components/TrialReportCard';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { isBackendConfigured } from '../lib/config';
import { accountState, AlreadySubscribedError, billingStatus, FriendlyError, NotConfiguredError, resendTrialEmail } from '../lib/api';
import { daysLeft, frenchDate, isLiveStatus, TRIAL_REPORT_DAYS_BEFORE, type BillingStatus } from '../lib/billing';
import { openExternal } from '../lib/native';

const CONTACT = 'contact@vitrineappli.fr';

/**
 * « Mon abonnement » dans les applis App Store et Google Play.
 * Apple et Google interdisent de vendre un abonnement dans l'appli avec un autre moyen de paiement que le leur,
 * et même d'y mettre un lien ou un bouton vers ce paiement. Ici, donc : aucun prix, aucun bouton « payer ».
 * Le commerçant voit où il en est ; les offres et le lien de paiement lui arrivent par e-mail (fonction trial-emails).
 * blocked : l'essai est terminé sans abonnement. Cet écran est alors le seul de l'appli (avec « Supprimer mon compte »).
 */
export function StoreSubscription({ blocked }: { blocked?: boolean }) {
  const { back, refreshBilling, isPatron } = useApp();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [s, a] = await Promise.all([billingStatus(), accountState().catch(() => null)]);
      setStatus(s);
      setEmail(a?.kind === 'email' ? a.email : null);
    } catch (e) {
      setLoadError(e instanceof NotConfiguredError ? 'Le serveur de Vitrine n\'est pas encore branché.' : e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isBackendConfigured) { setLoading(false); return; }
    refresh();
  }, [refresh]);

  async function resend() {
    setSending(true);
    setError(null);
    setSent(null);
    try {
      setSent(await resendTrialEmail());
    } catch (e) {
      // Déjà payé (par exemple depuis l'e-mail) : on relit l'abonnement, l'appli se rouvre.
      if (e instanceof AlreadySubscribedError) { await check(); return; }
      setError(e instanceof NotConfiguredError ? "L'envoi d'e-mails n'est pas encore branché. Écrivez-nous à " + CONTACT + '.' : e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.');
    } finally {
      setSending(false);
    }
  }

  /** « C'est fait » : on relit l'abonnement ; s'il est en place, l'appli se rouvre toute seule. */
  async function check() {
    setChecking(true);
    await Promise.all([refresh(), refreshBilling()]);
    setChecking(false);
  }

  const sub = status?.subscription ?? null;
  const live = Boolean(sub && isLiveStatus(sub.status));
  const free = status?.access === 'free';
  const trialEnd = status?.trialEndsAt ?? null;
  const trialDays = trialEnd ? daysLeft(trialEnd) : null;
  const ended = blocked || status?.access === 'expired';

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}>
      {blocked ? (
        <View style={{ gap: 10, alignItems: 'center', paddingTop: 12 }}>
          <IconTile size={72} tone="orange"><MailIcon size={36} color={colors.orangeText} /></IconTile>
          <Title size={28} style={{ textAlign: 'center' }}>Votre essai gratuit est terminé</Title>
          <Body soft center>Votre boutique, vos photos et vos posts sont gardés.</Body>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={back} />
          <Title size={26}>Mon abonnement</Title>
        </View>
      )}

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={colors.green} size="large" /></View>
      ) : loadError ? (
        <>
          <Notice tone="red" title="Impossible de charger votre abonnement" text={loadError} />
          <Button title="Réessayer" kind="secondary" onPress={() => { setLoading(true); refresh(); }} />
        </>
      ) : live || free ? (
        <Notice tone="green" title={free ? 'Votre compte Vitrine est offert.' : 'Votre abonnement est actif.'} text={free ? undefined : 'Merci ! Toutes les fonctions de Vitrine sont ouvertes.'} />
      ) : !isPatron ? (
        <Notice tone="orange" title={ended ? "L'essai gratuit de la boutique est terminé" : `Essai gratuit : encore ${trialDays} jour${(trialDays ?? 0) > 1 ? 's' : ''}`} text="L'abonnement est géré par votre patron. Il a reçu toutes les informations par e-mail." />
      ) : (
        <>
          {!ended && trialEnd && (
            <Card style={{ gap: 6, borderColor: colors.green }}>
              <Body style={{ fontWeight: '700' }} size={18}>Essai gratuit : encore {trialDays} jour{(trialDays ?? 0) > 1 ? 's' : ''}</Body>
              <Body soft size={15}>Jusqu'au {frenchDate(trialEnd)}. Toutes les fonctions sont ouvertes.</Body>
            </Card>
          )}
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <IconTile size={48}><MailIcon size={26} color={colors.green} /></IconTile>
              <Body style={{ flex: 1, fontWeight: '700' }} size={17}>
                {ended ? 'Pour continuer, regardez vos e-mails' : 'Pour la suite, tout se passe par e-mail'}
              </Body>
            </View>
            <Body size={16}>
              {ended ? 'Nous vous avons envoyé un e-mail' : `Quelques jours avant la fin de l'essai, nous vous envoyons un e-mail`}
              {email ? ` à ${email}` : ''}. Il vous explique comment continuer avec Vitrine.
            </Body>
            <Body soft size={15}>Vous ne le trouvez pas ? Regardez aussi dans les courriers indésirables (spam).</Body>
            <Button title="Renvoyer l'e-mail" kind={ended ? 'primary' : 'secondary'} icon={<MailIcon size={22} color={ended ? colors.white : colors.green} />} loading={sending} onPress={resend} />
            {sent && <Notice tone="green" title="E-mail envoyé" text={`Regardez votre boîte ${sent} dans une minute.`} />}
            {error && <Notice tone="red" title={error} />}
          </Card>
          {ended && (
            <Button title="C'est fait, actualiser" kind="secondary" icon={<RefreshIcon size={22} color={colors.green} />} loading={checking} onPress={check} />
          )}
          {/* Le bilan des 15 jours, sous l'essentiel. */}
          {status && (ended || (trialDays ?? 99) <= TRIAL_REPORT_DAYS_BEFORE) && <TrialReportCard billing={status} ended={Boolean(ended)} />}
        </>
      )}

      <Body soft size={15} center>Une question ? Écrivez-nous à {CONTACT}</Body>
      {blocked && <DeleteAccount />}
      <Button title="Conditions d'utilisation" kind="ghost" onPress={() => openExternal('https://vitrineappli.fr/conditions/')} />
    </ScrollView>
  );
}
