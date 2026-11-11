import React from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { Badge, Body, Button, Card, Notice, PostThumb, Title } from '../components/ui';
import { AlertIcon, CheckIcon, FacebookIcon, InstagramIcon, SendIcon } from '../components/icons';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import type { PublicationResult } from '../lib/types';
import { hasStats, type Stats } from '../lib/stats';
import { StatsRow } from './Posts';

/** Écran 3 : résultat RÉEL de la publication, réseau par réseau. Jamais de faux succès. */
export function Published({ postId }: { postId: string }) {
  const { posts, go, team, stats } = useApp();
  const post = posts.find((p) => p.id === postId);
  if (!post) return null;
  if (post.reviewState === 'pending') return <SentToPatron postId={postId} patron={team?.ownerFirstName} />;
  if (post.reviewState === 'rejected') {
    return (
      <ScrollView contentContainerStyle={{ padding: 24, gap: 18, paddingTop: 56 }}>
        <View style={{ alignItems: 'center', gap: 14 }}>
          <PostThumb post={post} width={120} height={150} />
          <Title size={28} style={{ textAlign: 'center' }}>Le patron a refusé ce post</Title>
        </View>
        {post.reviewNote ? <Notice tone="orange" title="Son message" text={post.reviewNote} /> : <Body soft center>Il n'a pas laissé de message.</Body>}
        <Button title={post.kind === 'story' ? 'Faire une autre story' : 'Refaire un post'} onPress={() => go(post.kind === 'story' ? { name: 'story' } : { name: 'create' })} />
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
              ? `La publication sur Instagram et Facebook n'est pas encore configurée. ${story ? 'Votre story est gardée' : 'Votre post est gardé'} dans « Mes posts ».`
              : 'Rien n\'a été publié sur le réseau en erreur. Vous pouvez réessayer.'}
        </Body>
      </View>

      {pubs.map((p) => <PublicationRow key={p.platform} p={p} stats={stats[post.id]?.[p.platform]} />)}

      {notConfigured && (
        <Notice tone="orange" title="Bientôt disponible" text="Dès que le compte Meta de Vitrine sera configuré et vos réseaux connectés, ce bouton publiera pour de vrai." />
      )}

      {!allOk && !notConfigured && <Button title="Réessayer" kind="secondary" onPress={() => go(story ? { name: 'story' } : { name: 'create' })} />}
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
      {p.url ? <Button title="Voir la publication" kind="ghost" onPress={() => Linking.openURL(p.url!)} /> : null}
    </Card>
  );
}

/** Employé : le post est parti chez le patron. Il sera prévenu de la réponse (dans l'accueil et « Mes posts »). */
function SentToPatron({ postId, patron }: { postId: string; patron?: string }) {
  const { posts, go } = useApp();
  const post = posts.find((p) => p.id === postId)!;
  const story = post.kind === 'story';
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 18, alignItems: 'stretch', paddingTop: 64 }}>
      <View style={{ alignItems: 'center', gap: 16 }}>
        <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
          <SendIcon size={52} color={colors.green} />
        </View>
        <Title size={32} style={{ textAlign: 'center' }}>{patron ? `Envoyé à ${patron}` : 'Envoyé au patron'}</Title>
        <Body soft center>Vous verrez sa réponse sur l'accueil et dans « Mes posts ».</Body>
      </View>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <PostThumb post={post} width={64} height={64} />
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '700' }} size={15}>{story ? 'Votre story' : post.caption.length > 60 ? `${post.caption.slice(0, 60)}…` : post.caption}</Body>
        </View>
        <Badge text="En attente" tone="orange" />
      </Card>
      <Button title="Retour à l'accueil" kind="secondary" onPress={() => go({ name: 'home' })} />
    </ScrollView>
  );
}
