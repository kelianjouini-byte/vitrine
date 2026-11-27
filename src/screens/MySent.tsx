import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import { Badge, Body, Button, Card, IconTile, Label, Notice, Title } from '../components/ui';
import { CameraIcon, HeartIcon, ImageIcon, SendIcon, VideoIcon } from '../components/icons';
import { colors, fonts } from '../lib/theme';
import { useApp } from '../lib/store';
import { FriendlyError, mySentPosts, NotConfiguredError } from '../lib/api';
import type { MySentPost } from '../lib/team';

/**
 * Employé : « Mes envois ». Relus sur le serveur, donc les mêmes sur tous ses téléphones :
 * à refaire (avec le mot du patron), en attente, publiés (avec les points gagnés).
 */
export function MySent() {
  const { go, team, stats } = useApp();
  const patron = team?.ownerFirstName ?? 'votre patron';
  const [list, setList] = useState<MySentPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await mySentPosts());
    } catch (e) {
      setError(e instanceof NotConfiguredError ? "L'équipe n'est pas encore activée sur le serveur." : e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const redo = list?.filter((p) => p.reviewState === 'rejected') ?? [];
  const waiting = list?.filter((p) => p.reviewState === 'pending') ?? [];
  const done = list?.filter((p) => p.reviewState === 'approved') ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 32 }}>
      <Title size={30}>Mes envois</Title>
      <Body soft>Ce que vous avez préparé pour {patron}.</Body>

      {error && <Notice tone="red" title="Vos envois n'ont pas pu être chargés" text={error} />}
      {error && <Button title="Réessayer" kind="secondary" onPress={load} />}
      {!list && !error && <ActivityIndicator color={colors.green} style={{ marginTop: 32 }} />}

      {list && !list.length && (
        <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
          <IconTile size={64}><SendIcon size={30} color={colors.green} /></IconTile>
          <Body center>Vous n'avez encore rien envoyé.</Body>
          <Body soft center size={15}>Prenez une photo : Vitrine écrit le texte, {patron} le publie. +10 points à chaque envoi.</Body>
          <Button title="Prendre une photo" icon={<CameraIcon size={20} />} onPress={() => go({ name: 'home' })} />
        </Card>
      )}

      {redo.length > 0 && <Label>{`À refaire (${redo.length})`}</Label>}
      {redo.map((p) => (
        <Card key={p.id} style={{ gap: 12, backgroundColor: 'rgba(253,243,226,0.9)', borderColor: 'rgba(242,182,109,0.6)', borderWidth: 1.5 }}>
          <Row p={p}>
            <Text style={{ color: colors.orangeText, fontSize: 15, lineHeight: 21, fontFamily: fonts.body }}>
              {p.reviewNote ? `${patron} : « ${p.reviewNote} »` : `${patron} n'a pas laissé de message.`}
            </Text>
          </Row>
          <Button title={p.kind === 'story' ? 'Refaire une story' : 'Refaire ce post'} kind="secondary" onPress={() => go({ name: 'home' })} />
        </Card>
      ))}

      {waiting.length > 0 && <Label>{`En attente (${waiting.length})`}</Label>}
      {waiting.map((p) => (
        <Card key={p.id}>
          <Row p={p} badge={<Badge text={`Chez ${patron}`} tone="orange" />}>
            <Body soft size={14}>{`${when(p.submittedAt)}${p.points ? ` · +${p.points}` : ''}`}</Body>
          </Row>
        </Card>
      ))}

      {done.length > 0 && <Label>{`Publié (${done.length})`}</Label>}
      {done.map((p) => {
        const s = stats[p.id];
        const likes = (s?.instagram?.likes ?? 0) + (s?.facebook?.likes ?? 0);
        return (
          <Card key={p.id}>
            <Row p={p} badge={<Badge text="Publié" tone="green" />}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {likes > 0 && <HeartIcon size={16} color={colors.orangeText} />}
                {likes > 0 && <Text style={{ color: colors.orangeText, fontWeight: '700', fontSize: 15, fontFamily: fonts.body }}>{`${likes} j'aime`}</Text>}
                <Body soft size={14}>{`${likes > 0 ? '· ' : ''}${when(p.publishedAt ?? p.submittedAt)}${p.points ? ` · +${p.points} points` : ''}`}</Body>
              </View>
            </Row>
          </Card>
        );
      })}
    </ScrollView>
  );
}

function Row({ p, badge, children }: { p: MySentPost; badge?: React.ReactNode; children?: React.ReactNode }) {
  const label = p.kind === 'story' ? 'Story' : p.mediaType === 'video' ? 'Reel' : null;
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      {p.thumbUrl ? (
        <Image source={{ uri: p.thumbUrl }} style={{ width: 64, height: 80, borderRadius: 12, backgroundColor: colors.greenSoft }} resizeMode="cover" accessibilityLabel="Photo envoyée" />
      ) : (
        <View style={{ width: 64, height: 80, borderRadius: 12, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
          {p.mediaType === 'video' ? <VideoIcon size={24} color={colors.green} /> : <ImageIcon size={24} color={colors.green} />}
        </View>
      )}
      <View style={{ flex: 1, gap: 6 }}>
        {(badge || label) && (
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {badge}
            {label && <Badge text={label} tone="sand" />}
          </View>
        )}
        <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.text, fontFamily: fonts.body }}>
          {p.kind === 'story' ? 'Votre story' : p.caption.split('\n')[0] || 'Votre post'}
        </Text>
        {children}
      </View>
    </View>
  );
}

function when(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return "Envoyé aujourd'hui";
  if (days === 1) return 'Hier';
  return `Le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}
