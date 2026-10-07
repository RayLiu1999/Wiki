import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

const version = __WIKI_BUILD_ID__;
const articleCache = 'devwiki-articles-' + version;
setCacheNameDetails({ prefix: 'devwiki', suffix: version });
precacheAndRoute(self.__WB_MANIFEST, { ignoreURLParametersMatching: [/.*/] });
cleanupOutdatedCaches();
clientsClaim();

const articles = new NetworkFirst({
  cacheName: articleCache,
  networkTimeoutSeconds: 4,
  plugins: [
    {
      cacheKeyWillBeUsed: async ({ request }) => {
        const url = new URL(request.url);
        url.search = '';
        return url.href;
      },
      cacheWillUpdate: async ({ response }) => response.status === 200 ? response : null,
    },
    new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true }),
  ],
});

const isArticle = (url) => url.origin === self.location.origin && /^\/languages\/csharp\/[^/]+\/$/.test(url.pathname);
registerRoute(({ request, url }) => request.mode === 'navigate' && isArticle(url), articles);
registerRoute(({ request, url }) => request.mode === 'navigate' && url.origin === self.location.origin, new NetworkOnly());
setCatchHandler(async ({ request }) => request.mode === 'navigate'
  ? (await matchPrecache('/offline/index.html')) ?? Response.error()
  : Response.error());

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter((name) => name.startsWith('devwiki-articles-') && name !== articleCache).map((name) => caches.delete(name)),
  )));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  const port = event.ports[0];
  if (!port) return;
  event.waitUntil((async () => {
    const cache = await caches.open(articleCache);
    if (event.data?.type === 'LIST_ARTICLES') {
      const requests = await cache.keys();
      port.postMessage({ urls: requests.map((request) => new URL(request.url).pathname) });
      return;
    }
    try {
      const url = new URL(event.data?.url);
      if (!isArticle(url)) { port.postMessage({ cached: false }); return; }
      url.search = '';
      url.hash = '';
      if (event.data.type === 'CACHE_ARTICLE') {
        try { await Promise.all(articles.handleAll({ request: new Request(url.href), event })); } catch { /* Read existing cache below. */ }
      }
      port.postMessage({ cached: Boolean(await cache.match(url.href)) });
    } catch {
      port.postMessage({ cached: false });
    }
  })());
});
