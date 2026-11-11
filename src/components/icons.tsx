import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

type P = { size?: number; color?: string };
const S = ({ size = 24, children }: { size?: number; children: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">{children}</Svg>
);
const st = (color: string) => ({ stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

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
export const PlanningIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Rect x={4} y={4} width={16} height={16} rx={3} {...st(color)} /><Path d="M8 9h8M8 13h8M8 17h5" {...st(color)} /></S>
);
export const VideoIcon = ({ size, color = '#fff' }: P) => (
  <S size={size}><Rect x={3} y={6} width={13} height={12} rx={2} {...st(color)} /><Path d="m16 10.5 5-3v9l-5-3" {...st(color)} /></S>
);
/** Story : un téléphone debout avec un anneau, comme les stories d'Instagram. */
export const StoryIcon = ({ size, color = '#fff' }: P) => (
  <S size={size}><Rect x={6.5} y={2.5} width={11} height={19} rx={2.5} {...st(color)} /><Circle cx={12} cy={10.5} r={3} {...st(color)} /><Path d="M9.5 17h5" {...st(color)} /></S>
);
export const MusicIcon = ({ size, color = '#fff' }: P) => (
  <S size={size}><Path d="M9 18V6l11-2v12" {...st(color)} /><Circle cx={6.5} cy={18} r={2.5} {...st(color)} /><Circle cx={17.5} cy={16} r={2.5} {...st(color)} /></S>
);
export const PlayIcon = ({ size, color = '#fff' }: P) => (<S size={size}><Path d="M8 5.5v13l10.5-6.5L8 5.5Z" {...st(color)} /></S>);
export const StopIcon = ({ size, color = '#fff' }: P) => (<S size={size}><Rect x={6.5} y={6.5} width={11} height={11} rx={2} {...st(color)} /></S>);
export const DownloadIcon = ({ size, color = '#fff' }: P) => (<S size={size}><Path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" {...st(color)} /></S>);
export const CheckIcon = ({ size, color = '#fff' }: P) => (<S size={size}><Path d="m5 12.5 4.5 4.5L19 7.5" {...st(color)} strokeWidth={2.6} /></S>);
export const BackIcon = ({ size, color = '#000' }: P) => (<S size={size}><Path d="M15 5 8 12l7 7" {...st(color)} /></S>);
export const ImageIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Rect x={3} y={4} width={18} height={16} rx={2} {...st(color)} /><Circle cx={9} cy={10} r={2} {...st(color)} /><Path d="m21 16-5-5-9 9" {...st(color)} /></S>
);
export const SparkIcon = ({ size, color = '#000' }: P) => (<S size={size}><Path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" {...st(color)} /></S>);
export const RefreshIcon = ({ size, color = '#000' }: P) => (<S size={size}><Path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" {...st(color)} /></S>);
export const PencilIcon = ({ size, color = '#000' }: P) => (<S size={size}><Path d="M4 20h4L19 9l-4-4L4 16v4Z" {...st(color)} /></S>);
export const GearIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Circle cx={12} cy={12} r={3} {...st(color)} /><Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" {...st(color)} /></S>
);
export const InstagramIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Rect x={3.5} y={3.5} width={17} height={17} rx={5} {...st(color)} /><Circle cx={12} cy={12} r={4} {...st(color)} /><Circle cx={17} cy={7} r={0.8} fill={color} /></S>
);
export const FacebookIcon = ({ size, color = '#000' }: P) => (<S size={size}><Path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8Z" {...st(color)} /></S>);
/** Logos pleins (blancs) posés sur les pastilles colorées « Publier sur ». */
export const InstagramMark = ({ size, color = '#fff' }: P) => (
  <S size={size}><Rect x={3.5} y={3.5} width={17} height={17} rx={5} {...st(color)} strokeWidth={2.1} /><Circle cx={12} cy={12} r={4} {...st(color)} strokeWidth={2.1} /><Circle cx={17.2} cy={6.8} r={1.2} fill={color} /></S>
);
export const FacebookMark = ({ size, color = '#fff' }: P) => (<S size={size}><Path d="M13.6 21v-7.6h2.6l.4-3.1h-3V8.4c0-.9.3-1.5 1.5-1.5h1.6V4.1a21 21 0 0 0-2.3-.1c-2.3 0-3.9 1.4-3.9 4v2.3H7.9v3.1h2.6V21h3.1Z" fill={color} /></S>);
/** Petit graphique qui monte : purement décoratif, ce n'est PAS une courbe de données. */
export const ChartUpIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Path d="M4 20h16" {...st(color)} /><Path d="m5 16 4.5-4.5 3 3L19 8" {...st(color)} /><Path d="M15 8h4v4" {...st(color)} /></S>
);
export const ChevronIcon = ({ size, color = '#000' }: P) => (<S size={size}><Path d="m9 5 7 7-7 7" {...st(color)} /></S>);
export const BulbIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" {...st(color)} /></S>
);
export const ThumbUpIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Path d="M7 10v10H4V10h3Zm0 0 4-7a2 2 0 0 1 2 2.5L12.3 9H18a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 16.8 20H7" {...st(color)} /></S>
);
export const ThumbDownIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Path d="M17 14V4h3v10h-3Zm0 0-4 7a2 2 0 0 1-2-2.5l.7-3.5H6a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 7.2 4H17" {...st(color)} /></S>
);
export const ClockIcon = ({ size, color = '#000' }: P) => (<S size={size}><Circle cx={12} cy={12} r={8.5} {...st(color)} /><Path d="M12 7.5V12l3 2" {...st(color)} /></S>);
export const EyeIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" {...st(color)} /><Circle cx={12} cy={12} r={3} {...st(color)} /></S>
);
export const StarIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" {...st(color)} /></S>
);
export const StoreIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Path d="M4 9.5 5.5 5h13L20 9.5M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5M4 9.5h16M5.5 12v8h13v-8M10 20v-4.5h4V20" {...st(color)} /></S>
);
export const LinkIcon = ({ size, color = '#000' }: P) => (<S size={size}><Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" {...st(color)} /></S>);
export const TrashIcon = ({ size, color = '#000' }: P) => (<S size={size}><Path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" {...st(color)} /></S>);
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
/** Envoyer un message (bulle). */
export const MessageIcon = ({ size, color = '#fff' }: P) => (
  <S size={size}><Path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" {...st(color)} /></S>
);
/** Cœur : les « j'aime ». fill = couleur de remplissage (facultatif). */
export const HeartIcon = ({ size, color = '#000', fill = 'none' }: P & { fill?: string }) => (
  <S size={size}><Path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z" {...st(color)} fill={fill} /></S>
);
export const PrintIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Path d="M6 9V3h12v6M7 14h10v7H7z" {...st(color)} /><Rect x={3} y={9} width={18} height={8} rx={2} {...st(color)} /></S>
);
/** Deux personnes : le parrainage entre commerçants. */
export const PeopleIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Circle cx={9} cy={8} r={3.2} {...st(color)} /><Circle cx={17} cy={9.5} r={2.6} {...st(color)} /><Path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5M15 15c2.8-.4 5.2 1.4 6 4.5" {...st(color)} /></S>
);
/** Une personne : un membre de l'équipe. */
export const PersonIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Circle cx={12} cy={8} r={3.6} {...st(color)} /><Path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" {...st(color)} /></S>
);
export const PlusIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Path d="M12 5v14M5 12h14" {...st(color)} /></S>
);
/** Avion en papier : « Envoyer au patron ». */
export const SendIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" {...st(color)} /></S>
);
/** Petite flèche vers le bas : le bouton de choix de boutique. */
export const ChevronDownIcon = ({ size, color = '#000' }: P) => (
  <S size={size}><Path d="m6 9 6 6 6-6" {...st(color)} /></S>
);
