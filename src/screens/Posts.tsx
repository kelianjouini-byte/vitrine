import React from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Badge, Body, Button, Card, Title } from '../components/ui';
import { CameraIcon } from '../components/icons';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import type { PostStatus } from '../lib/types';

const STATUS: Record<PostStatus, { label: string; tone: 'green' | 'orange' | 'red' | 'grey' | 'blue' }> = {
  draft: { label: 'Brouillon', tone: 'grey' },
  generating: { label: 'En écriture', tone: 'grey' },
  awaiting_approval: { label: 'À valider', tone: 'orange' },
  scheduled: { label: 'Programmé', tone: 'blue' },
  publishing: { label: 'En cours', tone: 'grey' },
  published: { label: 'Publié', tone: 'green' },
  partially_published: { label: 'Publié en partie', tone: 'orange' },
  failed: { label: 'Échec', tone: 'red' },
  cancelled: { label: 'Annulé', tone: 'grey' },
};

/** Historique des publications. */
export function Posts() {
  const { posts, go } = useApp();
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 32 }}>
      <Title size={30}>Mes posts</Title>
      {posts.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
          <Body size={40}>📸</Body>
          <Body center>Vous n'avez pas encore de post.</Body>
          <Button title="Prendre une photo" icon={<CameraIcon size={20} />} onPress={() => go({ name: 'create' })} />
        </Card>
      ) : (
        posts.map((p) => (
          <Card key={p.id} onPress={() => go({ name: 'published', postId: p.id })} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View>
              <Image source={{ uri: p.imageUri }} style={{ width: 64, height: 80, borderRadius: 10, backgroundColor: colors.greenSoft }} />
              {(p.photoCount ?? 1) > 1 && (
                <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(20,28,23,0.75)', borderRadius: 8, paddingHorizontal: 5 }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{p.photoCount} 📷</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Body size={15} style={{ fontWeight: '600' }}>{p.caption.split('\n')[0].slice(0, 60)}</Body>
              <Body soft size={13}>{new Date(p.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · {p.platforms.map((x) => (x === 'instagram' ? 'Instagram' : 'Facebook')).join(' + ')}</Body>
            </View>
            <Badge text={STATUS[p.status].label} tone={STATUS[p.status].tone} />
          </Card>
        ))
      )}
    </ScrollView>
  );
}
