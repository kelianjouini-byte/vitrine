/** Musique d'une vidéo (story ou Reel) : l'écran « Choisir la musique », avec « Sans musique » en premier. */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BackButton, Badge, Body, Button, Label } from './ui';
import { CheckIcon, MusicIcon, PlayIcon, StopIcon } from './icons';
import { colors, fonts, glass, glassSurface, radius } from '../lib/theme';
import { TRACKS, trackById, type Track } from '../lib/music';
import { playSample } from '../lib/videoMusic';

/** Écran « Choisir la musique » (stories et Reels) : retour, titre, puis la liste. */
export function MusicChooser({ selected, suggested, onPick, onClose }: { selected: string | null; suggested: string; onPick: (id: string | null) => void; onClose: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 20 }}>
        <BackButton onPress={onClose} />
        <Text style={{ flex: 1, fontFamily: fonts.title, fontSize: 24, fontWeight: '700', color: colors.text }}>Choisir la musique</Text>
      </View>
      <MusicList selected={selected} suggested={suggested} onPick={onPick} onClose={onClose} />
    </View>
  );
}

/** La liste des musiques : ambiances, puis une musique par fête. On peut écouter avant de choisir. */
export function MusicList({ selected, suggested, onPick, onClose }: { selected: string | null; suggested: string; onPick: (id: string | null) => void; onClose: () => void }) {
  const [playing, setPlaying] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopSample = () => {
    stop.current?.();
    stop.current = null;
    if (timer.current) clearTimeout(timer.current);
    setPlaying(null);
  };
  useEffect(() => stopSample, []);

  function listen(id: string) {
    const again = playing === id;
    stopSample();
    if (again) return;
    stop.current = playSample(id);
    setPlaying(id);
    timer.current = setTimeout(() => setPlaying(null), 15_000);
  }

  const suggestion = trackById(suggested);
  const ambiances = TRACKS.filter((t) => t.group === 'ambiance');
  const fetes = TRACKS.filter((t) => t.group === 'fete');
  const row = (t: Track) => (
    <TrackRow key={t.id} track={t} selected={t.id === selected} playing={t.id === playing} onListen={() => listen(t.id)} onPick={() => { stopSample(); onPick(t.id); }} />
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }}>
      <Body soft>Touchez le bouton rond pour écouter, puis choisissez. Toutes ces musiques ont été créées pour Vitrine : vous pouvez les utiliser librement.</Body>
      <Pressable onPress={() => { stopSample(); onPick(null); }} accessibilityRole="button" accessibilityState={{ selected: selected === null }} accessibilityLabel="Sans musique : garder le son de la vidéo"
        style={{ ...glassSurface, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, padding: 10, minHeight: 68, borderColor: selected === null ? colors.green : glass.line, borderWidth: selected === null ? 1.5 : 1 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#E3E9E0', alignItems: 'center', justifyContent: 'center' }}>
          <MusicIcon size={20} color="#4E6B57" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: selected === null ? '700' : '500', fontFamily: fonts.body }}>Sans musique</Text>
          <Text style={{ color: colors.textSoft, fontSize: 14, fontFamily: fonts.body }}>Le son de la vidéo seulement</Text>
        </View>
        {selected === null && <CheckIcon size={20} color={colors.green} />}
      </Pressable>
      {suggestion && (
        <View style={{ gap: 8 }}>
          <Label>Proposée pour vous</Label>
          {row(suggestion)}
        </View>
      )}
      <Label>Ambiances</Label>
      {ambiances.map(row)}
      <Label>Fêtes et saisons</Label>
      {fetes.map(row)}
      <Button title="Fermer" kind="ghost" onPress={() => { stopSample(); onClose(); }} />
    </ScrollView>
  );
}

function TrackRow({ track, selected, playing, onListen, onPick }: { track: Track; selected: boolean; playing: boolean; onListen: () => void; onPick: () => void }) {
  return (
    <View style={{ ...glassSurface, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, padding: 10, borderColor: selected ? colors.green : glass.line, borderWidth: selected ? 1.5 : 1 }}>
      <Pressable onPress={onListen} accessibilityRole="button" accessibilityLabel={playing ? `Arrêter l'écoute de ${track.title}` : `Écouter ${track.title}`}
        style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: playing ? colors.green : colors.greenSoft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
        {playing ? <StopIcon size={20} color="#fff" /> : <PlayIcon size={20} color={colors.green} />}
      </Pressable>
      <Pressable onPress={onPick} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Choisir ${track.title}`} style={{ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: selected ? '700' : '500', fontFamily: fonts.body }}>{track.title}</Text>
        {playing && <Badge text="Écoute" tone="green" />}
        {selected && <CheckIcon size={20} color={colors.green} />}
      </Pressable>
    </View>
  );
}
