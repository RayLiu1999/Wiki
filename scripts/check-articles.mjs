import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { checkArticle, splitFrontmatter } from './lib/article-rules.mjs';

const root = 'src/content/docs';
// 尚未重寫的舊文章：暫時豁免新規則。每個主題重寫完成後，從清單移除。
const legacy = new Set(JSON.parse(await readFile('scripts/legacy-articles.json', 'utf8')));

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(file) : entry.name.endsWith('.md') ? [file] : [];
  }))).flat();
}

const files = (await markdownFiles(root)).map((file) => path.relative(root, file).split(path.sep).join('/')).sort();
const problems = [];
let checked = 0;
for (const file of files) {
  if (legacy.has(file)) continue;
  checked += 1;
  const { frontmatter, body } = splitFrontmatter(await readFile(path.join(root, file), 'utf8'));
  for (const issue of checkArticle({ frontmatter, body })) problems.push(file + '：' + issue);
}
for (const file of legacy) {
  if (!files.includes(file)) problems.push('legacy-articles.json 含已不存在的文章：' + file + '（請自清單移除）');
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('文章規則檢查通過：' + checked + ' 篇適用新規則，' + legacy.size + ' 篇舊文章暫時豁免。');
