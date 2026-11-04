import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform as RNPlatform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Body, Button, Chip, Field, Notice, PlatformPicker, Title, BackButton } from '../components/ui';
import { CameraIcon, CheckIcon, ImageIcon, PencilIcon, RefreshIcon, SparkIcon } from '../components/icons';
import { colors, fonts, glassSurface, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { upcomingEvents } from '../lib/events';
import { isBackendConfigured } from '../lib/config';
import { ensureSession, exampleCaption, FriendlyError, generatePost, NotConfiguredError, publishPost, saveBusinessRemote, uploadPhoto } from '../lib/api';
import { autoCrop, formatRatio, MAX_PHOTOS, takePhotos, type PhotoFormat, type PickedPhoto, type RawPhoto } from '../lib/photo';
import { PhotoCarousel } from '../components/PhotoCarousel';
import { tradeById } from '../lib/trades';
import type { GeneratedPost, Platform, Post, PostIdea, PublicationResult, Tone } from '../lib/types';
import { DEFAULT_TONE, toneLabel, TONES } from '../lib/business';

type Phase = 'pick' | 'photos' | 'generating' | 'preview' | 'publishing';

/** Une photo du post : la version cadrée et son chemin sur le serveur. */
type Slide = { key: string; photo: PickedPhoto; path: string | null };

/** Format de toutes les photos d'un post. */
const FORMAT: PhotoFormat = 'portrait';

export function Create({ occasionId, initialPhoto, idea }: { occasionId?: string; initialPhoto?: RawPhoto; idea?: PostIdea }) {
  const { business, back, go, upsertPost, connections, saveBusiness } = useApp();
  const b = business!;
  const occasion = useMemo(() => (occasionId ? upcomingEvents(b, new Date(), 13, b.postalCode).find((e) => e.id === occasionId) : null), [occasionId, b]);

  const [phase, setPhase] = useState<Phase>('pick');
  const [slides, setSlides] = useState<Slide[]>([]);
  const [busy, setBusy] = useState(false);
  const [postId, setPostIdState] = useState<string>(() => Crypto.randomUUID());
  // Le chemin le plus court pour lire le postId à jour juste après l'avoir changé.
  const postIdRef = useRef(postId);
  const setPostId = (id: string) => {
    postIdRef.current = id;
    setPostIdState(id);
  };
  const [gen, setGen] = useState<GeneratedPost | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [editing, setEditing] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(['instagram', 'facebook']);
  const [error, setError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  // Ton de CE post : celui de la boutique au départ, modifiable avec « Changer le ton ».
  const [tone, setTone] = useState<Tone>(b.tone ?? DEFAULT_TONE);
  // Idées du commerçant, en vrac : l'IA les glisse dans le texte avec ses mots.
  const [notes, setNotes] = useState('');
  const [publishStep, setPublishStep] = useState(0);
  const idempotencyKey = useRef<string>(Crypto.randomUUID());
  // Toujours la dernière liste de photos (les envois au serveur la complètent pendant l'attente).
  const slidesRef = useRef<Slide[]>(slides);
  slidesRef.current = slides;
  const updateSlides = (next: Slide[]) => {
    slidesRef.current = next;
    setSlides(next);
  };

  // Photo déjà prise depuis l'accueil : elle est cadrée toute seule, on passe directement à la suite.
  // Sinon (depuis une fête), on ouvre directement l'appareil photo sur téléphone.
  useEffect(() => {
    if (initialPhoto) addPhotos([initialPhoto]);
    else if (RNPlatform.OS !== 'web') pick('camera');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const room = MAX_PHOTOS - slides.length;

  async function pick(source: 'camera' | 'library') {
    setError(null);
    if (room <= 0) return;
    try {
      const raws = await takePhotos(source, room);
      if (raws.length) await addPhotos(raws);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : "La photo n'a pas pu être ouverte. Réessayez.");
    }
  }

  // ------------------------------------------------------------------ cadrage automatique

  /** Les photos sont cadrées toutes seules, au centre, au format portrait (le mieux mis en valeur sur Instagram). */
  async function addPhotos(raws: RawPhoto[]) {
    setBusy(true);
    setError(null);
    try {
      const next = [...slidesRef.current];
      for (const raw of raws.slice(0, MAX_PHOTOS - next.length)) {
        next.push({ key: Crypto.randomUUID(), photo: await autoCrop(raw, FORMAT), path: null });
      }
      updateSlides(next);
      setPhase('photos');
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : "La photo n'a pas pu être préparée. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------------ liste des photos

  function move(index: number, by: -1 | 1) {
    const next = [...slidesRef.current];
    const j = index + by;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    updateSlides(next);
  }

  function remove(index: number) {
    const next = slidesRef.current.filter((_, i) => i !== index);
    updateSlides(next);
    if (!next.length) {
      setGen(null);
      setPhase('pick');
    }
  }

  // ------------------------------------------------------------------ IA

  /** Envoie au serveur les photos qui n'y sont pas encore. Retourne leurs chemins, dans l'ordre. */
  async function ensureUploaded(): Promise<string[]> {
    const paths: string[] = [];
    for (const s of slidesRef.current) {
      if (s.path) {
        paths.push(s.path);
        continue;
      }
      if (!s.photo.base64) throw new FriendlyError("Une photo n'a pas pu être lue. Retirez-la ou reprenez-la.");
      const path = await uploadPhoto(s.photo.base64);
      // On garde le chemin pour ne pas renvoyer la photo une 2e fois (« Refaire », publication).
      updateSlides(slidesRef.current.map((x) => (x.key === s.key ? { ...x, path } : x)));
      paths.push(path);
    }
    return paths;
  }

  /** Nouveau post à partir des photos choisies : l'IA écrit un nouveau texte. */
  async function start() {
    setPostId(Crypto.randomUUID());
    idempotencyKey.current = Crypto.randomUUID();
    setGen(null);
    await generate(true);
  }

  async function generate(fresh = false, withTone: Tone = tone) {
    if (!slidesRef.current.length) return;
    const hadText = !fresh && !!gen;
    setPhase('generating');
    setError(null);
    setAiNotice(null);
    setRetryNotice(null);
    try {
      if (!isBackendConfigured) throw new NotConfiguredError('serveur');
      if (!(await ensureSession())) throw new NotConfiguredError('compte');
      if (!b.id) {
        // Boutique créée avant que le serveur soit branché : on l'enregistre maintenant.
        const id = await saveBusinessRemote(b);
        if (id) await saveBusiness({ ...b, id });
      }
      const paths = await ensureUploaded();
      const out = await generatePost({ imagePaths: paths, occasion: occasion ?? null, postId: postIdRef.current, tradeHint: tradeById(b.businessType)?.aiHint, idea: idea ?? null, tone: withTone, merchantNote: notes.trim() || undefined });
      setPostId(out.postId);
      apply(out);
    } catch (e) {
      if (e instanceof NotConfiguredError) {
        setAiNotice(e.what === 'compte'
          ? "Connectez-vous à votre compte pour que l'IA écrive votre texte. En attendant, voici un texte d'exemple à modifier."
          : "L'IA n'est pas encore branchée : voici un texte d'exemple, qui ne décrit pas votre photo. Modifiez-le avant de publier.");
        apply(exampleCaption(b, occasion));
      } else if (hadText) {
        // « Refaire » a échoué : le texte précédent est toujours là, on le dit simplement.
        setRetryNotice("Le nouveau texte n'a pas pu être écrit cette fois. Votre texte est toujours là : vous pouvez le publier, ou appuyer à nouveau sur « Refaire ».");
        setPhase('preview');
      } else {
        setError(e instanceof FriendlyError ? e.message : "L'IA n'a pas pu écrire votre texte. Réessayez.");
        setPhase('photos');
      }
    }
  }

  function apply(out: GeneratedPost) {
    setGen(out);
    setCaption(out.instagramCaption);
    setHashtags(out.hashtags.join(' '));
    setEditing(false);
    setPhase('preview');
  }

  async function publish() {
    if (!slides.length) return;
    const tags = hashtags.split(/\s+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`));
    if (!caption.trim()) {
      setError('Le texte est vide. Écrivez quelques mots ou demandez un nouveau texte.');
      return;
    }
    setPhase('publishing');
    setPublishStep(0);
    setError(null);
    const timer = setTimeout(() => setPublishStep(1), 1500);
    let publications: PublicationResult[];
    try {
      if (!isBackendConfigured) throw new NotConfiguredError('meta');
      const imagePaths = await ensureUploaded();
      publications = await publishPost({ postId, caption: caption.trim(), hashtags: tags, platforms, imagePaths, idempotencyKey: idempotencyKey.current });
    } catch (e) {
      const notConfigured = e instanceof NotConfiguredError;
      publications = platforms.map((p) => ({
        platform: p,
        status: notConfigured ? 'not_configured' : 'failed',
        error: notConfigured ? null : e instanceof FriendlyError ? e.message : 'La publication a échoué.',
      }));
    } finally {
      clearTimeout(timer);
    }
    const ok = publications.filter((x) => x.status === 'published').length;
    const first = slides[0].photo;
    const post: Post = {
      id: postId,
      kind: 'post',
      // Seule la 1re photo est gardée sur le téléphone (10 photos rempliraient vite la mémoire du navigateur).
      imageUri: first.base64 && RNPlatform.OS === 'web' ? `data:image/jpeg;base64,${first.base64}` : first.uri,
      photoCount: slides.length,
      caption: caption.trim(),
      hashtags: tags,
      platforms,
      occasionId: occasion?.id ?? null,
      createdAt: new Date().toISOString(),
      publishedAt: ok ? new Date().toISOString() : null,
      status: ok === publications.length ? 'published' : ok > 0 ? 'partially_published' : publications.every((x) => x.status === 'not_configured') ? 'draft' : 'failed',
      publications,
    };
    upsertPost(post);
    go({ name: 'published', postId: post.id });
  }

  // ------------------------------------------------------------------ rendu

  const ratio = formatRatio(FORMAT);
  const header = (title: string, onBack: () => void = back) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <BackButton onPress={onBack} />
      <Title size={24} style={{ flex: 1 }}>{title}</Title>
    </View>
  );

  // Case « Vos idées pour le texte » : sur la page des photos et sous le texte proposé.
  const notesField = (
    <Field
      label="Vos idées pour le texte (facultatif)"
      hint="Écrivez en vrac ce que vous voulez dire. L'IA le glisse dans le texte avec ses mots. Les prix et les dates sont repris tels quels."
      placeholder="Ex. : pivoines du marché, pour la fête des mères, petits bouquets aussi"
      value={notes}
      onChangeText={setNotes}
      multiline
      maxLength={300}
      accessibilityLabel="Vos idées pour le texte"
    />
  );

  if (phase === 'pick') {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
        {header(occasion ? occasion.name : idea ? idea.title : 'Nouvelle publication')}
        <Body soft>{idea ? `À photographier : ${idea.photo}` : 'Prenez votre produit, votre vitrine ou votre équipe en photo. Une belle lumière fait toute la différence.'}</Body>
        <Button title="PRENDRE UNE PHOTO" icon={<CameraIcon size={24} />} loading={busy} onPress={() => pick('camera')} style={{ minHeight: 72 }} />
        <Button title="Choisir dans la galerie" kind="secondary" icon={<ImageIcon size={22} color={colors.green} />} disabled={busy} onPress={() => pick('library')} />
        <Body soft size={14} center>Dans la galerie, vous pouvez choisir jusqu'à {MAX_PHOTOS} photos d'un coup.</Body>
        {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}
      </ScrollView>
    );
  }

  if (phase === 'photos') {
    const thumbW = 84;
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
        {header(slides.length > 1 ? `Vos ${slides.length} photos` : 'Votre photo', gen ? () => setPhase('preview') : back)}
        <Body soft>
          {slides.length > 1
            ? 'Elles défileront dans cet ordre sur Instagram et Facebook. La 1re est celle que l\'on voit en premier.'
            : 'Vous pouvez ajouter d\'autres photos : elles défileront comme un diaporama.'}
        </Body>
        {slides.map((s, i) => (
          <View key={s.key} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', ...glassSurface, borderRadius: radius.md, padding: 10 }}>
            <Image source={{ uri: s.photo.uri }} style={{ width: thumbW, height: thumbW / ratio, borderRadius: radius.sm, backgroundColor: colors.greenSoft }} />
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text, fontFamily: fonts.body }}>Photo {i + 1}</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <SmallButton label="Retirer" danger onPress={() => remove(i)} />
              </View>
            </View>
            {slides.length > 1 && (
              <View style={{ gap: 6 }}>
                <SmallButton label="▲" a11y={`Monter la photo ${i + 1}`} disabled={i === 0} onPress={() => move(i, -1)} />
                <SmallButton label="▼" a11y={`Descendre la photo ${i + 1}`} disabled={i === slides.length - 1} onPress={() => move(i, 1)} />
              </View>
            )}
          </View>
        ))}

        {room > 0 ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Photo" kind="secondary" icon={<CameraIcon size={20} color={colors.green} />} loading={busy} onPress={() => pick('camera')} style={{ flex: 1 }} />
            <Button title="Galerie" kind="secondary" icon={<ImageIcon size={20} color={colors.green} />} disabled={busy} onPress={() => pick('library')} style={{ flex: 1 }} />
          </View>
        ) : (
          <Body soft size={14} center>{MAX_PHOTOS} photos au maximum : c'est la limite d'Instagram et Facebook.</Body>
        )}

        {notesField}

        {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}

        {gen ? (
          <>
            <Button title="VOIR MON POST" onPress={() => setPhase('preview')} style={{ minHeight: 64 }} />
            <Button title="Écrire un nouveau texte pour ces photos" kind="secondary" icon={<RefreshIcon size={18} color={colors.green} />} onPress={() => generate()} />
          </>
        ) : (
          <Button title="ÉCRIRE MON TEXTE" icon={<SparkIcon size={22} color={colors.white} />} onPress={start} style={{ minHeight: 64 }} />
        )}
      </ScrollView>
    );
  }

  if (phase === 'generating' || phase === 'publishing') {
    const lines = phase === 'generating'
      ? [slides.length > 1 ? 'Vitrine regarde vos photos...' : 'Vitrine regarde votre photo...', 'Votre texte est en cours d\'écriture.']
      : ['Votre publication est en préparation...', 'Vitrine publie votre contenu.'];
    const cover = slides[0]?.photo.uri;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 }}>
        {cover && <Image source={{ uri: cover }} style={{ width: 180, height: 180 / ratio, borderRadius: radius.md, opacity: 0.9 }} />}
        <ActivityIndicator size="large" color={colors.green} />
        <Title size={22} style={{ textAlign: 'center' }}>{phase === 'publishing' ? lines[publishStep] : lines[0]}</Title>
        <Body soft center>{phase === 'generating' ? lines[1] : 'Gardez l\'application ouverte quelques secondes.'}</Body>
      </View>
    );
  }

  // phase === 'preview'
  const handle = b.businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {header('Votre post est prêt')}

      {aiNotice ? (
        <Notice tone="orange" title="Texte d'exemple" text={aiNotice} />
      ) : (
        <View style={{ backgroundColor: colors.greenSoft, borderRadius: radius.sm + 2, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <SparkIcon size={18} color={colors.green} />
          <Text style={{ color: colors.green, fontWeight: '700', flex: 1, fontFamily: fonts.body }}>Écrit par l'IA · ton {toneLabel(tone)}</Text>
        </View>
      )}

      <View style={{ backgroundColor: colors.white, borderRadius: radius.md + 2, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#FBE3E6' }} />
          <Text style={{ fontWeight: '700', color: colors.text, fontFamily: fonts.body }}>{handle}</Text>
        </View>
        <PhotoCarousel uris={slides.map((x) => x.photo.uri)} ratio={ratio} />
        <View style={{ padding: 14, gap: 8 }}>
          {editing ? (
            <>
              <Text style={{ fontWeight: '600', color: colors.text }}>Texte</Text>
              <TextInput value={caption} onChangeText={setCaption} multiline style={inputStyle(140)} accessibilityLabel="Texte de la publication" />
              <Text style={{ fontWeight: '600', color: colors.text }}>Hashtags</Text>
              <TextInput value={hashtags} onChangeText={setHashtags} multiline style={inputStyle(60)} autoCapitalize="none" accessibilityLabel="Hashtags" />
              <Button title="Valider mes modifications" kind="secondary" icon={<CheckIcon size={18} color={colors.green} />} onPress={() => setEditing(false)} />
            </>
          ) : (
            <>
              <Body size={16}>{caption}</Body>
              <Body size={15} style={{ color: '#2F5FA8' }}>{hashtags}</Body>
            </>
          )}
        </View>
      </View>

      {retryNotice && <Notice tone="orange" title="Pas de nouveau texte cette fois" text={retryNotice} />}
      {gen?.improvementTip ? <Body soft size={14}>Conseil : {gen.improvementTip}</Body> : null}

      {!aiNotice && (
        <View style={{ gap: 8 }}>
          {notesField}
          <Button title="Réécrire avec mes idées" kind="secondary" icon={<SparkIcon size={18} color={colors.green} />} onPress={() => generate()} disabled={!notes.trim()} />
        </View>
      )}

      {!aiNotice && (
        <View style={{ gap: 8 }}>
          <Body style={{ fontWeight: '600' }}>Changer le ton</Body>
          <Body soft size={14}>Le texte ne vous plaît pas ? Choisissez un autre ton, l'IA le réécrit. Seulement pour ce post.</Body>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TONES.map((t) => (
              <Chip key={t.id} label={t.label} selected={tone === t.id} onPress={() => { setTone(t.id); generate(false, t.id); }} />
            ))}
          </View>
        </View>
      )}

      <PlatformPicker value={platforms} onChange={setPlatforms} connections={connections} />

      {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}

      <Button title="PUBLIER MAINTENANT" onPress={publish} style={{ minHeight: 64 }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="MODIFIER" kind="secondary" icon={<PencilIcon size={18} color={colors.green} />} onPress={() => setEditing(true)} style={{ flex: 1 }} />
        <Button title="REFAIRE" kind="secondary" icon={<RefreshIcon size={18} color={colors.green} />} onPress={() => generate()} style={{ flex: 1 }} />
      </View>
      <Button title={slides.length > 1 ? 'Changer les photos' : 'Changer la photo, ou en ajouter'} kind="ghost" onPress={() => { setError(null); setPhase('photos'); }} />
    </ScrollView>
  );
}

const inputStyle = (minHeight: number) => ({
  minHeight, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text, textAlignVertical: 'top' as const, fontFamily: fonts.body,
});

function SmallButton({ label, a11y, onPress, disabled, danger }: { label: string; a11y?: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const c = danger ? colors.red : colors.green;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y ?? label}
      style={({ pressed }) => ({ minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: c, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : pressed ? 0.8 : 1 })}>
      <Text style={{ color: c, fontWeight: '700', fontSize: 15, fontFamily: fonts.body }}>{label}</Text>
    </Pressable>
  );
}
