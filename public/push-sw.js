// Service worker de Vitrine : affiche « le petit rappel du jour » envoyé par le serveur,
// et ouvre Vitrine sur le choix Photo / Vidéo quand on touche la notification.
// Il ne met rien en cache : l'appli se charge toujours normalement.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const base = self.registration.scope;
  event.waitUntil(self.registration.showNotification(data.title || 'Vitrine', {
    body: data.body || 'Une photo aujourd\'hui ? Vitrine écrit le reste.',
    icon: base + 'icon-192.png',
    badge: base + 'icon-192.png',
    tag: data.tag || 'vitrine-rappel',
    lang: 'fr',
    data: { url: new URL(data.url || '?ouvrir=creer', base).href },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if (client.url.indexOf(self.registration.scope) === 0 && 'focus' in client) {
        client.postMessage({ type: 'vitrine-open' });
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
