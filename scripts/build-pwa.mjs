import { readdir, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { injectManifest } from 'workbox-build';
import { load } from 'cheerio';

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? filesIn(path.join(directory, entry.name))
    : [path.join(directory, entry.name)]));
  return files.flat().sort();
}
const hash = createHash('sha256');
const articlePaths = [];
for (const file of await filesIn('dist')) {
  const contents = await readFile(file);
  hash.update(file);
  hash.update(contents);
  if (file.endsWith('.html') && load(contents.toString())('.article-heading[data-article-id]').length) {
    articlePaths.push('/' + path.relative('dist', file).replaceAll(path.sep, '/').replace(/index\.html$/, ''));
  }
}
const version = hash.digest('hex').slice(0, 12);
await mkdir('.astro/pwa', { recursive: true });
await build({
  entryPoints: ['src/pwa/sw.mjs'],
  outfile: '.astro/pwa/sw.js',
  bundle: true,
  format: 'iife',
  target: 'es2020',
  define: { __WIKI_BUILD_ID__: JSON.stringify(version), __WIKI_ARTICLE_PATHS__: JSON.stringify(articlePaths), 'process.env.NODE_ENV': JSON.stringify('production') },
});
const result = await injectManifest({
  swSrc: '.astro/pwa/sw.js',
  swDest: 'dist/sw.js',
  globDirectory: 'dist',
  globPatterns: [
    '_astro/**/*.{js,css,woff,woff2}',
    'icons/*.png',
    'favicon.svg',
    'manifest.webmanifest',
    'index.html',
    'offline/index.html',
    'languages/csharp/index.html',
    'frameworks/aspnet-core/index.html',
    'architecture/index.html',
    'data-access/index.html',
    'platforms/dotnet/index.html',
    'engineering/index.html',
    'topics/index.html',
    'work-notes/index.html',
    'learning-paths/**/index.html',
    'saved/index.html',
  ],
  maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
});
if (result.warnings.length) throw new Error(result.warnings.join('\n'));
console.log('PWA ' + version + '：預快取 ' + result.count + ' 個基本資源，' + (result.size / 1024).toFixed(1) + ' KB。');
