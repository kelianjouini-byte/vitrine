import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { load, save, clearAll } from './storage';
import { onNotificationTap, scheduleReminders } from './notifications';
import { signOut, socialConnections } from './api';
import { Platform } from 'react-native';
import type { Business, NotificationPrefs, Post, PostIdea, SocialConnection } from './types';
import type { RawPhoto } from './photo';
import type { Month } from './report';

export type Route =
  | { name: 'home' }
  | { name: 'fetes' }
  | { name: 'posts' }
  | { name: 'settings' }
  | { name: 'ideas' }
  | { name: 'report'; month?: Month }
  | { name: 'create'; occasionId?: string; photo?: RawPhoto; idea?: PostIdea }
  | { name: 'published'; postId: string };

export const TAB_ROUTES = ['home', 'fetes', 'posts'] as const;

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
  setPrefs: (p: NotificationPrefs) => void;
  refreshConnections: () => Promise<void>;
  resetAll: () => Promise<void>;
}

const DEFAULT_PREFS: NotificationPrefs = { enabled: true, daysBefore: 7, hour: 9, weeklyIdeas: true, monthlyReport: true };

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [business, setBusiness] = useState<Business | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [prefs, setPrefsState] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
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
      // On affiche l'app tout de suite ; l'état des réseaux arrive juste après.
      setReady(true);
      setConnections(await socialConnections());
    })();
  }, []);

  const go = useCallback((r: Route) => {
    setStack((s) => ((TAB_ROUTES as readonly string[]).includes(r.name) ? [r] : [...s, r]));
  }, []);

  // Appui sur une notification : le rappel du lundi ouvre les idées, celui du 1er du mois ouvre le bilan.
  useEffect(() => onNotificationTap((data) => {
    if (data?.route === 'ideas') setStack([{ name: 'home' }, { name: 'ideas' }]);
    if (data?.route === 'report') {
      const [y, m] = String(data.month ?? '').split('-').map(Number);
      setStack([{ name: 'home' }, { name: 'report', month: y && m ? { year: y, month: m - 1 } : undefined }]);
    }
  }), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  const saveBusiness = useCallback(async (b: Business) => {
    setBusiness(b);
    await save('business', b);
    scheduleReminders(b, await load('prefs', DEFAULT_PREFS)).catch(() => {});
  }, []);

  const upsertPost = useCallback((p: Post) => {
    setPosts((list) => {
      const next = [p, ...list.filter((x) => x.id !== p.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      save('posts', next);
      return next;
    });
  }, []);

  const setPrefs = useCallback(
    (p: NotificationPrefs) => {
      setPrefsState(p);
      save('prefs', p);
      if (business) scheduleReminders(business, p).catch(() => {});
    },
    [business],
  );

  const refreshConnections = useCallback(async () => setConnections(await socialConnections()), []);

  const resetAll = useCallback(async () => {
    await clearAll();
    setBusiness(null);
    setPosts([]);
    setPrefsState(DEFAULT_PREFS);
    setStack([{ name: 'home' }]);
  }, []);

  const value = useMemo<AppState>(
    () => ({ ready, business, posts, prefs, connections, route: stack[stack.length - 1], go, back, saveBusiness, upsertPost, setPrefs, refreshConnections, resetAll }),
    [ready, business, posts, prefs, connections, stack, go, back, saveBusiness, upsertPost, setPrefs, refreshConnections, resetAll],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp hors AppProvider');
  return v;
}
