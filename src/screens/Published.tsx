import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Badge, Body, Button, Card, Label, Notice, PostThumb, Title } from '../components/ui';
import { AlertIcon, CheckIcon, FacebookIcon, InstagramIcon, SendIcon } from '../components/icons';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import type { Post, PublicationResult } from '../lib/types';
import { hasStats, type Stats } from '../lib/stats';
import { StatsRow } from './Posts';
import { openExternal } from '../lib/native';
import { PointsScene } from '../components/PointsScene';
import { teamPoints } from '../lib/api';
import type { PointsSummary } from '../lib/team';

/** « Votre post », « Votre story », « Votre Reel ». */
export const postNoun = (p: Post) => (p.kind === 'story' ? 'story' : p.mediaType === 'video' ? 'Reel' : 'post');
const again = (p: Post) => (p.kind === 'story' ? { name: 'story' as const } : p.mediaType === 'video' ? { name: 'home' as const } : { name: 'create' as const });

/**
 * Écran 3 : résultat RÉEL de la publication, réseau par réseau. Jamais de faux succès.
 * `alsoId` : la story publiée en même temps (Post + Story, Reel + Story), montrée en dessous.
 */
export function Published({ postId, alsoId }: { postId: string; alsoId?: string }) {
  const { posts, go, team, stats, syncPosts } = useApp();
  const post = posts.find((p) => p.id === postId);
  const also = alsoId ? posts.find((p) => p.id === alsoId) : undefined;
  const sending = post?.status === 'publishing' || also?.status === 'publishing';
  // Envoi en arrière-plan : on relit le résultat chez le serveur toutes les 4 s (4 minutes au plus : un Reel est plus long).
  useEffect(() => {
    if (!sending) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 60) return clearInterval(timer);
      syncPosts().catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [sending, syncPosts]);
  if (!post) return null;
  if (sending) return <Sending postId={postId} also={also} />;
  if (post.reviewState === 'pending') return <SentToPatron postId={postId} patron={team?.ownerFirstName} />;
  if (post.reviewState === 'rejected') {
    return (
      <ScrollView contentContainerStyle={{ padding: 24, gap: 18, paddingTop: 56 }}>
        <View style={{ alignItems: 'center', gap: 14 }}>
          <PostThumb post={post} width={120} height={150} />
          <Title size={28} style={{ textAlign: 'center' }}>Le patron a refusé ce post</Title>
        </View>
        {post.reviewNote ? <Notice tone="orange" title="Son message" text={post.reviewNote} /> : <Body soft center>Il n'a pas laissé de message.</Body>}
        <Button title={post.kind === 'story' ? 'Faire une autre story' : post.mediaType === 'video' ? 'Refaire un Reel' : 'Refaire un post'} onPress={() => go(again(post))} />
        <Button title="Retour à l'accueil" kind="ghost" onPress={() => go({ name: 'home' })} />
      </ScrollView>
    );
  }
  const pubs = post.publications;
  const allOk = pubs.every((p) => p.status === 'published');
  const someOk = pubs.some((p) => p.status === 'published');
  const notConfigured = pubs.every((p) => p.status === 'not_configured');
  const when = post.publishedAt ? new Date(post.publishedAt) : null;
  const story = post.kind === 'story';

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 18, alignItems: 'stretch', paddingTop: 48 }}>
      <View style={{ alignItems: 'center', gap: 16 }}>
        <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: allOk ? colors.greenSoft : colors.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: allOk ? colors.greenDark : colors.orange, alignItems: 'center', justifyContent: 'center' }}>
            {allOk ? <CheckIcon size={48} /> : <AlertIcon size={44} color="#fff" />}
          </View>
        </View>
        <Title size={32} style={{ textAlign: 'center' }}>
          {allOk ? "C'est publié !" : someOk ? 'Publié en partie' : notConfigured ? 'Pas encore publié' : 'La publication a échoué'}
        </Title>
        <Body soft center>
          {allOk
            ? `Votre publication est en ligne${when ? `, le ${when.toLocaleDateString('fr-FR')} à ${when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}.`
            : notConfigured
              ? `La publication sur Instagram et Facebook n'est pas encore configurée. ${story ? 'Votre story est gardée' : `Votre ${postNoun(post)} est gardé`} dans « Mes posts ».`
              : 'Rien n\'a été publié sur le réseau en erreur. Vous pouvez réessayer.'}
        </Body>
      </View>

      {pubs.map((p) => <PublicationRow key={p.platform} p={p} stats={stats[post.id]?.[p.platform]} />)}

      {also && also.publications.length > 0 && (
        <View style={{ gap: 10 }}>
          <Label>Votre story</Label>
          {also.publications.map((p) => <PublicationRow key={`s-${p.platform}`} p={p} />)}
        </View>
      )}

      {notConfigured && (
        <Notice tone="orange" title="Bientôt disponible" text="Dès que le compte Meta de Vitrine sera configuré et vos réseaux connectés, ce bouton publiera pour de vrai." />
      )}

      {!allOk && !notConfigured && <Button title="Réessayer" kind="secondary" onPress={() => go(again(post))} />}
      <Button title="Retour à l'accueil" onPress={() => go({ name: 'home' })} />
    </ScrollView>
  );
}

