import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../lib/theme';

/**
 * Fond « verre dépoli » : des reflets doux vert et pêche qui dérivent lentement,
 * comme une lumière qui bouge derrière une vitrine. Purement décoratif.
 * - Seuls des déplacements sont animés (pilote natif : presque rien pour la batterie).
 * - Si le téléphone demande de réduire les animations, les reflets restent immobiles.
 */
type Blob = {
  id: string;
  color: string;
  /** Centre de départ, en fraction de l'écran. */
  x: number;
  y: number;
  /** Taille, en fraction de la largeur de l'écran. */
  size: number;
  /** Amplitude du mouvement, en fraction de la largeur / hauteur. */
  dx: number;
  dy: number;
  /** Durée d'un aller, en secondes (chaque reflet a son rythme, pour un mouvement naturel). */
  duration: number;
};

const BLOBS: Blob[] = [
  { id: 'g1', color: '#BDE0CB', x: 0.05, y: 0.1, size: 1.2, dx: 0.4, dy: 0.12, duration: 5.5 },
  { id: 'o1', color: '#F5C994', x: 1.0, y: 0.32, size: 1.0, dx: -0.42, dy: 0.14, duration: 6.5 },
  { id: 'g2', color: '#C9E7D4', x: 0.08, y: 0.72, size: 1.25, dx: 0.36, dy: -0.12, duration: 7.5 },
  { id: 'o2', color: '#F3D6B0', x: 0.95, y: 1.0, size: 1.05, dx: -0.38, dy: -0.1, duration: 7 },
];

const useNativeDriver = Platform.OS !== 'web';

/** Vrai si le téléphone demande de réduire les animations : on garde alors tout immobile. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}

function MovingBlob({ blob, width, height, still }: { blob: Blob; width: number; height: number; still: boolean }) {
  const t = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    if (still) { t.setValue(0); return; }
    const leg = (to: number) => Animated.timing(t, { toValue: to, duration: blob.duration * 1000, easing: Easing.inOut(Easing.sin), useNativeDriver });
    const loop = Animated.loop(Animated.sequence([leg(1), leg(0)]));
    loop.start();
    return () => loop.stop();
  }, [t, still, blob.duration]);

  const size = blob.size * width;
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, blob.dx * width] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, blob.dy * height] });
  const scale = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: blob.x * width - size / 2,
        top: blob.y * height - size / 2,
        width: size,
        height: size,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={blob.id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={blob.color} stopOpacity={1} />
            <Stop offset="0.55" stopColor={blob.color} stopOpacity={0.55} />
            <Stop offset="1" stopColor={blob.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#${blob.id})`} />
      </Svg>
    </Animated.View>
  );
}

export function GlassBackground() {
  const { width, height } = useWindowDimensions();
  const still = useReduceMotion();
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, overflow: 'hidden' }]}
      importantForAccessibility="no-hide-descendants"
    >
      {BLOBS.map((b) => <MovingBlob key={b.id} blob={b} width={width} height={height} still={still} />)}
    </View>
  );
}
