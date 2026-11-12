/**
 * Retour de la connexion Meta sur la version web.
 * Sur le web, Vitrine ouvre la page Facebook dans le MÊME onglet (une fenêtre à part est souvent
 * bloquée par le navigateur). Meta revient ensuite sur « …/app/meta-connected?status=… » :
 * au démarrage, on garde ce résultat de côté, on nettoie l'adresse, et l'écran Réglages l'affiche.
 */
import { Platform } from 'react-native';

let pending: string | null = null;

/** À appeler au démarrage. true = on revient de Meta (ouvrir l'écran Réglages). */
export function captureMetaReturn(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (!/\/meta-connected\/?$/.test(window.location.pathname)) return false;
  pending = window.location.search || '?status=error';
  window.history.replaceState(null, '', window.location.pathname.replace(/meta-connected\/?$/, ''));
  return true;
}

/** Le résultat du retour Meta (« ?status=ok… »), une seule fois. */
export function takeMetaReturn(): string | null {
  const r = pending;
  pending = null;
  return r;
}
