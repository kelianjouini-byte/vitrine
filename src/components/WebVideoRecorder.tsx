/**
 * Caméra vidéo intégrée, pour la version web (téléphone dans le navigateur), qui filme en plusieurs bouts.
 * - Rester appuyé = ça filme ; lâcher = un bout est gardé. L'image rétrécit et va se ranger en bas à gauche
 *   avec un petit chiffre (1, 2, 3...). Un simple « toc » sur le bouton marche aussi : ça filme jusqu'au toc suivant.
 * - « Effacer » retire le dernier bout. « Valider » est possible dès le premier bout.
 * - Le temps total ne dépasse jamais la limite des Reels : la caméra s'arrête toute seule.
 * Pourquoi notre propre caméra : sur iPhone, le bouton « filmer » du navigateur enregistre en très basse qualité.
 * Ici on filme en haute définition (jusqu'à 1080p).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { colors, fonts, greenGradient } from '../lib/theme';
import { BackIcon, CheckIcon, ImageIcon, RefreshIcon, UndoIcon } from './icons';
import { recordingMimeType } from '../lib/videoMusic';
import { clock, limitLabel, MIN_CLIP_SECONDS, TAP_SECONDS, usedSeconds } from '../lib/montage';

export type Clip = { uri: string; seconds: number; thumb: string | null };

type Props = {
  maxSeconds: number;
  onDone: (clips: Clip[]) => void;
  onCancel: () => void;
  /** Caméra refusée ou absente : on propose la galerie à la place. */
  onError: (message: string) => void;
  /** Bouton « Galerie » : prendre des vidéos déjà filmées. */
  onLibrary?: () => void;
};

