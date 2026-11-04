import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform as RNPlatform, ScrollView, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useVideoPlayer, VideoView } from 'expo-video';
import { BackButton, Body, Button, Notice, PlatformPicker, Title } from '../components/ui';
import { CameraIcon, ImageIcon, VideoIcon } from '../components/icons';
import { WebVideoRecorder } from '../components/WebVideoRecorder';
import { colors, fonts, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { FriendlyError, NotConfiguredError, publishStory } from '../lib/api';
import { STORY_MAX_SECONDS, takeStoryMedia, type StoryMedia } from '../lib/photo';
import type { Platform, Post, PublicationResult } from '../lib/types';

/** Story : une photo ou une vidéo plein écran, visible 24 heures. Pas de texte : Instagram n'affiche pas de légende sur les stories. */
export function Story() {
  const { back, go, upsertPost, connections } = useApp();
  const [media, setMedia] = useState<StoryMedia | null>(null);
  const [busy, setBusy] = useState(false);
  // Version web : on filme avec notre propre caméra (celle du navigateur filme en basse qualité sur iPhone).
  const [recording, setRecording] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>(['instagram', 'facebook']);
  const idempotencyKey = useRef<string>(Crypto.randomUUID());

  async function pick(source: 'photo' | 'video' | 'library') {
    setError(null);
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

  async function publish() {
    if (!media) return;
    setPublishing(true);
    setError(null);
    let publications: PublicationResult[];
    try {
      if (media.kind === 'photo' && !media.photo.base64) throw new FriendlyError("La photo n'a pas pu être lue. Choisissez-en une autre.");
      publications = await publishStory({
        platforms,
        media: media.kind === 'photo' ? { kind: 'photo', base64: media.photo.base64! } : { kind: 'video', uri: media.uri },
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
    const ok = publications.filter((x) => x.status === 'published').length;
    const photo = media.kind === 'photo' ? media.photo : null;
    const post: Post = {
      id: Crypto.randomUUID(),
      kind: 'story',
      mediaType: media.kind,
      imageUri: photo ? (photo.base64 ? `data:image/jpeg;base64,${photo.base64}` : photo.uri) : '',
      caption: media.kind === 'video' ? 'Story vidéo' : 'Story photo',
      hashtags: [],
      platforms,
      createdAt: new Date().toISOString(),
      publishedAt: ok ? new Date().toISOString() : null,
      status: ok === publications.length ? 'published' : ok > 0 ? 'partially_published' : publications.every((x) => x.status === 'not_configured') ? 'draft' : 'failed',
      publications,
    };
    upsertPost(post);
    setPublishing(false);
    go({ name: 'published', postId: post.id });
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
        <Button title="PRENDRE UNE PHOTO" icon={<CameraIcon size={24} />} loading={busy} onPress={() => pick('photo')} style={{ minHeight: 72 }} />
        <Button title="FILMER UNE VIDÉO" icon={<VideoIcon size={24} />} disabled={busy} onPress={() => pick('video')} style={{ minHeight: 72 }} />
        <Button title="Choisir dans la galerie" kind="secondary" icon={<ImageIcon size={22} color={colors.green} />} disabled={busy} onPress={() => pick('library')} />
        <Body soft size={14} center>Une vidéo dure {STORY_MAX_SECONDS} secondes au maximum.</Body>
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
          : <StoryVideo uri={media.uri} />}
        <View style={{ position: 'absolute', top: 8, left: 10, right: 10, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)' }} />
      </View>
      {media.kind === 'video' && media.seconds ? <Body soft size={14} center>Vidéo de {media.seconds} secondes</Body> : null}

      <PlatformPicker value={platforms} onChange={setPlatforms} connections={connections} />

      {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}

      <Button title="PUBLIER LA STORY" onPress={publish} style={{ minHeight: 64 }} />
      <Button title={media.kind === 'video' ? 'Changer de vidéo' : 'Changer de photo'} kind="ghost" onPress={() => setMedia(null)} />
    </ScrollView>
  );
}

/** Aperçu de la vidéo, en boucle et sans le son (comme dans les stories, avant d'appuyer). */
function StoryVideo({ uri }: { uri: string }) {
  // Navigateur : une simple balise vidéo, qui s'affiche aussi sur iPhone (lecture dans la page, sans le son).
  if (RNPlatform.OS === 'web') {
    return (
      <View style={{ width: '100%', height: '100%' }}>
        {React.createElement('video', { src: uri, autoPlay: true, muted: true, loop: true, playsInline: true, style: { width: '100%', height: '100%', objectFit: 'cover' } })}
        <Text style={{ position: 'absolute', bottom: 10, alignSelf: 'center', color: '#fff', fontSize: 13, fontFamily: fonts.body, opacity: 0.85 }}>Aperçu sans le son</Text>
      </View>
    );
  }
  return <NativeStoryVideo uri={uri} />;
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
      <Text style={{ position: 'absolute', bottom: 10, alignSelf: 'center', color: '#fff', fontSize: 13, fontFamily: fonts.body, opacity: 0.85 }}>Aperçu sans le son</Text>
    </View>
  );
}
