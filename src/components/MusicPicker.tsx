/** Musique d'une story vidéo : le bouton Musique (vert allumé, gris éteint) et la liste « Changer la musique ». */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Body, Button, Card, Label } from './ui';
import { CheckIcon, MusicIcon, PlayIcon, StopIcon } from './icons';
import { colors, fonts, glass, glassSurface, radius } from '../lib/theme';
import { TRACKS, trackById, type Track } from '../lib/music';
import { playSample } from '../lib/videoMusic';

/** La ligne sous l'aperçu : allumer / éteindre la musique, voir laquelle, en changer. */
export function MusicBar({ trackId, on, onToggle, onChange }: { trackId: string; on: boolean; onToggle: () => void; onChange: () => void }) {
  const track = trackById(trackId);
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={onToggle} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={on ? 'Musique allumée : toucher pour éteindre' : 'Musique éteinte : toucher pour allumer'}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 16, borderRadius: 26, backgroundColor: on ? colors.green : '#C9D1CB', opacity: pressed ? 0.85 : 1 })}>
          <MusicIcon size={22} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>{on ? 'Musique' : 'Sans musique'}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: on ? colors.text : colors.textSoft, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }} numberOfLines={1}>{track?.title}</Text>
          <Text style={{ color: colors.textSoft, fontSize: 13, fontFamily: fonts.body }}>{on ? 'Le son redescend tout seul à la fin' : 'Le son de la vidéo seulement'}</Text>
        </View>
      </View>
      <Button title="Changer la musique" kind="secondary" icon={<MusicIcon size={20} color={colors.green} />} onPress={onChange} />
    </Card>
  );
}

/** La liste des musiques : ambiances, puis une musique par fête. On peut écouter avant de choisir. */
export function MusicList({ selected, suggested, onPick, onClose }: { selected: string; suggested: string; onPick: (id: string) => void; onClose: () => void }) {
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
