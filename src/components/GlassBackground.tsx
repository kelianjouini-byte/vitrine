import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../lib/theme';

/** Taches de couleur très douces (vert et pêche) derrière les surfaces en verre. Purement décoratif. */
const BLOBS = [
  { id: 'g1', cx: 12, cy: 10, rx: 60, ry: 34, color: '#CFE8D8' },
  { id: 'p1', cx: 96, cy: 30, rx: 50, ry: 28, color: '#F7DDB8' },
  { id: 'g2', cx: 18, cy: 78, rx: 64, ry: 36, color: '#DCEFE3' },
  { id: 'p2', cx: 92, cy: 96, rx: 50, ry: 30, color: '#F5E6D0' },
];

export function GlassBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          {BLOBS.map((b) => (
            <RadialGradient key={b.id} id={b.id} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={b.color} stopOpacity={1} />
              <Stop offset="1" stopColor={b.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={colors.bg} />
        {BLOBS.map((b) => (
          <Ellipse key={b.id} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill={`url(#${b.id})`} />
        ))}
      </Svg>
    </View>
  );
}