const THUMB = { left: 22, bottom: 46, w: 54, h: 96 };
const FLY_MS = 650;
const noSelect = { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' } as object;

export function WebVideoRecorder({ maxSeconds, onDone, onCancel, onError, onLibrary }: Props) {
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [recording, setRecording] = useState(false);
  const [tapMode, setTapMode] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [caption, setCaption] = useState<string | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [box, setBox] = useState({ w: 390, h: 844 });
  const [flying, setFlying] = useState<Clip | null>(null);

  const videoEl = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const stoppedAt = useRef(0);
  const pressedAt = useRef(0);
  const recRef = useRef(false);
  const tapRef = useRef(false);
  const clipsRef = useRef<Clip[]>([]);
  clipsRef.current = clips;

  const fly = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const bump = useRef(new Animated.Value(0)).current;
  const captionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Aperçu en direct de la caméra (un vrai <video> du navigateur, posé dans la vue). Il reste ouvert entre les bouts.
  useEffect(() => {
    let cancelled = false;
    const v = videoEl.current;
    if (!v) return;
    setReady(false);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !recordingMimeType()) throw new Error('unsupported');
        const s = await openCamera(facing);
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        v.srcObject = s;
        await v.play().catch(() => {});
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        const denied = (e as { name?: string })?.name === 'NotAllowedError';
        onError(denied
          ? "Vitrine n'a pas le droit d'utiliser la caméra. Autorisez-la dans les réglages du navigateur, ou choisissez une vidéo dans la galerie."
          : "La caméra n'a pas pu s'ouvrir sur ce navigateur. Filmez avec l'appareil photo du téléphone, puis choisissez la vidéo dans la galerie.");
      }
    })();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    if (captionTimer.current) clearTimeout(captionTimer.current);
  }, []);

  const used = usedSeconds(clips) + (flying ? flying.seconds : 0) + (recording ? elapsed : 0);
  const full = usedSeconds(clips) >= maxSeconds - MIN_CLIP_SECONDS;

  function say(text: string) {
    setCaption(text);
    if (captionTimer.current) clearTimeout(captionTimer.current);
    captionTimer.current = setTimeout(() => setCaption(null), 1600);
  }

  /** Petite image du dernier instant filmé : c'est elle qui file se ranger en bas à gauche. */
  function snapshot(): string | null {
    const v = videoEl.current;
    if (!v || !v.videoWidth) return null;
    try {
      const c = document.createElement('canvas');
      c.width = 216;
      c.height = 384;
      const g = c.getContext('2d')!;
      const r = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
      const w = v.videoWidth * r;
      const h = v.videoHeight * r;
      if (facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); }
      g.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h);
      return c.toDataURL('image/jpeg', 0.7);
    } catch {
      return null;
    }
  }

  function start() {
    const s = stream.current;
    const mimeType = recordingMimeType();
    if (!s || !mimeType || recRef.current || full) return;
    const chunks: Blob[] = [];
    // 12 Mbit/s : la qualité d'une vidéo filmée avec l'appareil photo du téléphone.
    const r = new MediaRecorder(s, { mimeType, videoBitsPerSecond: 12_000_000 });
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      const seconds = Math.min(((stoppedAt.current || Date.now()) - startedAt.current) / 1000, maxSeconds - usedSeconds(clipsRef.current));
      if (seconds < MIN_CLIP_SECONDS || !chunks.length) return;
      const thumb = snapshot();
      const clip: Clip = { uri: URL.createObjectURL(new Blob(chunks, { type: mimeType.split(';')[0] })), seconds, thumb };
      land(clip);
    };
    recorder.current = r;
    startedAt.current = Date.now();
    stoppedAt.current = 0;
    r.start(500);
    recRef.current = true;
    setRecording(true);
    setElapsed(0);
    setConfirmQuit(false);
    const before = usedSeconds(clipsRef.current);
    timer.current = setInterval(() => {
      const sec = (Date.now() - startedAt.current) / 1000;
      setElapsed(sec);
      if (before + sec >= maxSeconds) stop();
    }, 100);
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stoppedAt.current = Date.now();
    recRef.current = false;
    tapRef.current = false;
    setTapMode(false);
    setRecording(false);
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  /** Le bout est gardé : flash, l'image rétrécit et va se poser sur la pile, le chiffre augmente. */
  function land(clip: Clip) {
    flash.setValue(0.55);
    Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: false }).start();
    setFlying(clip);
    fly.setValue(0);
    Animated.timing(fly, { toValue: 1, duration: FLY_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start(() => {
      setFlying(null);
      const n = clipsRef.current.length + 1;
      setClips((cs) => [...cs, clip]);
      say(n === 1 ? 'Bout n°1 enregistré' : `Bout n°${n}`);
      bump.setValue(0);
      Animated.timing(bump, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    });
  }

  function pressIn() {
    if (!ready) return;
    if (recRef.current && tapRef.current) return stop();
    pressedAt.current = Date.now();
    start();
  }
  function pressOut() {
    if (!recRef.current || tapRef.current) return;
    if ((Date.now() - pressedAt.current) / 1000 < TAP_SECONDS) {
      // Simple « toc » : on continue de filmer jusqu'au toc suivant.
      tapRef.current = true;
      setTapMode(true);
      return;
    }
    stop();
  }

  function removeLast() {
    const lastClip = clips[clips.length - 1];
    if (!lastClip) return;
    URL.revokeObjectURL(lastClip.uri);
    setClips(clips.slice(0, -1));
    say('Dernier bout effacé');
  }

  function quit() {
    if (recording) return;
    if (clips.length && !confirmQuit) {
      setConfirmQuit(true);
      say('Appuyez encore pour quitter sans garder les vidéos');
      return;
    }
    stream.current?.getTracks().forEach((t) => t.stop());
    clips.forEach((c) => URL.revokeObjectURL(c.uri));
    onCancel();
  }

  function validate() {
    if (recording || !clips.length) return;
    stream.current?.getTracks().forEach((t) => t.stop());
    onDone(clips);
  }

  // Géométrie de l'animation : du cadre 9:16 plein écran jusqu'à la vignette en bas à gauche.
  const frameW = Math.min(box.w, (box.h * 9) / 16);
  const frameH = (frameW * 16) / 9;
  const frameX = (box.w - frameW) / 2;
  const frameY = (box.h - frameH) / 2;
  const endScale = THUMB.h / frameH;
  const dx = THUMB.left + THUMB.w / 2 - (frameX + frameW / 2);
  const dy = box.h - THUMB.bottom - THUMB.h / 2 - (frameY + frameH / 2);

  const left = maxSeconds - used;
  const hint = !ready ? 'Ouverture de la caméra...'
    : recording ? (left <= 10 ? `Encore ${Math.ceil(left)} secondes` : tapMode ? 'Appuyez pour arrêter' : null)
    : full ? `${limitLabel(maxSeconds)} atteinte : validez`
    : clips.length || flying ? null : 'Restez appuyé pour filmer';
  const barW = box.w - 36;

  return (
    <View style={{ flex: 1, backgroundColor: '#000', overflow: 'hidden', ...noSelect }} onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* Cadre vertical 9:16 : exactement ce qui sera publié en Reel ou en story. */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ height: '100%', maxWidth: '100%', aspectRatio: 9 / 16, overflow: 'hidden', borderRadius: 18 }}>
          {React.createElement('video', {
            ref: videoEl, muted: true, autoPlay: true, playsInline: true,
            style: { width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'user' ? 'scaleX(-1)' : undefined, pointerEvents: 'none' },
          })}
        </View>
      </View>

      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', opacity: flash }} />

      {/* L'image du bout qui vient d'être filmé, qui rétrécit et file en bas à gauche. */}
      {flying?.thumb && (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', left: frameX, top: frameY, width: frameW, height: frameH, overflow: 'hidden',
          borderColor: '#fff',
          borderWidth: fly.interpolate({ inputRange: [0, 1], outputRange: [0, 2 / endScale] }),
          borderRadius: fly.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 40, 12 / endScale] }),
          transform: [
            { translateX: fly.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0, dx] }) },
            { translateY: fly.interpolate({ inputRange: [0, 0.12, 0.6, 1], outputRange: [0, 0, dy * 0.45, dy] }) },
            { scale: fly.interpolate({ inputRange: [0, 0.12, 1], outputRange: [1, 0.94, endScale] }) },
          ],
          boxShadow: '0px 30px 80px rgba(0,0,0,0.55)',
        }}>
          <Image source={{ uri: flying.thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </Animated.View>
      )}

      {/* Haut : barre du temps filmé (pleine = la limite des Reels) */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 14, left: 18, right: 18 }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden', flexDirection: 'row' }}>
          {clips.map((c, i) => (
            <View key={c.uri} style={{ width: Math.max(2, (c.seconds / maxSeconds) * barW - 2), marginRight: 2, height: '100%', backgroundColor: '#fff', opacity: i === clips.length - 1 ? 1 : 0.9 }} />
          ))}
          {recording && <View style={{ width: (Math.min(elapsed, left + elapsed) / maxSeconds) * barW, height: '100%', backgroundColor: colors.red }} />}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={shadowText(13)}>{`${clock(used)} filmées`}</Text>
          <Text style={shadowText(13)}>{`${limitLabel(maxSeconds)} maximum`}</Text>
        </View>
      </View>

      {/* Retour, compteur, changer de caméra */}
      <View style={{ position: 'absolute', top: 54, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <RoundButton a11y="Annuler" onPress={quit} disabled={recording}><BackIcon size={22} color="#fff" /></RoundButton>
        {recording && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red }} />
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: fonts.body }}>{clock(elapsed)}</Text>
          </View>
        )}
        <RoundButton a11y="Changer de caméra" onPress={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} disabled={recording}><RefreshIcon size={22} color="#fff" /></RoundButton>
      </View>

      {caption && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 120, left: 20, right: 20, alignItems: 'center' }}>
          <Text style={{ ...glassDark, color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: fonts.body, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 16, textAlign: 'center', overflow: 'hidden' }}>{caption}</Text>
        </View>
      )}

      {/* Pile des bouts filmés, en bas à gauche, avec leur nombre */}
      {clips.length > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', left: THUMB.left, bottom: THUMB.bottom, width: THUMB.w, height: THUMB.h }}>
          {clips.slice(-3).map((c, i, arr) => {
            const depth = arr.length - 1 - i;
            const top = depth === 0;
            return (
              <Animated.View key={c.uri} style={{
                position: 'absolute', width: THUMB.w, height: THUMB.h, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#fff',
                backgroundColor: '#333', boxShadow: '0px 6px 14px -6px rgba(0,0,0,0.6)',
                transform: [
                  { translateX: -depth * 5 }, { translateY: depth * 3 }, { rotate: `${-depth * 6}deg` },
                  { scale: top ? bump.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1] }) : 1 },
                ],
              }}>
                {c.thumb && <Image source={{ uri: c.thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />}
              </Animated.View>
            );
          })}
          <Animated.View style={{
            position: 'absolute', right: -14, top: -12, minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 6,
            backgroundColor: colors.green, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center',
            transform: [{ scale: bump.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.35, 1] }) }],
          }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800', fontFamily: fonts.body }}>{clips.length}</Text>
          </Animated.View>
        </View>
      )}
      {clips.length > 0 && !recording && (
        <Pressable onPress={removeLast} accessibilityRole="button" accessibilityLabel="Effacer le dernier bout"
          style={({ pressed }) => ({ ...glassDark, position: 'absolute', left: 16, bottom: THUMB.bottom + THUMB.h + 26, flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingLeft: 11, paddingRight: 14, borderRadius: 21, opacity: pressed ? 0.7 : 1 })}>
          <UndoIcon size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: fonts.body }}>Effacer</Text>
        </Pressable>
      )}

      {/* Bas à droite : « Galerie » avant le premier bout, puis « Valider » */}
      {!clips.length && !flying && onLibrary && !recording && (
        <Pressable onPress={onLibrary} accessibilityRole="button" accessibilityLabel="Choisir des vidéos déjà filmées"
          style={{ position: 'absolute', bottom: 50, right: 20, alignItems: 'center', gap: 4, width: 78 }}>
          <View style={{ ...glassDark, width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}><ImageIcon size={24} color="#fff" /></View>
          <Text style={shadowText(12)}>Galerie</Text>
        </Pressable>
      )}
      {clips.length > 0 && (
        <Pressable onPress={validate} disabled={recording} accessibilityRole="button" accessibilityLabel="Valider les vidéos"
          style={({ pressed }) => ({ ...greenGradient, position: 'absolute', right: 18, bottom: 58, height: 60, paddingLeft: 14, paddingRight: 18, borderRadius: 30, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: recording ? 0.45 : 1, transform: [{ scale: pressed ? 0.95 : 1 }], boxShadow: '0px 10px 24px -10px rgba(0,0,0,0.6)' })}>
          <CheckIcon size={22} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', fontFamily: fonts.body }}>Valider</Text>
        </Pressable>
      )}

      {/* Le gros bouton : rester appuyé pour filmer */}
      {hint && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 150, left: 0, right: 0, alignItems: 'center' }}>
          <Text style={{ ...glassDark, color: '#fff', fontSize: 15, fontWeight: '600', fontFamily: fonts.body, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, overflow: 'hidden' }}>{hint}</Text>
        </View>
      )}
      <View style={{ position: 'absolute', bottom: 44, left: 0, right: 0, alignItems: 'center' }} pointerEvents="box-none">
        <Pressable onPressIn={pressIn} onPressOut={pressOut} disabled={!ready || (full && !recording)}
          accessibilityRole="button" accessibilityLabel={recording ? "Arrêter l'enregistrement" : 'Rester appuyé pour filmer'}
          style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: ready && !full ? 1 : recording ? 1 : 0.4, transform: [{ scale: recording ? 1.15 : 1 }], ...noSelect }}>
          <View style={recording
            ? { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.red }
            : { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.red }} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Ouvre la caméra en haute définition. Téléphone tenu debout : il faut une image DEBOUT (1080 x 1920).
 * Une image couchée (1920 x 1080) serait coupée sur les côtés pour faire du vertical, et deviendrait floue.
 * Si le navigateur donne une image couchée, on redemande une image debout.
 */
