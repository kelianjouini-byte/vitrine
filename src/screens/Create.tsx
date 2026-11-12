import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform as RNPlatform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Body, Button, Chip, Field, Notice, PlatformPicker, Title, BackButton } from '../components/ui';
import { CameraIcon, CheckIcon, CropIcon, ImageIcon, PencilIcon, RefreshIcon, SparkIcon, TrashIcon, SendIcon } from '../components/icons';
import { colors, fonts, glassSurface, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { upcomingEvents } from '../lib/events';
import { isBackendConfigured } from '../lib/config';
import { ensureSession, exampleCaption, FriendlyError, generatePost, NotConfiguredError, publishPost, saveBusinessRemote, submitPost, uploadPhoto } from '../lib/api';
import { CENTERED, formatRatio, MAX_PHOTOS, renderCrop, takePhotos, type Framing, type PhotoFormat, type PickedPhoto, type RawPhoto } from '../lib/photo';
import { PhotoCropper } from '../components/PhotoCropper';
import { PhotoCarousel } from '../components/PhotoCarousel';
import { tradeById } from '../lib/trades';
import type { GeneratedPost, Platform, Post, PostIdea, PublicationResult, Tone } from '../lib/types';
import { DEFAULT_TONE, toneLabel, TONES } from '../lib/business';
import { DAY_NAMES, dayLabel, parseDayKey, reminderDate, statusAfterPublish, weekday } from '../lib/planning';

type Phase = 'pick' | 'photos' | 'crop' | 'generating' | 'preview' | 'publishing';

/** Une photo du post : l'originale (pour « Recadrer »), son cadrage, la version cadrée et son chemin sur le serveur. */
type Slide = { key: string; raw: RawPhoto; framing: Framing; photo: PickedPhoto; path: string | null };

/** Format de toutes les photos d'un post. */
const FORMAT: PhotoFormat = 'portrait';

export function Create({ occasionId, initialPhoto, idea, plannedFor, note }: { occasionId?: string; initialPhoto?: RawPhoto; idea?: PostIdea; plannedFor?: string; note?: string }) {
  const { business, back, go, upsertPost, connections, saveBusiness, prefs, canPublish, refreshTeam } = useApp();
  // Post préparé à l'avance depuis le planning : « Vendredi 6 novembre ».
  const plannedLabel = plannedFor ? dayLabel(parseDayKey(plannedFor)) : null;
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
  // Pré-remplie depuis le planning (ex. « Ouvert le mercredi 11 novembre (jour férié) »).
  const [notes, setNotes] = useState(note ?? '');
  const [publishStep, setPublishStep] = useState(0);
  const idempotencyKey = useRef<string>(Crypto.randomUUID());
  // Toujours la dernière liste de photos (les envois au serveur la complètent pendant l'attente).
  const slidesRef = useRef<Slide[]>(slides);
  slidesRef.current = slides;
  const updateSlides = (next: Slide[]) => {
    slidesRef.current = next;
    setSlides(next);
  };
  // Recadrage d'une photo : laquelle, et le cadrage en cours (validé seulement avec « Valider »).
  const [cropKey, setCropKey] = useState<string | null>(null);
  const [cropDraft, setCropDraft] = useState<Framing>(CENTERED);
  const [cropDragging, setCropDragging] = useState(false);

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
        next.push({ key: Crypto.randomUUID(), raw, framing: CENTERED, photo: await renderCrop(raw, FORMAT, CENTERED), path: null });
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

  // ------------------------------------------------------------------ recadrage à la main

  function openCrop(key: string) {
    const s = slidesRef.current.find((x) => x.key === key);
    if (!s) return;
    setError(null);
    setCropDraft(s.framing);
    setCropKey(key);
    setPhase('crop');
  }

  /** Redécoupe la photo avec le nouveau cadrage. Elle sera renvoyée au serveur (le texte, lui, ne change pas). */
  async function saveCrop() {
    const s = slidesRef.current.find((x) => x.key === cropKey);
    if (!s) return setPhase('photos');
    setBusy(true);
    setError(null);
    try {
      const photo = await renderCrop(s.raw, FORMAT, cropDraft);
      updateSlides(slidesRef.current.map((x) => (x.key === s.key ? { ...x, framing: cropDraft, photo, path: null } : x)));
      setCropKey(null);
      setPhase('photos');
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : "La photo n'a pas pu être recadrée. Réessayez.");
    } finally {
      setBusy(false);
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
    if (!canPublish) return sendToPatron(tags);
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
    const status = statusAfterPublish(publications);
    const done = status === 'published' || status === 'partially_published';
    const post = buildPost(tags, { status, publications, publishedAt: done ? new Date().toISOString() : null });
    upsertPost(post);
    go({ name: 'published', postId: post.id });
  }

  /** Employé : le post part chez le patron, qui le publie (ou le refuse avec un petit mot). Rien n'est publié ici. */
  async function sendToPatron(tags: string[]) {
    setBusy(true);
    setError(null);
    try {
      if (!isBackendConfigured) throw new NotConfiguredError('serveur');
      const imagePaths = await ensureUploaded();
      await submitPost({ postId, caption: caption.trim(), hashtags: tags, platforms, imagePaths, idempotencyKey: idempotencyKey.current });
      upsertPost(buildPost(tags, { status: 'awaiting_approval', publications: [], reviewState: 'pending', reviewNote: null }));
      refreshTeam();
      go({ name: 'published', postId });
    } catch (e) {
      setError(e instanceof NotConfiguredError ? "L'envoi au patron n'est pas encore activé sur le serveur." : e instanceof FriendlyError ? e.message : "Le post n'a pas pu être envoyé. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  /** Le post tel qu'il est gardé sur le téléphone (Mes posts, planning, bilan). */
  function buildPost(tags: string[], extra: Pick<Post, 'status' | 'publications'> & Partial<Post>): Post {
    const first = slides[0].photo;
    return {
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
      ...extra,
    };
  }

  /** Planning : le post est rangé dans son jour, prêt à publier (rien n'est publié maintenant). */
  async function keepForLater() {
    if (!plannedFor || !slides.length) return;
    if (!caption.trim()) {
      setError('Le texte est vide. Écrivez quelques mots ou demandez un nouveau texte.');
      return;
    }
    const tags = hashtags.split(/\s+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`));
    setBusy(true);
    setError(null);
    let imagePaths: string[] | undefined;
    try {
      // Les photos sont gardées sur le serveur pour pouvoir les publier le jour venu.
      if (isBackendConfigured && (await ensureSession())) imagePaths = await ensureUploaded();
    } catch {
      setBusy(false);
      setError("Les photos n'ont pas pu être enregistrées. Vérifiez votre connexion et réessayez.");
      return;
    }
    upsertPost(buildPost(tags, {
      status: 'scheduled',
      publications: [],
      scheduledFor: reminderDate(plannedFor, prefs.hour).toISOString(),
      imagePaths,
      idempotencyKey: idempotencyKey.current,
    }));
    setBusy(false);
    back(); // retour au jour du planning, qui montre le post prévu
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
        {plannedLabel && <Body style={{ fontWeight: '600', color: colors.green }}>Pour {plannedLabel.toLowerCase()}</Body>}
        <Body soft>{idea ? `À photographier : ${idea.photo}` : 'Prenez votre produit, votre vitrine ou votre équipe en photo. Une belle lumière fait toute la différence.'}</Body>
        <Button title="Prendre une photo" icon={<CameraIcon size={24} />} loading={busy} onPress={() => pick('camera')} style={{ minHeight: 72 }} />
        <Button title="Choisir dans la galerie" kind="secondary" icon={<ImageIcon size={22} color={colors.green} />} disabled={busy} onPress={() => pick('library')} />
        <Body soft size={15} center>Dans la galerie, vous pouvez choisir jusqu'à {MAX_PHOTOS} photos d'un coup.</Body>
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
                <SmallButton label="Recadrer" a11y={`Recadrer la photo ${i + 1}`} icon={<CropIcon size={18} color={colors.green} />} green onPress={() => openCrop(s.key)} />
                <SmallButton label="Retirer" a11y={`Retirer la photo ${i + 1}`} icon={<TrashIcon size={18} color={colors.textSoft} />} onPress={() => remove(i)} />
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
          <View style={{ gap: 10 }}>
            <Button title="Prendre une autre photo" kind="secondary" icon={<CameraIcon size={20} color={colors.green} />} loading={busy} onPress={() => pick('camera')} />
            <Button title="Choisir dans mes photos" kind="secondary" icon={<ImageIcon size={20} color={colors.green} />} disabled={busy} onPress={() => pick('library')} />
          </View>
        ) : (
          <Body soft size={15} center>{MAX_PHOTOS} photos au maximum : c'est la limite d'Instagram et Facebook.</Body>
        )}

        {notesField}

        {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}

        {gen ? (
          <>
            <Button title="Voir mon post" onPress={() => setPhase('preview')} style={{ minHeight: 64 }} />
            <Button title="Écrire un nouveau texte pour ces photos" kind="secondary" icon={<RefreshIcon size={18} color={colors.green} />} onPress={() => generate()} />
          </>
        ) : (
          <Button title="Écrire mon texte" icon={<SparkIcon size={22} color={colors.white} />} onPress={start} style={{ minHeight: 64 }} />
        )}
      </ScrollView>
    );
  }

  if (phase === 'crop') {
    const index = slides.findIndex((x) => x.key === cropKey);
    const s = slides[index];
    if (!s) return null;
    return (
      <ScrollView scrollEnabled={!cropDragging} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
        {header(slides.length > 1 ? `Recadrer la photo ${index + 1}` : 'Recadrer la photo', () => setPhase('photos'))}
        <Body soft>Faites glisser la photo avec le doigt pour choisir ce qui apparaît. Zoomez avec deux doigts ou avec les boutons.</Body>
        <PhotoCropper photo={s.raw} format={FORMAT} framing={cropDraft} onChange={setCropDraft} onDragging={setCropDragging} />
        {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}
        <Button title="Valider le cadrage" icon={<CheckIcon size={22} />} loading={busy} onPress={saveCrop} style={{ minHeight: 64 }} />
        <Button title="Remettre au centre" kind="secondary" disabled={busy} onPress={() => setCropDraft(CENTERED)} />
        <Button title="Annuler" kind="ghost" disabled={busy} onPress={() => setPhase('photos')} />
      </ScrollView>
    );
  }

  if (phase === 'generating' || phase === 'publishing') {
    const lines = phase === 'generating'
      ? [slides.length > 1 ? 'Vitrine regarde vos photos...' : 'Vitrine regarde votre photo...', 'Votre texte est en cours d\'écriture.']
      : ['Envoi de vos photos à Vitrine...', 'Encore un instant...'];
    const cover = slides[0]?.photo.uri;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 }}>
        {cover && <Image source={{ uri: cover }} style={{ width: 180, height: 180 / ratio, borderRadius: radius.md, opacity: 0.9 }} />}
        <ActivityIndicator size="large" color={colors.green} />
        <Title size={22} style={{ textAlign: 'center' }}>{phase === 'publishing' ? lines[publishStep] : lines[0]}</Title>
        <Body soft center>{phase === 'generating' ? lines[1] : 'Ensuite, Vitrine publie toute seule : vous pourrez fermer l\'application.'}</Body>
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
      {gen?.improvementTip ? <Body soft size={15}>Conseil : {gen.improvementTip}</Body> : null}

      {!aiNotice && (
        <View style={{ gap: 8 }}>
          {notesField}
          <Button title="Réécrire avec mes idées" kind="secondary" icon={<SparkIcon size={18} color={colors.green} />} onPress={() => generate()} disabled={!notes.trim()} />
        </View>
      )}

      {!aiNotice && (
        <View style={{ gap: 8 }}>
          <Body style={{ fontWeight: '600' }}>Changer le ton</Body>
          <Body soft size={15}>Le texte ne vous plaît pas ? Choisissez un autre ton, l'IA le réécrit. Seulement pour ce post.</Body>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TONES.map((t) => (
              <Chip key={t.id} label={t.label} selected={tone === t.id} onPress={() => { setTone(t.id); generate(false, t.id); }} />
            ))}
          </View>
        </View>
      )}

      <PlatformPicker value={platforms} onChange={setPlatforms} connections={connections} />

      {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}

      {plannedLabel ? (
        <>
          <Button title={`Prévoir pour ${DAY_NAMES[weekday(parseDayKey(plannedFor!))].toLowerCase()}`} icon={<CheckIcon size={20} />} loading={busy} onPress={keepForLater} style={{ minHeight: 64 }} />
          <Button title={canPublish ? 'Publier maintenant' : 'Envoyer au patron maintenant'} kind="secondary" disabled={busy} onPress={publish} />
        </>
      ) : canPublish ? (
        <Button title="Publier maintenant" onPress={publish} style={{ minHeight: 64 }} />
      ) : (
        <>
          <Button title="Envoyer au patron" icon={<SendIcon size={22} color={colors.white} />} loading={busy} onPress={publish} style={{ minHeight: 64 }} />
          <Body soft size={14} center>Le patron le valide avant qu'il parte sur Instagram et Facebook.</Body>
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Modifier" kind="secondary" icon={<PencilIcon size={18} color={colors.green} />} onPress={() => setEditing(true)} style={{ flex: 1 }} />
        <Button title="Autre texte" kind="secondary" icon={<RefreshIcon size={18} color={colors.green} />} onPress={() => generate()} style={{ flex: 1 }} />
      </View>
      <Button title={slides.length > 1 ? 'Changer les photos' : 'Changer la photo, ou en ajouter'} kind="ghost" onPress={() => { setError(null); setPhase('photos'); }} />
    </ScrollView>
  );
}

const inputStyle = (minHeight: number) => ({
  minHeight, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text, textAlignVertical: 'top' as const, fontFamily: fonts.body,
});

/** Petit bouton des photos (monter, descendre, recadrer, retirer). « Retirer » est gris : ce n'est pas une erreur. */
function SmallButton({ label, a11y, onPress, disabled, icon, green }: { label: string; a11y?: string; onPress: () => void; disabled?: boolean; icon?: React.ReactNode; green?: boolean }) {
  const c = icon && !green ? colors.textSoft : colors.green;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y ?? label}
      style={({ pressed }) => ({ minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: icon && !green ? 'rgba(36,51,43,0.15)' : c, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : pressed ? 0.8 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon}
        <Text style={{ color: c, fontWeight: '700', fontSize: 15, fontFamily: fonts.body }}>{label}</Text>
      </View>
    </Pressable>
  );
}
