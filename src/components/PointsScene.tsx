import React, { useEffect, useRef, useState } from 'react';
import { Text, View, type ViewInstance } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Body, Card } from './ui';
import { PersonIcon } from './icons';
import { colors, fonts } from '../lib/theme';
import { frNumber, levelOf, postsLeft } from '../lib/points';
import { buzz, playChime, playCoin, playPop, playWhoosh } from '../lib/sfx';
import type { TeamGoal } from '../lib/team';

/**
 * Les points qui s'envolent (style jeu mobile), validé par Kelian le 23 nov. 2026 :
 * un gros « +10 » apparaît, éclate en 5 pièces qui volent jusqu'aux points de la personne (un « ting » par pièce),
 * puis repartent remplir la barre de l'équipe. À la fin : petite mélodie, étincelles, l'écran tremble et le téléphone vibre.
 *  - who = 'me' : l'employé (ses points dans la pastille en haut, son niveau, la barre de l'équipe) ;
 *  - who = { name } : le patron qui vient de publier le post de cette personne.
 */
export function PointsScene({ who, before, gained, goal, sound, header, footer }: {
  who: 'me' | { name: string };
  /** Points de la personne avant ce gain. */
  before: number;
  gained: number;
  /** Objectif de l'équipe, APRÈS ce gain (null : pas d'objectif en cours). */
  goal: TeamGoal | null;
  sound: boolean;
  header: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const me = who === 'me';
  const animate = gained > 0;
  const per = gained / COINS;
  const goalAfter = goal ? Math.min(goal.points, goal.progress) : 0;
  const goalBefore = goal ? Math.max(0, goalAfter - gained) : 0;
  const withTeam = Boolean(goal) && animate && goalAfter > goalBefore;
  const T = timeline(withTeam);

  // Horloge de l'animation (en secondes), arrêtée à la fin.
  const [t, setT] = useState(animate ? 0 : T.end);
  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    const start = Date.now() + START_DELAY * 1000;
    const tick = () => {
      const now = Math.max(0, (Date.now() - start) / 1000);
      setT(now);
      if (now < T.end) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, T.end]);

  // Sons et vibration, chacun une seule fois, au bon moment.
  const fired = useRef(new Set<string>());
  useEffect(() => {
    if (!animate) return;
    const once = (key: string, at: number, fn: () => void) => { if (t >= at && !fired.current.has(key)) { fired.current.add(key); fn(); } };
    if (sound) {
      once('pop', T.big, playPop);
      once('whoosh', T.burst - 0.02, playWhoosh);
      T.a.forEach((a, i) => once(`a${i}`, a, () => playCoin(i)));
      T.b.forEach((a, i) => once(`b${i}`, a, () => playCoin(COINS + i)));
      once('chime', T.final, playChime);
    }
    once('buzz', T.final, buzz);
  }, [t, animate, sound, T]);

  // Positions des cibles (pastille ou badge, et barre de l'équipe) dans la scène.
  const scene = useRef<ViewInstance>(null);
  const target = useRef<ViewInstance>(null);
  const bar = useRef<ViewInstance>(null);
  const spot = useRef<ViewInstance>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const measure = () => {
    const s = scene.current, a = target.current;
    if (!s || !a) return;
    s.measureInWindow((sx, sy, w, h) => {
      a.measureInWindow((ax, ay, aw, ah) => {
        const done = (bx: number, by: number, bw: number) => {
          const base = { tx: ax - sx + aw / 2, ty: ay - sy + ah / 2, bx, by, bw, w, h, cy: h - 60 };
          if (spot.current) spot.current.measureInWindow((_x, cy, _w, ch) => setPos({ ...base, cy: cy - sy + ch / 2 }));
          else setPos(base);
        };
        if (bar.current) bar.current.measureInWindow((bx, by, bw, bh) => done(bx - sx, by - sy + bh / 2, bw));
        else done(0, 0, 0);
      });
    });
  };

  const gotA = T.a.filter((a) => t >= a).length;
  const gotB = T.b.filter((a) => t >= a).length;
  const personPts = animate ? before + Math.round(gotA * per) : before;
  const teamPts = withTeam ? Math.min(goalAfter, goalBefore + Math.round(gotB * per)) : goalAfter;
  const level = levelOf(personPts);

  // Petits sauts quand une pièce arrive, gros saut à la fin.
  const bump = (arr: number[], size: number) => arr.reduce((m, a) => { const d = t - a; return d >= 0 && d < 0.15 ? Math.max(m, 1 + size * (1 - d / 0.15)) : m; }, 1);
  const fd = t - T.final;
  const finalPop = fd >= 0 && fd < 0.45 ? 1 + 0.3 * Math.sin((Math.PI * fd) / 0.45) : 1;
  const targetScale = Math.max(bump(T.a, 0.14), withTeam ? 1 : finalPop);
  const teamScale = withTeam ? Math.max(bump(T.b, 0.05), 1 + (finalPop - 1) * 0.35) : 1;
  const shake = fd >= 0 && fd < 0.38 ? { x: Math.sin(fd * 95) * 8 * (1 - fd / 0.38), y: Math.cos(fd * 80) * 4 * (1 - fd / 0.38) } : { x: 0, y: 0 };

  const badge = (
    <View ref={target} onLayout={measure} style={{ transform: [{ scale: targetScale }], flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.orange, borderRadius: 999, paddingVertical: 7, paddingLeft: 10, paddingRight: 14, shadowColor: '#B0661A', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }}
      accessible accessibilityLabel={`${frNumber(personPts)} points`}>
      <Star size={18} />
      <Text style={{ color: '#5B3A0C', fontWeight: '800', fontSize: 17, fontFamily: fonts.body }}>{frNumber(personPts)}</Text>
    </View>
  );

  return (
    <View ref={scene} onLayout={measure} style={{ gap: 16, transform: [{ translateX: shake.x }, { translateY: shake.y }] }}>
      {me && <View style={{ alignItems: 'flex-end' }}>{badge}</View>}
      {header}

      {me ? (
        <Card style={{ gap: 10 }}>
          <Body style={{ fontWeight: '700' }}>Niveau {level.number} : {level.name}</Body>
          <Bar value={level.progress} />
          <Body soft size={15}>{level.next ? `Encore ${frNumber(level.next - personPts)} points pour « ${level.nextName} »` : 'Vous êtes au plus haut niveau. Bravo !'}</Body>
        </Card>
      ) : (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
            <PersonIcon size={22} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>{who.name}</Body>
            <Body soft size={14}>Niveau {level.number} · {level.name}</Body>
          </View>
          {badge}
        </Card>
      )}

      {goal && (
        <Card style={{ gap: 8, backgroundColor: 'rgba(253,243,226,0.9)', borderColor: 'rgba(242,182,109,0.6)', borderWidth: 1.5, transform: [{ scale: teamScale }] }}>
          <Text style={{ color: colors.orangeText, fontWeight: '700', fontSize: 12, letterSpacing: 1, fontFamily: fonts.body }}>OBJECTIF DE L'ÉQUIPE</Text>
          <Body style={{ fontWeight: '700' }}>{goal.reward}</Body>
          <View ref={bar} onLayout={measure}><Bar value={teamPts / goal.points} /></View>
          <Body soft size={14}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{frNumber(teamPts)}</Text>
            {` / ${frNumber(goal.points)} points`}
            {teamPts >= goal.points ? ' · objectif atteint !' : ` · encore environ ${postsLeft(goal.points, teamPts)} posts publiés`}
          </Body>
        </Card>
      )}

      {/* Place libre sous les chiffres, où apparaît le gros « +10 » (sans rien cacher). */}
      {animate && <View ref={spot} onLayout={measure} style={{ height: 96 }} />}
      {footer}

      {/* Le gros « +10 » et les pièces, par-dessus la scène. */}
      {animate && pos && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: pos.w, height: pos.h }}>
          <Overlay t={t} T={T} pos={pos} gained={gained} withTeam={withTeam} barFrom={goal ? goalBefore / goal.points : 0} barStep={goal ? per / goal.points : 0} />
        </View>
      )}
    </View>
  );
}

