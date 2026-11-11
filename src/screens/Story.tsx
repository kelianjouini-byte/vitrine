import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform as RNPlatform, ScrollView, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useVideoPlayer, VideoView } from 'expo-video';
import { BackButton, Body, Button, Notice, PlatformPicker, Title } from '../components/ui';
import { CameraIcon, DownloadIcon, ImageIcon, VideoIcon } from '../components/icons';
import { MusicBar, MusicList } from '../components/MusicPicker';
import { WebVideoRecorder } from '../components/WebVideoRecorder';
import { colors, fonts, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { FriendlyError, metaConfigured, NotConfiguredError, publishStory, submitStory } from '../lib/api';
import { STORY_MAX_SECONDS, takeStoryMedia, type StoryMedia } from '../lib/photo';
import { upcomingEvents } from '../lib/events';
import { suggestTrack } from '../lib/music';
import { statusAfterPublish } from '../lib/planning';
import { audioContext, makeVideoWithMusic, musicSupported, saveVideo, startPreview } from '../lib/videoMusic';
import type { Platform, Post, PublicationResult } from '../lib/types';

/** Story : une photo ou une vidéo plein écran, visible 24 heures. Pas de texte : Instagram n'affiche pas de légende sur les stories. */
export function Story() {
  const { back, go, upsertPost, connections, business, canPublish, refreshTeam } = useApp();
  const [media, setMedia] = useState<StoryMedia | null>(null);
  const [busy, setBusy] = useState(false);
  // Version web : on filme avec notre propre caméra (celle du navigateur filme en basse qualité sur iPhone).
  const [recording, setRecording] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>(['instagram', 'facebook']);
  const idempotencyKey = useRef<string>(Crypto.randomUUID());
  // Musique (stories vidéo, version web) : proposée d'office selon la prochaine fête, modifiable.
  const suggested = useMemo(() => (business ? suggestTrack(upcomingEvents(business, new Date(), 1, business.postalCode)) : 'cocooning'), [business]);
  const [track, setTrack] = useState(suggested);
  const [musicOn, setMusicOn] = useState(true);
  const [choosingMusic, setChoosingMusic] = useState(false);
  const [making, setMaking] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const withMusic = musicSupported && musicOn && media?.kind === 'video';

  async function pick(source: 'photo' | 'video' | 'library') {
    setError(null);
    setSaved(false);
    // Appui de la personne : on en profite pour « réveiller » le son (règle des navigateurs).
    if (musicSupported) audioContext();
    if (source === 'video' && RNPlatform.OS === 'web') return setRecording(true);
    setBusy(true);
    try {
      const m = await takeStoryMedia(source);
      if (m) {
        setMedia(m);
        idempotencyKey.current = Crypto.randomUUID();
      }
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : "La photo ou la vidéo n'a pas pu être ouverte. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  /** Employé : la story part chez le patron (avec la musique déjà dedans), qui la publie. */
  async function sendToPatron() {
    if (!media) return;
    setPublishing(true);
    setError(null);
    try {
      if (media.kind === 'photo' && !media.photo.base64) throw new FriendlyError("La photo n'a pas pu être lue. Choisissez-en une autre.");
      let withSound: Blob | undefined;
      if (media.kind === 'video' && withMusic) {
        setPublishing(false);
        setMaking(0);
        try {
          withSound = (await makeVideoWithMusic(media.uri, track, setMaking)).blob;
        } finally {
          setMaking(null);
          setPublishing(true);
        }
      }
      await submitStory({
        storyId: idempotencyKey.current,
        platforms,
        media: media.kind === 'photo' ? { kind: 'photo', base64: media.photo.base64! } : { kind: 'video', uri: media.uri, blob: withSound },
        idempotencyKey: idempotencyKey.current,
      });
      const photo = media.kind === 'photo' ? media.photo : null;
      upsertPost({
        id: idempotencyKey.current,
        kind: 'story',
        mediaType: media.kind,
        imageUri: photo ? (photo.base64 ? `data:image/jpeg;base64,${photo.base64}` : photo.uri) : '',
        caption: media.kind === 'video' ? 'Story vidéo' : 'Story photo',
        hashtags: [],
        platforms,
        createdAt: new Date().toISOString(),
        status: 'awaiting_approval',
        reviewState: 'pending',
        publications: [],
      });
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
    setPublishing(true);
    setError(null);
    let publications: PublicationResult[];
    try {
      if (media.kind === 'photo' && !media.photo.base64) throw new FriendlyError("La photo n'a pas pu être lue. Choisissez-en une autre.");
      // Vidéo avec musique : on fabrique d'abord la vidéo avec le son, c'est elle qui part.
      let withSound: Blob | undefined;
      if (media.kind === 'video' && withMusic && (await metaConfigured())) {
        setPublishing(false);
        setMaking(0);
        try {
          withSound = (await makeVideoWithMusic(media.uri, track, setMaking)).blob;
        } finally {
          setMaking(null);
          setPublishing(true);
        }
      }
      publications = await publishStory({
        storyId: idempotencyKey.current,
        platforms,
        media: media.kind === 'photo' ? { kind: 'photo', base64: media.photo.base64! } : { kind: 'video', uri: media.uri, blob: withSound },
        idempotencyKey: idempotencyKey.current,
      });
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
    const photo = media.kind === 'photo' ? media.photo : null;
    const post: Post = {
      id: idempotencyKey.current, // même identifiant que sur le serveur
      kind: 'story',
      mediaType: media.kind,
      imageUri: photo ? (photo.base64 ? `data:image/jpeg;base64,${photo.base64}` : photo.uri) : '',
      caption: media.kind === 'video' ? 'Story vidéo' : 'Story photo',
      hashtags: [],
      platforms,
      createdAt: new Date().toISOString(),
      publishedAt: ok ? new Date().toISOString() : null,
      status,
      publications,
    };
    upsertPost(post);
    setPublishing(false);
    go({ name: 'published', postId: post.id });
  }

  /** Vidéo avec la musique dedans, enregistrée sur le téléphone (en attendant la publication directe). */
  async function saveWithMusic() {
    if (!media || media.kind !== 'video') return;
    setError(null);
    audioContext();
    setMaking(0);
    try {
      const out = await makeVideoWithMusic(media.uri, track, setMaking);
      setMaking(null);
      await saveVideo(out.blob);
      setSaved(true);
    } catch {
      setMaking(null);
      setError("La vidéo avec la musique n'a pas pu être préparée sur ce téléphone. Réessayez, ou publiez-la sans musique.");
    }
  }

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <BackButton onPress={media && !publishing ? () => setMedia(null) : back} />
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

  if (making !== null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
        <ActivityIndicator size="large" color={colors.green} />
        <Title size={22} style={{ textAlign: 'center' }}>Vitrine ajoute la musique...</Title>
        <View style={{ width: '80%', height: 10, borderRadius: 5, backgroundColor: colors.greenSoft, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(making * 100)}%`, height: '100%', backgroundColor: colors.green }} />
        </View>
        <Body soft center>Cela prend le temps de la vidéo. Gardez l'application ouverte.</Body>
      </View>
    );
  }

  if (choosingMusic) {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 20 }}>
          <BackButton onPress={() => setChoosingMusic(false)} />
          <Title size={24} style={{ flex: 1 }}>Choisir la musique</Title>
        </View>
        <MusicList selected={track} suggested={suggested} onPick={(id) => { setTrack(id); setMusicOn(true); setChoosingMusic(false); }} onClose={() => setChoosingMusic(false)} />
      </View>
    );
  }

  if (recording) {
    return (
      <WebVideoRecorder
        maxSeconds={STORY_MAX_SECONDS}
        onDone={(v) => { setRecording(false); setMedia({ kind: 'video', uri: v.uri, seconds: v.seconds }); idempotencyKey.current = Crypto.randomUUID(); }}
        onCancel={() => setRecording(false)}
        onError={(message) => { setRecording(false); setError(message); }}
      />
    );
  }

  if (!media) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {header}
        <Body soft>Une photo ou une petite vidéo, en plein écran. Elle reste visible 24 heures sur Instagram et Facebook.</Body>
        <Button title="Prendre une photo" icon={<CameraIcon size={24} />} loading={busy} onPress={() => pick('photo')} style={{ minHeight: 72 }} />
        <Button title="Filmer une vidéo" icon={<VideoIcon size={24} />} disabled={busy} onPress={() => pick('video')} style={{ minHeight: 72 }} />
        <Button title="Choisir dans la galerie" kind="secondary" icon={<ImageIcon size={22} color={colors.green} />} disabled={busy} onPress={() => pick('library')} />
        <Body soft size={15} center>Une vidéo dure {STORY_MAX_SECONDS} secondes au maximum.</Body>
        {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
      {header}
      <View style={{ alignSelf: 'center', width: '72%', maxWidth: 300, aspectRatio: 9 / 16, borderRadius: radius.md + 4, overflow: 'hidden', backgroundColor: '#141C17' }}>
        {media.kind === 'photo'
          ? <Image source={{ uri: media.photo.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel="Votre photo en story" />
          : <StoryVideo uri={media.uri} seconds={media.seconds} music={withMusic ? track : null} />}
        <View style={{ position: 'absolute', top: 8, left: 10, right: 10, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)' }} />
      </View>
      {media.kind === 'video' && media.seconds ? <Body soft size={15} center>Vidéo de {media.seconds} secondes</Body> : null}

      {media.kind === 'video' && musicSupported && (
        <MusicBar trackId={track} on={musicOn} onToggle={() => { audioContext(); setMusicOn((v) => !v); setSaved(false); }} onChange={() => { audioContext(); setChoosingMusic(true); }} />
      )}

      <PlatformPicker value={platforms} onChange={setPlatforms} connections={connections} />

      {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}

      <Button title={canPublish ? 'Publier la story' : 'Envoyer au patron'} onPress={publish} style={{ minHeight: 64 }} />
      {withMusic && (
        <Button title={saved ? 'Vidéo enregistrée' : 'Enregistrer la vidéo avec la musique'} kind="secondary" icon={<DownloadIcon size={20} color={colors.green} />} onPress={saveWithMusic} />
      )}
      {saved && <Body soft size={15} center>Vous pouvez aussi la publier vous-même depuis Instagram, en attendant que Vitrine publie pour vous.</Body>}
      <Button title={media.kind === 'video' ? 'Changer de vidéo' : 'Changer de photo'} kind="ghost" onPress={() => setMedia(null)} />
    </ScrollView>
  );
}

/** Aperçu de la vidéo, en boucle. Avec musique : on l'entend, calée sur la vidéo, qui redescend à la fin. */
function StoryVideo({ uri, seconds, music }: { uri: string; seconds: number | null; music: string | null }) {
  if (RNPlatform.OS === 'web') return <WebStoryVideo uri={uri} seconds={seconds} music={music} />;
  return <NativeStoryVideo uri={uri} />;
}

/** Navigateur : une simple balise vidéo, qui s'affiche aussi sur iPhone (lecture dans la page, sans le son). */
function WebStoryVideo({ uri, seconds, music }: { uri: string; seconds: number | null; music: string | null }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || !music) return;
    const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : seconds ?? 15;
    v.currentTime = 0;
    v.play().catch(() => {});
    return startPreview(v, music, duration);
  }, [music, uri, seconds]);
  return (
    <View style={{ width: '100%', height: '100%' }}>
      {React.createElement('video', { ref, src: uri, autoPlay: true, muted: true, loop: true, playsInline: true, style: { width: '100%', height: '100%', objectFit: 'cover' } })}
      <Text style={{ position: 'absolute', bottom: 10, alignSelf: 'center', color: '#fff', fontSize: 15, fontFamily: fonts.body, opacity: 0.9 }}>{music ? 'Aperçu avec la musique' : 'Aperçu sans le son'}</Text>
    </View>
  );
}

function NativeStoryVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <View style={{ width: '100%', height: '100%' }}>
      <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" nativeControls={false} />
      <Text style={{ position: 'absolute', bottom: 10, alignSelf: 'center', color: '#fff', fontSize: 15, fontFamily: fonts.body, opacity: 0.9 }}>Aperçu sans le son</Text>
    </View>
  );
}
