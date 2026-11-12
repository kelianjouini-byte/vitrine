import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { BackButton, Body, Button, Notice, Title } from '../components/ui';
import { ImageIcon, VideoIcon } from '../components/icons';
import { WebVideoRecorder } from '../components/WebVideoRecorder';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { FriendlyError } from '../lib/api';
import { REEL_MAX_SECONDS, takeVideo } from '../lib/photo';

/**
 * Bouton « Vidéo » de l'accueil, version web : la caméra de Vitrine s'ouvre tout de suite, cadrée en vertical
 * comme le Reel et la story. On peut aussi prendre une vidéo déjà filmée, dans la galerie.
 * Ensuite : « Où la publier ? ».
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
      const v = await takeVideo('library');
      if (v) replace({ name: 'choose', media: v });
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : "La vidéo n'a pas pu être ouverte. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  if (filming) {
    return (
      <WebVideoRecorder
        maxSeconds={REEL_MAX_SECONDS}
        onDone={(v) => replace({ name: 'choose', media: { kind: 'video', uri: v.uri, seconds: v.seconds } })}
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
      <Button title="Choisir une vidéo dans la galerie" icon={<ImageIcon size={22} color={colors.white} />} loading={busy} onPress={library} style={{ minHeight: 64 }} />
      <Button title="Réessayer la caméra" kind="secondary" icon={<VideoIcon size={22} color={colors.green} />} disabled={busy} onPress={() => { setError(null); setFilming(true); }} />
      <Body soft size={15} center>Une vidéo de {REEL_MAX_SECONDS} secondes au maximum.</Body>
    </ScrollView>
  );
}
