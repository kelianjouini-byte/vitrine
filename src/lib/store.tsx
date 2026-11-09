import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { captureMetaReturn } from './metaReturn';
import type { DayChoice, PlanChoices } from './planning';
import { load, save, clearAll } from './storage';
import { onNotificationTap, scheduleReminders } from './notifications';
import { billingStatus, fetchBusinessRemote, fetchRemotePosts, NotConfiguredError, setCurrentShop, signOut, socialConnections, teamContext } from './api';
import { isPatron as isPatronRole, type TeamContext } from './team';
import { isLiveStatus, type BillingStatus } from './billing';
import { isBackendConfigured } from './config';
import { mergePosts } from './sync';
import { codeFromUrl, savePendingCode } from './referral';
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
  | { name: 'published'; postId: string }
  | { name: 'offers'; payment?: 'ok' | 'annule' }
  | { name: 'referral' }
  | { name: 'review' }
  | { name: 'team' }
  | { name: 'teamAdd'; role?: 'patron' | 'employe' }
  | { name: 'teamMember'; id: string; code?: string }
  | { name: 'shopAdd' };

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
  /** Essai gratuit et abonnement (null : pas de serveur, ou pas encore lu). */
  billing: BillingStatus | null;
  refreshBilling: () => Promise<void>;
  /** Équipe et boutiques (null : pas de serveur, ou pas encore lu). */
  team: TeamContext | null;
  refreshTeam: () => Promise<void>;
  /** Ouvre une autre boutique de l'entreprise (bouton en haut de l'accueil). */
  switchShop: (id: string) => Promise<void>;
  /** Patron (ou commerçant seul) : abonnement, équipe, boutiques, réseaux, validation. */
  isPatron: boolean;
  /** Publie directement ; sinon le post est envoyé au patron. */
  canPublish: boolean;
}

