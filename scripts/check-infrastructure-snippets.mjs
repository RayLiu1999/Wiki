import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const snippets = JSON.parse(await readFile(new URL('../examples/infrastructure/snippets.json', import.meta.url), 'utf8'));
for (const snippet of snippets) {
  const source = await readFile(new URL('../examples/infrastructure/' + snippet.source, import.meta.url), 'utf8');
  const start = '// wiki:start:' + snippet.marker + '\n';
  const end = '// wiki:end:' + snippet.marker;
  const section = source.split(start)[1]?.split(end)[0]?.trimEnd();
  assert.ok(section && source.includes(end), snippet.marker + ' 缺少來源標記');
  const lines = section.split('\n');
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length));
  const expected = lines.map((line) => line.slice(indent)).join('\n').trim();
  const article = await readFile(new URL('../src/content/docs/' + snippet.article, import.meta.url), 'utf8');
  const blocks = [...article.matchAll(/~~~csharp[^\n]*\n([\s\S]*?)\n~~~/g)];
  assert.equal(blocks[snippet.block]?.[1].trim(), expected, snippet.article + ' 的範例與可編譯來源不一致');
}
console.log(snippets.length + ' 個 Redis、RabbitMQ 與 Outbox／Inbox 文章片段與來源一致。');
