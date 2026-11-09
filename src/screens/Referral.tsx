import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform as RNPlatform, ScrollView, Share, Text, View } from 'react-native';
import { BackButton, Badge, Body, Button, Card, IconTile, Label, Notice, Title } from '../components/ui';
import { MessageIcon, PrintIcon, StoreIcon } from '../components/icons';
import { colors, fonts, radius } from '../lib/theme';
import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';

/** Barre de progression : dégradé du vert de Vitrine vers l'orange (couleur unie en secours). */
const progressGradient: ViewStyle = {
  backgroundColor: colors.green,
  ...(Platform.OS === 'web'
    ? ({ backgroundImage: 'linear-gradient(90deg, #3A8463, #F2B66D)' } as ViewStyle)
    : ({ experimental_backgroundImage: 'linear-gradient(90deg, #3A8463, #F2B66D)' } as ViewStyle)),
};
import { useApp } from '../lib/store';
import { isBackendConfigured } from '../lib/config';
import { FriendlyError, NotConfiguredError, referralInfo } from '../lib/api';
import { euros, frenchDate } from '../lib/billing';
import { printableCards, REFERRER_CREDIT_CENTS, shareMessage, type ReferralInfo } from '../lib/referral';

const STATUS: Record<ReferralInfo['referrals'][number]['status'], { text: string; tone: 'green' | 'orange' | 'grey' }> = {
  active: { text: '-10 €', tone: 'green' },
  pending: { text: 'En attente', tone: 'orange' },
  ended: { text: 'Arrêté', tone: 'grey' },
};