/** Boutique ouverte sur ce téléphone. La principale garde les clés d'origine (« business », « posts »…). */
interface ShopRef { id: string; main: boolean }
const suffix = (ref: ShopRef | null) => (ref && !ref.main ? `:${ref.id}` : '');

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
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [team, setTeam] = useState<TeamContext | null>(null);
  // Boutique ouverte : lue au démarrage, avant tout le reste (les données de chaque boutique sont rangées à part).
  const shopRef = useRef<ShopRef | null>(null);
  // Dernière équipe connue (lue par switchShop juste après l'ajout d'une boutique).
  const teamRef = useRef<TeamContext | null>(null);
  const k = (base: string) => `${base}${suffix(shopRef.current)}`;

  const refreshBilling = useCallback(async () => {
    if (!isBackendConfigured) return;
    try { setBilling(await billingStatus()); } catch { /* hors ligne : on garde le dernier état connu */ }
  }, []);

  useEffect(() => {
    (async () => {
      // Lien de test « …/vitrine/app/?nouveau » : on repart de zéro sur cet appareil (rien n'est supprimé sur le serveur).
      if (Platform.OS === 'web' && typeof window !== 'undefined' && /[?&]nouveau\b/.test(window.location.search)) {
        await clearAll();
        await signOut().catch(() => {});
        window.history.replaceState(null, '', window.location.pathname);
      }
      // Lien de parrainage « …/vitrine/app/?parrain=CODE » : on garde le code pour le moment du paiement.
      if (Platform.OS === 'web') {
        const code = codeFromUrl();
        if (code) await savePendingCode(code);
      }
      // Retour de la connexion Instagram / Facebook (version web) : on rouvre Réglages, qui affiche le résultat.
      if (captureMetaReturn()) setStack([{ name: 'home' }, { name: 'settings' }]);
      // Retour de la page de paiement Stripe (version web) : « …/vitrine/app/abonnement?paiement=ok ».
      if (Platform.OS === 'web' && typeof window !== 'undefined' && /\/abonnement\/?$/.test(window.location.pathname)) {
        const p = new URLSearchParams(window.location.search).get('paiement');
        setStack([{ name: 'home' }, { name: 'settings' }, { name: 'offers', payment: p === 'ok' || p === 'annule' ? p : undefined }]);
        window.history.replaceState(null, '', window.location.pathname.replace(/abonnement\/?$/, ''));
      }
      shopRef.current = await load<ShopRef | null>('shop', null);
      setCurrentShop(shopRef.current?.id);
      setBusiness(await load<Business | null>(k('business'), null));
      setPosts(await load<Post[]>(k('posts'), []));
      setPrefsState(await load('prefs', DEFAULT_PREFS));
      setPlanChoices(await load<PlanChoices>(k('planChoices'), {}));
      // On affiche l'app tout de suite ; l'état des réseaux arrive juste après.
      setReady(true);
      setConnections(await socialConnections());
      // Équipe et boutiques : qui est connecté (patron, employé) et quelle boutique est ouverte.
      await loadTeam().catch(() => {});
      // Essai gratuit / abonnement : décide si l'appli est ouverte ou si seules les offres s'affichent.
      await refreshBilling();
      // L'historique du serveur complète celui du téléphone (posts publiés depuis un autre appareil).
      await syncPosts().catch(() => {});
    })();
  }, []);

  const go = useCallback((r: Route) => {
    setStack((s) => ((TAB_ROUTES as readonly string[]).includes(r.name) ? [r] : [...s, r]));
  }, []);

  // Appui sur une notification : le rappel du lundi ouvre les idées, celui du 1er du mois ouvre le bilan.
  useEffect(() => onNotificationTap((data) => {
    if (data?.route === 'offers') setStack([{ name: 'home' }, { name: 'offers' }]);
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
    setTeam((t) => (t && b.id ? { ...t, shops: t.shops.map((s) => (s.id === b.id ? { ...s, ...b } : s)) } : t));
    await save(k('business'), b);
  }, []);

  const upsertPost = useCallback((p: Post) => {
    setPosts((list) => {
      const next = [p, ...list.filter((x) => x.id !== p.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      save(k('posts'), next);
      return next;
    });
  }, []);

  const syncPosts = useCallback(async () => {
    const remote = await fetchRemotePosts(shopRef.current?.id);
    if (!remote.length) return;
    setPosts((list) => {
      const next = mergePosts(list, remote);
      save(k('posts'), next);
      return next;
    });
  }, []);

  /** Ouvre une boutique : ses données à elle (fiche, posts, planning), complétées par ce que dit le serveur. */
  const openShop = useCallback(async (shop: Business, companyId: string) => {
    if (!shop.id) return;
    const ref: ShopRef = { id: shop.id, main: shop.id === companyId };
    const changed = shopRef.current?.id !== ref.id || shopRef.current?.main !== ref.main;
    shopRef.current = ref;
    setCurrentShop(ref.id);
    await save('shop', ref);
    const local = changed ? await load<Business | null>(k('business'), null) : null;
    // Les réglages gardés seulement sur le téléphone (jours de fermeture, jours fériés) restent ; le reste vient du serveur.
    setBusiness((cur) => {
      const base = changed ? local : cur;
      const next: Business = { ...(base ?? {}), ...shop, closedDays: base?.closedDays, holidays: base?.holidays };
      save(k('business'), next);
      return next;
    });
    if (changed) {
      setPosts(await load<Post[]>(k('posts'), []));
      setPlanChoices(await load<PlanChoices>(k('planChoices'), {}));
    }
  }, []);

  /** Lit l'équipe sur le serveur. null si le serveur ne connaît pas encore cette fonction (ancienne version). */
  const loadTeam = useCallback(async (): Promise<TeamContext | null> => {
    if (!isBackendConfigured) return null;
    let ctx: TeamContext;
    try {
      ctx = await teamContext();
    } catch (e) {
      if (e instanceof NotConfiguredError) setTeam(null);
      return null;
    }
    setTeam(ctx);
    teamRef.current = ctx;
    const shop = ctx.shops.find((s) => s.id === shopRef.current?.id) ?? ctx.shops[0];
    if (shop) await openShop(shop, ctx.companyId);
    return ctx;
  }, [openShop]);

  const refreshTeam = useCallback(async () => { await loadTeam().catch(() => {}); }, [loadTeam]);

  const switchShop = useCallback(async (id: string) => {
    const t = teamRef.current;
    if (!t || id === shopRef.current?.id) return;
    const shop = t.shops.find((s) => s.id === id);
    if (!shop) return;
    await openShop(shop, t.companyId);
    setStack([{ name: 'home' }]);
    setConnections(await socialConnections());
    await syncPosts().catch(() => {});
  }, [openShop, syncPosts]);

  // Les posts à valider (patron) ou la réponse du patron (employé) : on regarde toutes les minutes.
  useEffect(() => {
    if (!team) return;
    const t = setInterval(() => {
      loadTeam().catch(() => {});
      // Un employé voit aussi le refus (et le petit mot) du patron sur ses posts.
      if (!isPatronRole(team.role)) syncPosts().catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, [team !== null, team?.role, loadTeam, syncPosts]);

  const restoreFromServer = useCallback(async () => {
    // Membre d'une équipe (employé, patron ajouté) ou patron avec plusieurs boutiques : le serveur dit quelle boutique ouvrir.
    const ctx = await loadTeam().catch(() => null);
    if (!ctx?.shops.length) {
      const b = await fetchBusinessRemote();
      if (!b) return false;
      setBusiness(b);
      await save(k('business'), b);
    }
    await syncPosts().catch(() => {});
    setConnections(await socialConnections());
    await refreshBilling();
    setStack([{ name: 'home' }]);
    return true;
  }, [syncPosts, loadTeam, refreshBilling]);

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
      save(k('planChoices'), next);
      return next;
    });
  }, []);

  // Les rappels (fêtes, idées du lundi, bilan, planning) sont reprogrammés dès que quelque chose change.
  useEffect(() => {
    if (!ready || !business) return;
    // Rappels de fin d'essai seulement si le commerçant n'a pas encore choisi d'offre.
    const trialEndsAt = billing?.access === 'trial' && !isLiveStatus(billing.subscription?.status) ? billing.trialEndsAt : null;
    const t = setTimeout(() => scheduleReminders(business, prefs, { posts, choices: planChoices, trialEndsAt }).catch(() => {}), 800);
    return () => clearTimeout(t);
  }, [ready, business, prefs, posts, planChoices, billing]);

  const refreshConnections = useCallback(async () => setConnections(await socialConnections()), []);

  const resetAll = useCallback(async () => {
    await clearAll();
    setBusiness(null);
    setPosts([]);
    setPrefsState(DEFAULT_PREFS);
    setPlanChoices({});
    setBilling(null);
    setTeam(null);
    teamRef.current = null;
    shopRef.current = null;
    setCurrentShop(null);
    setStack([{ name: 'home' }]);
  }, []);

  const isPatron = !team || isPatronRole(team.role);
  const canPublish = !team || team.canPublish;

  const value = useMemo<AppState>(
    () => ({ ready, business, posts, prefs, connections, route: stack[stack.length - 1], go, back, saveBusiness, upsertPost, planChoices, setDayChoice, setPrefs, refreshConnections, resetAll, syncPosts, restoreFromServer, billing, refreshBilling, team, refreshTeam, switchShop, isPatron, canPublish }),
    [ready, business, posts, prefs, connections, stack, go, back, saveBusiness, upsertPost, planChoices, setDayChoice, setPrefs, refreshConnections, resetAll, syncPosts, restoreFromServer, billing, refreshBilling, team, refreshTeam, switchShop, isPatron, canPublish],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp hors AppProvider');
  return v;
}
