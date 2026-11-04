/**
 * Caméra vidéo intégrée, pour la version web (téléphone dans le navigateur).
 * Pourquoi : sur iPhone, le bouton « filmer » du navigateur enregistre en très basse qualité,
 * sans réglage possible. Ici on filme nous-mêmes, en haute définition (jusqu'à 1080p).
 * Sur l'appli installée (iOS / Android), c'est la caméra du téléphone qui sert, déjà en haute qualité.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, fonts } from '../lib/theme';
import { BackIcon, RefreshIcon } from './icons';

type Props = {
  maxSeconds: number;
  onDone: (video: { uri: string; seconds: number }) => void;
  onCancel: () => void;
  /** Caméra refusée ou absente : on propose la galerie à la place. */
  onError: (message: string) => void;
};

/** Le premier format que le navigateur sait enregistrer (mp4 sur iPhone, webm ailleurs). */
function pickMimeType(): string | undefined {
  const MR = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR) return undefined;
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) => MR.isTypeSupported(t));
}

export function WebVideoRecorder({ maxSeconds, onDone, onCancel, onError }: Props) {
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ready, setReady] = useState(false);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);

  // Aperçu en direct de la caméra (un vrai <video> du navigateur, posé dans la vue).
  useEffect(() => {
    let cancelled = false;
    const v = videoEl.current;
    if (!v) return;
    setReady(false);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !pickMimeType()) throw new Error('unsupported');
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          audio: true,
        });
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

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function start() {
    const s = stream.current;
    const mimeType = pickMimeType();
    if (!s || !mimeType) return;
    const chunks: Blob[] = [];
    // 8 Mbit/s : la qualité d'une vidéo de téléphone, pour une story nette.
    const r = new MediaRecorder(s, { mimeType, videoBitsPerSecond: 8_000_000 });
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
      stream.current?.getTracks().forEach((t) => t.stop());
      onDone({ uri: URL.createObjectURL(blob), seconds });
    };
    recorder.current = r;
    startedAt.current = Date.now();
    r.start(1000);
    setRecording(true);
    setElapsed(0);
    timer.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(sec);
      if (sec >= maxSeconds) stop();
    }, 250);
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    setRecording(false);
  }

  const left = maxSeconds - elapsed;
  return (
    <View style={{ flex: 1, backgroundColor: '#000', overflow: 'hidden' }}>
      {React.createElement('video', {
        ref: videoEl, muted: true, autoPlay: true, playsInline: true,
        style: { width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'user' ? 'scaleX(-1)' : undefined },
      })}

      {/* Haut : retour, durée, changer de caméra */}
      <View style={{ position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <RoundButton a11y="Annuler" onPress={() => { stop(); onCancel(); }} disabled={recording}><BackIcon size={22} color="#fff" /></RoundButton>
        {recording && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red }} />
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: fonts.body }}>{`0:${String(elapsed).padStart(2, '0')}`}</Text>
          </View>
        )}
        <RoundButton a11y="Changer de caméra" onPress={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} disabled={recording}><RefreshIcon size={22} color="#fff" /></RoundButton>
      </View>

      {/* Bas : le gros bouton rouge */}
      <View style={{ position: 'absolute', bottom: 28, left: 0, right: 0, alignItems: 'center', gap: 10 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontFamily: fonts.body, opacity: 0.9 }}>
          {!ready ? 'Ouverture de la caméra...' : recording ? (left <= 10 ? `Encore ${left} secondes` : 'Appuyez pour arrêter') : `Appuyez pour filmer (${maxSeconds} s maximum)`}
        </Text>
        <Pressable onPress={recording ? stop : start} disabled={!ready} accessibilityRole="button" accessibilityLabel={recording ? "Arrêter l'enregistrement" : 'Commencer à filmer'}
          style={({ pressed }) => ({ width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: ready ? (pressed ? 0.8 : 1) : 0.4 })}>
          <View style={recording
            ? { width: 30, height: 30, borderRadius: 6, backgroundColor: colors.red }
            : { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.red }} />
        </Pressable>
      </View>
    </View>
  );
}

function RoundButton({ children, onPress, a11y, disabled }: { children: React.ReactNode; onPress: () => void; a11y: string; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y}
      style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      {children}
    </Pressable>
  );
}