/** « Recommander Vitrine » : le code du commerçant, l'envoyer, imprimer des cartes, et ce qu'il y gagne. */
export function Referral() {
  const { back, business } = useApp();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(!isBackendConfigured);
  const [note, setNote] = useState<{ tone: 'green' | 'orange' | 'red'; title: string; text?: string } | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setInfo(await referralInfo());
    } catch (e) {
      if (e instanceof NotConfiguredError) setNotReady(true);
      else setError(e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (isBackendConfigured) refresh(); else setLoading(false); }, [refresh]);

  async function send() {
    if (!info) return;
    const message = shareMessage(info.code);
    setNote(null);
    try {
      if (RNPlatform.OS !== 'web') {
        await Share.share({ message });
        return;
      }
      const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }) : null;
      if (nav?.share) {
        await nav.share({ text: message });
        return;
      }
      await nav?.clipboard?.writeText(message);
      setNote({ tone: 'green', title: 'Message copié', text: 'Collez-le dans un SMS, un message WhatsApp ou un e-mail.' });
    } catch {
      // Le commerçant a fermé la fenêtre de partage : rien à dire.
    }
  }

  function print() {
    if (!info || !business) return;
    if (RNPlatform.OS !== 'web' || typeof window === 'undefined') {
      setNote({ tone: 'orange', title: 'Imprimer depuis un ordinateur', text: 'Ouvrez Vitrine sur un ordinateur relié à une imprimante, puis revenez ici.' });
      return;
    }
    const w = window.open('', '_blank');
    if (!w) {
      setNote({ tone: 'red', title: "La page d'impression n'a pas pu s'ouvrir", text: 'Autorisez les fenêtres de Vitrine dans votre navigateur, puis réessayez.' });
      return;
    }
    w.document.write(printableCards(info.code, business.businessName));
    w.document.close();
  }

  const steps = info ? Math.ceil(info.priceCents / REFERRER_CREDIT_CENTS) : 3;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={back} />
        <Title size={26} style={{ flex: 1 }}>Parlez-en autour de vous</Title>
      </View>
      <Body soft>Vous connaissez d'autres commerçants dans votre village ou votre quartier ? Si Vitrine vous rend service, dites-le-leur. Pour vous remercier, vous payez 10 € de moins chaque mois pour chacun d'eux qui s'abonne, tant qu'il reste.</Body>

      {notReady ? (
        <Notice tone="orange" title="Cette page arrive bientôt" text="Il sera disponible dès que le paiement en ligne sera activé." />
      ) : loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={colors.green} size="large" /></View>
      ) : error || !info ? (
        <>
          <Notice tone="red" title="Impossible de charger votre code" text={error ?? undefined} />
          <Button title="Réessayer" kind="secondary" onPress={() => { setLoading(true); refresh(); }} />
        </>
      ) : (
        <>
          <Card style={{ gap: 12 }}>
            <Body soft size={15} style={{ fontWeight: '600' }}>Votre code</Body>
            <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.green, borderRadius: radius.md, backgroundColor: 'rgba(220,239,227,0.6)', paddingVertical: 14, alignItems: 'center' }}>
              <Text selectable style={{ fontFamily: fonts.title, fontSize: 28, fontWeight: '700', letterSpacing: 2, color: colors.greenDark }}>{info.code}</Text>
            </View>
            <Button title="Envoyer à un collègue" icon={<MessageIcon size={20} color={colors.white} />} onPress={send} />
            <Button title="Imprimer mes cartes" kind="secondary" icon={<PrintIcon size={20} color={colors.green} />} onPress={print} />
            {note && <Notice tone={note.tone} title={note.title} text={note.text} />}
          </Card>

          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Title size={19}>Votre abonnement</Title>
              {info.paying > 0 && <Badge tone="green" text={`${info.paying} recommandé${info.paying > 1 ? 's' : ''}`} />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              {info.paying > 0 && <Text style={{ fontSize: 17, color: colors.textSoft, textDecorationLine: 'line-through', fontFamily: fonts.body }}>{euros(info.priceCents)}</Text>}
              <Text style={{ fontFamily: fonts.title, fontSize: 30, fontWeight: '700', color: colors.green }}>{euros(info.discountedCents)}</Text>
              <Body soft size={15}>par mois</Body>
            </View>
            <View style={{ height: 10, borderRadius: 99, backgroundColor: 'rgba(36,51,43,0.08)', overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${Math.min(100, (info.paying / steps) * 100)}%`, borderRadius: 99, ...progressGradient }} />
            </View>
            <Body soft size={15}>
              {info.untilFree === 0
                ? 'Vitrine est gratuite pour vous, tant que vos filleuls restent abonnés.'
                : `Encore ${info.untilFree} commerçant${info.untilFree > 1 ? 's' : ''} et Vitrine est gratuite.`}
            </Body>
            {!info.subscribed && <Body soft size={15}>Votre réduction démarre dès que vous avez choisi votre offre.</Body>}
          </Card>

          <Label>Vos recommandations</Label>
          {info.referrals.length === 0 ? (
            <Card><Body soft size={15}>Personne pour l'instant. Pensez aux commerçants que vous connaissez : le boulanger, le fleuriste, le coiffeur de votre village...</Body></Card>
          ) : (
            <Card style={{ gap: 4, paddingVertical: 8 }}>
              {info.referrals.map((r, i) => (
                <View key={`${r.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: 'rgba(36,51,43,0.08)' }}>
                  <IconTile size={38}><StoreIcon size={20} color={colors.green} /></IconTile>
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: '600' }}>{r.name}</Body>
                    <Body soft size={14}>
                      {r.status === 'active' ? `Abonné depuis le ${frenchDate(r.since)}` : r.status === 'pending' ? 'Pas encore de premier paiement' : 'A arrêté son abonnement'}
                    </Body>
                  </View>
                  <Badge tone={STATUS[r.status].tone} text={STATUS[r.status].text} />
                </View>
              ))}
            </Card>
          )}

          <Label>Comment ça marche</Label>
          <Card style={{ gap: 10 }}>
            {[
              'Vous parlez de Vitrine à un commerçant que vous connaissez, et vous lui donnez votre code (message ou carte).',
              "Il essaie Vitrine 15 jours gratuitement.",
              "S'il s'abonne, il tape votre code au moment de payer : 10 € de moins pour lui pendant 3 mois.",
              'Pour vous remercier, dès son premier paiement, vous payez 10 € de moins chaque mois.',
            ].map((t, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.white, fontWeight: '700', fontSize: 13, fontFamily: fonts.body }}>{i + 1}</Text>
                </View>
                <Body size={15} style={{ flex: 1 }}>{t}</Body>
              </View>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}
