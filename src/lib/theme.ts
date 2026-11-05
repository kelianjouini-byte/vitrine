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
