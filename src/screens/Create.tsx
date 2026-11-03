import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform as RNPlatform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Body, Button, Notice, Title } from '../components/ui';
import { BackIcon, CameraIcon, CheckIcon, ImageIcon, PencilIcon, RefreshIcon, SparkIcon } from '../components/icons';
import { colors, fonts, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { upcomingEvents } from '../lib/events';
import { isBackendConfigured } from '../lib/config';
import { ensureSession, exampleCaption, FriendlyError, generatePost, NotConfiguredError, publishPost, saveBusinessRemote, uploadPhoto } from '../lib/api';
import { CENTERED, clampFraming, formatRatio, MAX_PHOTOS, renderCrop, takePhotos, type Framing, type PhotoFormat, type PickedPhoto, type RawPhoto } from '../lib/photo';
import { PhotoCropper } from '../components/PhotoCropper';
import { PhotoCarousel } from '../components/PhotoCarousel';
import { tradeById } from '../lib/trades';
import type { GeneratedPost, Platform, Post, PostIdea, PublicationResult } from '../lib/types';

type Phase = 'pick' | 'crop' | 'photos' | 'generating' | 'preview' | 'publishing';

/** Une photo du post : l'originale (pour recadrer à nouveau), son cadrage, la version recadrée et son chemin sur le serveur. */
type Slide = { key: string; raw: RawPhoto; framing: Framing; photo: PickedPhoto; path: string | null };

/** Photo en cours de recadrage. `index` null = nouvelle photo ; `rest` = photos choisies ensemble dans la galerie, à recadrer ensuite. */
type Cropping = { raw: RawPhoto; framing: Framing; index: number | null; rest: RawPhoto[] };

export function Create({ occasionId, initialPhoto, idea }: { occasionId?: string; initialPhoto?: RawPhoto; idea?: PostIdea }) {
  const { business, back, go, upsertPost, connections, saveBusiness } = useApp();
  const b = business!;
  const occasion = useMemo(() => (occasionId ? upcomingEvents(b, new Date(), 13, b.postalCode).find((e) => e.id === occasionId) : null), [occasionId, b]);

  const [phase, setPhase] = useState<Phase>('pick');
  const [slides, setSlides] = useState<Slide[]>([]);
  const [format, setFormat] = useState<PhotoFormat>('portrait');
  const [cropping, setCropping] = useState<Cropping | null>(null);
  const [cropFormat, setCropFormat] = useState<PhotoFormat>('portrait');
  const [cropBusy, setCropBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
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
  const [publishStep, setPublishStep] = useState(0);
  const idempotencyKey = useRef<string>(Crypto.randomUUID());
  // Toujours la dernière liste de photos (les envois au serveur la complètent pendant l'attente).
  const slidesRef = useRef<Slide[]>(slides);
  slidesRef.current = slides;
  const updateSlides = (next: Slide[]) => {
    slidesRef.current = next;
    setSlides(next);
  };

  // Photo déjà prise depuis l'accueil : on passe tout de suite au recadrage.
  // Sinon (depuis une fête), on ouvre directement l'appareil photo sur téléphone.
  useEffect(() => {
    if (initialPhoto) openCrop([initialPhoto]);
    else if (RNPlatform.OS !== 'web') pick('camera');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const room = MAX_PHOTOS - slides.length;

  async function pick(source: 'camera' | 'library') {
    setError(null);
    if (room <= 0) return;
    try {
      const raws = await takePhotos(source, room);
      if (raws.length) openCrop(raws);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : "La photo n'a pas pu être ouverte. Réessayez.");
    }
  }

  // ------------------------------------------------------------------ recadrage

  function openCrop(raws: RawPhoto[]) {
    const [first, ...rest] = raws;
    setCropFormat(format);
    setCropping({ raw: first, framing: clampFraming(first, format, CENTERED), index: null, rest });
    setPhase('crop');
  }

  function recrop(index: number) {
    const s = slidesRef.current[index];
    setCropFormat(format);
    setCropping({ raw: s.raw, framing: s.framing, index, rest: [] });
    setPhase('crop');
  }

  /** Le format ne se choisit que sur la 1re photo : toutes les photos d'un carrousel ont le même. */
  const canChooseFormat = !!cropping && (cropping.index === 0 || (cropping.index === null && slides.length === 0));

  function changeCropFormat(f: PhotoFormat) {
    if (!cropping) return;
    setCropFormat(f);
    setCropping({ ...cropping, framing: clampFraming(cropping.raw, f, cropping.framing) });
  }

  /** Valide le recadrage. `centerRest` : les autres photos choisies ensemble sont centrées automatiquement. */
  async function validateCrop(centerRest = false) {
    if (!cropping) return;
    setCropBusy(true);
    setError(null);
    try {
      const f = cropFormat;
      let next = [...slidesRef.current];
      // Nouveau format choisi : on recadre les autres photos dans ce format, en gardant leur cadrage au mieux.
      if (f !== format && next.length) {
        next = await Promise.all(next.map(async (s, i) => {
          if (i === cropping.index) return s;
          const framing = clampFraming(s.raw, f, s.framing);
          return { ...s, framing, photo: await renderCrop(s.raw, f, framing), path: null };
        }));
      }
      const photo = await renderCrop(cropping.raw, f, cropping.framing);
      const slide: Slide = { key: Crypto.randomUUID(), raw: cropping.raw, framing: cropping.framing, photo, path: null };
      if (cropping.index === null) next.push(slide);
      else next[cropping.index] = slide;
      let rest = cropping.rest.slice(0, MAX_PHOTOS - next.length);
      if (centerRest) {
        for (const raw of rest) {
          const framing = clampFraming(raw, f, CENTERED);
          next.push({ key: Crypto.randomUUID(), raw, framing, photo: await renderCrop(raw, f, framing), path: null });
        }
        rest = [];
      }
      setFormat(f);
      updateSlides(next);
      if (rest.length) {
        const [first, ...others] = rest;
        setCropping({ raw: first, framing: clampFraming(first, f, CENTERED), index: null, rest: others });
      } else {
        setCropping(null);
        setPhase('photos');
      }
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : "La photo n'a pas pu être recadrée. Réessayez.");
    } finally {
      setCropBusy(false);
    }
  }

  function cancelCrop() {
    setCropping(null);
    setError(null);
    setPhase(slidesRef.current.length ? 'photos' : 'pick');
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

  async function generate(fresh = false) {
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
      const out = await generatePost({ imagePaths: paths, occasion: occasion ?? null, postId: postIdRef.current, tradeHint: tradeById(b.businessType)?.aiHint, idea: idea ?? null });
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

  const togglePlatform = (p: Platform) =>
    setPlatforms((cur) => (cur.includes(p) ? (cur.length > 1 ? cur.filter((x) => x !== p) : cur) : [...cur, p]));

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

  const ratio = formatRatio(format);
  const header = (title: string, onBack: () => void = back) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable onPress={onBack} accessibilityLabel="Retour" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
        <BackIcon color={colors.text} size={20} />
      </Pressable>
      <Title size={24} style={{ flex: 1 }}>{title}</Title>
    </View>
  );

  if (phase === 'pick') {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
        {header(occasion ? `${occasion.name} ${occasion.emoji}` : idea ? idea.title : 'Nouvelle publication')}
        <Body soft>{idea ? `📸 ${idea.photo}` : 'Prenez votre produit, votre vitrine ou votre équipe en photo. Une belle lumière fait toute la différence.'}</Body>
        <Button title="PRENDRE UNE PHOTO" icon={<CameraIcon size={24} />} onPress={() => pick('camera')} style={{ minHeight: 72 }} />
        <Button title="Choisir dans la galerie" kind="secondary" icon={<ImageIcon size={22} color={colors.green} />} onPress={() => pick('library')} />
        <Body soft size={14} center>Dans la galerie, vous pouvez choisir jusqu'à {MAX_PHOTOS} photos d'un coup.</Body>
        {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}
      </ScrollView>
    );
  }

  if (phase === 'crop' && cropping) {
    const position = cropping.index !== null ? cropping.index + 1 : slides.length + 1;
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} scrollEnabled={!dragging}>
        {header(`Recadrer la photo${position > 1 || cropping.rest.length ? ` ${position}` : ''}`, cancelCrop)}
        <Body soft>Faites glisser la photo avec le doigt pour choisir ce qui apparaît.</Body>
        <PhotoCropper
          photo={cropping.raw}
          format={cropFormat}
          framing={cropping.framing}
          onChange={(framing) => setCropping((c) => (c ? { ...c, framing } : c))}
          onFormat={canChooseFormat ? changeCropFormat : undefined}
          onDragging={setDragging}
        />
        {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}
        <Button title="VALIDER" icon={<CheckIcon size={22} />} loading={cropBusy} onPress={() => validateCrop()} style={{ minHeight: 64 }} />
        {cropping.rest.length > 0 && !cropBusy && (
          <Button
            title={cropping.rest.length === 1 ? 'Valider, et centrer la photo suivante' : `Valider, et centrer les ${cropping.rest.length} suivantes`}
            kind="secondary"
            onPress={() => validateCrop(true)}
          />
        )}
        <Button title="Annuler" kind="ghost" onPress={cancelCrop} disabled={cropBusy} />
      </ScrollView>
    );
  }

  if (phase === 'photos' || phase === 'crop') {
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
          <View key={s.key} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10 }}>
            <Image source={{ uri: s.photo.uri }} style={{ width: thumbW, height: thumbW / ratio, borderRadius: radius.sm, backgroundColor: colors.greenSoft }} />
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text, fontFamily: fonts.body }}>Photo {i + 1}</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <SmallButton label="Recadrer" onPress={() => recrop(i)} />
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
            <Button title="Photo" kind="secondary" icon={<CameraIcon size={20} color={colors.green} />} onPress={() => pick('camera')} style={{ flex: 1 }} />
            <Button title="Galerie" kind="secondary" icon={<ImageIcon size={20} color={colors.green} />} onPress={() => pick('library')} style={{ flex: 1 }} />
          </View>
        ) : (
          <Body soft size={14} center>{MAX_PHOTOS} photos au maximum : c'est la limite d'Instagram et Facebook.</Body>
        )}

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
          <Text style={{ color: colors.green, fontWeight: '700', flex: 1, fontFamily: fonts.body }}>Écrit par l'IA dans le style de votre boutique</Text>
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
      {gen?.improvementTip ? <Body soft size={14}>💡 {gen.improvementTip}</Body> : null}

      <View style={{ gap: 8 }}>
        <Body style={{ fontWeight: '600' }}>Publier sur</Body>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['instagram', 'facebook'] as Platform[]).map((p) => {
            const on = platforms.includes(p);
            const conn = connections.find((c) => c.platform === p)?.status === 'connected';
            return (
              <Pressable key={p} onPress={() => togglePlatform(p)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={{ flex: 1, minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: on ? colors.green : colors.border, backgroundColor: on ? colors.greenSoft : colors.white, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
                {on && <CheckIcon size={16} color={colors.green} />}
                <Text style={{ color: on ? colors.green : colors.textSoft, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>{p === 'instagram' ? 'Instagram' : 'Facebook'}</Text>
                {!conn && <Text style={{ color: colors.textSoft, fontSize: 12 }}>(non connecté)</Text>}
              </Pressable>
            );
          })}
        </View>
      </View>

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
