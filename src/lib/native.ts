/**
 * Applis App Store et Google Play.
 * Ces applis contiennent la version web de Vitrine, emballée par Capacitor : tout le code reste le même
 * (Platform.OS vaut toujours « web »). Ce fichier dit si l'on tourne dans une de ces applis,
 * et fournit les rares choses qui s'y font autrement (pages externes, connexion Meta).
 */
import { Linking } from 'react-native';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

/** true dans l'appli iPhone ou Android des stores ; false sur le site vitrineappli.fr/app. */
export const isStoreApp = Capacitor.isNativePlatform();

/** Adresse où Meta renvoie le commerçant dans l'appli des stores. */
export const STORE_APP_META_RETURN = 'vitrine://meta-connected';

/**
 * Ouvre une page externe (conditions, publication Instagram…).
 * Appli des stores : dans le navigateur intégré, par-dessus Vitrine. Site : nouvel onglet, comme avant.
 */
export async function openExternal(url: string): Promise<void> {
  if (isStoreApp) await Browser.open({ url });
  else await Linking.openURL(url);
}

/**
 * Connexion Meta dans l'appli des stores. Facebook refuse sa connexion à l'intérieur d'une appli :
 * on l'ouvre donc dans le navigateur du téléphone (Safari / Chrome), par-dessus Vitrine.
 * Le serveur renvoie ensuite vers « vitrine://meta-connected?status=… », ce qui rouvre Vitrine.
 * Renvoie cette adresse de retour, ou null si le commerçant a fermé la page sans aller au bout.
 */
export function openMetaLogin(url: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const subs: { remove: () => Promise<void> }[] = [];
    const finish = (value: string | null) => {
      if (finished) return;
      finished = true;
      subs.forEach((s) => s.remove().catch(() => {}));
      resolve(value);
    };
    (async () => {
      subs.push(await App.addListener('appUrlOpen', ({ url: back }) => {
        if (!back.startsWith(STORE_APP_META_RETURN)) return;
        Browser.close().catch(() => {}); // sur Android, la page est déjà fermée
        finish(back);
      }));
      // Page fermée : on laisse un court instant au retour « vitrine:// » pour arriver avant de conclure.
      subs.push(await Browser.addListener('browserFinished', () => setTimeout(() => finish(null), 1500)));
      await Browser.open({ url, presentationStyle: 'popover' });
    })().catch((e) => {
      subs.forEach((s) => s.remove().catch(() => {}));
      if (!finished) { finished = true; reject(e); }
    });
  });
}
