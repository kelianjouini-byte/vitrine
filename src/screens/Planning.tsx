import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Body, Card, Chevron, Label, PostThumb, Title } from '../components/ui';
import { BackIcon, ChevronIcon } from '../components/icons';
import { colors, fonts, glassSurface, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { upcomingEvents, upcomingHolidays } from '../lib/events';
import { buildWeek, dayKey, DAY_NAMES, postsOfDay, WEEK_GOAL, weekCount, weekday, weekLabel, weekStart, type PlanDay } from '../lib/planning';

export const KIND_BADGE = {
  post: { text: 'Post', tone: 'green' },
  story: { text: 'Story', tone: 'blue' },
  both: { text: 'Post + Story', tone: 'orange' },
  rest: { text: 'Repos', tone: 'grey' },
} as const;

/** Onglet Planning : la semaine du lundi au dimanche, avec le conseil de Vitrine pour chaque jour. */
export function Planning() {
  const { business, posts, planChoices, go, saveBusiness } = useApp();
  const b = business!;
  // 0 = cette semaine. On peut regarder 4 semaines en arrière et préparer 8 semaines à l'avance (Noël, fête des mères...).
  const [offset, setOffset] = useState(0);
  const today = dayKey(new Date());
  const start = useMemo(() => weekStart(new Date(), offset), [offset]);
  const days = useMemo(() => buildWeek(b, start, planChoices, upcomingEvents(b, start, 2, b.postalCode), upcomingHolidays(start, 2, b.postalCode)), [b, start, planChoices]);
  const count = weekCount(posts, days);
  const closed = b.closedDays ?? [];

  const toggleClosed = (i: number) => {
    const next = closed.includes(i) ? closed.filter((x) => x !== i) : [...closed, i].sort();
    saveBusiness({ ...b, closedDays: next });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 32 }}>
      <Title size={30}>Ma semaine</Title>
      <Body soft>Vitrine vous conseille quoi publier. Vous pouvez préparer vos posts à l'avance.</Body>

      <View style={{ ...glassSurface, borderRadius: radius.lg - 2, flexDirection: 'row', alignItems: 'center', padding: 6 }}>
        <WeekArrow dir="prev" disabled={offset <= -4} onPress={() => setOffset(offset - 1)} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, fontFamily: fonts.body }}>{weekLabel(start)}</Text>
          {offset !== 0 && (
            <Pressable onPress={() => setOffset(0)} accessibilityRole="button" hitSlop={8}>
              <Text style={{ fontSize: 14, color: colors.green, fontWeight: '600', fontFamily: fonts.body }}>Revenir à cette semaine</Text>
            </Pressable>
          )}
        </View>
        <WeekArrow dir="next" disabled={offset >= 8} onPress={() => setOffset(offset + 1)} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Counter value={count.post} goal={WEEK_GOAL.post} label="posts cette semaine" />
        <Counter value={count.story} goal={WEEK_GOAL.story} label="stories cette semaine" />
      </View>

      {days.map((d) => (
        <DayRow key={d.key} day={d} isToday={d.key === today} past={d.key < today} posts={postsOfDay(posts, d.key)} onPress={() => go({ name: 'planDay', day: d.key })} />
      ))}

      <Label>Vos jours de fermeture</Label>
      <Card style={{ gap: 10 }}>
        <Body soft size={14}>Vitrine n'y conseille rien : ce sont vos jours de repos.</Body>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {DAY_NAMES.map((n, i) => {
            const on = closed.includes(i);
            return (
              <Pressable key={n} onPress={() => toggleClosed(i)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${n} : boutique fermée`}
                style={{ flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: on ? colors.green : 'rgba(36,51,43,0.10)', backgroundColor: on ? colors.greenSoft : 'rgba(255,255,255,0.82)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontWeight: '700', fontSize: 14, color: on ? colors.green : colors.text, fontFamily: fonts.body }}>{n.slice(0, 3)}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </ScrollView>
  );
}

function WeekArrow({ dir, disabled, onPress }: { dir: 'prev' | 'next'; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={dir === 'prev' ? 'Semaine précédente' : 'Semaine suivante'}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : pressed ? 0.7 : 1 })}>
      {dir === 'prev' ? <BackIcon size={22} color={colors.green} /> : <ChevronIcon size={22} color={colors.green} />}
    </Pressable>
  );
}

function Counter({ value, goal, label }: { value: number; goal: number; label: string }) {
  const done = value >= goal;
  return (
    <View style={{ ...glassSurface, flex: 1, borderRadius: radius.md, padding: 12, gap: 2 }}>
      <Text style={{ fontFamily: fonts.title, fontSize: 20, fontWeight: '700', color: done ? colors.green : colors.text }}>{value} / {goal}</Text>
      <Text style={{ fontSize: 13, color: colors.textSoft, fontFamily: fonts.body }}>{label}</Text>
    </View>
  );
}

function DayRow({ day, isToday, past, posts, onPress }: { day: PlanDay; isToday: boolean; past: boolean; posts: ReturnType<typeof postsOfDay>; onPress: () => void }) {
  const done = posts.find((p) => p.status !== 'scheduled');
  const ready = posts.find((p) => p.status === 'scheduled');
  const shown = ready ?? done;
  const k = KIND_BADGE[day.kind];
  const text = shown
    ? (shown.kind === 'story' ? (shown.mediaType === 'video' ? 'Story vidéo' : 'Story photo') : shown.caption.split('\n')[0].slice(0, 60))
    : day.kind === 'rest'
      ? (day.holiday ? 'Jour férié : fermé' : day.closed ? 'Boutique fermée' : 'Pas besoin de publier ce jour-là')
      : day.idea?.title ?? '';
  const dim = day.kind === 'rest' && !shown;
  return (
    <Card onPress={onPress} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, opacity: dim || (past && !shown) ? 0.7 : 1 }, isToday && { borderWidth: 2, borderColor: colors.green }]}>
      <View style={{ width: 48, alignItems: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: isToday ? colors.green : colors.textSoft, fontFamily: fonts.body }}>{isToday ? 'AUJ.' : DAY_NAMES[weekday(day.date)].slice(0, 3).toUpperCase()}</Text>
        <Text style={{ fontFamily: fonts.title, fontSize: 22, fontWeight: '700', color: isToday ? colors.green : colors.text }}>{day.date.getDate()}</Text>
      </View>
      {shown && <PostThumb post={shown} width={46} height={46} />}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Badge text={shown ? (shown.kind === 'story' ? 'Story' : 'Post') : k.text} tone={shown ? (shown.kind === 'story' ? 'blue' : 'green') : k.tone} />
          {ready && <Badge text="Prévu" tone="green" />}
          {done && <Badge text="Publié" tone="green" />}
          {!shown && day.occasion && <Badge text={day.occasion.name} tone="orange" />}
          {day.holiday && <Badge text="Férié" tone="orange" />}
        </View>
        <Body soft size={14} style={{ lineHeight: 19 }}>{text}</Body>
      </View>
      <Chevron color={colors.textSoft} />
    </Card>
  );
}
