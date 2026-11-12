/**
 * Petit texte sur la photo ou la vidéo (stories et Reels) :
 * - OverlayStage : l'aperçu (photo ou vidéo) avec le texte dessiné par-dessus, exactement comme il sera publié ;
 * - OverlayTools : les 4 boutons Texte, Style, Placer, Musique ;
 * - OverlayEditor : la fenêtre « Texte sur la vidéo » (phrase, style, emoji, place).
 * Le texte n'existe que dans le navigateur (version web) ; ailleurs, l'aperçu montre la photo ou la vidéo seule.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform as RNPlatform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Body, Button } from './ui';
import { LetterIcon, MoveIcon, MusicIcon, SparkIcon, TextIcon } from './icons';
import { colors, fonts, radius } from '../lib/theme';
import { DEFAULT_EMOJIS, drawOverlay, emptyOverlay, FRAME, loadOverlayFonts, OVERLAY_MAX_CHARS, OVERLAY_PLACES, OVERLAY_STYLES, type Overlay, type OverlayStyle } from '../lib/overlay';
import { startPreview, videoEditSupported } from '../lib/videoMusic';
import { ensureSession, overlayText, uploadPhoto } from '../lib/api';
import { isBackendConfigured } from '../lib/config';
import { videoFrame } from '../lib/media';
import { tradeById } from '../lib/trades';
import type { Business } from '../lib/types';

const web = RNPlatform.OS === 'web';

export type StageMedia = { kind: 'photo'; uri: string } | { kind: 'video'; uri: string; seconds: number | null };

/**
 * Aperçu vertical (9:16) : photo ou vidéo en boucle, avec le texte posé dessus.
 * Vidéo : le texte apparaît en douceur à chaque tour, comme dans la vidéo publiée.
 * `music` : la musique s'entend pendant l'aperçu (version web).
 */
