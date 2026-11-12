import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform as RNPlatform, ScrollView, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { BackButton, Body, Button, Notice, PlatformPicker, Title } from '../components/ui';
import { CameraIcon, DownloadIcon, ImageIcon, VideoIcon } from '../components/icons';
import { MusicChooser } from '../components/MusicPicker';
import { MakingVideo, MusicLine, OverlayEditor, OverlayStage, OverlayStatus, OverlayTools, useOverlayText } from '../components/TextOverlay';
import { WebVideoRecorder } from '../components/WebVideoRecorder';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { FriendlyError, metaConfigured, NotConfiguredError, publishStory, submitStory } from '../lib/api';
import { autoCrop, STORY_MAX_SECONDS, takeStoryMedia, type Captured, type StoryMedia } from '../lib/photo';
import { upcomingEvents } from '../lib/events';
import { suggestTrack, trackById } from '../lib/music';
import { hasOverlay } from '../lib/overlay';
import { photoWithText } from '../lib/media';
import { statusAfterPublish } from '../lib/planning';
import { audioContext, makeFinalVideo, musicSupported, prepareVideo, saveVideo } from '../lib/videoMusic';
import type { Platform, Post, PublicationResult } from '../lib/types';

/**
 * Story : une photo ou une vidéo plein écran, visible 24 heures, avec un petit texte écrit dessus
 * (proposé par l'IA, modifiable). Instagram n'affiche pas de légende sous une story : le texte est SUR l'image.
 * `initial` : photo ou vidéo déjà prise avec les boutons de l'accueil.
 */
