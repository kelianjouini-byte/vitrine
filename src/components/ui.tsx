import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native';
import { colors, fonts, glass, glassSurface, greenGradient, radius } from '../lib/theme';
import { BackIcon, CheckIcon, ChevronIcon, VideoIcon } from './icons';
import type { Platform, Post, SocialConnection } from '../lib/types';

export function Title({ children, size = 26, style }: { children: React.ReactNode; size?: number; style?: StyleProp<any> }) {
  return <Text style={[{ fontFamily: fonts.title, fontSize: size, color: colors.text, fontWeight: '600' }, style]}>{children}</Text>;
}

export function Body({ children, soft, size = 16, style, center }: { children: React.ReactNode; soft?: boolean; size?: number; style?: StyleProp<any>; center?: boolean }) {
  return (
    <Text style={[{ fontFamily: fonts.body, fontSize: size, lineHeight: size * 1.4, color: soft ? colors.textSoft : colors.text, textAlign: center ? 'center' : 'left' }, style]}>
      {children}
    </Text>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ title, onPress, kind = 'primary', loading, disabled, icon, style }: { title: string; onPress?: () => void; kind?: BtnKind; loading?: boolean; disabled?: boolean; icon?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const bg = { primary: colors.green, secondary: glass.bgStrong, ghost: 'transparent', danger: glass.bgStrong }[kind];
  const fg = { primary: colors.white, secondary: colors.green, ghost: colors.textSoft, danger: colors.red }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        kind === 'primary' && s.btnPrimary,
        kind !== 'primary' && { backgroundColor: bg },
        { opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        kind === 'secondary' && { borderWidth: 1.5, borderColor: colors.green },
        kind === 'danger' && { borderWidth: 1.5, borderColor: colors.red },
        kind === 'ghost' && { minHeight: 44 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {icon}
          <Text style={{ color: fg, fontSize: kind === 'ghost' ? 16 : 18, fontWeight: '700', fontFamily: fonts.body }}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const inner = <View style={[s.card, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>{inner}</Pressable> : inner;
}

const BADGES = {
  green: [colors.greenSoft, colors.green],
  orange: [colors.orangeSoft, colors.orangeText],
  sand: [colors.sandSoft, colors.sandText],
  grey: ['#EEF1ED', colors.textSoft],
  red: [colors.redSoft, colors.red],
} as const;
export function Badge({ text, tone = 'grey' }: { text: string; tone?: keyof typeof BADGES }) {
  const [bg, fg] = BADGES[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ color: fg, fontSize: 14, fontWeight: '700', fontFamily: fonts.body }}>{text}</Text>
    </View>
  );
}

export function DateTile({ date, tone = 'orange' }: { date: Date; tone?: keyof typeof BADGES }) {
  const [bg, fg] = BADGES[tone];
  const months = ['JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC'];
  return (
    <View style={{ width: 54, height: 58, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: fonts.title, fontSize: 22, fontWeight: '700', color: fg }}>{date.getDate()}</Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: fg, letterSpacing: 0.5 }}>{months[date.getMonth()]}</Text>
    </View>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, fontFamily: fonts.body }}>{label}</Text>
      <TextInput
        placeholderTextColor="#9AA39D"
        {...props}
        style={[s.input, error ? { borderColor: colors.red } : null, props.multiline ? { minHeight: 96, textAlignVertical: 'top', paddingTop: 14 } : null]}
      />
      {error ? <Text style={{ color: colors.red, fontSize: 15 }}>{error}</Text> : hint ? <Text style={{ color: colors.textSoft, fontSize: 15, lineHeight: 21 }}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, borderWidth: 1.5, borderColor: selected ? colors.green : glass.line, backgroundColor: selected ? colors.greenSoft : glass.bgStrong }}
    >
      <Text style={{ fontSize: 16, color: selected ? colors.green : colors.text, fontWeight: selected ? '700' : '500', fontFamily: fonts.body }}>{label}</Text>
    </Pressable>
  );
}

