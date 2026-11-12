/**
 * Les choix du parcours « Publier » :
 * - MediaCard : les 2 grandes cartes de l'accueil, Photo (vert) et Vidéo (doré), avec des ondes et un reflet ;
 * - ToggleCard : « Où la publier ? », des cases à cocher (Post, Reel, Story), une ou les deux.
 * Au repos : couleurs pâles. Une fois touchées : couleur pleine, pour qu'on voie bien ce qui est choisi.
 */
import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View, type ViewStyle } from 'react-native';
import { colors, fonts, greenGradient } from '../lib/theme';
import { CameraIcon, CheckIcon, VideoIcon } from './icons';
import { Wave } from './PhotoButton';
import { useReduceMotion } from './GlassBackground';

const useNativeDriver = Platform.OS !== 'web';

const gradient = (fallback: string, css: string): ViewStyle => ({
  backgroundColor: fallback,
  ...(Platform.OS === 'web' ? ({ backgroundImage: css } as ViewStyle) : { experimental_backgroundImage: css }),
});

/** Couleurs : pâle au repos, pleine une fois choisie. */
export const CHOICE_TONES = {
  green: {
    pale: { backgroundColor: colors.greenSoft } as ViewStyle,
    full: greenGradient,
    paleText: colors.green,
    fullText: colors.white,
    paleSub: '#4E7A63',
    wave: '#9FCDB2',
    shadow: 'rgba(47,118,88,0.35)',
  },
  orange: {
    pale: { backgroundColor: '#FBE8CF' } as ViewStyle,
    full: gradient('#E2A865', 'linear-gradient(150deg, #F0C486, #E2A865)'),
    paleText: '#9A6224',
    fullText: '#3B2A1C',
    paleSub: '#9A6224',
    wave: '#EFC58F',
    shadow: 'rgba(226,168,101,0.45)',
  },
} as const;

/** Un reflet de lumière qui traverse la carte de temps en temps. */
function Shine({ delay, still }: { delay: number; still: boolean }) {
  const t = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(1800),
      Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver }),
      Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver }),
    ]));
    const start = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(start); loop.stop(); };
  }, [t, still, delay]);
  if (still) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', top: -20, bottom: -20, width: 60,
        ...gradient('rgba(255,255,255,0.25)', 'linear-gradient(100deg, rgba(255,255,255,0), rgba(255,255,255,0.45), rgba(255,255,255,0))'),
        transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-90, 260] }) }, { rotate: '12deg' }],
      }}
    />
  );
}

/**
 * Carte « Photo » ou « Vidéo » de l'accueil : arrive en rebondissant, ondes autour de l'icône,
 * reflet qui passe. `active` = elle vient d'être touchée (couleur pleine pendant l'ouverture de la caméra).
 */
export function MediaCard({ kind, active, onPress, delay = 0 }: { kind: 'photo' | 'video'; active: boolean; onPress: () => void; delay?: number }) {
  const still = useReduceMotion();
  const tone = CHOICE_TONES[kind === 'photo' ? 'green' : 'orange'];
  const pop = useMemo(() => new Animated.Value(still ? 1 : 0), [still]);
  useEffect(() => {
    if (still) return;
    Animated.spring(pop, { toValue: 1, delay, friction: 5, tension: 70, useNativeDriver }).start();
  }, [pop, delay, still]);
  const title = kind === 'photo' ? 'Photo' : 'Vidéo';
  const sub = kind === 'photo' ? 'Post ou story' : 'Reel ou story';
  return (
    <Animated.View style={{ flex: 1, opacity: pop, transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }, { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title} : ${sub}`}>
        {({ pressed }) => {
          const on = active || pressed;
          return (
            <View style={{
              ...(on ? tone.full : tone.pale),
              borderRadius: 26, paddingVertical: 20, paddingHorizontal: 10, alignItems: 'center', gap: 6, overflow: 'hidden',
              borderWidth: 2, borderColor: on ? 'transparent' : 'rgba(255,255,255,0.95)',
              boxShadow: `0px 12px 26px -12px ${tone.shadow}`,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            }}>
              <Shine delay={delay + 400} still={still} />
              <View style={{ width: 70, height: 70, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <Wave delay={delay} still={still} size={70} radius={35} color={on ? 'rgba(255,255,255,0.9)' : tone.wave} width={2} />
                <Wave delay={delay + 1300} still={still} size={70} radius={35} color={on ? 'rgba(255,255,255,0.9)' : tone.wave} width={2} />
                <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: on ? 'rgba(255,255,255,0.22)' : colors.white, alignItems: 'center', justifyContent: 'center' }}>
                  {kind === 'photo'
                    ? <CameraIcon size={34} color={on ? tone.fullText : tone.paleText} />
                    : <VideoIcon size={34} color={on ? tone.fullText : tone.paleText} />}
                </View>
              </View>
              <Text style={{ color: on ? tone.fullText : tone.paleText, fontSize: 23, fontWeight: '800', fontFamily: fonts.body }}>{title}</Text>
              <Text style={{ color: on ? tone.fullText : tone.paleSub, fontSize: 15, fontFamily: fonts.body, opacity: 0.92 }}>{sub}</Text>
            </View>
          );
        }}
      </Pressable>
    </Animated.View>
  );
}

/**
 * Une case à cocher en grande carte : Post, Reel ou Story. Pâle quand elle n'est pas cochée,
 * couleur pleine avec une coche blanche quand elle l'est. `note` : pourquoi elle est grisée.
 */
export function ToggleCard({ tone: toneId, icon, title, text, on, onPress, disabled, note }: {
  tone: 'green' | 'orange';
  icon: (color: string) => React.ReactNode;
  title: string;
  text: string;
  on: boolean;
  onPress: () => void;
  disabled?: boolean;
  note?: string;
}) {
  const tone = CHOICE_TONES[toneId];
  const active = on && !disabled;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked: active, disabled }} accessibilityLabel={`${title} : ${disabled && note ? note : text}`}
      style={({ pressed }) => ({
        ...(active ? tone.full : tone.pale),
        flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 16, minHeight: 86,
        opacity: disabled ? 0.5 : 1,
        boxShadow: active ? `0px 10px 22px -10px ${tone.shadow}` : 'none',
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}>
      <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: active ? 'rgba(255,255,255,0.25)' : colors.white, alignItems: 'center', justifyContent: 'center' }}>
        {icon(active ? tone.fullText : tone.paleText)}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: active ? tone.fullText : colors.text, fontSize: 20, fontWeight: '800', fontFamily: fonts.body }}>{title}</Text>
        <Text style={{ color: active ? tone.fullText : tone.paleSub, fontSize: 14, fontFamily: fonts.body, opacity: 0.95 }}>{disabled && note ? note : text}</Text>
      </View>
      <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
        borderColor: active ? colors.white : 'rgba(36,51,43,0.2)', backgroundColor: colors.white }}>
        {active && <CheckIcon size={18} color={toneId === 'green' ? colors.green : '#B9772F'} />}
      </View>
    </Pressable>
  );
}
