import { parse } from 'yaml';

// 文章模板的必要章節。「延伸閱讀」由 frontmatter 的 sources 渲染為「參考來源」，不在正文重複。
export const requiredSections = [
  { id: '問題情境', keyword: '問題情境' },
  { id: '運作機制', keyword: '運作機制' },
  { id: '反模式', keyword: '反模式' },
  { id: '邊界與故障情境', keyword: '邊界' },
  { id: '觀測與排查', keyword: '觀測' },
  { id: '決策清單', keyword: '決策' },
];

// 正文字數標準（不含空白與程式碼區塊）：講求重點，以 1,000 字以內為目標。
export const minimumBodyCharacters = 400;
export const maximumBodyCharacters = 1200;

// 技術文章正文不得出現的內部識別字：讀者不會 clone 本倉庫，也不會執行 pnpm 腳本。
export const forbiddenPatterns = [
  { pattern: /\bpnpm\b/, message: '正文不得出現 pnpm 指令；本地驗證請寫入 CONTRIBUTING.md' },
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

// 回傳違規訊息陣列；空陣列代表通過。
export function checkArticle({ frontmatter, body }) {
  const issues = [];
  const prose = stripCodeBlocks(body);

  for (const { pattern, message } of forbiddenPatterns) {
    if (pattern.test(body)) issues.push(message);
  }

  const omitted = new Map();
  for (const entry of frontmatter.omitSections ?? []) {
    if (!requiredSections.some((section) => section.id === entry.section)) {
      issues.push('omitSections 含未知章節：' + entry.section);
    } else if (!String(entry.reason ?? '').trim()) {
      issues.push('omitSections 的「' + entry.section + '」缺少理由');
    } else {
      omitted.set(entry.section, entry.reason);
    }
  }

  const headings = [...prose.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]);
  for (const section of requiredSections) {
    if (omitted.has(section.id)) continue;
    if (!headings.some((heading) => heading.includes(section.keyword))) {
      issues.push('缺少必要章節「' + section.id + '」（或於 omitSections 說明省略理由）');
    }
  }

  const count = bodyCharacterCount(body);
  if (count < minimumBodyCharacters) {
    issues.push('正文僅 ' + count + ' 字，低於下限 ' + minimumBodyCharacters + ' 字');
  } else if (count > maximumBodyCharacters) {
    issues.push('正文共 ' + count + ' 字，超過上限 ' + maximumBodyCharacters + ' 字（目標為 1000 字以內精煉重點）');
  }
  return issues;
}
