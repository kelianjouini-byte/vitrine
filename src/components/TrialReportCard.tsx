import React from 'react';
import { Text, View } from 'react-native';
import { Body, Card, IconTile } from './ui';
import { ChartUpIcon } from './icons';
import { colors, fonts } from '../lib/theme';
import { useApp } from '../lib/store';
import { durationLabel } from '../lib/report';
import { trialSummary, TRIAL_DAYS, type BillingStatus } from '../lib/billing';

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Bilan de l'essai gratuit : ce que le commerçant a VRAIMENT publié pendant ses 15 jours,
 * puis ce que ça donnerait sur un mois au même rythme (présenté comme une projection, jamais comme une promesse).
 * Pas de nombre de vues tant que Meta ne nous donne pas les statistiques : on ne l'invente pas.
 */
export function TrialReportCard({ billing, ended }: { billing: BillingStatus; ended: boolean }) {
  const { posts } = useApp();
  const s = trialSummary(posts, billing.trialStartedAt, billing.trialEndsAt);
  const total = s.posts + s.stories;
  const period = ended ? `vos ${TRIAL_DAYS} jours d'essai` : `vos ${plural(s.days, 'premier jour', 'premiers jours')}`;

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconTile size={44}><ChartUpIcon size={22} color={colors.green} /></IconTile>
        <Body style={{ fontWeight: '700', flex: 1 }} size={18}>Votre bilan de l'essai</Body>
      </View>

      {total === 0 ? (
        <Body size={16}>Pendant {period}, vous n'avez encore rien publié. Une photo suffit : Vitrine écrit le texte pour vous.</Body>
      ) : (
        <>
          <Body size={16}>Pendant {period}, avec Vitrine{'\u00a0'}:</Body>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat value={String(s.posts)} label={s.posts > 1 ? 'posts publiés' : 'post publié'} />
            {s.stories > 0 && <Stat value={String(s.stories)} label={s.stories > 1 ? 'stories' : 'story'} />}
            <Stat value={durationLabel(s.minutesSaved)} label="de travail en moins" />
          </View>
          <View style={{ backgroundColor: colors.greenSoft, borderRadius: 16, padding: 14, gap: 4 }}>
            <Body style={{ fontWeight: '700', color: colors.green }}>Sur un mois, au même rythme</Body>
            <Body size={16}>
              {plural(s.month.posts, 'post', 'posts')}
              {s.month.stories ? `, ${plural(s.month.stories, 'story', 'stories')}` : ''} et {durationLabel(s.month.minutesSaved)} de travail en moins.
            </Body>
          </View>
        </>
      )}
      <Body soft size={15}>Le nombre de personnes touchées s'affichera ici dès qu'Instagram et Facebook nous donneront leurs statistiques.</Body>
    </Card>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontFamily: fonts.title, fontSize: 28, fontWeight: '600', color: colors.text }}>{value}</Text>
      <Body soft size={15}>{label}</Body>
    </View>
  );
}
