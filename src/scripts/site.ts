import { readBookmarks, writeBookmarks } from '../lib/bookmarks.mjs';
import { initializePwa, cachedArticleUrls } from '../pwa/client';

interface CatalogArticle {
  id: string;
  url: string;
  title: string;
  description: string;
  category: string;
  level: string;
  tags: string[];
}
interface PagefindData { url: string; meta: { title?: string }; plain_excerpt: string; }
interface PagefindModule {
  search: (query: string) => Promise<{ results: { data: () => Promise<PagefindData> }[] }>;
}
interface DevSearchArticle { url: string; title: string; description: string; text: string; }

const catalog: CatalogArticle[] = JSON.parse(document.getElementById('wiki-catalog')?.textContent ?? '[]');
const allowedIds = catalog.map((article) => article.id);
let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* Storage may be disabled by the browser. */ }

let toastTimer: ReturnType<typeof setTimeout>;
export function notify(message: string) {
  const toast = document.getElementById('site-toast');
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

const themeButton = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
function syncThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeButton?.setAttribute('aria-label', dark ? '切換至淺色模式' : '切換至深色模式');
}
syncThemeButton();
themeButton?.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { storage?.setItem('devwiki-theme', theme); } catch { /* The current page still changes theme. */ }
  syncThemeButton();
});

function syncBookmarks() {
  const ids = readBookmarks(storage, allowedIds);
  document.querySelectorAll<HTMLButtonElement>('[data-bookmark]').forEach((button) => {
    const saved = ids.includes(button.dataset.bookmark ?? '');
    button.setAttribute('aria-pressed', String(saved));
    const text = button.querySelector('span');
    if (text) text.textContent = saved ? '已收藏' : '收藏文章';
  });
  const savedList = document.querySelector<HTMLElement>('[data-saved-list]');
  if (savedList) {
    savedList.hidden = ids.length === 0;
    savedList.querySelectorAll<HTMLElement>('[data-saved-row]').forEach((row) => {
      row.hidden = !ids.includes(row.dataset.articleId ?? '');
    });
    const empty = document.querySelector<HTMLElement>('[data-saved-empty]');
    if (empty) empty.hidden = ids.length > 0;
    const count = document.querySelector<HTMLElement>('[data-saved-count]');
    if (count) count.textContent = ids.length + ' 篇收藏文章';
  }
}
syncBookmarks();
document.querySelectorAll<HTMLButtonElement>('[data-bookmark]').forEach((button) => {
  button.addEventListener('click', () => {
    const id = button.dataset.bookmark;
    if (!id || !allowedIds.includes(id)) return;
    const ids = readBookmarks(storage, allowedIds);
    const existing = ids.includes(id);
    const next = existing ? ids.filter((value) => value !== id) : [...ids, id];
    if (!writeBookmarks(storage, next)) {
      notify('瀏覽器目前無法儲存收藏，請確認儲存空間或隱私設定。');
      return;
    }
    syncBookmarks();
    notify(existing ? '已取消收藏' : '已加入收藏，可在這台裝置再次找到');
  });
});
window.addEventListener('storage', syncBookmarks);

const filters = document.querySelectorAll<HTMLButtonElement>('[data-filter]');
function selectCategory(id: string, updateUrl: boolean) {
  if (![...filters].some((button) => button.dataset.filter === id)) id = 'all';
  filters.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === id)));
  let count = 0;
  document.querySelectorAll<HTMLElement>('[data-article-row]').forEach((row) => {
    row.hidden = id !== 'all' && row.dataset.category !== id;
    if (!row.hidden) count++;
  });
  const heading = document.querySelector<HTMLElement>('[data-filter-heading]');
  if (heading) heading.textContent = [...filters].find((button) => button.dataset.filter === id)?.childNodes[0].textContent ?? '全部文章';
  const countLabel = document.querySelector<HTMLElement>('[data-filter-count]');
  if (countLabel) countLabel.textContent = count + ' 篇';
  if (updateUrl) {
    const url = new URL(window.location.href);
    if (id === 'all') url.searchParams.delete('category');
    else url.searchParams.set('category', id);
    history.pushState({}, '', url);
  }
}
if (filters.length) {
  selectCategory(new URL(window.location.href).searchParams.get('category') ?? 'all', false);
  filters.forEach((button) => button.addEventListener('click', () => selectCategory(button.dataset.filter ?? 'all', true)));
  window.addEventListener('popstate', () => selectCategory(new URL(window.location.href).searchParams.get('category') ?? 'all', false));
}

