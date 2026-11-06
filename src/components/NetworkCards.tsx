import React, { useEffect, useState } from 'react';
import { Platform as RNPlatform, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Badge, Body, Button, Card, Notice } from './ui';
import { FacebookIcon, InstagramIcon } from './icons';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { isBackendConfigured } from '../lib/config';
import { chooseMetaPage, metaConfigured, metaLoginUrl, metaPendingPages, NotConfiguredError, FriendlyError, type MetaPageChoice } from '../lib/api';
import type { Platform } from '../lib/types';

/**
 * Connexion Instagram / Facebook via l'OAuth officiel de Meta.
 * Le serveur fabrique l'URL de connexion Meta ; Meta renvoie ensuite vers notre serveur
 * qui stocke les jetons chiffrés, puis rouvre l'app (vitrine://meta-connected).
 */
/**
 * Adresse où Meta renvoie le commerçant après la connexion.
 * Appli : vitrine://meta-connected. Web : la page de Vitrine elle-même (ex. …github.io/vitrine/app/meta-connected).
 */
function redirectUri(): string {
  if (RNPlatform.OS === 'web' && typeof window !== 'undefined') {
    const base = window.location.pathname.replace(/[^/]*$/, ''); // « /vitrine/app/ »
    return `${window.location.origin}${base}meta-connected`;
  }
  return AuthSession.makeRedirectUri({ scheme: 'vitrine', path: 'meta-connected' });
}

/** Message simple selon la raison renvoyée par le serveur après la connexion. */
function failureText(url: string): string {
  const reason = /[?&]reason=([^&#]+)/.exec(url)?.[1];
  if (reason === 'no_page') return "Aucune Page Facebook n'a été trouvée. Créez une Page pour votre boutique, puis réessayez.";
  if (reason === 'no_instagram') return "Facebook est connecté, mais votre Instagram n'est pas encore relié à votre Page. Passez Instagram en compte professionnel, reliez-le à la Page, puis réessayez.";
  if (reason === 'expired') return 'La connexion a pris trop de temps. Réessayez.';
  if (reason === 'access_denied' || reason === 'denied') return "Vous n'avez pas donné l'autorisation. Vous pouvez réessayer quand vous voulez.";
  return 'Vérifiez que votre Instagram est un compte professionnel relié à votre Page Facebook, puis réessayez.';
}

export function NetworkCards() {
  const { connections, refreshConnections } = useApp();
  const [busy, setBusy] = useState(false);
  // null = on demande au serveur ; false = pas encore branché (« Bientôt disponible »).
  const [ready, setReady] = useState<boolean | null>(isBackendConfigured ? null : false);
  const [message, setMessage] = useState<{ tone: 'orange' | 'red' | 'green'; title: string; text?: string } | null>(null);
  // Le compte gère plusieurs Pages : le commerçant choisit celle de sa boutique.
  const [choices, setChoices] = useState<MetaPageChoice[] | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);

  useEffect(() => {
    if (!isBackendConfigured) return;
    let alive = true;
    metaConfigured().then((ok) => alive && setReady(ok));
    return () => { alive = false; };
  }, []);

  async function connect() {
    setMessage(null);
    setBusy(true);
    try {
      const redirect = redirectUri();
      const url = await metaLoginUrl(redirect);
      const res = await WebBrowser.openAuthSessionAsync(url, redirect);
      await refreshConnections();
      if (res.type === 'success' && res.url.includes('status=choose')) {
        const pages = await metaPendingPages();
        if (pages.length) setChoices(pages);
        else setMessage({ tone: 'red', title: "La connexion n'a pas abouti", text: 'Le choix a expiré. Réessayez.' });
      } else if (res.type === 'success') {
        setMessage(res.url.includes('status=error')
          ? { tone: 'red', title: "La connexion n'a pas abouti", text: failureText(res.url) }
          : { tone: 'green', title: 'Votre boutique est connectée.' });
      }
    } catch (e) {
      if (e instanceof NotConfiguredError) setReady(false);
      else setMessage({ tone: 'red', title: 'Nous avons besoin de votre attention', text: e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.' });
    } finally {
      setBusy(false);
    }
  }

  async function pick(page: MetaPageChoice) {
    setChoosing(page.id);
    setMessage(null);
    try {
      const hasIg = await chooseMetaPage(page.id);
      await refreshConnections();
      setChoices(null);
      setMessage(hasIg
        ? { tone: 'green', title: 'Votre boutique est connectée.' }
        : { tone: 'orange', title: 'Facebook est connecté', text: "Cette Page n'a pas d'Instagram relié. Passez Instagram en compte professionnel, reliez-le à la Page, puis reconnectez." });
    } catch (e) {
      setChoices(null);
      setMessage({ tone: 'red', title: 'Nous avons besoin de votre attention', text: e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.' });
    } finally {
      setChoosing(null);
    }
  }

  if (choices) {
    return (
      <View style={{ gap: 12 }}>
        <Body style={{ fontWeight: '700' }} size={18}>Sur quelle Page publier ?</Body>
        <Body soft size={14}>Votre compte gère plusieurs Pages. Choisissez celle de votre boutique.</Body>
        {choices.map((p) => (
          <Card key={p.id} onPress={choosing ? undefined : () => pick(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#E7F0FD', alignItems: 'center', justifyContent: 'center' }}><FacebookIcon color="#1877F2" /></View>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '700' }}>{p.name}</Body>
              <Body soft size={14}>{p.instagram ? `Instagram : ${p.instagram}` : 'Pas d\'Instagram relié'}</Body>
            </View>
            {choosing === p.id ? <Badge text="Un instant..." tone="green" /> : null}
          </Card>
        ))}
        <Button title="Annuler" kind="ghost" disabled={!!choosing} onPress={() => setChoices(null)} />
      </View>
    );
  }

  const row = (platform: Platform, label: string, icon: React.ReactNode, bg: string) => {
    const c = connections.find((x) => x.platform === platform);
    const connected = c?.status === 'connected';
    return (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '700' }}>{label}</Body>
          <Body soft size={14}>{connected ? c?.accountName ?? 'Connecté' : c?.status === 'expired' ? 'À reconnecter' : 'Pas encore connecté'}</Body>
        </View>
        {connected ? <Badge text="Connecté" tone="green" /> : c?.status === 'expired' ? <Badge text="À reconnecter" tone="red" /> : null}
      </Card>
    );
  };

  const allConnected = ['instagram', 'facebook'].every((p) => connections.find((c) => c.platform === p)?.status === 'connected');

  return (
    <View style={{ gap: 12 }}>
      {row('instagram', 'Instagram', <InstagramIcon color="#C13584" />, '#FCE8F1')}
      {row('facebook', 'Facebook', <FacebookIcon color="#1877F2" />, '#E7F0FD')}
      {!allConnected && ready === false && (
        <Notice tone="orange" title="Bientôt disponible" text="La connexion à Instagram et Facebook arrive très bientôt. Vos posts restent gardés dans « Mes posts » en attendant." />
      )}
      {!allConnected && ready !== false && (
        <Button title="Connecter Instagram et Facebook" kind="secondary" onPress={connect} loading={busy || ready === null} />
      )}
      {message && <Notice {...message} />}
      <Body soft size={13}>Instagram doit être un compte professionnel relié à votre Page Facebook.</Body>
    </View>
  );
}

// Nécessaire pour terminer la redirection OAuth sur le web.
WebBrowser.maybeCompleteAuthSession();
