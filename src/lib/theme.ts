import { Platform } from 'react-native';

/** Palette officielle Vitrine (cf. cahier des charges, section 3). */
export const colors = {
  green: '#2F7658',
  greenDark: '#1F5F45',
  greenSoft: '#DCEFE3',
  bg: '#F8FAF7',
  white: '#FFFFFF',
  text: '#24332B',
  textSoft: '#758078',
  orange: '#F2B66D',
  orangeSoft: '#FCEFD9',
  orangeText: '#8A5A12',
  red: '#D96B61',
  redSoft: '#FBE7E5',
  blueSoft: '#E6ECFA',
  blueText: '#3C5BA9',
  border: '#E5EAE4',
};

export const fonts = {
  title: Platform.select({ web: 'Fraunces, Georgia, serif', ios: 'Georgia', default: 'serif' }),
  body: Platform.select({ web: 'Inter, system-ui, -apple-system, sans-serif', default: undefined }),
};

export const radius = { sm: 10, md: 16, lg: 24, xl: 32 };
