import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform as RNPlatform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { Body, Button, Notice, Title } from '../components/ui';
import { BackIcon, CameraIcon, CheckIcon, ImageIcon, PencilIcon, RefreshIcon, SparkIcon } from '../components/icons';
import { colors, fonts, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { upcomingEvents } from '../lib/events';
import { isBackendConfigured } from '../lib/config';
import { exampleCaption, FriendlyError, generatePost, NotConfiguredError, publishPost, uploadPhoto } from '../lib/api';
import type { GeneratedPost, Platform, Post, PublicationResult } from '../lib/types';

type Phase = 'pick' | 'generating' | 'preview' | 'publishing';

export function Create({ occasionId }: { occasionId?: string }) {
  const { business, back, go, upsertPost, connections } = useApp();
  const b = business!;
  const occasion = useMemo(() => (occasionId ? upcomingEvents(b.businessType, new Date(), 13, b.postalCode).find((e) => e.id === occasionId) : null), [occasionId, b]);

  const [phase, setPhase] = useState<Phase>('pick');
  const [photo, setPhoto] = useState<{ uri: string; base64?: string | null } | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [postId, setPostId] = useState<string>(() => Crypto.randomUUID());
  const [gen, setGen] = useState<GeneratedPost | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [editing, setEditing] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(['instagram', 'facebook']);
  const [error, setError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [publishStep, setPublishStep] = useState(0);
  const idempotencyKey = useRef<string>(Crypto.randomUUID());

  // Ouvre directement l'appareil photo sur téléphone (sur le web, il faut un clic).
  useEffect(() => {
    if (RNPlatform.OS !== 'web') pick('camera');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(source: 'camera' | 'library') {
    setError(null);
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 0.8, base64: true };
    try {
      if (source === 'camera' && RNPlatform.OS !== 'web') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError("Vitrine a besoin de l'appareil photo. Vous pouvez aussi choisir une photo dans la galerie.");
          return;
        }
      }
      const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const base64 = a.base64 ?? (a.uri.startsWith('data:') ? a.uri.split(',')[1] : null);
      setPhoto({ uri: a.uri, base64 });
      setImagePath(null);
      setPostId(Crypto.randomUUID());
      idempotencyKey.current = Crypto.randomUUID();
      await generate({ uri: a.uri, base64 }, null);
    } catch {
      setError("La photo n'a pas pu être ouverte. Réessayez.");
    }
  }

  async function generate(p = photo, existingPath = imagePath) {
    if (!p) return;
    setPhase('generating');
    setError(null);
    setAiNotice(null);
    try {
      if (!isBackendConfigured) throw new NotConfiguredError('serveur');
      if (!p.base64) throw new FriendlyError("La photo n'a pas pu être lue. Réessayez.");
      const path = existingPath ?? (await uploadPhoto(p.base64));
      setImagePath(path);
      const out = await generatePost({ imagePath: path, occasion: occasion ?? null, postId });
      setPostId(out.postId);
      apply(out);
    } catch (e) {
      if (e instanceof NotConfiguredError) {
        setAiNotice(e.what === 'compte'
          ? "Connectez-vous à votre compte pour que l'IA écrive votre texte. En attendant, voici un texte d'exemple à modifier."
          : "L'IA n'est pas encore branchée : voici un texte d'exemple, qui ne décrit pas votre photo. Modifiez-le avant de publier.");
        apply(exampleCaption(b, occasion));
      } else {
        setError(e instanceof FriendlyError ? e.message : "L'IA n'a pas pu écrire votre texte. Réessayez.");
        setPhase(gen ? 'preview' : 'pick');
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
    if (!photo) return;
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
      if (!isBackendConfigured || !imagePath) throw new NotConfiguredError('meta');
      publications = await publishPost({ postId, caption: caption.trim(), hashtags: tags, platforms, idempotencyKey: idempotencyKey.current });
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
    const post: Post = {
      id: postId,
      imageUri: photo.base64 && RNPlatform.OS === 'web' ? `data:image/jpeg;base64,${photo.base64}` : photo.uri,
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

  const header = (title: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable onPress={back} accessibilityLabel="Retour" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
        <BackIcon color={colors.text} size={20} />
      </Pressable>
      <Title size={24} style={{ flex: 1 }}>{title}</Title>
    </View>
  );

  if (phase === 'pick') {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
        {header(occasion ? `${occasion.name} ${occasion.emoji}` : 'Nouvelle publication')}
        <Body soft>Prenez votre produit, votre vitrine ou votre équipe en photo. Une belle lumière fait toute la différence.</Body>
        <Button title="PRENDRE UNE PHOTO" icon={<CameraIcon size={24} />} onPress={() => pick('camera')} style={{ minHeight: 72 }} />
        <Button title="Choisir dans la galerie" kind="secondary" icon={<ImageIcon size={22} color={colors.green} />} onPress={() => pick('library')} />
        {error && <Notice tone="red" title="Nous avons besoin de votre attention" text={error} />}
      </ScrollView>
    );
  }

  if (phase === 'generating' || phase === 'publishing') {
    const lines = phase === 'generating'
      ? ['Vitrine regarde votre photo...', 'Votre texte est en cours d\'écriture.']
      : ['Votre publication est en préparation...', 'Vitrine publie votre contenu.'];
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 }}>
        {photo && <Image source={{ uri: photo.uri }} style={{ width: 180, height: 225, borderRadius: radius.md, opacity: 0.9 }} />}
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
        {photo && <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 4 / 5 }} resizeMode="cover" />}
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
      <Button title="Reprendre la photo" kind="ghost" onPress={() => { setPhase('pick'); setGen(null); }} />
    </ScrollView>
  );
}

const inputStyle = (minHeight: number) => ({
  minHeight, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text, textAlignVertical: 'top' as const, fontFamily: fonts.body,
});