type Pos = { tx: number; ty: number; bx: number; by: number; bw: number; w: number; h: number; cy: number };
const COINS = 5;
const START_DELAY = 0.5;

/** Le déroulé, en secondes. */
function timeline(withTeam: boolean) {
  const big = 0.15, burst = 1.05;
  const a = [0, 1, 2, 3, 4].map((i) => burst + 0.35 + i * 0.12);
  const launch = a[4] + 0.12;
  const b = withTeam ? [0, 1, 2, 3, 4].map((i) => launch + 0.3 + i * 0.12) : [];
  const final = withTeam ? b[4] : a[4];
  return { big, burst, a, launch, b, final, end: final + 1 };
}

const cl = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => 1 - (1 - cl(x)) ** 3;
const back = (x: number) => { const c = 1.7, y = cl(x) - 1; return 1 + (c + 1) * y ** 3 + c * y ** 2; };

function Overlay({ t, T, pos, gained, withTeam, barFrom, barStep }: {
  t: number; T: ReturnType<typeof timeline>; pos: Pos;
  gained: number; withTeam: boolean; barFrom: number; barStep: number;
}) {
  const items: React.ReactNode[] = [];
  const BX = pos.w / 2, BY = pos.cy;
  // Le gros « +10 ».
  if (t >= T.big && t < T.burst + 0.15) {
    const out = t > T.burst - 0.05 ? 1 - (t - (T.burst - 0.05)) / 0.2 : 1;
    const s = back((t - T.big) / 0.35) * cl(out);
    items.push(
      <Text key="big" style={{ position: 'absolute', left: BX - 100, top: BY - 45, width: 200, textAlign: 'center', fontSize: 64, fontWeight: '800', color: '#B0661A', fontFamily: fonts.body, opacity: cl(out), transform: [{ scale: s }], textShadowColor: 'rgba(176,102,26,0.35)', textShadowRadius: 18, textShadowOffset: { width: 0, height: 8 } }}>
        +{gained}
      </Text>,
    );
    if (t < T.big + 0.4) {
      const r = ease((t - T.big) / 0.4);
      items.push(<View key="ring" style={{ position: 'absolute', left: BX - 90 * r, top: BY - 90 * r, width: 180 * r, height: 180 * r, borderRadius: 90 * r, borderWidth: 3, borderColor: colors.orange, opacity: 1 - r }} />);
    }
  }
  // Une pièce sur une courbe, de (x0, y0) à (x1, y1).
  const coin = (key: string, x0: number, y0: number, x1: number, y1: number, st: number, a: number, bend: number) => {
    if (t < st || t >= a) return;
    const e = cl((t - st) / (a - st)) ** 2;
    const cx = (x0 + x1) / 2 + bend, cy = Math.min(y0, y1) - 60;
    const x = (1 - e) ** 2 * x0 + 2 * (1 - e) * e * cx + e * e * x1;
    const y = (1 - e) ** 2 * y0 + 2 * (1 - e) * e * cy + e * e * y1;
    items.push(
      <View key={key} style={{ position: 'absolute', left: x - 15, top: y - 15, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', transform: [{ scale: 1 - 0.35 * e }], shadowColor: '#B0661A', shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}>
        <Star size={17} />
      </View>,
    );
  };
  T.a.forEach((a, i) => coin(`a${i}`, BX + (i - 2) * 26, BY, pos.tx, pos.ty, T.burst + i * 0.04, a, (i - 2) * 40));
  if (withTeam) T.b.forEach((a, i) => coin(`b${i}`, pos.tx, pos.ty, pos.bx + pos.bw * Math.min(1, barFrom + (i + 1) * barStep), pos.by, T.launch + i * 0.12, a, (i - 2) * 18));
  // Étincelles à chaque arrivée sur la personne, et grande gerbe à la fin.
  const sparks = (key: string, x: number, y: number, d0: number, dur: number, n: number, dist: number, size: number) => {
    const d = t - d0;
    if (d < 0 || d >= dur) return;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + 0.3, r = 10 + dist * ease(d / dur);
      items.push(<View key={`${key}${i}`} style={{ position: 'absolute', left: x + Math.cos(ang) * r - size / 2, top: y + Math.sin(ang) * r - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: colors.orange, opacity: 1 - d / dur }} />);
    }
  };
  T.a.forEach((a, i) => sparks(`sa${i}`, pos.tx, pos.ty, a, 0.3, 6, 26, 6));
  const fx = withTeam ? pos.bx + pos.bw * Math.min(1, barFrom + COINS * barStep) : pos.tx;
  const fy = withTeam ? pos.by : pos.ty;
  sparks('sf', fx, fy, T.final, 0.7, 14, 60, 8);
  const fd = t - T.final;
  if (fd >= 0 && fd < 0.5) {
    const r = ease(fd / 0.5);
    items.push(<View key="fring" style={{ position: 'absolute', left: fx - 60 * r, top: fy - 60 * r, width: 120 * r, height: 120 * r, borderRadius: 60 * r, borderWidth: 3, borderColor: colors.orange, opacity: 1 - r }} />);
  }
  return <>{items}</>;
}

export function Star({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z" fill={color} />
    </Svg>
  );
}

/** Barre de progression orange → vert. */
export function Bar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <View style={{ height: 12, borderRadius: 7, backgroundColor: 'rgba(36,51,43,0.1)', overflow: 'hidden' }}>
      <View style={{ width: `${v * 100}%`, height: '100%', borderRadius: 7, backgroundColor: colors.green, ...({ backgroundImage: `linear-gradient(90deg, ${colors.orange}, ${colors.green})` } as object) }} />
    </View>
  );
}

/** Pastille des points (en haut à droite de l'accueil de l'employé). */
export function PointsPill({ points }: { points: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.orange, borderRadius: 999, paddingVertical: 7, paddingLeft: 10, paddingRight: 14 }}
      accessible accessibilityLabel={`${frNumber(points)} points`}>
      <Star size={18} />
      <Text style={{ color: '#5B3A0C', fontWeight: '800', fontSize: 17, fontFamily: fonts.body }}>{frNumber(points)}</Text>
    </View>
  );
}
