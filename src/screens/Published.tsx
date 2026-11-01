import React from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { Badge, Body, Button, Card, Notice, Title } from '../components/ui';
import { AlertIcon, CheckIcon, FacebookIcon, InstagramIcon } from '../components/icons';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import type { PublicationResult } from '../lib/types';

/** Écran 3 : résultat RÉEL de la publication, réseau par réseau. Jamais de faux succès. */
export function Published({ postId }: { postId: string }) {
  const { posts, go } = useApp();
  const post = posts.find((p) => p.id === postId);
  if (!post) return null;
  const pubs = post.publications;
  const allOk = pubs.every((p) => p.status === 'published');
  const someOk = pubs.some((p) => p.status === 'published');
  const notConfigured = pubs.every((p) => p.status === 'not_configured');
  const when = post.publishedAt ? new Date(post.publishedAt) : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 18, alignItems: 'stretch', paddingTop: 48 }}>
      <View style={{ alignItems: 'center', gap: 16 }}>
        <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: allOk ? colors.greenSoft : colors.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: allOk ? colors.greenDark : colors.orange, alignItems: 'center', justifyContent: 'center' }}>
            {allOk ? <CheckIcon size={48} /> : <AlertIcon size={44} color="#fff" />}
          </View>
        </View>
        <Title size={32} style={{ textAlign: 'center' }}>
          {allOk ? "C'est publié ! 🎉" : someOk ? 'Publié en partie' : notConfigured ? 'Pas encore publié' : 'La publication a échoué'}
        </Title>
        <Body soft center>
          {allOk
            ? `Votre publication est en ligne${when ? `, le ${when.toLocaleDateString('fr-FR')} à ${when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}.`
            : notConfigured
              ? "La publication sur Instagram et Facebook n'est pas encore configurée. Votre post est gardé dans « Mes posts »."
              : 'Rien n\'a été publié sur le réseau en erreur. Vous pouvez réessayer.'}
        </Body>
      </View>

      {pubs.map((p) => <PublicationRow key={p.platform} p={p} />)}

      {notConfigured && (
        <Notice tone="orange" title="Bientôt disponible" text="Dès que le compte Meta de Vitrine sera configuré et vos réseaux connectés, ce bouton publiera pour de vrai." />
      )}

      {!allOk && !notConfigured && <Button title="Réessayer" kind="secondary" onPress={() => go({ name: 'create' })} />}
      <Button title="Retour à l'accueil" onPress={() => go({ name: 'home' })} />
    </ScrollView>
  );
}

function PublicationRow({ p }: { p: PublicationResult }) {
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
          {p.error ? <Body soft size={14}>{p.error}</Body> : null}
        </View>
        <Badge text={label} tone={tone} />
      </View>
      {p.url ? <Button title="Voir la publication" kind="ghost" onPress={() => Linking.openURL(p.url!)} /> : null}
    </Card>
  );
}
