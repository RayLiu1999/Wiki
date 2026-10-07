import assert from 'node:assert/strict';

const baseUrl = new URL(process.env.WIKI_URL ?? 'http://127.0.0.1:8080');
assert.ok(['http:', 'https:'].includes(baseUrl.protocol), 'WIKI_URL 必須是 HTTP 或 HTTPS 網址');

async function resource(pathname, expectedStatus = 200) {
  const response = await fetch(new URL(pathname, baseUrl), { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, expectedStatus, pathname + ' 的 HTTP 狀態不正確');
  return response;
}

function revalidated(response, pathname) {
  assert.equal(response.headers.get('cache-control'), 'no-cache', pathname + ' 必須重新驗證快取');
}

const catalogResponse = await resource('/search-index.json');
revalidated(catalogResponse, '/search-index.json');
const catalog = await catalogResponse.json();
assert.ok(Array.isArray(catalog) && catalog.length > 0, '搜尋目錄必須包含已發布文章');
const pages = new Set([
  '/', '/topics/', '/work-notes/', '/learning-paths/',
  '/learning-paths/csharp-beginner/', '/learning-paths/dotnet-backend-practice/',
  '/languages/csharp/', '/frameworks/aspnet-core/', '/architecture/',
  '/data-access/', '/platforms/dotnet/', '/engineering/', '/saved/', '/offline/',
  ...catalog.map((article) => article.url),
]);
const pageBodies = new Map(await Promise.all([...pages].map(async (pathname) => {
  const response = await resource(pathname);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/, pathname + ' 必須提供 HTML');
  revalidated(response, pathname);
  const body = await response.text();
  assert.match(body, /<html[^>]*lang="zh-TW"/, pathname + ' 的語言設定不正確');
  assert.match(body, /<h1\b/, pathname + ' 缺少頁面標題');
  if (catalog.some((article) => article.url === pathname)) {
    assert.ok(body.includes('article-heading'), pathname + ' 必須提供文章頁面');
  }
  return [pathname, body];
})));

const worker = await resource('/sw.js');
revalidated(worker, '/sw.js');
assert.match(worker.headers.get('content-type') ?? '', /javascript/);
assert.ok((await worker.text()).length > 100, 'Service Worker 內容不可為空');
const manifestResponse = await resource('/manifest.webmanifest');
revalidated(manifestResponse, '/manifest.webmanifest');
const manifest = await manifestResponse.json();
assert.equal(manifest.start_url, '/');
assert.equal(manifest.display, 'standalone');
const pagefind = await resource('/pagefind/pagefind.js');
assert.match(pagefind.headers.get('content-type') ?? '', /javascript/);

for (const icon of manifest.icons) {
  const response = await resource(icon.src);
  assert.match(response.headers.get('content-type') ?? '', /image\/png/);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], icon.src + ' 必須是 PNG 圖示');
}
const assets = new Set([...pageBodies.get('/').matchAll(/(?:href|src)="(\/_astro\/[^"\s]+)"/g)].map((match) => match[1]));
assert.ok(assets.size > 0, '首頁必須引用 Astro 建置資源');
for (const pathname of assets) {
  const response = await resource(pathname);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable', pathname + ' 的資源快取設定不正確');
}

const redirect = await fetch(new URL('/data-access', baseUrl), { redirect: 'manual', signal: AbortSignal.timeout(10000) });
assert.equal(redirect.status, 301, '主題網址必須導向含尾斜線的目錄');
assert.equal(new URL(redirect.headers.get('location'), baseUrl).pathname, '/data-access/');
for (const pathname of ['/__container_check_missing__/', '/_astro/__container_check_missing__.js']) {
  const response = await resource(pathname, 404);
  revalidated(response, pathname);
  assert.ok((await response.text()).includes('可能換了位置'), pathname + ' 必須提供本站 404 頁面');
}

console.log('容器 HTTP 驗證通過：' + pages.size + ' 個頁面、' + catalog.length + ' 篇文章、搜尋與 PWA 資源、快取標頭、目錄轉址及 404。');
