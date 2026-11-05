import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { DayChoice, PlanChoices } from './planning';
import { load, save, clearAll } from './storage';
import { onNotificationTap, scheduleReminders } from './notifications';
import { fetchBusinessRemote, fetchRemotePosts, signOut, socialConnections } from './api';
import { mergePosts } from './sync';
import { Platform } from 'react-native';
import type { Business, NotificationPrefs, Post, PostIdea, SocialConnection } from './types';
import type { RawPhoto } from './photo';
import type { Month } from './report';

export type Route =
  | { name: 'home' }
  | { name: 'fetes' }
  | { name: 'posts' }
  | { name: 'planning' }
  | { name: 'planDay'; day: string }
  | { name: 'settings' }
  | { name: 'ideas' }
  | { name: 'report'; month?: Month }
  | { name: 'create'; occasionId?: string; photo?: RawPhoto; idea?: PostIdea; plannedFor?: string; note?: string }
  | { name: 'story' }
  | { name: 'published'; postId: string };

export const TAB_ROUTES = ['home', 'planning', 'fetes', 'posts'] as const;

interface AppState {
  ready: boolean;
  business: Business | null;
  posts: Post[];
  prefs: NotificationPrefs;
  connections: SocialConnection[];
  route: Route;
  go: (r: Route) => void;
  back: () => void;
  saveBusiness: (b: Business) => Promise<void>;
  upsertPost: (p: Post) => void;
  /** Choix du commerçant dans le planning (post, story, repos, « une autre idée »). */
  planChoices: PlanChoices;
  setDayChoice: (day: string, c: DayChoice) => void;
  setPrefs: (p: NotificationPrefs) => void;
  refreshConnections: () => Promise<void>;
  resetAll: () => Promise<void>;
  /** Relit l'historique des posts sur le serveur (nouveau téléphone, autre appareil). */
  syncPosts: () => Promise<void>;
  /** Après « Retrouver mon compte » : reprend la boutique et l'historique du serveur. false = aucune boutique trouvée. */
  restoreFromServer: () => Promise<boolean>;
}

const DEFAULT_PREFS: NotificationPrefs = { enabled: true, daysBefore: 7, hour: 9, weeklyIdeas: true, monthlyReport: true };

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [business, setBusiness] = useState<Business | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [prefs, setPrefsState] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [planChoices, setPlanChoices] = useState<PlanChoices>({});
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);

  useEffect(() => {
    (async () => {
      // Lien de test « …/vitrine/?nouveau » : on repart de zéro sur cet appareil (rien n'est supprimé sur le serveur).
      if (Platform.OS === 'web' && typeof window !== 'undefined' && /[?&]nouveau\b/.test(window.location.search)) {
        await clearAll();
        await signOut().catch(() => {});
        window.history.replaceState(null, '', window.location.pathname);
      }
      setBusiness(await load<Business | null>('business', null));
      setPosts(await load<Post[]>('posts', []));
      setPrefsState(await load('prefs', DEFAULT_PREFS));
      setPlanChoices(await load<PlanChoices>('planChoices', {}));
      // On affiche l'app tout de suite ; l'état des réseaux arrive juste après.
      setReady(true);
      setConnections(await socialConnections());
      // L'historique du serveur complète celui du téléphone (posts publiés depuis un autre appareil).
      await syncPosts().catch(() => {});
    })();
  }, []);

  const go = useCallback((r: Route) => {
    setStack((s) => ((TAB_ROUTES as readonly string[]).includes(r.name) ? [r] : [...s, r]));
  }, []);

  // Appui sur une notification : le rappel du lundi ouvre les idées, celui du 1er du mois ouvre le bilan.
  useEffect(() => onNotificationTap((data) => {
    if (data?.route === 'ideas') setStack([{ name: 'home' }, { name: 'ideas' }]);
    if (data?.route === 'planDay' && typeof data.day === 'string') setStack([{ name: 'planning' }, { name: 'planDay', day: data.day }]);
    if (data?.route === 'report') {
      const [y, m] = String(data.month ?? '').split('-').map(Number);
      setStack([{ name: 'home' }, { name: 'report', month: y && m ? { year: y, month: m - 1 } : undefined }]);
    }
  }), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  const saveBusiness = useCallback(async (b: Business) => {
    setBusiness(b);
    await save('business', b);
  }, []);

  const upsertPost = useCallback((p: Post) => {
    setPosts((list) => {
      const next = [p, ...list.filter((x) => x.id !== p.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      save('posts', next);
      return next;
    });
  }, []);

  const syncPosts = useCallback(async () => {
    const remote = await fetchRemotePosts();
    if (!remote.length) return;
    setPosts((list) => {
      const next = mergePosts(list, remote);
      save('posts', next);
      return next;
    });
  }, []);

  const restoreFromServer = useCallback(async () => {
    const b = await fetchBusinessRemote();
    if (!b) return false;
    setBusiness(b);
    await save('business', b);
    await syncPosts().catch(() => {});
    setConnections(await socialConnections());
    setStack([{ name: 'home' }]);
    return true;
  }, [syncPosts]);

  const setPrefs = useCallback((p: NotificationPrefs) => {
    setPrefsState(p);
    save('prefs', p);
  }, []);

  const setDayChoice = useCallback((day: string, c: DayChoice) => {
    setPlanChoices((all) => {
      const next = { ...all, [day]: c };
      // On garde seulement les choix des 60 derniers jours et à venir.
      const old = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
      for (const k of Object.keys(next)) if (k < old) delete next[k];
      save('planChoices', next);
      return next;
    });
  }, []);

  // Les rappels (fêtes, idées du lundi, bilan, planning) sont reprogrammés dès que quelque chose change.
  useEffect(() => {
    if (!ready || !business) return;
    const t = setTimeout(() => scheduleReminders(business, prefs, { posts, choices: planChoices }).catch(() => {}), 800);
    return () => clearTimeout(t);
  }, [ready, business, prefs, posts, planChoices]);

  const refreshConnections = useCallback(async () => setConnections(await socialConnections()), []);

  const resetAll = useCallback(async () => {
    await clearAll();
    setBusiness(null);
    setPosts([]);
    setPrefsState(DEFAULT_PREFS);
    setPlanChoices({});
    setStack([{ name: 'home' }]);
  }, []);

  const value = useMemo<AppState>(
    () => ({ ready, business, posts, prefs, connections, route: stack[stack.length - 1], go, back, saveBusiness, upsertPost, planChoices, setDayChoice, setPrefs, refreshConnections, resetAll, syncPosts, restoreFromServer }),
    [ready, business, posts, prefs, connections, stack, go, back, saveBusiness, upsertPost, planChoices, setDayChoice, setPrefs, refreshConnections, resetAll, syncPosts, restoreFromServer],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp hors AppProvider');
  return v;
}