export function Story({ initial }: { initial?: Captured }) {
  const { back, go, upsertPost, connections, business, canPublish, refreshTeam } = useApp();
  const [media, setMedia] = useState<StoryMedia | null>(null);
  const [busy, setBusy] = useState(!!initial);
  // Version web : on filme avec notre propre caméra (celle du navigateur filme en basse qualité sur iPhone).
  const [recording, setRecording] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>(['instagram', 'facebook']);
  const idempotencyKey = useRef<string>(Crypto.randomUUID());
  const occasion = useMemo(() => (business ? upcomingEvents(business, new Date(), 1, business.postalCode)[0] ?? null : null), [business]);
  // Musique (vidéos, version web) : proposée d'office selon la prochaine fête, modifiable, ou aucune.
  const suggested = useMemo(() => suggestTrack(occasion ? [occasion] : []), [occasion]);
  const [track, setTrack] = useState<string | null>(suggested);
  const [choosingMusic, setChoosingMusic] = useState(false);
  const [making, setMaking] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const text = useOverlayText(business, occasion);
  const music = musicSupported && media?.kind === 'video' ? track : null;
  const edited = hasOverlay(text.overlay) || !!music;

  /** Nouvelle photo ou vidéo : nouvelle clé de publication, et l'IA propose son petit texte. */
  function show(m: StoryMedia) {
    setMedia(m);
    setSaved(false);
    idempotencyKey.current = Crypto.randomUUID();
    if (m.kind === 'photo' && m.photo.base64) text.ask({ kind: 'photo', base64: m.photo.base64 });
    if (m.kind === 'video') text.ask({ kind: 'video', uri: m.uri });
  }

  // Photo ou vidéo venue de l'accueil : la photo est recadrée en plein écran vertical.
  useEffect(() => {
    if (!initial) return;
    (async () => {
      try {
        show(initial.kind === 'video' ? { kind: 'video', uri: initial.uri, seconds: initial.seconds } : { kind: 'photo', photo: await autoCrop(initial.raw, 'story') });
      } catch (e) {
        setError(e instanceof FriendlyError ? e.message : "La photo n'a pas pu être préparée. Réessayez.");
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(source: 'photo' | 'video' | 'library') {
    setError(null);
    // Appui de la personne : on en profite pour « réveiller » le son (règle des navigateurs).
    if (musicSupported) audioContext();
    if (source === 'video' && RNPlatform.OS === 'web') return setRecording(true);
    setBusy(true);
    try {
      const m = await takeStoryMedia(source);
      if (m) show(m);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : "La photo ou la vidéo n'a pas pu être ouverte. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  /** Le fichier qui part : photo avec son texte, ou vidéo refabriquée (texte, musique) si besoin. */
  async function finalMedia(): Promise<Parameters<typeof publishStory>[0]['media']> {
    if (!media) throw new FriendlyError('Choisissez une photo ou une vidéo.');
    if (media.kind === 'photo') {
      if (!media.photo.base64) throw new FriendlyError("La photo n'a pas pu être lue. Choisissez-en une autre.");
      if (text.supported && hasOverlay(text.overlay)) return { kind: 'photo', base64: (await photoWithText(media.photo.uri, text.overlay)).base64 };
      return { kind: 'photo', base64: media.photo.base64 };
    }
    setMaking(0);
    try {
      const blob = await prepareVideo(media.uri, { overlay: text.overlay, trackId: music }, setMaking);
      return { kind: 'video', uri: media.uri, blob };
    } catch {
      throw new FriendlyError("La vidéo n'a pas pu être préparée sur ce téléphone. Réessayez, ou retirez le texte et la musique.");
    } finally {
      setMaking(null);
    }
  }

  function localPost(extra: Pick<Post, 'status' | 'publications'> & Partial<Post>): Post {
    const photo = media?.kind === 'photo' ? media.photo : null;
    return {
      id: idempotencyKey.current, // même identifiant que sur le serveur
      kind: 'story',
      mediaType: media?.kind ?? 'photo',
      imageUri: photo ? (photo.base64 ? `data:image/jpeg;base64,${photo.base64}` : photo.uri) : '',
      caption: hasOverlay(text.overlay) && text.overlay.text.trim() ? text.overlay.text.trim() : media?.kind === 'video' ? 'Story vidéo' : 'Story photo',
      hashtags: [],
      platforms,
      createdAt: new Date().toISOString(),
      ...extra,
    };
  }

  /** Employé : la story part chez le patron (texte et musique déjà dedans), qui la publie. */
  async function sendToPatron() {
    setError(null);
    try {
      const file = await finalMedia();
      setPublishing(true);
      await submitStory({ storyId: idempotencyKey.current, platforms, media: file, idempotencyKey: idempotencyKey.current });
      upsertPost(localPost({ status: 'awaiting_approval', reviewState: 'pending', publications: [] }));
      refreshTeam();
      go({ name: 'published', postId: idempotencyKey.current });
    } catch (e) {
      setError(e instanceof NotConfiguredError ? "L'envoi au patron n'est pas encore activé sur le serveur." : e instanceof FriendlyError ? e.message : "La story n'a pas pu être envoyée. Réessayez.");
    } finally {
      setPublishing(false);
    }
  }

  async function publish() {
    if (!media) return;
    if (!canPublish) return sendToPatron();
    setError(null);
    let publications: PublicationResult[];
    try {
      // Rien ne sert de fabriquer la vidéo si la publication n'est pas branchée.
      if (!(await metaConfigured())) throw new NotConfiguredError('meta');
      const file = await finalMedia();
      setPublishing(true);
      publications = await publishStory({ storyId: idempotencyKey.current, platforms, media: file, idempotencyKey: idempotencyKey.current });
    } catch (e) {
      const notConfigured = e instanceof NotConfiguredError;
      publications = platforms.map((p) => ({
        platform: p,
        status: notConfigured ? 'not_configured' : 'failed',
        error: notConfigured ? null : e instanceof FriendlyError ? e.message : 'La publication a échoué.',
      }));
    }
    const status = statusAfterPublish(publications);
    const ok = status === 'published' || status === 'partially_published';
    upsertPost(localPost({ status, publications, publishedAt: ok ? new Date().toISOString() : null }));
    setPublishing(false);
    go({ name: 'published', postId: idempotencyKey.current });
  }

  /** La vidéo avec son texte et sa musique, enregistrée sur le téléphone. */
  async function saveEdited() {
    if (!media || media.kind !== 'video') return;
    setError(null);
    audioContext();
    setMaking(0);
    try {
      const out = await makeFinalVideo(media.uri, { trackId: music, overlay: hasOverlay(text.overlay) ? text.overlay : null }, setMaking);
      setMaking(null);
      await saveVideo(out.blob, 'story-vitrine');
      setSaved(true);
    } catch {
      setMaking(null);
      setError("La vidéo n'a pas pu être préparée sur ce téléphone. Réessayez.");
    }
  }

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <BackButton onPress={media && !publishing && !initial ? () => setMedia(null) : back} />
      <Title size={24} style={{ flex: 1 }}>{media ? 'Votre story' : 'Nouvelle story'}</Title>
    </View>
  );

  if (publishing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 }}>
        <ActivityIndicator size="large" color={colors.green} />
        <Title size={22} style={{ textAlign: 'center' }}>Votre story est en préparation...</Title>
        <Body soft center>Gardez l'application ouverte quelques secondes.</Body>
      </View>
    );
  }

  if (making !== null) return <MakingVideo progress={making} />;

  if (choosingMusic) {
    return <MusicChooser selected={track} suggested={suggested} onPick={(id) => { setTrack(id); setSaved(false); setChoosingMusic(false); }} onClose={() => setChoosingMusic(false)} />;
  }

  if (recording) {
    return (
      <WebVideoRecorder
        maxSeconds={STORY_MAX_SECONDS}
        onDone={(v) => { setRecording(false); show({ kind: 'video', uri: v.uri, seconds: v.seconds }); }}
        onCancel={() => setRecording(false)}
        onError={(message) => { setRecording(false); setError(message); }}
      />
    );
  }

  if (!media) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {header}
        {busy && initial ? (
          <View style={{ alignItems: 'center', padding: 40 }}><ActivityIndicator size="large" color={colors.green} /></View>
        ) : (
          <>
            <Body soft>Une photo ou une petite vidéo, en plein écran, avec un petit texte dessus. Elle reste visible 24 heures sur Instagram et Facebook.</Body>
            <Button title="Prendre une photo" icon={<CameraIcon size={24} />} loading={busy} onPress={() => pick('photo')} style={{ minHeight: 72 }} />
            <Button title="Filmer une vidéo" icon={<VideoIcon size={24} />} disabled={busy} onPress={() => pick('video')} style={{ minHeight: 72 }} />
            <Button title="Choisir dans la galerie" kind="secondary" icon={<ImageIcon size={22} color={colors.green} />} disabled={busy} onPress={() => pick('library')} />
            <Body soft size={15} center>Une vidéo dure {STORY_MAX_SECONDS} secondes au maximum.</Body>
          </>
        )}
        {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}
      </ScrollView>
    );
  }

  const stage = media.kind === 'photo' ? { kind: 'photo' as const, uri: media.photo.uri } : { kind: 'video' as const, uri: media.uri, seconds: media.seconds };
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
      {header}
      <OverlayStage media={stage} overlay={text.supported ? text.overlay : null} music={music} label={media.kind === 'video' && !music ? 'Aperçu sans le son' : undefined} />
      {text.supported && (
        <>
          <OverlayStatus loading={text.loading} failed={text.failed} empty={!hasOverlay(text.overlay)} />
          <OverlayTools overlay={text.overlay} onChange={text.setOverlay} onEdit={() => text.setEditing(true)} onMusic={media.kind === 'video' && musicSupported ? () => { audioContext(); setChoosingMusic(true); } : undefined} />
          {media.kind === 'video' && musicSupported && <MusicLine title={music ? trackById(music)?.title ?? null : null} />}
        </>
      )}
      {media.kind === 'video' && media.seconds ? <Body soft size={15} center>Vidéo de {media.seconds} secondes</Body> : null}

      <PlatformPicker value={platforms} onChange={setPlatforms} connections={connections} />

      {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}

      <Button title={canPublish ? 'Publier la story' : 'Envoyer au patron'} onPress={publish} style={{ minHeight: 64 }} />
      {media.kind === 'video' && edited && text.supported && (
        <Button title={saved ? 'Vidéo enregistrée' : 'Enregistrer la vidéo sur mon téléphone'} kind="secondary" icon={<DownloadIcon size={20} color={colors.green} />} onPress={saveEdited} />
      )}
      <Button title={media.kind === 'video' ? 'Changer de vidéo' : 'Changer de photo'} kind="ghost" onPress={() => (initial ? back() : setMedia(null))} />

      <OverlayEditor
        visible={text.editing}
        overlay={text.overlay}
        emojis={text.emojis}
        onChange={text.setOverlay}
        onClose={() => text.setEditing(false)}
        onRewrite={text.canRewrite ? text.rewrite : undefined}
        rewriting={text.loading}
        video={media.kind === 'video'}
      />
    </ScrollView>
  );
}
