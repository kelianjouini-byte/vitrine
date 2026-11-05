import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Body, Button, Card, Notice, Title, BackButton } from '../components/ui';
import { CameraIcon, RefreshIcon, ThumbDownIcon, ThumbUpIcon } from '../components/icons';
import { colors, fonts, glass, greenGradient, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { upcomingEvents } from '../lib/events';
import { tradeById } from '../lib/trades';
import { isBackendConfigured } from '../lib/config';
import { fetchPostIdeas, FriendlyError, NotConfiguredError, sendIdeaVote } from '../lib/api';
import { basicIdeas, toggleVote, type IdeaVotes } from '../lib/ideas';
import { load, save } from '../lib/storage';
import { takePhoto } from '../lib/photo';
import type { PostIdea } from '../lib/types';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; ideas: PostIdea[]; basic: boolean }
  | { kind: 'error'; message: string };

/** « Je ne sais pas quoi poster » : 3 idées, un appui = la photo, puis l'IA écrit selon l'idée. */
export function Ideas() {
  const { business, back, go } = useApp();
  const b = business!;
  const occasions = useMemo(() => upcomingEvents(b, new Date(), 2, b.postalCode).slice(0, 5), [b]);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [votes, setVotes] = useState<IdeaVotes>({});
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => { load<IdeaVotes>('ideaVotes', {}).then(setVotes); }, []);

  const showBasic = useCallback(() => {
    setState({ kind: 'ready', basic: true, ideas: basicIdeas({ products: b.specialties, occasion: occasions[0] ?? null }) });
  }, [b.specialties, occasions]);

  const loadIdeas = useCallback(async () => {
    setState({ kind: 'loading' });
    setPhotoError(null);
    if (!isBackendConfigured) return showBasic();
    try {
      const ideas = await fetchPostIdeas({ occasions, tradeHint: tradeById(b.businessType)?.aiHint });
      if (!ideas.length) setState({ kind: 'error', message: "L'IA n'a pas trouvé d'idées cette fois. Réessayez." });
      else setState({ kind: 'ready', ideas, basic: false });
    } catch (e) {
      if (e instanceof NotConfiguredError) showBasic();
      else setState({ kind: 'error', message: e instanceof FriendlyError ? e.message : "Les idées n'ont pas pu être chargées. Réessayez." });
    }
  }, [occasions, b.businessType, showBasic]);

  useEffect(() => { loadIdeas(); }, [loadIdeas]);

  async function vote(idea: PostIdea, v: 1 | -1) {
    const next = toggleVote(votes, idea.title, v);
    setVotes(next);
    save('ideaVotes', next);
    // Seul un nouvel avis est envoyé au serveur (retirer son avis ne change rien côté IA).
    if (next[idea.title]) sendIdeaVote(b.id, idea.title, v).catch(() => {});
  }

  async function shoot(idea: PostIdea) {
    setPhotoError(null);
    try {
      const photo = await takePhoto();
      if (photo) go({ name: 'create', photo, idea });
    } catch (e) {
      setPhotoError(e instanceof FriendlyError ? e.message : "La photo n'a pas pu être ouverte. Réessayez.");
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={back} />
        <Title size={24} style={{ flex: 1 }}>3 idées pour vous</Title>
      </View>

      {state.kind === 'loading' && (
        <View style={{ alignItems: 'center', gap: 16, paddingVertical: 60 }}>
          <ActivityIndicator size="large" color={colors.green} />
          <Title size={20} style={{ textAlign: 'center' }}>Vitrine cherche des idées...</Title>
          <Body soft center>Selon votre métier, vos produits, la saison et les prochaines fêtes.</Body>
        </View>
      )}

      {state.kind === 'error' && (
        <View style={{ gap: 12 }}>
          <Notice tone="red" title="Nous avons besoin de votre attention" text={state.message} />
          <Button title="Réessayer" icon={<RefreshIcon size={20} color={colors.white} />} onPress={loadIdeas} />
        </View>
      )}

      {state.kind === 'ready' && (
        <>
          {state.basic ? (
            <Notice tone="orange" title="Idées de base" text="L'IA n'est pas encore branchée : voici des idées simples, pas encore adaptées à votre boutique." />
          ) : (
            <Body soft>Touchez une idée : l'appareil photo s'ouvre, puis Vitrine écrit le texte selon cette idée.</Body>
          )}
          {state.ideas.map((idea, i) => (
            <Card key={idea.title} style={{ gap: 10 }}>
              <Pressable onPress={() => shoot(idea)} accessibilityRole="button" accessibilityLabel={`Idée ${i + 1} : ${idea.title}. Prendre la photo`} style={{ gap: 8 }}>
                <Text style={{ color: colors.orangeText, fontWeight: '700', fontSize: 14, letterSpacing: 1, fontFamily: fonts.body }}>IDÉE {i + 1}</Text>
                <Body style={{ fontWeight: '700' }} size={19}>{idea.title}</Body>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <View style={{ paddingTop: 2 }}><CameraIcon size={18} color={colors.green} /></View>
                  <Body size={16} style={{ flex: 1 }}>{idea.photo}</Body>
                </View>
                {idea.why ? <Body soft size={15}>{idea.why}</Body> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, ...greenGradient, borderRadius: radius.md, minHeight: 52, justifyContent: 'center', marginTop: 4 }}>
                  <CameraIcon size={22} />
                  <Text style={{ color: colors.white, fontWeight: '700', fontSize: 17, fontFamily: fonts.body }}>Prendre cette photo</Text>
                </View>
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Body soft size={15} style={{ flex: 1 }}>Cette idée vous plaît ?</Body>
                <VoteButton up label="J'aime cette idée" on={votes[idea.title] === 1} onPress={() => vote(idea, 1)} />
                <VoteButton up={false} label="Je n'aime pas cette idée" on={votes[idea.title] === -1} onPress={() => vote(idea, -1)} />
              </View>
            </Card>
          ))}
          {photoError && <Notice tone="red" title="Nous avons besoin de votre attention" text={photoError} />}
          {!state.basic && <Body soft size={15} center>Vos avis aident Vitrine à mieux vous connaître.</Body>}
          <Button title="3 autres idées" kind="secondary" icon={<RefreshIcon size={20} color={colors.green} />} onPress={loadIdeas} />
        </>
      )}
    </ScrollView>
  );
}

function VoteButton({ up, label, on, onPress }: { up: boolean; label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }}
      style={{ width: 52, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: on ? colors.green : glass.line, backgroundColor: on ? colors.greenSoft : glass.bgStrong, alignItems: 'center', justifyContent: 'center' }}>
      {up ? <ThumbUpIcon size={22} color={on ? colors.green : colors.textSoft} /> : <ThumbDownIcon size={22} color={on ? colors.green : colors.textSoft} />}
    </Pressable>
  );
}
