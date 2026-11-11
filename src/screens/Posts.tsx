import React, { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { Badge, Body, Button, Card, IconTile, PostThumb, Title } from '../components/ui';
import { CameraIcon, EyeIcon, ImageIcon, MessageIcon, ThumbUpIcon } from '../components/icons';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import type { PostStatus } from '../lib/types';
import { formatCount, hasStats, totalOf, type Stats } from '../lib/stats';

const STATUS: Record<PostStatus, { label: string; tone: 'green' | 'orange' | 'red' | 'grey' | 'sand' }> = {
  draft: { label: 'Brouillon', tone: 'grey' },
  generating: { label: 'En écriture', tone: 'grey' },
  awaiting_approval: { label: 'À valider', tone: 'orange' },
  scheduled: { label: 'Programmé', tone: 'sand' },
  publishing: { label: 'En cours', tone: 'grey' },
  published: { label: 'Publié', tone: 'green' },
  partially_published: { label: 'Publié en partie', tone: 'orange' },
  failed: { label: 'Échec', tone: 'red' },
  cancelled: { label: 'Annulé', tone: 'grey' },
};

/** Historique des publications. */
export function Posts() {
  const { posts, go, stats, refreshStats } = useApp();
  // Les chiffres bougent : on les relit à chaque ouverture de « Mes posts » (le serveur les garde 30 min).
  useEffect(() => { refreshStats(); }, [refreshStats]);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 32 }}>
      <Title size={30}>Mes posts</Title>
      {posts.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
          <IconTile size={64}><ImageIcon size={32} color={colors.green} /></IconTile>
          <Body center>Vous n'avez pas encore de post.</Body>
          <Button title="Prendre une photo" icon={<CameraIcon size={20} />} onPress={() => go({ name: 'create' })} />
        </Card>
      ) : (
        posts.map((p) => (
          <Card key={p.id} onPress={() => go({ name: 'published', postId: p.id })} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <PostThumb post={p} width={64} height={80} />
            <View style={{ flex: 1, gap: 4 }}>
              <Body size={15} style={{ fontWeight: '600' }}>{p.caption.split('\n')[0].slice(0, 60)}</Body>
              <Body soft size={15}>{new Date(p.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · {p.platforms.map((x) => (x === 'instagram' ? 'Instagram' : 'Facebook')).join(' + ')}</Body>
              {hasStats(totalOf(stats[p.id])) ? <StatsRow s={totalOf(stats[p.id])} /> : null}
              {p.reviewState === 'rejected' && p.reviewNote ? <Body size={15} style={{ color: colors.orangeText }}>« {p.reviewNote} »</Body> : null}
            </View>
            {p.reviewState === 'pending'
              ? <Badge text="Chez le patron" tone="orange" />
              : p.reviewState === 'rejected'
                ? <Badge text="Refusé" tone="red" />
                : <Badge text={STATUS[p.status].label} tone={STATUS[p.status].tone} />}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

/** Likes, commentaires et vues d'un post (Instagram + Facebook réunis). Seulement les chiffres connus. */
export function StatsRow({ s }: { s: Stats }) {
  const item = (icon: React.ReactNode, n: number | null, label: string) => n === null ? null : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessible accessibilityLabel={`${n} ${label}`}>
      {icon}
      <Body size={14} style={{ color: colors.text, fontWeight: '600' }}>{formatCount(n)}</Body>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
      {item(<ThumbUpIcon size={16} color={colors.green} />, s.likes, "j'aime")}
      {item(<MessageIcon size={16} color={colors.green} />, s.comments, 'commentaires')}
      {item(<EyeIcon size={16} color={colors.green} />, s.views, 'vues')}
    </View>
  );
}
