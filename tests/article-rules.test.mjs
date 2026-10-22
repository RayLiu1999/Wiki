import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyCharacterCount, checkArticle, cloudSection, requiredSections, splitFrontmatter } from '../scripts/lib/article-rules.mjs';

const filler = '這是一段白話說明重點的文字。'.repeat(12);
const diagram = '\n\n~~~mermaid\nflowchart LR\n  A --> B\n~~~';
const sectionText = (section) => '## ' + section + '\n\n' + filler + (section === '運作原理' ? diagram : '');
const bodyOf = (sections) => sections.map(sectionText).join('\n\n');
const conceptBody = bodyOf(requiredSections);
const cloudBody = bodyOf([...requiredSections, cloudSection]);
const concept = { title: 'DDD：怎麼讓規則留在模型裡', topic: 'architecture', prerequisites: [] };
const platform = { title: 'Redis：快取為什麼會讀到舊資料', topic: 'redis', prerequisites: [] };

test('概念主題有四個章節即通過', () => {
  assert.deepEqual(checkArticle({ frontmatter: concept, body: conceptBody }), []);
});

test('雲端排查主題必須有「雲端排查」章節', () => {
  assert.deepEqual(checkArticle({ frontmatter: platform, body: cloudBody }), []);
  assert.match(checkArticle({ frontmatter: platform, body: conceptBody }).join('\n'), /雲端排查/);
});

test('非雲端排查主題不能有「雲端排查」章節', () => {
  const issues = checkArticle({ frontmatter: concept, body: cloudBody });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /不屬於雲端排查範圍/);
});

test('章節順序錯誤或多出章節會被回報', () => {
  const swapped = bodyOf(['運作原理', '這是什麼', '常見錯誤與正確寫法', '使用邊界']);
  assert.match(checkArticle({ frontmatter: concept, body: swapped }).join('\n'), /章節須依序/);
  const extra = conceptBody + '\n\n## 其他\n\n' + filler;
  assert.match(checkArticle({ frontmatter: concept, body: extra }).join('\n'), /章節須依序/);
});

test('程式碼區塊裡的 ## 不算章節標題', () => {
  const body = conceptBody.replace('## 使用邊界', '~~~markdown\n## 不是標題\n~~~\n\n## 使用邊界');
  assert.deepEqual(checkArticle({ frontmatter: concept, body }), []);
});

test('「運作原理」沒有 Mermaid 圖會被回報', () => {
  const body = conceptBody.replace(diagram, '');
  assert.match(checkArticle({ frontmatter: concept, body }).join('\n'), /Mermaid/);
});

test('omitSections 附理由即可省略章節，但不能省略「這是什麼」', () => {
  const body = bodyOf(['這是什麼', '常見錯誤與正確寫法', '使用邊界']);
  const frontmatter = { ...concept, omitSections: [{ section: '運作原理', reason: '本篇為參考速查' }] };
  assert.deepEqual(checkArticle({ frontmatter, body }), []);
  const blank = { ...concept, omitSections: [{ section: '運作原理', reason: '  ' }] };
  assert.match(checkArticle({ frontmatter: blank, body }).join('\n'), /缺少理由/);
  const entry = { ...concept, omitSections: [{ section: '這是什麼', reason: '不需要' }] };
  assert.match(checkArticle({ frontmatter: entry, body: conceptBody }).join('\n'), /不能省略/);
});

test('標題缺少全形冒號或使用誇張字眼會被回報', () => {
  assert.match(checkArticle({ frontmatter: { ...concept, title: 'DDD 模型' }, body: conceptBody }).join('\n'), /全形冒號/);
  assert.match(checkArticle({ frontmatter: { ...concept, title: 'DDD：致命反模式實戰' }, body: conceptBody }).join('\n'), /致命[\s\S]*實戰|實戰[\s\S]*致命/);
});

test('先備知識超過兩篇會被回報', () => {
  const frontmatter = { ...concept, prerequisites: ['a', 'b', 'c'] };
  assert.match(checkArticle({ frontmatter, body: conceptBody }).join('\n'), /先備知識最多/);
});

test('字數超過上限或不足會被回報，程式碼區塊不計入字數', () => {
  const overlong = conceptBody + '\n\n' + '這是一段多餘的灌水文字。'.repeat(500);
  assert.match(checkArticle({ frontmatter: concept, body: overlong }).join('\n'), /超過上限/);
  const code = '~~~csharp\n' + 'var value = 1;\n'.repeat(500) + '~~~';
  const short = requiredSections.map((section) => '## ' + section).join('\n\n') + '\n\n' + code;
  assert.ok(bodyCharacterCount(short) < 200);
  assert.match(checkArticle({ frontmatter: concept, body: short }).join('\n'), /低於下限/);
});

test('正文出現 pnpm、Lab 類別或 lab: 指令會被拒絕，程式碼區塊內同樣檢查', () => {
  for (const noise of ['請執行 pnpm lab:up', 'LabDiagnostics.CacheMisses.Add(1);', 'run lab:redis']) {
    const issues = checkArticle({ frontmatter: concept, body: conceptBody + '\n\n~~~text\n' + noise + '\n~~~' });
    assert.ok(issues.length > 0, noise);
  }
});

test('splitFrontmatter 能解析 YAML 並保留正文', () => {
  const { frontmatter, body } = splitFrontmatter('---\ntitle: 標題\nomitSections:\n  - section: 運作原理\n    reason: 無\n---\n\n## 內文\n');
  assert.equal(frontmatter.title, '標題');
  assert.deepEqual(frontmatter.omitSections, [{ section: '運作原理', reason: '無' }]);
  assert.match(body, /## 內文/);
});

test('沒有 frontmatter 時丟出明確錯誤', () => {
  assert.throws(() => splitFrontmatter('## 沒有 frontmatter'), /缺少 frontmatter/);
});
