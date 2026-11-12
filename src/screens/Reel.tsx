import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { BackButton, Body, Button, Notice, PlatformPicker, Title } from '../components/ui';
import { CheckIcon, PencilIcon, RefreshIcon, SendIcon, SparkIcon } from '../components/icons';
import { MusicChooser } from '../components/MusicPicker';
import { MakingVideo, MusicLine, OverlayEditor, OverlayStage, OverlayStatus, OverlayTools, useOverlayText } from '../components/TextOverlay';
import { colors, fonts, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { isBackendConfigured } from '../lib/config';
import {
  ensureSession, exampleCaption, FriendlyError, generatePost, metaConfigured, NotConfiguredError, publishReel, publishStory,
  saveBusinessRemote, submitReel, submitStory, uploadPhoto, uploadVideo,
} from '../lib/api';
import { upcomingEvents } from '../lib/events';
import { suggestTrack, trackById } from '../lib/music';
import { hasOverlay } from '../lib/overlay';
import { videoFrame } from '../lib/media';
import { statusAfterPublish } from '../lib/planning';
import { tradeById } from '../lib/trades';
import { DEFAULT_TONE, toneLabel } from '../lib/business';
import { audioContext, musicSupported, prepareVideo } from '../lib/videoMusic';
import type { Captured } from '../lib/photo';
import type { Platform, Post, PublicationResult } from '../lib/types';

type Video = Extract<Captured, { kind: 'video' }>;

/**
 * Reel : une vidéo courte qui reste sur la page, avec un petit texte écrit dessus (style, emoji, place)
 * et une légende en dessous, comme un post. L'IA « regarde » une image de la vidéo pour écrire les deux.
 * `alsoStory` : la même vidéo part aussi en story.
 */
export function Reel({ video, alsoStory }: { video: Video; alsoStory?: boolean }) {
  const { business, back, go, upsertPost, connections, saveBusiness, canPublish, refreshTeam } = useApp();
  const b = business!;
  const occasion = useMemo(() => upcomingEvents(b, new Date(), 1, b.postalCode)[0] ?? null, [b]);
  const suggested = useMemo(() => suggestTrack(occasion ? [occasion] : []), [occasion]);
  const [track, setTrack] = useState<string | null>(suggested);
  const [choosingMusic, setChoosingMusic] = useState(false);
  const music = musicSupported ? track : null;
  const text = useOverlayText(business, occasion);

  const postId = useRef<string>(Crypto.randomUUID());
  const storyId = useRef<string>(Crypto.randomUUID());
  const idempotencyKey = useRef<string>(Crypto.randomUUID());
  const [cover, setCover] = useState<{ base64: string | null; path: string | null }>({ base64: null, path: null });
  const [writing, setWriting] = useState(true);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [editing, setEditing] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>(['instagram', 'facebook']);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  // Dès l'arrivée : une image de la vidéo est envoyée, l'IA écrit la légende et le petit texte en même temps.
  useEffect(() => {
    (async () => {
      const frame = await videoFrame(video.uri);
      let path: string | null = null;
      try {
        if (!isBackendConfigured) throw new NotConfiguredError('serveur');
        if (!(await ensureSession())) throw new NotConfiguredError('compte');
        if (!frame) throw new NotConfiguredError('ia');
        if (!b.id) {
          const id = await saveBusinessRemote(b);
          if (id) await saveBusiness({ ...b, id });
        }
        path = await uploadPhoto(frame);
        setCover({ base64: frame, path });
        text.ask({ kind: 'path', path, video: true });
        await writeCaption(path);
      } catch (e) {
        setCover({ base64: frame, path });
        if (!path) text.ask({ kind: 'video', uri: video.uri });
        showExample(e);
      } finally {
        setWriting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function writeCaption(path: string) {
    const out = await generatePost({ imagePaths: [path], postId: postId.current, occasion, tradeHint: tradeById(b.businessType)?.aiHint, tone: b.tone ?? DEFAULT_TONE, format: 'reel' });
    postId.current = out.postId;
    setCaption(out.instagramCaption);
    setHashtags(out.hashtags.join(' '));
    setAiNotice(null);
  }

  /** IA pas branchée ou en panne : un texte d'exemple, clairement annoncé, à modifier. */
  function showExample(e: unknown) {
    const ex = exampleCaption(b, occasion);
    setCaption(ex.instagramCaption);
    setHashtags(ex.hashtags.join(' '));
    setAiNotice(e instanceof NotConfiguredError
      ? "L'IA n'est pas encore branchée : voici une légende d'exemple, qui ne décrit pas votre vidéo. Modifiez-la avant de publier."
      : "L'IA n'a pas pu écrire la légende cette fois. Voici un exemple à modifier, ou touchez « Autre texte ».");
  }

  async function again() {
    if (!cover.path) return;
    setWriting(true);
    setError(null);
    try {
      await writeCaption(cover.path);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : "La nouvelle légende n'a pas pu être écrite. Votre texte est toujours là.");
    } finally {
      setWriting(false);
    }
  }

  const tags = () => hashtags.split(/\s+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`));

  /** La vidéo finale (texte + musique), envoyée une seule fois : elle sert au Reel et à la story. */
  async function uploadFinal(): Promise<{ path: string; blob?: Blob }> {
    setMaking(0);
    let blob: Blob | undefined;
    try {
      blob = await prepareVideo(video.uri, { overlay: text.overlay, trackId: music }, setMaking);
    } catch {
      throw new FriendlyError("La vidéo n'a pas pu être préparée sur ce téléphone. Réessayez, ou retirez le texte et la musique.");
    } finally {
      setMaking(null);
    }
    setSending(true);
    return { path: await uploadVideo(video.uri, blob), blob };
  }

  function localPosts(reel: Pick<Post, 'status' | 'publications'> & Partial<Post>, story?: Pick<Post, 'status' | 'publications'> & Partial<Post>) {
    const now = new Date().toISOString();
    upsertPost({
      id: postId.current, kind: 'post', mediaType: 'video',
      imageUri: cover.base64 ? `data:image/jpeg;base64,${cover.base64}` : '',
      photoCount: 1, caption: caption.trim(), hashtags: tags(), platforms, occasionId: occasion?.id ?? null, createdAt: now, ...reel,
    });
    if (alsoStory && story) {
      upsertPost({
        id: storyId.current, kind: 'story', mediaType: 'video', imageUri: '',
        caption: text.overlay.text.trim() || 'Story vidéo', hashtags: [], platforms, createdAt: now, ...story,
      });
    }
  }

  async function publish() {
    if (!caption.trim()) return setError('La légende est vide. Écrivez quelques mots ou demandez un autre texte.');
    setError(null);
    audioContext();
    if (!canPublish) return sendToPatron();
    let reel: PublicationResult[];
    let story: PublicationResult[] = [];
    let file: { path: string; blob?: Blob } | null = null;
    try {
      if (!isBackendConfigured || !(await metaConfigured())) throw new NotConfiguredError('meta');
      file = await uploadFinal();
    } catch (e) {
      setSending(false);
      if (!(e instanceof NotConfiguredError)) {
        // Vidéo impossible à préparer ou à envoyer : rien n'est parti, on reste ici pour réessayer.
        return setError(e instanceof FriendlyError ? e.message : "La vidéo n'a pas pu être envoyée. Vérifiez votre connexion et réessayez.");
      }
    }
    const failed = (e: unknown, what: string): PublicationResult[] => platforms.map((p) => ({
      platform: p,
      status: e instanceof NotConfiguredError ? 'not_configured' : 'failed',
      error: e instanceof NotConfiguredError ? null : e instanceof FriendlyError ? e.message : what,
    }));
    if (!file) {
      reel = failed(new NotConfiguredError('meta'), '');
      story = alsoStory ? reel : [];
    } else {
      const f = file;
      reel = await publishReel({ postId: postId.current, caption: caption.trim(), hashtags: tags(), platforms, videoPath: f.path, coverPath: cover.path, idempotencyKey: idempotencyKey.current })
        .catch((e) => failed(e, 'La publication a échoué.'));
      if (alsoStory) {
        story = await publishStory({ storyId: storyId.current, platforms, media: { kind: 'video', uri: video.uri, blob: f.blob, path: f.path }, idempotencyKey: storyId.current })
          .catch((e) => failed(e, 'La story n\'a pas pu partir.'));
      }
    }
    const at = (pubs: PublicationResult[]) => {
      const status = statusAfterPublish(pubs);
      return { status, publications: pubs, publishedAt: status === 'published' || status === 'partially_published' ? new Date().toISOString() : null };
    };
    localPosts(at(reel), alsoStory ? at(story) : undefined);
    setSending(false);
    go({ name: 'published', postId: postId.current, alsoId: alsoStory ? storyId.current : undefined });
  }

  /** Employé : le Reel (et la story) partent chez le patron, qui les publie. */
  async function sendToPatron() {
    try {
      if (!isBackendConfigured) throw new NotConfiguredError('serveur');
      const file = await uploadFinal();
      await submitReel({ postId: postId.current, caption: caption.trim(), hashtags: tags(), platforms, videoPath: file.path, coverPath: cover.path, idempotencyKey: idempotencyKey.current });
      if (alsoStory) await submitStory({ storyId: storyId.current, platforms, media: { kind: 'video', uri: video.uri, blob: file.blob, path: file.path }, idempotencyKey: storyId.current });
      const waiting = { status: 'awaiting_approval' as const, publications: [], reviewState: 'pending' as const };
      localPosts(waiting, waiting);
      refreshTeam();
      go({ name: 'published', postId: postId.current });
    } catch (e) {
      setError(e instanceof NotConfiguredError ? "L'envoi au patron n'est pas encore activé sur le serveur." : e instanceof FriendlyError ? e.message : "Le Reel n'a pas pu être envoyé. Réessayez.");
    } finally {
      setSending(false);
    }
  }

  if (making !== null) return <MakingVideo progress={making} />;
  if (sending) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 }}>
        <ActivityIndicator size="large" color={colors.green} />
        <Title size={22} style={{ textAlign: 'center' }}>Envoi de votre vidéo à Vitrine...</Title>
        <Body soft center>Ensuite, Vitrine publie toute seule : vous pourrez fermer l'application.</Body>
      </View>
    );
  }
  if (choosingMusic) {
    return <MusicChooser selected={track} suggested={suggested} onPick={(id) => { setTrack(id); setChoosingMusic(false); }} onClose={() => setChoosingMusic(false)} />;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={back} />
        <Title size={24} style={{ flex: 1 }}>{writing ? 'Votre Reel' : 'Votre Reel est prêt'}</Title>
      </View>

      <OverlayStage media={{ kind: 'video', uri: video.uri, seconds: video.seconds }} overlay={text.supported ? text.overlay : null} music={music} label={!music ? 'Aperçu sans le son' : undefined} />
      {text.supported && (
        <>
          <OverlayStatus loading={text.loading} failed={text.failed} empty={!hasOverlay(text.overlay)} />
          <OverlayTools overlay={text.overlay} onChange={text.setOverlay} onEdit={() => text.setEditing(true)} onMusic={musicSupported ? () => { audioContext(); setChoosingMusic(true); } : undefined} />
          {musicSupported && <MusicLine title={music ? trackById(music)?.title ?? null : null} />}
        </>
      )}

      {aiNotice ? <Notice tone="orange" title="Légende d'exemple" text={aiNotice} /> : !writing && (
        <View style={{ backgroundColor: colors.greenSoft, borderRadius: radius.sm + 2, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <SparkIcon size={18} color={colors.green} />
          <Text style={{ color: colors.green, fontWeight: '700', flex: 1, fontFamily: fonts.body }}>Écrit par l'IA · ton {toneLabel(b.tone ?? DEFAULT_TONE)}</Text>
        </View>
      )}

      <View style={{ backgroundColor: colors.white, borderRadius: radius.md + 2, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 }}>
        <Text style={{ color: colors.textSoft, fontWeight: '600', fontSize: 14, fontFamily: fonts.body }}>Légende (sous le Reel)</Text>
        {writing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
            <ActivityIndicator color={colors.green} />
            <Body soft size={15}>Vitrine regarde votre vidéo et écrit la légende...</Body>
          </View>
        ) : editing ? (
          <>
            <TextInput value={caption} onChangeText={setCaption} multiline style={input(120)} accessibilityLabel="Légende du Reel" />
            <TextInput value={hashtags} onChangeText={setHashtags} multiline style={input(50)} autoCapitalize="none" accessibilityLabel="Hashtags" />
            <Button title="Valider mes modifications" kind="secondary" icon={<CheckIcon size={18} color={colors.green} />} onPress={() => setEditing(false)} />
          </>
        ) : (
          <>
            <Body size={16}>{caption}</Body>
            <Body size={15} style={{ color: '#2F5FA8' }}>{hashtags}</Body>
          </>
        )}
      </View>
      {!writing && !editing && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Modifier" kind="secondary" icon={<PencilIcon size={18} color={colors.green} />} onPress={() => setEditing(true)} style={{ flex: 1 }} />
          {cover.path && <Button title="Autre texte" kind="secondary" icon={<RefreshIcon size={18} color={colors.green} />} onPress={again} style={{ flex: 1 }} />}
        </View>
      )}

      <PlatformPicker value={platforms} onChange={setPlatforms} connections={connections} />
      {alsoStory && <Body soft size={15} center>La même vidéo, avec son petit texte, part aussi en story.</Body>}

      {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}

      {canPublish ? (
        <Button title={alsoStory ? 'Publier le Reel et la story' : 'Publier le Reel'} disabled={writing} onPress={publish} style={{ minHeight: 64 }} />
      ) : (
        <>
          <Button title="Envoyer au patron" icon={<SendIcon size={22} color={colors.white} />} disabled={writing} onPress={publish} style={{ minHeight: 64 }} />
          <Body soft size={14} center>Le patron le valide avant qu'il parte sur Instagram et Facebook.</Body>
        </>
      )}
      <Button title="Changer de vidéo" kind="ghost" onPress={back} />

      <OverlayEditor
        visible={text.editing}
        overlay={text.overlay}
        emojis={text.emojis}
        onChange={text.setOverlay}
        onClose={() => text.setEditing(false)}
        onRewrite={text.canRewrite ? text.rewrite : undefined}
        rewriting={text.loading}
        video
      />
    </ScrollView>
  );
}

const input = (minHeight: number) => ({
  minHeight, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text, textAlignVertical: 'top' as const, fontFamily: fonts.body,
});
