import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyCharacterCount, checkArticle, requiredSections, splitFrontmatter } from '../scripts/lib/article-rules.mjs';

const filler = '這是一段精煉重點的說明文字。'.repeat(6); // 每個章節約 84 字，6 個章節共約 500 字，符合 400~1200 字範圍
const fullBody = requiredSections.map((section) => '## ' + section.id + '\n\n' + filler).join('\n\n');

test('完整章節且字數符合 1000 字以內標準的文章通過', () => {
  assert.deepEqual(checkArticle({ frontmatter: {}, body: fullBody }), []);
});

test('字數超過上限會回報需精煉', () => {
  const overlong = fullBody + '\n\n' + '這是一段多餘的灌水文字。'.repeat(100);
  const issues = checkArticle({ frontmatter: {}, body: overlong });
  assert.ok(issues.some((issue) => issue.includes('超過上限')));
});

test('缺少必要章節時回報章節名稱', () => {
  const body = fullBody.replace('## 反模式', '## 其他');
  const issues = checkArticle({ frontmatter: {}, body });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /反模式/);
});

test('omitSections 附理由即可省略章節', () => {
  const body = fullBody.replace('## 反模式', '## 其他');
  const frontmatter = { omitSections: [{ section: '反模式', reason: '本篇為參考速查，無對應反模式' }] };
  assert.deepEqual(checkArticle({ frontmatter, body }), []);
});

test('omitSections 的未知章節或空白理由會被拒絕', () => {
  const unknown = checkArticle({ frontmatter: { omitSections: [{ section: '不存在', reason: 'x' }] }, body: fullBody });
  assert.match(unknown.join('\n'), /未知章節/);
  const blank = checkArticle({ frontmatter: { omitSections: [{ section: '反模式', reason: '  ' }] }, body: fullBody.replace('## 反模式', '## 其他') });
  assert.match(blank.join('\n'), /缺少理由/);
});

test('字數不足會回報，程式碼區塊不計入字數', () => {
  const code = '~~~csharp\n' + 'var value = 1;\n'.repeat(500) + '~~~';
  const body = requiredSections.map((section) => '## ' + section.id).join('\n\n') + '\n\n' + code;
  assert.ok(bodyCharacterCount(body) < 200);
  assert.match(checkArticle({ frontmatter: {}, body }).join('\n'), /低於下限/);
});

test('正文出現 pnpm、Lab 類別或 lab: 指令會被拒絕，程式碼區塊內同樣檢查', () => {
  for (const noise of ['請執行 pnpm lab:up', 'LabDiagnostics.CacheMisses.Add(1);', 'run lab:redis']) {
    const issues = checkArticle({ frontmatter: {}, body: fullBody + '\n\n~~~text\n' + noise + '\n~~~' });
    assert.ok(issues.length > 0, noise);
  }
});

test('splitFrontmatter 能解析 YAML 並保留正文', () => {
  const { frontmatter, body } = splitFrontmatter('---\ntitle: 標題\nomitSections:\n  - section: 反模式\n    reason: 無\n---\n\n## 內文\n');
  assert.equal(frontmatter.title, '標題');
  assert.deepEqual(frontmatter.omitSections, [{ section: '反模式', reason: '無' }]);
  assert.match(body, /## 內文/);
});

test('沒有 frontmatter 時丟出明確錯誤', () => {
  assert.throws(() => splitFrontmatter('## 沒有 frontmatter'), /缺少 frontmatter/);
});
