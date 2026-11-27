import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { BackButton, Body, Button, Notice, Title } from '../components/ui';
import { ImageIcon, VideoIcon } from '../components/icons';
import { WebVideoRecorder, type Clip } from '../components/WebVideoRecorder';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { FriendlyError } from '../lib/api';
import { REEL_MAX_SECONDS, takeVideos } from '../lib/photo';
import { limitLabel } from '../lib/montage';

/**
 * Bouton « Vidéo » de l'accueil, version web : la caméra de Vitrine s'ouvre tout de suite, cadrée en vertical
 * comme le Reel et la story. On filme en un ou plusieurs bouts ; on peut aussi prendre des vidéos de la galerie.
 * Un seul bout : directement « Où la publier ? ». Plusieurs : Vitrine les monte d'abord ensemble.
 */
export function Capture() {
  const { back, replace } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [filming, setFilming] = useState(true);
  const [busy, setBusy] = useState(false);

  async function library() {
    setError(null);
    setBusy(true);
    try {
      const vs = await takeVideos();
      if (vs.length === 1) replace({ name: 'choose', media: vs[0] });
      else if (vs.length > 1) replace({ name: 'montage', clips: vs.map((v) => ({ uri: v.uri })) });
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : "La vidéo n'a pas pu être ouverte. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  function done(clips: Clip[]) {
    if (clips.length === 1) replace({ name: 'choose', media: { kind: 'video', uri: clips[0].uri, seconds: Math.round(clips[0].seconds) } });
    else replace({ name: 'montage', clips: clips.map((c) => ({ uri: c.uri, thumb: c.thumb })) });
  }

  if (filming) {
    return (
      <WebVideoRecorder
        maxSeconds={REEL_MAX_SECONDS}
        onDone={done}
        onCancel={back}
        onError={(message) => { setFilming(false); setError(message); }}
        onLibrary={() => { setFilming(false); library(); }}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      <BackButton onPress={back} />
      <Title size={24}>Votre vidéo</Title>
      {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}
      <Button title="Choisir des vidéos dans la galerie" icon={<ImageIcon size={22} color={colors.white} />} loading={busy} onPress={library} style={{ minHeight: 64 }} />
      <Button title="Réessayer la caméra" kind="secondary" icon={<VideoIcon size={22} color={colors.green} />} disabled={busy} onPress={() => { setError(null); setFilming(true); }} />
      <Body soft size={15} center>{`Une ou plusieurs vidéos, ${limitLabel(REEL_MAX_SECONDS)} au total au maximum. Plusieurs vidéos sont montées ensemble automatiquement.`}</Body>
    </ScrollView>
  );
}