function PublicationRow({ p, stats }: { p: PublicationResult; stats?: Stats }) {
  const ig = p.platform === 'instagram';
  const label = { published: 'En ligne', failed: 'Échec', not_configured: 'Non configuré', pending: 'En cours' }[p.status];
  const tone = ({ published: 'green', failed: 'red', not_configured: 'orange', pending: 'grey' } as const)[p.status];
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: ig ? '#FCE8F1' : '#E7F0FD', alignItems: 'center', justifyContent: 'center' }}>
          {ig ? <InstagramIcon color="#C13584" /> : <FacebookIcon color="#1877F2" />}
        </View>
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '700' }}>{ig ? 'Instagram' : 'Facebook'}</Body>
          {p.error ? <Body soft size={15}>{p.error}</Body> : null}
        </View>
        <Badge text={label} tone={tone} />
      </View>
      {stats && hasStats(stats) ? <StatsRow s={stats} /> : null}
      {p.url ? <Button title="Voir la publication" kind="ghost" onPress={() => openExternal(p.url!)} /> : null}
    </Card>
  );
}

/** « Publication envoyée » : le serveur publie tout seul, l'écran se met à jour dès que c'est en ligne. */
function Sending({ postId, also }: { postId: string; also?: Post }) {
  const { posts, go } = useApp();
  const post = posts.find((p) => p.id === postId)!;
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 18, alignItems: 'stretch', paddingTop: 64 }}>
      <View style={{ alignItems: 'center', gap: 16 }}>
        <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
            <SendIcon size={46} color="#fff" />
          </View>
        </View>
        <Title size={32} style={{ textAlign: 'center' }}>Publication envoyée</Title>
        <Body soft center>
          {also ? `Votre ${postNoun(post)} et votre story partent` : `Votre ${postNoun(post)} part`} sur Instagram et Facebook. Vitrine s'occupe de tout : vous pouvez fermer l'application.
        </Body>
      </View>
      {post.publications.map((p) => <PublicationRow key={p.platform} p={p} />)}
      {also && also.publications.length > 0 && (
        <View style={{ gap: 10 }}>
          <Label>Votre story</Label>
          {also.publications.map((p) => <PublicationRow key={`s-${p.platform}`} p={p} />)}
        </View>
      )}
      <Body soft center size={15}>
        {post.mediaType === 'video' ? 'Instagram prépare la vidéo avant de la mettre en ligne : en général une à deux minutes.' : 'Le résultat s\'affichera ici et dans « Mes posts », en général en moins d\'une minute.'}
      </Body>
      <Button title="Retour à l'accueil" onPress={() => go({ name: 'home' })} />
    </ScrollView>
  );
}

/** Employé : le post est parti chez le patron. +10 points qui s'envolent (s'il y en a), puis sa réponse dans « Mes envois ». */
function SentToPatron({ postId, patron }: { postId: string; patron?: string }) {
  const { posts, go, prefs, refreshTeam } = useApp();
  const post = posts.find((p) => p.id === postId)!;
  const story = post.kind === 'story';
  // Les points sont relus sur le serveur : undefined = en cours, null = pas de points (pas encore installés, ou erreur).
  const [res, setRes] = useState<{ points: PointsSummary; gained: number; maxPerDay: number } | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    teamPoints(postId)
      .then((r) => { if (alive) setRes(r.points ? { points: r.points, gained: r.gained, maxPerDay: r.maxPerDay } : null); })
      .catch(() => { if (alive) setRes(null); })
      .finally(() => { refreshTeam(); });
    return () => { alive = false; };
  }, [postId, refreshTeam]);

  const header = (
    <View style={{ alignItems: 'center', gap: 14 }}>
      <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.greenDark, alignItems: 'center', justifyContent: 'center' }}>
          <SendIcon size={32} color="#fff" />
        </View>
      </View>
      <Title size={30} style={{ textAlign: 'center' }}>{patron ? `Envoyé à ${patron}` : 'Envoyé au patron'}</Title>
      <Body soft center>
        {res && !res.gained
          ? `Merci ! Vous avez déjà ${res.maxPerDay} envois comptés aujourd'hui : celui-ci ne rapporte pas de points, mais il compte quand même.`
          : `${patron ?? 'Votre patron'} le relit et le publie. Vous verrez sa réponse dans « Mes envois ».`}
      </Body>
    </View>
  );
  const footer = (
    <View style={{ gap: 10, marginTop: 4 }}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <PostThumb post={post} width={56} height={56} />
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '700' }} size={15}>{story ? 'Votre story' : post.caption.length > 60 ? `${post.caption.slice(0, 60)}…` : post.caption}</Body>
          {res?.gained ? <Body soft size={13}>{`+${res.gained} points · +50 de plus s'il est publié`}</Body> : null}
        </View>
        <Badge text="En attente" tone="orange" />
      </Card>
      <Button title="Retour à l'accueil" onPress={() => go({ name: 'home' })} style={{ minHeight: 60 }} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 18, alignItems: 'stretch', paddingTop: 24, paddingBottom: 40 }}>
      {res === undefined ? (
        <View style={{ gap: 18, paddingTop: 40 }}>{header}<ActivityIndicator color={colors.green} /></View>
      ) : res ? (
        <PointsScene who="me" before={res.points.mine - res.gained} gained={res.gained} goal={res.points.goal} sound={prefs.sounds !== false} header={header} footer={footer} />
      ) : (
        <View style={{ gap: 18, paddingTop: 40 }}>{header}{footer}</View>
      )}
    </ScrollView>
  );
}
