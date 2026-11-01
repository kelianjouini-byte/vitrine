import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { load, save, clearAll } from './storage';
import { scheduleReminders } from './notifications';
import { socialConnections } from './api';
import type { Business, NotificationPrefs, Post, SocialConnection } from './types';

export type Route =
  | { name: 'home' }
  | { name: 'fetes' }
  | { name: 'posts' }
  | { name: 'settings' }
  | { name: 'create'; occasionId?: string }
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

const DEFAULT_PREFS: NotificationPrefs = { enabled: true, daysBefore: 7, hour: 9 };

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
      setBusiness(await load<Business | null>('business', null));
      setPosts(await load<Post[]>('posts', []));
      setPrefsState(await load('prefs', DEFAULT_PREFS));
      setConnections(await socialConnections());
      setReady(true);
    })();
  }, []);

  const go = useCallback((r: Route) => {
    setStack((s) => ((TAB_ROUTES as readonly string[]).includes(r.name) ? [r] : [...s, r]));
  }, []);
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
