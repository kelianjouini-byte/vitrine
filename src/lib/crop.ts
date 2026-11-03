/** Calculs du recadrage (sans dépendance : testés avec node --test). */

/** Les 3 formats proposés. Toutes les photos d'un carrousel ont le même. */
export type PhotoFormat = 'portrait' | 'square' | 'landscape';

/**
 * Taille finale de chaque format, en pixels. Instagram accepte du 4:5 (0,8) au 1,91:1 :
 * on arrondit toujours du bon côté pour rester dans ces limites.
 */
export const FORMATS: Record<PhotoFormat, { label: string; width: number; height: number }> = {
  portrait: { label: 'Portrait', width: 1080, height: 1350 },
  square: { label: 'Carré', width: 1080, height: 1080 },
  landscape: { label: 'Paysage', width: 1080, height: 566 },
};

export const formatRatio = (f: PhotoFormat) => FORMATS[f].width / FORMATS[f].height;

/** Cadrage choisi par le commerçant : zoom (1 = photo entière dans le cadre) et centre visé (0 à 1). */
export type Framing = { zoom: number; cx: number; cy: number };
export const CENTERED: Framing = { zoom: 1, cx: 0.5, cy: 0.5 };
export const MAX_ZOOM = 4;

/** Une photo, vue par le recadrage : seulement sa taille en pixels. */
type Size = { width: number; height: number };

/** Rectangle à découper dans la photo (en pixels de la photo) pour un cadrage et un format. */
export function cropRect(photo: Size, format: PhotoFormat, framing: Framing) {
  const ratio = formatRatio(format);
  // Zoom 1 : le plus grand rectangle au bon format qui tient dans la photo.
  let w = Math.min(photo.width, photo.height * ratio);
  let h = w / ratio;
  const zoom = Math.min(Math.max(framing.zoom, 1), MAX_ZOOM);
  w /= zoom;
  h /= zoom;
  const x = clamp(framing.cx * photo.width - w / 2, 0, photo.width - w);
  const y = clamp(framing.cy * photo.height - h / 2, 0, photo.height - h);
  const originX = Math.floor(x);
  const originY = Math.floor(y);
  return {
    originX,
    originY,
    width: Math.max(1, Math.min(Math.round(w), photo.width - originX)),
    height: Math.max(1, Math.min(Math.round(h), photo.height - originY)),
  };
}

/** Garde le centre visé à l'intérieur de la photo (pas de bande vide dans le cadre). */
export function clampFraming(photo: Size, format: PhotoFormat, framing: Framing): Framing {
  const r = cropRect(photo, format, framing);
  return {
    zoom: Math.min(Math.max(framing.zoom, 1), MAX_ZOOM),
    cx: (r.originX + r.width / 2) / photo.width,
    cy: (r.originY + r.height / 2) / photo.height,
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

