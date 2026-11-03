/** Aperçu en carrousel, comme sur Instagram : on fait défiler les photos, avec les petits points en dessous. */
import React, { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { colors, fonts } from '../lib/theme';
import { BackIcon } from './icons';

export function PhotoCarousel({ uris, ratio }: { uris: string[]; ratio: number }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scroller = useRef<ScrollViewInstance>(null);
  const many = uris.length > 1;
  const goTo = (i: number) => {
    const n = Math.min(Math.max(i, 0), uris.length - 1);
    setIndex(n);
    scroller.current?.scrollTo({ x: n * width, animated: true });
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ width: '100%', aspectRatio: ratio }}>
        {width > 0 && (
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {uris.map((uri, i) => (
              <Image key={`${i}-${uri.slice(-24)}`} source={{ uri }} style={{ width, height: width / ratio }} resizeMode="cover" accessibilityLabel={`Photo ${i + 1} sur ${uris.length}`} />
            ))}
          </ScrollView>
        )}
        {many && (
          <>
            <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(20,28,23,0.7)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, fontFamily: fonts.body }}>{index + 1}/{uris.length}</Text>
            </View>
            {index > 0 && <Arrow side="left" onPress={() => goTo(index - 1)} />}
            {index < uris.length - 1 && <Arrow side="right" onPress={() => goTo(index + 1)} />}
          </>
        )}
      </View>
      {many && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, paddingTop: 10 }}>
          {uris.map((_, i) => (
            <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: i === index ? colors.green : '#C9D1CB' }} />
          ))}
        </View>
      )}
    </View>
  );
}

function Arrow({ side, onPress }: { side: 'left' | 'right'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={side === 'left' ? 'Photo précédente' : 'Photo suivante'}
      style={{ position: 'absolute', top: '50%', marginTop: -20, [side]: 8, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center' }}>
      <View style={side === 'right' ? { transform: [{ rotate: '180deg' }] } : null}>
        <BackIcon size={20} color={colors.text} />
      </View>
    </Pressable>
  );
}