async function openCamera(facing: 'environment' | 'user'): Promise<MediaStream> {
  const s = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
    audio: true,
  });
  const portraitScreen = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
  const set = s.getVideoTracks()[0]?.getSettings?.() ?? {};
  if (!portraitScreen || !set.width || !set.height || set.height >= set.width) return s;
  try {
    const tall = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 }, aspectRatio: { ideal: 9 / 16 }, frameRate: { ideal: 30 } },
      audio: true,
    });
    const t = tall.getVideoTracks()[0]?.getSettings?.() ?? {};
    if (t.width && t.height && t.height > t.width) {
      s.getTracks().forEach((x) => x.stop());
      return tall;
    }
    tall.getTracks().forEach((x) => x.stop());
  } catch { /* on garde la première image */ }
  return s;
}

const glassDark = { backgroundColor: 'rgba(20,40,30,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backdropFilter: 'blur(14px)' } as object;
const shadowText = (size: number) => ({ color: '#fff', fontSize: size, fontWeight: '600' as const, fontFamily: fonts.body, textShadow: '0px 1px 4px rgba(0,0,0,0.45)' });

function RoundButton({ children, onPress, a11y, disabled }: { children: React.ReactNode; onPress: () => void; a11y: string; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y}
      style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      {children}
    </Pressable>
  );
}