/** Bandeau d'information honnête : fonctionnalité pas encore branchée, erreur, etc. */
export function Notice({ tone = 'orange', title, text }: { tone?: 'orange' | 'red' | 'green'; title: string; text?: string }) {
  const bg = { orange: colors.orangeSoft, red: colors.redSoft, green: colors.greenSoft }[tone];
  const fg = { orange: colors.orangeText, red: colors.red, green: colors.green }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, padding: 14, gap: 4 }}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>{title}</Text>
      {text ? <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21, fontFamily: fonts.body }}>{text}</Text> : null}
    </View>
  );
}

/** Bouton rond « Retour » en verre, en haut des écrans secondaires. */
export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Retour" style={({ pressed }) => [s.round, { opacity: pressed ? 0.8 : 1 }]}>
      <BackIcon color={colors.text} size={20} />
    </Pressable>
  );
}

/** Petite pastille colorée qui porte une icône au trait (cartes de l'accueil, bilan...). */
export function IconTile({ children, tone = 'green', size = 48 }: { children: React.ReactNode; tone?: 'green' | 'orange'; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: tone === 'green' ? 'rgba(220,239,227,0.9)' : 'rgba(252,239,217,0.9)', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </View>
  );
}

/** Flèche discrète au bout d'une carte cliquable. */
export const Chevron = ({ color = colors.green }: { color?: string }) => <ChevronIcon size={20} color={color} />;

const s = StyleSheet.create({
  round: { ...glassSurface, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '700', letterSpacing: 1, color: colors.textSoft, textTransform: 'uppercase', fontFamily: fonts.body },
  btn: { minHeight: 58, borderRadius: radius.md + 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  btnPrimary: { ...greenGradient, boxShadow: '0px 12px 24px -12px rgba(31,95,69,0.6)' },
  card: { ...glassSurface, borderRadius: radius.lg - 2, padding: 16 },
  input: { minHeight: 54, borderRadius: 14, borderWidth: 1.5, borderColor: glass.line, backgroundColor: glass.bgStrong, paddingHorizontal: 16, fontSize: 17, color: colors.text, fontFamily: fonts.body },
});

/** « Publier sur » : Instagram et/ou Facebook (au moins un reste coché). Sert aux posts et aux stories. */
export function PlatformPicker({ value, onChange, connections }: { value: Platform[]; onChange: (p: Platform[]) => void; connections: SocialConnection[] }) {
  const toggle = (p: Platform) => onChange(value.includes(p) ? (value.length > 1 ? value.filter((x) => x !== p) : value) : [...value, p]);
  return (
    <View style={{ gap: 8 }}>
      <Body style={{ fontWeight: '600' }}>Publier sur</Body>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(['instagram', 'facebook'] as Platform[]).map((p) => {
          const on = value.includes(p);
          const conn = connections.find((c) => c.platform === p)?.status === 'connected';
          return (
            <Pressable key={p} onPress={() => toggle(p)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
              style={{ flex: 1, minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: on ? colors.green : glass.line, backgroundColor: on ? colors.greenSoft : glass.bgStrong, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
              {on && <CheckIcon size={16} color={colors.green} />}
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: on ? colors.green : colors.textSoft, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>{p === 'instagram' ? 'Instagram' : 'Facebook'}</Text>
                {!conn && <Text style={{ color: colors.textSoft, fontSize: 14, fontFamily: fonts.body }}>pas encore connecté</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Vignette d'un post ou d'une story (Mes posts, bilan). Une story vidéo n'a pas d'image gardée : on montre une icône. */
export function PostThumb({ post, width, height }: { post: Post; width: number; height: number }) {
  const tag = post.kind === 'story' ? 'Story' : (post.photoCount ?? 1) > 1 ? `${post.photoCount} photos` : null;
  return (
    <View style={{ width, height, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
      {post.imageUri
        ? <Image source={{ uri: post.imageUri }} style={{ width, height }} />
        : <VideoIcon size={28} color={colors.green} />}
      {tag && (
        <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(20,28,23,0.75)', borderRadius: 8, paddingHorizontal: 5 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{tag}</Text>
        </View>
      )}
    </View>
  );
}