export function OverlayStage({ media, overlay, music, width = '78%', label }: { media: StageMedia; overlay: Overlay | null; music?: string | null; width?: `${number}%` | number; label?: string }) {
  return (
    <View style={{ alignSelf: 'center', width, maxWidth: 320, aspectRatio: FRAME.width / FRAME.height, borderRadius: radius.md + 4, overflow: 'hidden', backgroundColor: '#141C17' }}>
      {web ? <WebStage media={media} overlay={overlay} music={music ?? null} /> : <NativeStage media={media} />}
      <View style={{ position: 'absolute', top: 8, left: 10, right: 10, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)' }} />
      {label ? (
        <View style={{ position: 'absolute', bottom: 10, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontFamily: fonts.body }}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

function WebStage({ media, overlay, music }: { media: StageMedia; overlay: Overlay | null; music: string | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => { loadOverlayFonts().then(() => setFontsReady(true)); }, []);

  // Le texte est redessiné à chaque image (vidéo) ou à chaque changement (photo).
  useEffect(() => {
    const c = canvasRef.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    let frame = 0;
    const paint = () => {
      g.clearRect(0, 0, c.width, c.height);
      const o = overlayRef.current;
      const v = videoRef.current;
      if (o) drawOverlay(g, o, c.width, c.height, media.kind === 'video' && v ? v.currentTime : null);
      if (media.kind === 'video') frame = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [media, overlay, fontsReady]);

  // Musique de l'aperçu, calée sur la vidéo.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !music || media.kind !== 'video') return;
    const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : media.seconds ?? 15;
    v.currentTime = 0;
    v.play().catch(() => {});
    return startPreview(v, music, duration);
  }, [music, media]);

  const fill = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', objectFit: 'cover' as const };
  return (
    <View style={{ width: '100%', height: '100%' }}>
      {media.kind === 'video'
        ? React.createElement('video', { ref: videoRef, src: media.uri, autoPlay: true, muted: true, loop: true, playsInline: true, style: fill })
        : React.createElement('img', { src: media.uri, alt: 'Votre photo', style: fill })}
      {React.createElement('canvas', { ref: canvasRef, width: FRAME.width, height: FRAME.height, style: { ...fill, pointerEvents: 'none' } })}
    </View>
  );
}

function NativeStage({ media }: { media: StageMedia }) {
  if (media.kind === 'photo') return <Image source={{ uri: media.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel="Votre photo" />;
  return <NativeVideo uri={media.uri} />;
}

function NativeVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" nativeControls={false} />;
}

// ------------------------------------------------------------------ boutons

const TOOL_TONES = {
  green: { bg: colors.greenSoft, fg: colors.green },
  peach: { bg: '#FBE8CF', fg: '#9A6224' },
  rose: { bg: '#F6DCD8', fg: '#A8524A' },
  sage: { bg: '#E3E9E0', fg: '#4E6B57' },
};

function Tool({ label, tone, icon, onPress, a11y }: { label: string; tone: keyof typeof TOOL_TONES; icon: (c: string) => React.ReactNode; onPress: () => void; a11y: string }) {
  const t = TOOL_TONES[tone];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y}
      style={({ pressed }) => ({ flex: 1, minHeight: 66, borderRadius: 18, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', gap: 4, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      {icon(t.fg)}
      <Text style={{ color: t.fg, fontWeight: '700', fontSize: 14, fontFamily: fonts.body }}>{label}</Text>
    </Pressable>
  );
}

const next = <T,>(list: { id: T }[], cur: T) => list[(list.findIndex((x) => x.id === cur) + 1) % list.length].id;

/**
 * Texte : ouvre la fenêtre de modification. Style et Placer : un appui = le style ou la place suivante,
 * on voit tout de suite le résultat sur l'aperçu. Musique : ouvre la liste des musiques.
 */
export function OverlayTools({ overlay, onChange, onEdit, onMusic }: { overlay: Overlay; onChange: (o: Overlay) => void; onEdit: () => void; onMusic?: () => void }) {
  const styleLabel = OVERLAY_STYLES.find((s) => s.id === overlay.style)?.label;
  const placeLabel = OVERLAY_PLACES.find((p) => p.id === overlay.place)?.label;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Tool label="Texte" tone="green" a11y="Modifier le texte sur l'image" icon={(c) => <TextIcon size={22} color={c} />} onPress={onEdit} />
      <Tool label="Style" tone="peach" a11y={`Style du texte : ${styleLabel}. Toucher pour changer`} icon={(c) => <LetterIcon size={22} color={c} />} onPress={() => onChange({ ...overlay, style: next(OVERLAY_STYLES, overlay.style) })} />
      <Tool label="Placer" tone="rose" a11y={`Place du texte : ${placeLabel}. Toucher pour changer`} icon={(c) => <MoveIcon size={22} color={c} />} onPress={() => onChange({ ...overlay, place: next(OVERLAY_PLACES, overlay.place) })} />
      {onMusic && <Tool label="Musique" tone="sage" a11y="Choisir la musique" icon={(c) => <MusicIcon size={22} color={c} />} onPress={onMusic} />}
    </View>
  );
}

// ------------------------------------------------------------------ fenêtre de modification

const STYLE_FONT: Record<OverlayStyle, { fontFamily: string; fontWeight: '700' | '800' | '900'; fontSize: number; upper?: boolean }> = {
  elegant: { fontFamily: 'Fraunces, Georgia, serif', fontWeight: '800', fontSize: 17 },
  moderne: { fontFamily: 'Montserrat, "Arial Black", sans-serif', fontWeight: '900', fontSize: 14, upper: true },
  manuscrit: { fontFamily: 'Caveat, cursive', fontWeight: '700', fontSize: 22 },
};

function Pick({ selected, onPress, children, a11y }: { selected: boolean; onPress: () => void; children: React.ReactNode; a11y: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={a11y}
      style={{ minHeight: 48, minWidth: 52, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
        borderColor: selected ? colors.green : colors.border, backgroundColor: selected ? colors.greenSoft : colors.white }}>
      {children}
    </Pressable>
  );
}

/**
 * « Texte sur la vidéo » : la phrase (modifiable au clavier), le style, l'emoji, la place.
 * `onRewrite` : demande une autre phrase à l'IA (absent si l'IA n'est pas branchée).
 */
export function OverlayEditor({ visible, overlay, emojis, onChange, onClose, onRewrite, rewriting, video }: {
  visible: boolean;
  overlay: Overlay;
  emojis: string[];
  onChange: (o: Overlay) => void;
  onClose: () => void;
  onRewrite?: () => void;
  rewriting?: boolean;
  video?: boolean;
}) {
  const choices = [...new Set([...(overlay.emoji ? [overlay.emoji] : []), ...emojis, ...DEFAULT_EMOJIS])].slice(0, 6);
  const label = (t: string) => <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSoft, fontFamily: fonts.body }}>{t}</Text>;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(20,28,23,0.35)' }} accessibilityLabel="Fermer" />
      <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '86%', width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center' }} />
          <Text style={{ fontFamily: fonts.title, fontSize: 22, fontWeight: '700', color: colors.text }}>{video ? 'Texte sur la vidéo' : 'Texte sur la photo'}</Text>
          <TextInput
            value={overlay.text}
            onChangeText={(text) => onChange({ ...overlay, text })}
            maxLength={OVERLAY_MAX_CHARS}
            placeholder="Ex. : Tout juste sortis du four"
            placeholderTextColor={colors.textSoft}
            accessibilityLabel="Texte écrit sur l'image"
            style={{ borderWidth: 2, borderColor: colors.green, borderRadius: 14, padding: 14, fontSize: 17, color: colors.text, fontFamily: fonts.body }}
          />
          <Body soft size={14}>Une phrase courte se lit mieux : {OVERLAY_MAX_CHARS} lettres au maximum.</Body>
          {onRewrite && (
            <Button title={rewriting ? 'Vitrine cherche une idée...' : 'Une autre idée de texte'} kind="secondary" icon={rewriting ? <ActivityIndicator color={colors.green} /> : <SparkIcon size={18} color={colors.green} />} disabled={rewriting} onPress={onRewrite} />
          )}

          {label('Style')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {OVERLAY_STYLES.map((s) => {
              const f = STYLE_FONT[s.id];
              return (
                <Pick key={s.id} selected={overlay.style === s.id} onPress={() => onChange({ ...overlay, style: s.id })} a11y={`Style ${s.label}`}>
                  <Text style={{ fontFamily: f.fontFamily, fontWeight: f.fontWeight, fontSize: f.fontSize, color: overlay.style === s.id ? colors.green : colors.text }}>{f.upper ? s.label.toUpperCase() : s.label}</Text>
                </Pick>
              );
            })}
          </View>

          {label('Emoji')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {choices.map((e) => (
              <Pick key={e} selected={overlay.emoji === e} onPress={() => onChange({ ...overlay, emoji: e })} a11y={`Emoji ${e}`}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pick>
            ))}
            <Pick selected={!overlay.emoji} onPress={() => onChange({ ...overlay, emoji: null })} a11y="Aucun emoji">
              <Text style={{ fontSize: 15, color: colors.text, fontFamily: fonts.body }}>Aucun</Text>
            </Pick>
          </View>

          {label('Place')}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {OVERLAY_PLACES.map((p) => (
              <Pick key={p.id} selected={overlay.place === p.id} onPress={() => onChange({ ...overlay, place: p.id })} a11y={`Texte en ${p.label.toLowerCase()}`}>
                <Text style={{ fontSize: 16, color: overlay.place === p.id ? colors.green : colors.text, fontWeight: overlay.place === p.id ? '700' : '500', fontFamily: fonts.body }}>{p.label}</Text>
              </Pick>
            ))}
          </View>

          <Button title="C'est bon" onPress={onClose} style={{ marginTop: 6 }} />
          {(overlay.text || overlay.emoji) ? <Button title="Retirer le texte" kind="ghost" onPress={() => { onChange({ ...overlay, text: '', emoji: null }); onClose(); }} /> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** La ligne sous l'aperçu : quelle musique (ou « Sans musique »). */
export function MusicLine({ title }: { title: string | null }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center' }}>
      <MusicIcon size={18} color={title ? colors.green : colors.textSoft} />
      <Text style={{ color: title ? colors.green : colors.textSoft, fontSize: 15, fontWeight: '600', fontFamily: fonts.body }}>{title ? `Musique : ${title}` : 'Sans musique'}</Text>
    </View>
  );
}

// ------------------------------------------------------------------ texte écrit par l'IA

/** Ce qu'il faut pour demander le petit texte : une image (photo, ou image tirée de la vidéo). */
export type OverlaySource = { kind: 'photo'; base64: string } | { kind: 'video'; uri: string } | { kind: 'path'; path: string; video: boolean };

/**
 * Le petit texte d'une story ou d'un Reel : l'IA le propose dès que la photo ou la vidéo est là,
 * le commerçant le change comme il veut. Sans IA (pas branchée, en panne), le texte reste vide
 * et le commerçant peut l'écrire lui-même : jamais de texte inventé « pour faire joli ».
 */
export function useOverlayText(business: Business | null, occasion?: { name: string } | null) {
  const [overlay, setOverlay] = useState<Overlay>(emptyOverlay);
  const [emojis, setEmojis] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const last = useRef<{ path: string; video: boolean } | null>(null);
  const touched = useRef(false);

  const change = useCallback((o: Overlay) => { touched.current = true; setOverlay(o); }, []);

  const fetchText = useCallback(async (path: string, video: boolean, replace: boolean) => {
    setLoading(true);
    setFailed(false);
    try {
      const out = await overlayText({ imagePath: path, video, occasion: occasion ?? null, tradeHint: business ? tradeById(business.businessType)?.aiHint : undefined });
      setEmojis(out.emojis);
      // Le commerçant a déjà écrit son texte pendant l'attente : on ne l'écrase pas (sauf « Une autre idée »).
      setOverlay((o) => (touched.current && !replace ? o : { ...o, text: out.text, emoji: out.emojis[0] ?? o.emoji }));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [business, occasion]);

  /** Demande le texte pour cette photo ou cette vidéo (envoie d'abord une petite image au serveur). */
  const ask = useCallback(async (src: OverlaySource) => {
    if (!videoEditSupported) return;
    touched.current = false;
    setOverlay(emptyOverlay());
    setEmojis([]);
    if (!isBackendConfigured) return setFailed(true);
    setLoading(true);
    try {
      if (!(await ensureSession())) throw new Error('compte');
      let path: string;
      let video = false;
      if (src.kind === 'path') ({ path, video } = src);
      else if (src.kind === 'photo') path = await uploadPhoto(src.base64);
      else {
        const frame = await videoFrame(src.uri);
        if (!frame) throw new Error('image');
        path = await uploadPhoto(frame);
        video = true;
      }
      last.current = { path, video };
      await fetchText(path, video, false);
    } catch {
      setLoading(false);
      setFailed(true);
    }
  }, [fetchText]);

  const rewrite = useCallback(() => {
    if (last.current) fetchText(last.current.path, last.current.video, true);
  }, [fetchText]);

  return { overlay, setOverlay: change, emojis, loading, failed, editing, setEditing, ask, rewrite, canRewrite: !!last.current, supported: videoEditSupported };
}

/** Message sous l'aperçu pendant que l'IA écrit, ou si elle n'a pas pu. */
export function OverlayStatus({ loading, failed, empty }: { loading: boolean; failed: boolean; empty: boolean }) {
  if (loading) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center' }}>
        <ActivityIndicator color={colors.green} />
        <Body soft size={15}>Vitrine écrit le petit texte...</Body>
      </View>
    );
  }
  if (failed && empty) return <Body soft size={15} center>Touchez « Texte » pour écrire un petit mot sur l'image.</Body>;
  return null;
}

/** Pendant la fabrication de la vidéo finale (texte et musique collés dedans). */
export function MakingVideo({ progress }: { progress: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
      <ActivityIndicator size="large" color={colors.green} />
      <Text style={{ fontFamily: fonts.title, fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' }}>Vitrine prépare votre vidéo...</Text>
      <View style={{ width: '80%', height: 10, borderRadius: 5, backgroundColor: colors.greenSoft, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: colors.green }} />
      </View>
      <Body soft center>Le texte et la musique sont ajoutés. Cela prend le temps de la vidéo : gardez l'application ouverte.</Body>
    </View>
  );
}
