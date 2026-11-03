/**
 * Écran de recadrage : la photo glisse sous le doigt (ou la souris), on zoome avec deux doigts
 * ou avec les gros boutons − et +, et on choisit le format. Marche sur téléphone et sur ordinateur.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Platform, Pressable, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { colors, fonts, glass, radius } from '../lib/theme';
import { clampFraming, cropRect, FORMATS, formatRatio, MAX_ZOOM, type Framing, type PhotoFormat, type RawPhoto } from '../lib/photo';

type Props = {
  photo: RawPhoto;
  format: PhotoFormat;
  framing: Framing;
  onChange: (f: Framing) => void;
  /** Absent : le format est imposé (c'est celui de la 1re photo du carrousel). */
  onFormat?: (f: PhotoFormat) => void;
  /** Prévient l'écran quand le doigt est posé sur la photo (pour bloquer le défilement de la page). */
  onDragging?: (on: boolean) => void;
};

const ZOOM_STEP = 1.25;

export function PhotoCropper({ photo, format, framing, onChange, onFormat, onDragging }: Props) {
  const win = useWindowDimensions();
  const [boxWidth, setBoxWidth] = useState(0);
  const ratio = formatRatio(format);
  // Le cadre prend toute la largeur, sans dépasser la moitié de la hauteur de l'écran.
  const frameW = Math.max(0, Math.min(boxWidth, win.height * 0.55 * ratio));
  const frameH = frameW / ratio;

  // Les gestes lisent toujours les dernières valeurs.
  const live = useRef({ photo, format, framing, frameW, onChange, onDragging });
  live.current = { photo, format, framing, frameW, onChange, onDragging };

  const pan = useMemo(() => {
    let start: Framing = framing;
    let pinchStart = 0;
    const distance = (e: GestureResponderEvent) => {
      const t = e.nativeEvent.touches;
      if (!t || t.length < 2) return 0;
      return Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        start = live.current.framing;
        pinchStart = distance(e);
        live.current.onDragging?.(true);
      },
      onPanResponderMove: (e, g) => {
        const { photo: p, format: f, frameW: w } = live.current;
        if (!w) return;
        const d = distance(e);
        if (d && !pinchStart) {
          // Le deuxième doigt vient de se poser : on repart de là.
          pinchStart = d;
          start = live.current.framing;
        }
        if (d && pinchStart) {
          live.current.onChange(clampFraming(p, f, { ...start, zoom: Math.min(MAX_ZOOM, Math.max(1, (start.zoom * d) / pinchStart)) }));
          return;
        }
        // Déplacement : la photo suit le doigt.
        const scale = w / cropRect(p, f, start).width; // pixels d'écran par pixel de photo
        live.current.onChange(clampFraming(p, f, { zoom: start.zoom, cx: start.cx - g.dx / scale / p.width, cy: start.cy - g.dy / scale / p.height }));
      },
      onPanResponderRelease: () => live.current.onDragging?.(false),
      onPanResponderTerminate: () => live.current.onDragging?.(false),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Position de la photo dans le cadre, calculée sans arrondi pour un mouvement fluide.
  const rect = cropRect(photo, format, framing);
  const scale = frameW ? frameW / rect.width : 0;
  const zoomBy = (k: number) => onChange(clampFraming(photo, format, { ...framing, zoom: Math.min(MAX_ZOOM, Math.max(1, framing.zoom * k)) }));

  return (
    <View style={{ gap: 16 }} onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}>
      <View style={{ alignItems: 'center' }}>
        <View
          {...pan.panHandlers}
          accessibilityLabel="Faites glisser la photo pour choisir ce qui apparaît"
          style={[
            { width: frameW, height: frameH, overflow: 'hidden', borderRadius: radius.sm, backgroundColor: '#1d2620' },
            Platform.OS === 'web' ? ({ touchAction: 'none', cursor: 'grab', userSelect: 'none' } as object) : null,
          ]}
        >
          {scale > 0 && (
            <Image
              source={{ uri: photo.uri }}
              // @ts-expect-error draggable n'existe que sur le web (empêche le « glisser l'image » du navigateur)
              draggable={false}
              style={{ position: 'absolute', left: -rect.originX * scale, top: -rect.originY * scale, width: photo.width * scale, height: photo.height * scale }}
            />
          )}
          {/* Repères des tiers, pour bien placer le produit */}
          <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
            {[1, 2].map((i) => (
              <React.Fragment key={i}>
                <View style={{ position: 'absolute', left: (frameW * i) / 3, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.45)' }} />
                <View style={{ position: 'absolute', top: (frameH * i) / 3, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.45)' }} />
              </React.Fragment>
            ))}
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <ZoomButton label="−" a11y="Dézoomer" disabled={framing.zoom <= 1.001} onPress={() => zoomBy(1 / ZOOM_STEP)} />
        <Text style={{ color: colors.textSoft, fontSize: 16, fontFamily: fonts.body, minWidth: 90, textAlign: 'center' }}>Zoom</Text>
        <ZoomButton label="+" a11y="Zoomer" disabled={framing.zoom >= MAX_ZOOM - 0.001} onPress={() => zoomBy(ZOOM_STEP)} />
      </View>

      {onFormat ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(Object.keys(FORMATS) as PhotoFormat[]).map((f) => (
            <FormatButton key={f} format={f} selected={f === format} onPress={() => onFormat(f)} />
          ))}
        </View>
      ) : (
        <Text style={{ color: colors.textSoft, fontSize: 15, fontFamily: fonts.body, textAlign: 'center' }}>
          Format {FORMATS[format].label.toLowerCase()}, comme la 1re photo : Instagram veut le même format pour toutes.
        </Text>
      )}
    </View>
  );
}

function ZoomButton({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y}
      style={({ pressed }) => ({ width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, borderColor: colors.green, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : pressed ? 0.8 : 1 })}>
      <Text style={{ color: colors.green, fontSize: 30, fontWeight: '700', lineHeight: 34, fontFamily: fonts.body }}>{label}</Text>
    </Pressable>
  );
}

function FormatButton({ format, selected, onPress }: { format: PhotoFormat; selected: boolean; onPress: () => void }) {
  const { width, height } = FORMATS[format];
  const k = 26 / Math.max(width, height);
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`Format ${FORMATS[format].label}`}
      style={{ flex: 1, minHeight: 72, borderRadius: 14, borderWidth: 1.5, borderColor: selected ? colors.green : glass.line, backgroundColor: selected ? colors.greenSoft : glass.bgStrong, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <View style={{ width: width * k, height: height * k, borderRadius: 3, borderWidth: 2, borderColor: selected ? colors.green : colors.textSoft }} />
      <Text style={{ color: selected ? colors.green : colors.text, fontWeight: '700', fontSize: 15, fontFamily: fonts.body }}>{FORMATS[format].label}</Text>
    </Pressable>
  );
}
