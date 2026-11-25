import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, ScrollView, View } from 'react-native';
import { BackButton, Body, Button, Notice, Title } from '../components/ui';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';

/**
 * Reel filmé en plusieurs bouts (ou plusieurs vidéos de la galerie) : Vitrine les colle toute seule,
 * avec un fondu très court entre deux. Ensuite : « Où la publier ? », comme une vidéo filmée d'un coup.
 */
export function Montage({ clips }: { clips: { uri: string; thumb?: string | null }[] }) {
  const { back, replace } = useApp();
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const { makeMontage } = await import('../lib/montageVideo');
        const done = await makeMontage(clips.map((c) => c.uri), setProgress);
        if (!done) return setFailed(true);
        replace({ name: 'choose', media: { kind: 'video', uri: URL.createObjectURL(done.blob), seconds: Math.round(done.seconds) } });
      } catch (e) {
        console.warn('[Vitrine] montage', e);
        setFailed(true);
      }
    })();
  }, [clips, replace]);

  function keepFirst() {
    replace({ name: 'choose', media: { kind: 'video', uri: clips[0].uri, seconds: null } });
  }

  const pct = Math.round(progress * 100);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingTop: 48, alignItems: 'stretch' }}>
      {failed && <BackButton onPress={back} />}
      <Title size={28} style={{ textAlign: 'center' }}>{failed ? 'Montage impossible' : 'Vitrine monte votre vidéo'}</Title>
      {!failed && <Body soft center>Les bouts s'enchaînent tout seuls, avec une transition douce.</Body>}

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {clips.map((c, i) => (
          <View key={c.uri} style={{ width: 66, height: 117, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.greenSoft, borderWidth: 2, borderColor: colors.white, boxShadow: '0px 12px 26px -14px rgba(31,95,69,0.6)' }}>
            {c.thumb && <Image source={{ uri: c.thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel={`Bout n°${i + 1}`} />}
            <View style={{ position: 'absolute', left: 6, top: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
              <Body size={12} style={{ color: colors.white, fontWeight: '800' }}>{String(i + 1)}</Body>
            </View>
          </View>
        ))}
      </View>

      {failed ? (
        <>
          <Notice tone="red" title="Ce téléphone n'arrive pas à assembler les bouts" text="Vous pouvez garder le premier bout seul, ou refilmer en une seule fois." />
          <Button title="Garder le premier bout" onPress={keepFirst} style={{ minHeight: 60 }} />
          <Button title="Refilmer" kind="secondary" onPress={() => replace({ name: 'capture' })} />
        </>
      ) : (
        <View style={{ gap: 10, marginTop: 12, paddingHorizontal: 20 }}>
          <View style={{ height: 12, borderRadius: 6, backgroundColor: 'rgba(36,51,43,0.1)', overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(4, pct)}%`, height: '100%', borderRadius: 6, backgroundColor: colors.green, ...(Platform.OS === 'web' ? { backgroundImage: 'linear-gradient(90deg, #F2B66D, #2F7658)' } : null) } as object} />
          </View>
          <Body soft center size={15}>{`${pct} %`}</Body>
        </View>
      )}
    </ScrollView>
  );
}
