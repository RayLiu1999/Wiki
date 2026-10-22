import { parse } from 'yaml';

// 技術專題的章節，依序出現；「雲端排查」只屬於問題會在部署環境浮現的主題（見 CONTENT_GUIDE.md）。
export const requiredSections = ['這是什麼', '運作原理', '常見錯誤與正確寫法', '使用邊界'];
export const cloudSection = '雲端排查';
export const cloudTopics = new Set([
  'data-access', 'redis', 'rabbitmq', 'containers-networking', 'kubernetes', 'gke', 'eks', 'dotnet', 'engineering',
]);
// 「這是什麼」是每篇的入口，不能省略。
const unomittable = new Set(['這是什麼']);

// 先備知識只列「沒讀過就看不懂本篇」的文章。
export const maximumPrerequisites = 2;

// 標題寫成「技術：讀者想解決的問題」，不使用誇張或堆砌的字眼。
export const forbiddenTitleWords = ['實戰', '生產級', '致命', '三劍客', '終極'];

// 正文字數標準（不含空白與程式碼區塊）：下限確保內容完整，上限避免灌水。
export const minimumBodyCharacters = 400;
export const maximumBodyCharacters = 6000;

// 技術專題正文不得出現的內部識別字：讀者不會 clone 本倉庫，也不會執行 pnpm 腳本。
export const forbiddenPatterns = [
  { pattern: /\bpnpm\b/, message: '正文不得出現 pnpm 指令；本地開發說明請寫入 CONTRIBUTING.md' },
  { pattern: /\bLab[A-Z][A-Za-z]*/, message: '正文不得出現 Lab* 內部測試類別；請改用標準 API' },
  { pattern: /\blab:[a-z-]+/, message: '正文不得出現 lab: 內部腳本指令' },
  { pattern: /devwiki-labs/, message: '正文不得出現內部實驗專案名稱' },
];

export function splitFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('缺少 frontmatter');
  return { frontmatter: parse(match[1]) ?? {}, body: match[2] };
}

function stripCodeBlocks(body) {
  return body.replace(/^(~~~|```)[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, '');
}

export function bodyCharacterCount(body) {
  return stripCodeBlocks(body).replace(/\s/g, '').length;
}

// 依 H2 切出各章節的原始內容（含程式碼區塊），程式碼區塊內的「## 」不算標題。
function sectionsOf(body) {
  const sections = [];
  let fence = null;
  for (const line of body.split(/\r?\n/)) {
    const marker = line.match(/^(~~~|```)/)?.[1];
    if (marker && (!fence || fence === marker)) fence = fence ? null : marker;
    const heading = !fence && !marker && line.match(/^##\s+(.+?)\s*$/);
    if (heading) sections.push({ heading: heading[1], content: '' });
    else if (sections.length) sections[sections.length - 1].content += line + '\n';
  }
  return sections;
}

// 回傳違規訊息陣列；空陣列代表通過。
export function checkArticle({ frontmatter, body }) {
  const issues = [];

  for (const { pattern, message } of forbiddenPatterns) {
    if (pattern.test(body)) issues.push(message);
  }

  const title = String(frontmatter.title ?? '');
  if (!title.includes('：')) issues.push('標題須寫成「技術：讀者想解決的問題」，缺少全形冒號');
  for (const word of forbiddenTitleWords) {
    if (title.includes(word)) issues.push('標題不得使用「' + word + '」');
  }

  if ((frontmatter.prerequisites ?? []).length > maximumPrerequisites) {
    issues.push('先備知識最多 ' + maximumPrerequisites + ' 篇；「讀了會更好」的文章請改放 relatedArticles');
  }

  const expected = [...requiredSections];
  if (cloudTopics.has(frontmatter.topic)) expected.push(cloudSection);

  const omitted = new Set();
  for (const entry of frontmatter.omitSections ?? []) {
    if (!expected.includes(entry.section) || unomittable.has(entry.section)) {
      issues.push('omitSections 不能省略「' + entry.section + '」');
    } else if (!String(entry.reason ?? '').trim()) {
      issues.push('omitSections 的「' + entry.section + '」缺少理由');
    } else {
      omitted.add(entry.section);
    }
  }

  const sections = sectionsOf(body);
  const actual = sections.map((section) => section.heading);
  const wanted = expected.filter((section) => !omitted.has(section));
  if (!cloudTopics.has(frontmatter.topic) && actual.includes(cloudSection)) {
    issues.push('本主題不屬於雲端排查範圍，不應有「' + cloudSection + '」章節');
  } else if (actual.join('|') !== wanted.join('|')) {
    issues.push('章節須依序為「' + wanted.join('／') + '」，目前是「' + actual.join('／') + '」');
  }

  const mechanism = sections.find((section) => section.heading === '運作原理');
  if (mechanism && !/^(~~~|```)mermaid\b/m.test(mechanism.content)) {
    issues.push('「運作原理」至少需要一張 Mermaid 圖');
  }

  const count = bodyCharacterCount(body);
  if (count < minimumBodyCharacters) {
    issues.push('正文僅 ' + count + ' 字，低於下限 ' + minimumBodyCharacters + ' 字');
  } else if (count > maximumBodyCharacters) {
    issues.push('正文共 ' + count + ' 字，超過上限 ' + maximumBodyCharacters + ' 字');
  }
  return issues;
}
