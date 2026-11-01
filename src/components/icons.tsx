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
export const AlertIcon = ({ size, color = '#000' }: P) => (<S size={size}><Circle cx={12} cy={12} r={9} {...st(color)} /><Path d="M12 7v6M12 16.5v.5" {...st(color)} /></S>);
