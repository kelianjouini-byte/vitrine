import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

type P = { size?: number; color?: string };
const S = ({ size = 24, children }: { size?: number; children: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">{children}</Svg>
);
const st = (color: string) => ({ stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export const CameraIcon = ({ size, color = '#fff' }: P) => (
  <S size={size}><Path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" {...st(color)} /><Circle cx={12} cy={13.5} r={3.5} {...st(color)} /></S>
);
export const HomeIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8Z" {...st(color)} /></S>
);
export const CalendarIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Rect x={4} y={5} width={16} height={15} rx={2} {...st(color)} /><Path d="M4 10h16M8 3v4M16 3v4" {...st(color)} /></S>
);
export const GridIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Rect x={4} y={4} width={6.5} height={6.5} rx={1.5} {...st(color)} /><Rect x={13.5} y={4} width={6.5} height={6.5} rx={1.5} {...st(color)} /><Rect x={4} y={13.5} width={6.5} height={6.5} rx={1.5} {...st(color)} /><Rect x={13.5} y={13.5} width={6.5} height={6.5} rx={1.5} {...st(color)} /></S>
);
export const CheckIcon = ({ size, color = '#fff' }: P) => (<S size={size}><Path d="m5 12.5 4.5 4.5L19 7.5" {...st(color)} strokeWidth={2.6} /></S>);
export const BackIcon = ({ size, color = '#000' }: P) => (<S size={size}><Path d="M15 5 8 12l7 7" {...st(color)} /></S>);
export const ImageIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Rect x={3} y={4} width={18} height={16} rx={2} {...st(color)} /><Circle cx={9} cy={10} r={2} {...st(color)} /><Path d="m21 16-5-5-9 9" {...st(color)} /></S>
);
export const SparkIcon = ({ size, color = '#000' }: P) => (<S size={size}><Path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" {...st(color)} /></S>);
export const RefreshIcon = ({ size, color = '#000' }: P) => (<S size={size}><Path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" {...st(color)} /></S>);
export const PencilIcon = ({ size, color = '#000' }: P) => (<S size={size}><Path d="M4 20h4L19 9l-4-4L4 16v4Z" {...st(color)} /></S>);
export const GearIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Circle cx={12} cy={12} r={3} {...st(color)} /><Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" {...st(color)} /></S>
);
export const InstagramIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Rect x={3.5} y={3.5} width={17} height={17} rx={5} {...st(color)} /><Circle cx={12} cy={12} r={4} {...st(color)} /><Circle cx={17} cy={7} r={0.8} fill={color} /></S>
);
export const FacebookIcon = ({ size, color = '#000' }: P) => (<S size={size}><Path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8Z" {...st(color)} /></S>);
/** Petit graphique qui monte : purement décoratif, ce n'est PAS une courbe de données. */
export const ChartUpIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Path d="M4 20h16" {...st(color)} /><Path d="m5 16 4.5-4.5 3 3L19 8" {...st(color)} /><Path d="M15 8h4v4" {...st(color)} /></S>
);
export const AlertIcon = ({ size, color = '#000' }: P) => (<S size={size}><Circle cx={12} cy={12} r={9} {...st(color)} /><Path d="M12 7v6M12 16.5v.5" {...st(color)} /></S>);

/** Logo Vitrine « la boutique qui reçoit un j'aime » : store, vitrine aux reflets orange, porte et pastille cœur. `onGreen` : version blanche pour fond vert. */
export const LogoMark = ({ size = 64, onGreen = false }: { size?: number; onGreen?: boolean }) => {
  const fg = onGreen ? '#FFFFFF' : '#2F7658';
  const bg = onGreen ? '#2F7658' : '#F8FAF7';
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel="Vitrine">
      <Rect x={10} y={34} width={84} height={7} rx={2.5} fill={fg} />
      <Path d="M10 40 H94 V46 Q83.5 58.6 73 46 Q62.5 58.6 52 46 Q41.5 58.6 31 46 Q20.5 58.6 10 46 Z" fill={fg} />
      <Rect x={16} y={66} width={48} height={38} rx={5} stroke={fg} strokeWidth={6} fill="none" />
      <Path d="M26 94 L40 76 M38 96 L46 86" stroke="#F2B66D" strokeWidth={5} strokeLinecap="round" />
      <Path d="M72 106 V68 H88 V106" stroke={fg} strokeWidth={6} strokeLinejoin="round" fill="none" />
      <Path d="M8 106 H96" stroke={fg} strokeWidth={6} strokeLinecap="round" />
      <Circle cx={96} cy={26} r={18} fill="#F2B66D" stroke={bg} strokeWidth={5} />
      <Path d="M96 32.7 C88.4 27 86.5 23.2 86.5 20.4 A4.7 4.7 0 0 1 96 18.5 A4.7 4.7 0 0 1 105.5 20.4 C105.5 23.2 103.6 27 96 32.7 Z" fill={bg} />
    </Svg>
  );
};