const dialog = document.getElementById('wiki-search') as HTMLDialogElement | null;
const input = document.getElementById('search-input') as HTMLInputElement | null;
const results = document.getElementById('search-results');
const status = document.getElementById('search-status');
let searchSequence = 0;
let searchTimer: ReturnType<typeof setTimeout>;
let pagefind: Promise<PagefindModule> | undefined;
let devIndex: Promise<DevSearchArticle[]> | undefined;

function showResults(items: { url: string; title: string; excerpt: string }[]) {
  results?.replaceChildren();
  for (const item of items) {
    const link = document.createElement('a');
    link.className = 'search-result';
    link.href = item.url;
    const title = document.createElement('h3');
    title.textContent = item.title;
    const description = document.createElement('p');
    description.textContent = item.excerpt;
    link.append(title, description);
    results?.append(link);
  }
}

async function search() {
  const current = ++searchSequence;
  const query = input?.value.trim() ?? '';
  if (!query) {
    showResults([]);
    if (status) status.textContent = '輸入關鍵字，找到你想理解的概念。';
    return;
  }
  if (!navigator.onLine) {
    const urls = await cachedArticleUrls();
    if (current !== searchSequence) return;
    const matches = catalog.filter((article) => urls.includes(article.url) &&
      [article.title, article.description, ...article.tags].join(' ').toLowerCase().includes(query.toLowerCase()));
    showResults(matches.map((article) => ({ url: article.url, title: article.title, excerpt: article.description })));
    if (status) status.textContent = '目前離線：僅比對已快取文章的標題與摘要。全文搜尋需要網路。';
    return;
  }
  if (status) status.textContent = '正在搜尋…';
  try {
    let items: { url: string; title: string; excerpt: string }[];
    let count: number;
    if (import.meta.env.DEV) {
      devIndex ??= fetch('/search-index.json').then((response) => {
        if (!response.ok) throw new Error('Search index unavailable');
        return response.json() as Promise<DevSearchArticle[]>;
      });
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const matches = (await devIndex).filter((article) => words.every((word) => article.text.toLowerCase().includes(word)));
      count = matches.length;
      items = matches.slice(0, 8).map((article) => ({ url: article.url, title: article.title, excerpt: article.description }));
    } else {
      const path = '/pagefind/pagefind.js';
      pagefind ??= import(/* @vite-ignore */ path) as Promise<PagefindModule>;
      const found = await (await pagefind).search(query);
      count = found.results.length;
      const data = await Promise.all(found.results.slice(0, 8).map((result) => result.data()));
      items = data.map((item) => ({ url: item.url, title: item.meta.title ?? 'C# 文章', excerpt: item.plain_excerpt }));
    }
    if (current !== searchSequence) return;
    showResults(items);
    if (status) status.textContent = count ? '找到 ' + count + ' 篇文章' + (count > 8 ? '，先顯示前 8 篇。' : '。') : '沒有找到相關文章，試試較短的概念名稱或英文關鍵字。';
  } catch {
    if (current !== searchSequence) return;
    pagefind = undefined;
    devIndex = undefined;
    showResults([]);
    if (status) status.textContent = '搜尋暫時無法載入。請確認連線，或從 C# 主題頁瀏覽文章。';
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-search-open]').forEach((button) => button.addEventListener('click', () => {
  dialog?.showModal();
  input?.focus();
  void search();
}));
document.querySelector('[data-search-close]')?.addEventListener('click', () => dialog?.close());
dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }
});
dialog?.addEventListener('close', () => { searchSequence++; clearTimeout(searchTimer); });
input?.addEventListener('input', () => {
  searchSequence++;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { void search(); }, 200);
});
input?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const first = results?.querySelector<HTMLAnchorElement>('a');
    if (first) { event.preventDefault(); window.location.assign(first.href); }
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (!dialog?.open) dialog?.showModal();
    input?.focus();
    void search();
  }
});

const tocLinks = [...document.querySelectorAll<HTMLAnchorElement>('.article-toc a[href^="#"]')];
if ('IntersectionObserver' in window && tocLinks.length) {
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.find((entry) => entry.isIntersecting);
    if (!visible) return;
    tocLinks.forEach((link) => {
      if (decodeURIComponent(link.hash.slice(1)) === visible.target.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });
  tocLinks.forEach((link) => {
    const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (target) observer.observe(target);
  });
}

void initializePwa(catalog, notify);
