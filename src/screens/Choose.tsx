import React, { useEffect, useState } from 'react';
import { Image, Platform as RNPlatform, Pressable, ScrollView, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { BackButton, Button } from '../components/ui';
import { PostIcon, ReelIcon, StoryIcon } from '../components/icons';
import { ToggleCard } from '../components/CreateChoice';
import { colors, fonts } from '../lib/theme';
import { useApp } from '../lib/store';
import { REEL_MAX_SECONDS, REEL_MIN_SECONDS, STORY_MAX_SECONDS, type Captured } from '../lib/photo';
import { videoDuration } from '../lib/media';

/**
 * Juste après la photo ou la vidéo : « Où la publier ? ».
 * Photo : Post et/ou Story. Vidéo : Reel et/ou Story. Les deux cochés = tout part d'un coup.
 */
export function Choose({ media }: { media: Captured }) {
  const { back, replace } = useApp();
  const video = media.kind === 'video';
  const [main, setMain] = useState(true);
  const [story, setStory] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(video ? media.seconds : null);

  // Une vidéo choisie dans la galerie n'annonce pas toujours sa durée : on la mesure.
  useEffect(() => {
    if (media.kind !== 'video' || media.seconds) return;
    videoDuration(media.uri).then((d) => d && setSeconds(Math.round(d)));
  }, [media]);

  // Limites des réseaux : un Reel dure de 3 à 90 secondes, une story vidéo 60 secondes au plus.
  const reelNote = video && seconds !== null && seconds < REEL_MIN_SECONDS ? `Un Reel dure au moins ${REEL_MIN_SECONDS} secondes`
    : video && seconds !== null && seconds > REEL_MAX_SECONDS ? `Un Reel dure ${REEL_MAX_SECONDS} secondes au maximum` : undefined;
  const storyNote = video && seconds !== null && seconds > STORY_MAX_SECONDS ? `Une story dure ${STORY_MAX_SECONDS} secondes au maximum` : undefined;
  const mainOn = main && !reelNote;
  const storyOn = story && !storyNote;

  useEffect(() => {
    // Le Reel n'est pas possible pour cette vidéo : on coche la story à la place (si elle l'est).
    if (reelNote && !storyNote) setStory(true);
  }, [reelNote, storyNote]);

  const mainName = video ? 'Reel' : 'Post';
  const summary = [mainOn && mainName, storyOn && 'Story'].filter(Boolean).join(' + ');

  function next() {
    if (media.kind === 'photo') {
      if (mainOn) replace({ name: 'create', photo: media.raw, alsoStory: storyOn });
      else replace({ name: 'story', media });
      return;
    }
    if (mainOn) replace({ name: 'reel', video: media, alsoStory: storyOn });
    else replace({ name: 'story', media });
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#141C17' }}>
      <View style={{ flex: 1, minHeight: 160 }}>
        {media.kind === 'photo'
          ? <Image source={{ uri: media.raw.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel="Votre photo" />
          : <Preview uri={media.uri} />}
        <View style={{ position: 'absolute', top: 16, left: 16 }}><BackButton onPress={back} /></View>
        <View style={{ position: 'absolute', top: 24, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', fontFamily: fonts.body }}>{video ? `Votre vidéo${seconds ? ` · ${seconds} s` : ''}` : 'Votre photo'}</Text>
        </View>
      </View>

      <ScrollView style={{ flexGrow: 0, backgroundColor: colors.white, borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -24 }}
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 28, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center' }} />
        <Text style={{ fontFamily: fonts.title, fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' }}>Où la publier ?</Text>
        <Text style={{ color: colors.textSoft, fontSize: 15, textAlign: 'center', fontFamily: fonts.body }}>Cochez un ou les deux</Text>
        <ToggleCard
          tone="green"
          title={mainName}
          text={video ? 'Reste sur votre page, texte sur la vidéo' : 'Reste sur votre page, avec un texte'}
          icon={(c) => (video ? <ReelIcon size={28} color={c} /> : <PostIcon size={28} color={c} />)}
          on={mainOn}
          disabled={!!reelNote}
          note={reelNote}
          onPress={() => setMain((v) => !v)}
        />
        <ToggleCard
          tone="orange"
          title="Story"
          text="24 h, avec un petit texte dessus"
          icon={(c) => <StoryIcon size={28} color={c} />}
          on={storyOn}
          disabled={!!storyNote}
          note={storyNote}
          onPress={() => setStory((v) => !v)}
        />
        <Button title={summary ? `Continuer · ${summary}` : 'Cochez au moins un choix'} disabled={!summary} onPress={next} style={{ minHeight: 60, marginTop: 4 }} />
        <Pressable onPress={back} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textSoft, fontSize: 16, fontWeight: '600', fontFamily: fonts.body }}>{video ? 'Refaire la vidéo' : 'Reprendre la photo'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Preview({ uri }: { uri: string }) {
  if (RNPlatform.OS === 'web') {
    return React.createElement('video', { src: uri, autoPlay: true, muted: true, loop: true, playsInline: true, style: { width: '100%', height: '100%', objectFit: 'cover' } });
  }
  return <NativePreview uri={uri} />;
}

function NativePreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" nativeControls={false} />;
}
