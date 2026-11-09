import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, TextInput, View } from 'react-native';
import { BackButton, Badge, Body, Button, Card, Field, IconTile, Notice, Title } from '../components/ui';
import { CheckIcon, PencilIcon, PersonIcon, VideoIcon } from '../components/icons';
import { colors, fonts } from '../lib/theme';
import { useApp } from '../lib/store';
import { approvePost, FriendlyError, NotConfiguredError, pendingPosts, rejectPost } from '../lib/api';
import type { PendingPost } from '../lib/team';
import type { PublicationResult } from '../lib/types';

/** Les posts préparés par les employés : le patron publie, modifie le texte, ou refuse avec un petit mot. */
export function Review() {
  const { back, refreshTeam } = useApp();
  const [posts, setPosts] = useState<PendingPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; text?: string; tone: 'green' | 'orange' | 'red' } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPosts(await pendingPosts());
    } catch (e) {
      setError(e instanceof NotConfiguredError ? "La validation n'est pas encore activée sur le serveur." : e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  // En quittant, l'accueil remet à jour le nombre de posts à valider.
  useEffect(() => () => { refreshTeam(); }, [refreshTeam]);

  const removeFromList = (id: string) => setPosts((l) => (l ? l.filter((p) => p.id !== id) : l));

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={back} />
        <Title size={26} style={{ flex: 1 }}>{posts && posts.length > 1 ? `${posts.length} posts à valider` : 'Post à valider'}</Title>
      </View>

      {done && <Notice tone={done.tone} title={done.title} text={done.text} />}
      {error && <Notice tone="red" title="Les posts n'ont pas pu être chargés" text={error} />}
      {error && <Button title="Réessayer" kind="secondary" onPress={load} />}
      {!posts && !error && <ActivityIndicator color={colors.green} style={{ marginTop: 40 }} />}
      {posts && !posts.length && (
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
          <IconTile size={56}><CheckIcon size={26} color={colors.green} /></IconTile>
          <Body style={{ fontWeight: '700' }} center>Tout est validé</Body>
          <Body soft center size={15}>Quand un employé vous enverra un post, il apparaîtra ici.</Body>
        </Card>
      )}
      {posts?.map((p) => (
        <ReviewCard
          key={p.id}
          post={p}
          onDone={(result) => { setDone(result); removeFromList(p.id); }}
        />
      ))}
    </ScrollView>
  );
}

function ReviewCard({ post, onDone }: { post: PendingPost; onDone: (r: { title: string; text?: string; tone: 'green' | 'orange' | 'red' }) => void }) {
  const [caption, setCaption] = useState(post.caption);
  const [editing, setEditing] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'publish' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const story = post.kind === 'story';

  async function publish() {
    setBusy('publish');
    setError(null);
    try {
      const pubs: PublicationResult[] = await approvePost(post.id, story ? undefined : caption.trim());
      const ok = pubs.filter((x) => x.status === 'published').length;
      if (!ok) {
        setError(pubs.find((x) => x.error)?.error ?? "La publication n'a pas pu partir. Le post reste à valider.");
        return;
      }
      onDone(ok === pubs.length
        ? { tone: 'green', title: `Publié ! Le post de ${post.by} est en ligne.` }
        : { tone: 'orange', title: 'Publié en partie', text: pubs.filter((x) => x.status !== 'published').map((x) => x.error).filter(Boolean).join(' ') });
    } catch (e) {
      setError(e instanceof NotConfiguredError
        ? "La publication sur Instagram et Facebook n'est pas encore branchée. Le post reste ici, à valider."
        : e instanceof FriendlyError ? e.message : 'La publication a échoué. Réessayez.');
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy('reject');
    setError(null);
    try {
      await rejectPost(post.id, note.trim());
      onDone({ tone: 'orange', title: `Post refusé. ${post.by} verra votre message.` });
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.');
    } finally {
      setBusy(null);
    }
  }

  const when = new Date(post.submittedAt);
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconTile size={36}><PersonIcon size={18} color={colors.green} /></IconTile>
        <View style={{ flex: 1 }}>
          <Body size={15} style={{ fontWeight: '700' }}>Préparé par {post.by}</Body>
          <Body soft size={13}>{post.shopName ? `${post.shopName} · ` : ''}{when.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</Body>
        </View>
        {story && <Badge text="Story" tone="sand" />}
      </View>

      {post.mediaType === 'video' ? (
        <View style={{ height: 200, borderRadius: 16, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <VideoIcon size={36} color={colors.green} />
          <Body soft size={15}>Story en vidéo</Body>
        </View>
      ) : post.mediaUrls[0] ? (
        <View>
          <Image source={{ uri: post.mediaUrls[0] }} accessibilityLabel="Photo du post" style={{ width: '100%', aspectRatio: story ? 9 / 16 : 4 / 5, maxHeight: 420, borderRadius: 16, backgroundColor: colors.greenSoft }} resizeMode="cover" />
          {post.mediaUrls.length > 1 && (
            <View style={{ position: 'absolute', top: 10, right: 10 }}><Badge text={`${post.mediaUrls.length} photos`} tone="grey" /></View>
          )}
        </View>
      ) : null}

      {!story && (editing ? (
        <View style={{ gap: 8 }}>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            multiline
            accessibilityLabel="Texte du post"
            style={{ minHeight: 140, borderRadius: 14, borderWidth: 1.5, borderColor: colors.green, backgroundColor: '#fff', padding: 14, fontSize: 16, lineHeight: 23, color: colors.text, fontFamily: fonts.body, textAlignVertical: 'top' }}
          />
          <Button title="Valider mes modifications" kind="secondary" icon={<CheckIcon size={18} color={colors.green} />} onPress={() => setEditing(false)} />
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          <Body size={16} style={{ lineHeight: 23 }}>{caption}</Body>
          {post.hashtags.length ? <Body size={15} style={{ color: colors.green }}>{post.hashtags.join(' ')}</Body> : null}
        </View>
      ))}

      {error && <Notice tone="red" title={error} />}

      {refusing ? (
        <View style={{ gap: 10 }}>
          <Field label={`Un petit mot pour ${post.by} (facultatif)`} value={note} onChangeText={setNote} maxLength={300} placeholder="Ex. : Prends la photo avec plus de lumière" />
          <Button title="Refuser ce post" kind="danger" loading={busy === 'reject'} onPress={reject} />
          <Button title="Annuler" kind="ghost" onPress={() => setRefusing(false)} />
        </View>
      ) : (
        <>
          <Button title="Publier" icon={<CheckIcon size={20} />} loading={busy === 'publish'} disabled={!caption.trim() && !story} onPress={publish} style={{ minHeight: 60 }} />
          {!story && !editing && <Button title="Modifier le texte" kind="secondary" icon={<PencilIcon size={18} color={colors.green} />} onPress={() => setEditing(true)} />}
          <Button title="Refuser" kind="danger" onPress={() => setRefusing(true)} />
        </>
      )}
    </Card>
  );
}
