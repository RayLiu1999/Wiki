import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(file) : entry.name.endsWith('.html') ? [file] : [];
  }))).flat();
}
const files = await htmlFiles('dist');
const documents = new Map();
for (const file of files) documents.set(file, cheerio.load(await readFile(file, 'utf8')));
const issues = [];
for (const [file, $] of documents) {
  const pagePath = '/' + path.relative('dist', file).replace(/index\.html$/, '');
  if ($('h1').length !== 1) issues.push(file + ' 必須包含一個主要標題');
  if ($('html').attr('lang') !== 'zh-TW') issues.push(file + ' 的語言設定錯誤');
  const ids = new Set();
  $('[id]').each((_, element) => {
    const id = $(element).attr('id');
    if (ids.has(id)) issues.push(file + ' 有重複 ID：' + id);
    ids.add(id);
  });
  for (const element of $('a[href], link[href], script[src], img[src]').toArray()) {
    const value = $(element).attr('href') ?? $(element).attr('src');
    if (!value || /^(https?:|mailto:|data:|tel:)/.test(value)) continue;
    const url = new URL(value, 'https://devwiki.invalid' + pagePath);
    if (url.origin !== 'https://devwiki.invalid') continue;
    let target = path.join('dist', decodeURIComponent(url.pathname));
    try {
      if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
      await stat(target);
      if (url.hash && documents.has(target)) {
        const id = decodeURIComponent(url.hash.slice(1));
        const target$ = documents.get(target);
        if (!target$('[id]').toArray().some((node) => target$(node).attr('id') === id)) issues.push(file + ' 無效頁內連結：' + value);
      }
    } catch { issues.push(file + ' 無效內部連結：' + value); }
  }
}
assert.equal(issues.length, 0, issues.join('\n'));
const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
assert.equal(manifest.start_url, '/');
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
for (const icon of manifest.icons) await stat(path.join('dist', icon.src));
await stat('dist/pagefind/pagefind.js');
await stat('dist/sw.js');
console.log('已驗證 ' + files.length + ' 個頁面、內部連結、頁內錨點、搜尋索引與 PWA 產物。');
