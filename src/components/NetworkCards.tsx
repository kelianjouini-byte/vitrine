import React, { useState } from 'react';
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Badge, Body, Button, Card, Notice } from './ui';
import { FacebookIcon, InstagramIcon } from './icons';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { isBackendConfigured } from '../lib/config';
import { metaLoginUrl, NotConfiguredError, FriendlyError } from '../lib/api';
import type { Platform } from '../lib/types';

/**
 * Connexion Instagram / Facebook via l'OAuth officiel de Meta.
 * Le serveur fabrique l'URL de connexion Meta ; Meta renvoie ensuite vers notre serveur
 * qui stocke les jetons chiffrés, puis rouvre l'app (vitrine://meta-connected).
 */
export function NetworkCards() {
  const { connections, refreshConnections } = useApp();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'orange' | 'red' | 'green'; title: string; text?: string } | null>(null);

  async function connect() {
    setMessage(null);
    if (!isBackendConfigured) {
      setMessage({ tone: 'orange', title: 'Bientôt disponible', text: "La connexion à Instagram et Facebook sera active dès que le compte Meta de Vitrine sera configuré." });
      return;
    }
    setBusy(true);
    try {
      const redirect = AuthSession.makeRedirectUri({ scheme: 'vitrine', path: 'meta-connected' });
      const url = await metaLoginUrl(redirect);
      const res = await WebBrowser.openAuthSessionAsync(url, redirect);
      await refreshConnections();
      if (res.type === 'success') {
        const failed = res.url.includes('status=error');
        setMessage(failed
          ? { tone: 'red', title: "La connexion n'a pas abouti", text: 'Vérifiez que votre Instagram est un compte professionnel relié à votre Page Facebook, puis réessayez.' }
          : { tone: 'green', title: 'Votre boutique est connectée.' });
      }
    } catch (e) {
      if (e instanceof NotConfiguredError) setMessage({ tone: 'orange', title: 'Bientôt disponible', text: 'La connexion Meta n\'est pas encore configurée sur le serveur.' });
      else setMessage({ tone: 'red', title: 'Nous avons besoin de votre attention', text: e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.' });
    } finally {
      setBusy(false);
    }
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
      {!allConnected && (
        <Button title="Connecter mes réseaux" kind="secondary" onPress={connect} loading={busy} />
      )}
      {message && <Notice {...message} />}
      <Body soft size={13}>Instagram doit être un compte professionnel relié à votre Page Facebook.</Body>
    </View>
  );
}

// Nécessaire pour terminer la redirection OAuth sur le web.
WebBrowser.maybeCompleteAuthSession();
