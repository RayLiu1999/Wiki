interface CachedMessage { cached?: boolean; urls?: string[]; }
interface ArticleCatalog { url: string; title: string; }
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let registration: ServiceWorkerRegistration | undefined;
let deferredInstall: InstallPromptEvent | undefined;

function messageWorker(type: string, url?: string): Promise<CachedMessage> {
  return new Promise((resolve, reject) => {
    const worker = navigator.serviceWorker?.controller;
    if (!worker) { resolve({}); return; }
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('Service worker did not respond')); }, 15000);
    channel.port1.onmessage = (event: MessageEvent<CachedMessage>) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data);
    };
    worker.postMessage({ type, url }, [channel.port2]);
  });
}

export async function cachedArticleUrls(): Promise<string[]> {
  if (!('serviceWorker' in navigator)) return [];
  try { return (await messageWorker('LIST_ARTICLES')).urls ?? []; } catch { return []; }
}

export async function initializePwa(catalog: ArticleCatalog[], notify: (text: string) => void) {
  const articleStatus = document.querySelector<HTMLElement>('[data-article-offline]');
  const installButton = document.getElementById('pwa-install');
  const help = document.getElementById('install-help') as HTMLDetailsElement | null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstall = event as InstallPromptEvent;
  });
  installButton?.addEventListener('click', async () => {
    if (window.matchMedia('(display-mode: standalone)').matches) { notify('目前已在應用程式模式中開啟。'); return; }
    if (!deferredInstall) {
      if (help) help.open = true;
      notify('請依下方說明，使用瀏覽器的安裝選項。');
      return;
    }
    await deferredInstall.prompt();
    const choice = await deferredInstall.userChoice;
    if (choice.outcome === 'accepted') notify('已送出安裝要求，請依瀏覽器提示完成。');
    deferredInstall = undefined;
  });
  window.addEventListener('appinstalled', () => { deferredInstall = undefined; notify('DevWiki 已安裝。'); });

  function connectionStatus() {
    const label = document.getElementById('offline-connection');
    if (label) {
      const isFallback = window.location.pathname !== '/offline/';
      label.textContent = isFallback
        ? '這個頁面尚未快取，且目前無法從網站讀取。恢復連線後重新整理即可重試，也可以先讀下方已快取的文章。'
        : navigator.onLine ? '裝置有網路連線，可以開啟文章並準備離線快取。' : '目前離線，可開啟下方已快取的文章。';
    }
  }
  connectionStatus();
  window.addEventListener('online', connectionStatus);
  window.addEventListener('offline', connectionStatus);

  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    if (articleStatus) articleStatus.textContent = '目前環境無法啟用離線閱讀。';
    const cacheLabel = document.getElementById('offline-cache-status');
    if (cacheLabel) cacheLabel.textContent = '請使用支援 Service Worker 的瀏覽器，並透過 HTTPS 或 localhost 開啟。';
    return;
  }
  if (import.meta.env.DEV) {
    if (articleStatus) articleStatus.textContent = '開發預覽尚未啟用離線閱讀。';
    const cacheLabel = document.getElementById('offline-cache-status');
    if (cacheLabel) cacheLabel.textContent = '完整建置的預覽版本會啟用離線快取。';
    return;
  }

  const updateNotice = document.getElementById('pwa-update');
  function showUpdate() { if (updateNotice) updateNotice.hidden = false; }
  let hasController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasController && !reloading) { reloading = true; window.location.reload(); }
    hasController = true;
  });
  document.getElementById('pwa-update-button')?.addEventListener('click', () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      if (updateNotice) updateNotice.hidden = true;
      notify('目前已是最新版本。');
    }
  });
  document.getElementById('pwa-update-dismiss')?.addEventListener('click', () => {
    if (updateNotice) updateNotice.hidden = true;
  });

  async function updateOfflineList() {
    const list = document.getElementById('offline-articles');
    const label = document.getElementById('offline-cache-status');
    if (!list || !label) return;
    const urls = await cachedArticleUrls();
    const cached = catalog.filter((article) => urls.includes(article.url));
    list.replaceChildren();
    for (const article of cached) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = article.url;
      link.textContent = article.title;
      item.append(link);
      list.append(item);
    }
    label.textContent = cached.length ? cached.length + ' 篇文章可離線閱讀。' : '尚未快取文章。連線時開啟一篇文章，等候「可離線閱讀」提示。';
  }

  try {
    registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    if (registration.waiting) showUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration?.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
      });
    });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        if (navigator.serviceWorker.controller) resolve();
        else navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
      });
    }
    if (articleStatus) {
      const url = window.location.origin + window.location.pathname;
      const initial = await messageWorker('CHECK_ARTICLE', url);
      if (initial.cached) articleStatus.textContent = '可離線閱讀 · 已儲存在這台裝置';
      else {
        articleStatus.textContent = '正在準備離線閱讀，請保持連線…';
        const result = await messageWorker('CACHE_ARTICLE', url);
        articleStatus.textContent = result.cached ? '可離線閱讀 · 已儲存在這台裝置' : '尚未完成離線快取，請保持連線後重新整理。';
      }
    }
    await updateOfflineList();
    window.addEventListener('online', () => { void updateOfflineList(); });
  } catch {
    if (articleStatus) articleStatus.textContent = '尚未完成離線快取，請確認連線後重新整理。';
    const label = document.getElementById('offline-cache-status');
    if (label) label.textContent = '離線快取暫時無法使用，請確認連線與瀏覽器的儲存設定。';
  }
}
