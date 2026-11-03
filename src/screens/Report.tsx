import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Body, Button, Card, IconTile, Label, Notice, Title, BackButton } from '../components/ui';
import { BulbIcon, CameraIcon, ChartUpIcon, ClockIcon, EyeIcon, RefreshIcon, StarIcon } from '../components/icons';
import { colors, fonts, glass, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { upcomingEvents } from '../lib/events';
import { tradeById } from '../lib/trades';
import { isBackendConfigured } from '../lib/config';
import { fetchMonthlyAdvice, FriendlyError, NotConfiguredError } from '../lib/api';
import {
  addMonths, basicAdvice, compareMonths, comparisonText, durationLabel, firstMonth, MINUTES_SAVED_PER_POST,
  monthKey, monthLabel, monthName, monthOf, ofMonth, summarize, type Month,
} from '../lib/report';

type AdviceState =
  | { kind: 'loading' }
  | { kind: 'ready'; text: string; basic: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'none' };

/** « Mon bilan » : les vrais chiffres du mois, la comparaison avec le mois d'avant et un conseil. */
export function Report({ initialMonth }: { initialMonth?: Month }) {
  const { business, posts, back, go } = useApp();
  const b = business!;
  const current = monthOf(new Date());
  const oldest = firstMonth(posts);
  const [month, setMonth] = useState<Month>(initialMonth ?? current);
  const s = useMemo(() => summarize(posts, month), [posts, month]);
  const canGoBack = compareMonths(month, oldest) > 0;
  const canGoNext = compareMonths(month, current) < 0;

  // Le conseil porte sur le mois qui suit. On ne le donne que pour le mois en cours ou celui qui vient de finir.
  const adviceFor = addMonths(month, 1);
  const showAdvice = compareMonths(month, addMonths(current, -1)) >= 0;
  const nextOccasions = useMemo(() => {
    // Les occasions à venir du mois suivant (pas celles déjà passées).
    const start = new Date(Math.max(new Date(adviceFor.year, adviceFor.month, 1).getTime(), Date.now()));
    return upcomingEvents(b, start, 1, b.postalCode).filter((e) => e.date.getMonth() === adviceFor.month).slice(0, 4);
  }, [b, adviceFor.year, adviceFor.month]);

  const [advice, setAdvice] = useState<AdviceState>({ kind: 'loading' });
  const loadAdvice = useCallback(async () => {
    if (!showAdvice) return setAdvice({ kind: 'none' });
    const basic = () => setAdvice({ kind: 'ready', basic: true, text: basicAdvice(s, nextOccasions[0] ?? null) });
    if (!isBackendConfigured) return basic();
    setAdvice({ kind: 'loading' });
    try {
      const text = await fetchMonthlyAdvice({
        month: monthKey(s.month), count: s.count, previousCount: s.previousCount, inProgress: s.inProgress, daysLeft: s.daysLeft,
        occasions: nextOccasions, tradeHint: tradeById(b.businessType)?.aiHint,
      });
      setAdvice({ kind: 'ready', text, basic: false });
    } catch (e) {
      if (e instanceof NotConfiguredError) basic();
      else setAdvice({ kind: 'error', message: e instanceof FriendlyError ? e.message : "Le conseil n'a pas pu être chargé. Réessayez." });
    }
  }, [showAdvice, s, nextOccasions, b.businessType]);
  useEffect(() => { loadAdvice(); }, [loadAdvice]);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={back} />
        <Title size={24} style={{ flex: 1 }}>Mon bilan</Title>
        <ChartUpIcon size={26} color={colors.green} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <MonthArrow label="‹" a11y="Mois précédent" enabled={canGoBack} onPress={() => setMonth(addMonths(month, -1))} />
        <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Text style={{ fontFamily: fonts.title, fontSize: 22, fontWeight: '600', color: colors.text, textTransform: 'capitalize' }}>{monthLabel(month)}</Text>
          {s.inProgress && <Badge text="Mois en cours" tone="green" />}
        </View>
        <MonthArrow label="›" a11y="Mois suivant" enabled={canGoNext} onPress={() => setMonth(addMonths(month, 1))} />
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Tile icon={<CameraIcon size={22} color={colors.green} />} value={String(s.count)} label={s.count > 1 ? 'posts publiés' : 'post publié'} />
        <Tile icon={<ClockIcon size={22} color={colors.green} />} value={durationLabel(s.minutesSaved)} label="de temps gagné" hint={`environ ${MINUTES_SAVED_PER_POST} min par post`} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Tile icon={<EyeIcon size={22} color={colors.orangeText} />} tone="orange" soon label="personnes touchées" hint="Vues et nouveaux abonnés, dès qu'Instagram et Facebook seront branchés." />
        <Tile icon={<StarIcon size={22} color={colors.orangeText} />} tone="orange" soon label="meilleur post" hint="Vitrine saura quel post vos clients ont préféré grâce aux statistiques." />
      </View>

      {s.posts.length > 0 && (
        <View style={{ gap: 10 }}>
          <Label>Vos posts {ofMonth(month)}</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {s.posts.map((p) => (
              <Pressable key={p.id} onPress={() => go({ name: 'published', postId: p.id })} accessibilityRole="button" accessibilityLabel={`Voir le post du ${new Date(p.publishedAt ?? p.createdAt).toLocaleDateString('fr-FR')}`}>
                <Image source={{ uri: p.imageUri }} style={{ width: 84, height: 84, borderRadius: radius.sm, backgroundColor: colors.greenSoft }} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      {s.count === 0 && (
        <Body soft center>{s.inProgress ? "Pas encore de post publié ce mois-ci. Une photo suffit pour commencer !" : `Aucun post publié en ${monthName(month)}.`}</Body>
      )}

      <Card style={{ gap: 8 }}>
        <Label>Par rapport à {monthName(s.previous)}</Label>
        <Body>{comparisonText(s)}</Body>
      </Card>

      {advice.kind !== 'none' && (
        <View style={{ backgroundColor: 'rgba(220,239,227,0.8)', borderWidth: 1, borderColor: glass.edge, borderRadius: radius.lg - 2, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BulbIcon size={20} color={colors.green} />
          <Text style={{ color: colors.green, fontWeight: '700', fontSize: 15, fontFamily: fonts.body, flex: 1 }}>
            {s.trend === 'down' ? 'Un petit coup de pouce' : 'Mon conseil'} pour {monthName(adviceFor)}
          </Text>
          </View>
          {advice.kind === 'loading' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color={colors.green} />
              <Body soft>Vitrine prépare votre conseil...</Body>
            </View>
          )}
          {advice.kind === 'ready' && (
            <>
              <Body size={17}>{advice.text}</Body>
              {advice.basic && <Body soft size={13}>Conseil de base : l'IA n'est pas encore branchée.</Body>}
            </>
          )}
          {advice.kind === 'error' && (
            <View style={{ gap: 10 }}>
              <Notice tone="red" title="Nous avons besoin de votre attention" text={advice.message} />
              <Button title="Réessayer" kind="secondary" icon={<RefreshIcon size={20} color={colors.green} />} onPress={loadAdvice} />
            </View>
          )}
        </View>
      )}

      <Body soft size={13} center>Ces chiffres viennent de vos vrais posts publiés avec Vitrine. Le temps gagné est une estimation.</Body>
    </ScrollView>
  );
}

function Tile({ icon, tone, value, label, hint, soon }: { icon: React.ReactNode; tone?: 'green' | 'orange'; value?: string; label: string; hint?: string; soon?: boolean }) {
  return (
    <Card style={{ flex: 1, gap: 6, minHeight: 150 }}>
      <IconTile size={42} tone={tone}>{icon}</IconTile>
      {soon ? <View style={{ alignSelf: 'flex-start' }}><Badge text="Bientôt" tone="orange" /></View> : <Title size={30}>{value}</Title>}
      <Body style={{ fontWeight: '700' }} size={15}>{label}</Body>
      {hint ? <Body soft size={13}>{hint}</Body> : null}
    </Card>
  );
}

function MonthArrow({ label, a11y, enabled, onPress }: { label: string; a11y: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!enabled} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled: !enabled }}
      style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: enabled ? colors.green : glass.line, backgroundColor: glass.bgStrong, alignItems: 'center', justifyContent: 'center', opacity: enabled ? 1 : 0.4 }}>
      <Text style={{ color: enabled ? colors.green : colors.textSoft, fontSize: 26, fontWeight: '700', lineHeight: 28 }}>{label}</Text>
    </Pressable>
  );
}
