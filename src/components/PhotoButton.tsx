import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { colors, greenGradient } from '../lib/theme';
import { CameraIcon, PlusIcon } from './icons';
import { useReduceMotion } from './GlassBackground';

const RING = 150;
const DISC = 128;
const useNativeDriver = Platform.OS !== 'web';

/** Une onde orange qui part du bouton et s'efface, comme un caillou dans l'eau. */
function Wave({ delay, still }: { delay: number; still: boolean }) {
  const t = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    if (still) { t.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver }));
    const start = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(start); loop.stop(); };
  }, [t, still, delay]);
  if (still) return null;
  return (
    <Animated.View
      style={{
        position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, borderWidth: 3, borderColor: colors.orange,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.42] }) }],
      }}
    />
  );
}

/**
 * Le gros bouton rond de l'accueil : appareil photo, petit « + » orange, et des ondes orange
 * qui donnent envie d'appuyer. Purement visuel : c'est l'accueil qui gère l'appui.
 * Si le téléphone demande de réduire les animations, il n'y a pas d'ondes.
 */
export function PhotoButton() {
  const still = useReduceMotion();
  return (
    <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }} importantForAccessibility="no-hide-descendants">
      <Wave delay={0} still={still} />
      <Wave delay={1300} still={still} />
      <View style={{ width: RING, height: RING, borderRadius: RING / 2, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 2, borderColor: colors.orange, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 22px 40px -14px rgba(31,95,69,0.5)' }}>
        <View style={{ ...greenGradient, width: DISC, height: DISC, borderRadius: DISC / 2, alignItems: 'center', justifyContent: 'center' }}>
          <CameraIcon size={52} />
        </View>
        <View style={{ position: 'absolute', right: 6, bottom: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.orange, borderWidth: 3, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
          <PlusIcon size={22} color={colors.text} />
        </View>
      </View>
    </View>
  );
}
