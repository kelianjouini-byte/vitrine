import { Platform, type ViewStyle } from 'react-native';

/** Palette officielle Vitrine (cf. cahier des charges, section 3). */
export const colors = {
  green: '#2F7658',
  greenDark: '#1F5F45',
  greenSoft: '#DCEFE3',
  bg: '#F6F7F2',
  white: '#FFFFFF',
  text: '#24332B',
  textSoft: '#55615A',
  orange: '#F2B66D',
  orangeSoft: '#FCEFD9',
  orangeText: '#8A5A12',
  /** Orange plus vif pour un chiffre à remarquer (gras uniquement, lisible sur fond clair). */
  orangeStrong: '#B0661A',
  red: '#D96B61',
  redSoft: '#FBE7E5',
  sandSoft: '#F1EBE2',
  sandText: '#6A5841',
  border: '#E5EAE4',
};

/**
 * Style « verre dépoli » : surfaces blanches translucides posées sur un fond aux taches douces
 * (voir GlassBackground). Le flou n'existe que sur le web ; sur téléphone, la transparence suffit.
 */
export const glass = {
  bg: 'rgba(255,255,255,0.62)',
  bgStrong: 'rgba(255,255,255,0.82)',
  edge: 'rgba(255,255,255,0.95)',
  line: 'rgba(36,51,43,0.10)',
};
export const glassSurface: ViewStyle = {
  backgroundColor: glass.bg,
  borderWidth: 1,
  borderColor: glass.edge,
  boxShadow: '0px 10px 28px -16px rgba(31,95,69,0.35)',
  ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(18px) saturate(140%)' } as ViewStyle) : null),
};
/** Dégradé vert du gros bouton photo et des boutons principaux (couleur unie en secours). */
export const greenGradient: ViewStyle = {
  backgroundColor: colors.green,
  ...(Platform.OS === 'web'
    ? ({ backgroundImage: 'linear-gradient(160deg, #3A8463, #1F5F45)' } as ViewStyle)
    : { experimental_backgroundImage: 'linear-gradient(160deg, #3A8463, #1F5F45)' }),
};

export const fonts = {
  title: Platform.select({ web: 'Fraunces, Georgia, serif', ios: 'Georgia', default: 'serif' }),
  body: Platform.select({ web: 'Inter, system-ui, -apple-system, sans-serif', default: undefined }),
};

export const radius = { sm: 10, md: 16, lg: 24, xl: 32 };

/** Dégradé « verre » réutilisable (web : backgroundImage ; téléphone : experimental_backgroundImage). */
const gradient = (fallback: string, css: string): ViewStyle => ({
  backgroundColor: fallback,
  ...(Platform.OS === 'web' ? ({ backgroundImage: css } as ViewStyle) : { experimental_backgroundImage: css }),
});
/**
 * Couleurs d'Instagram et de Facebook, adoucies pour aller avec le vert et le pêche de l'appli :
 * on garde la couleur reconnaissable, mais moins vive et un peu poudrée.
 */
export const brand = {
  instagram: {
    tile: gradient('#C97C93', 'linear-gradient(45deg, #EDB97C 0%, #DE8A86 45%, #B97AA6 75%, #8E7CB8 100%)'),
    soft: 'rgba(246,226,230,0.75)',
    line: 'rgba(196,112,138,0.55)',
  },
  facebook: {
    tile: gradient('#4F79B8', 'linear-gradient(160deg, #6E95D0, #4469A6)'),
    soft: 'rgba(225,234,247,0.75)',
    line: 'rgba(79,121,184,0.5)',
  },
};
