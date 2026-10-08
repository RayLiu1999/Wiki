import { getCollection, type CollectionEntry } from 'astro:content';
import { topicFor, type TopicId } from './taxonomy';
import { learningPaths } from './learning-paths';
import { knowledgeMaps } from './knowledge-maps';
import workNotes from '../data/work-notes.json';
export { categories, categoryFor, topics, topicFor, topicUrl } from './taxonomy';

export type Article = CollectionEntry<'docs'>;
export type HandbookEntry = CollectionEntry<'handbook'>;
export const handbookGroups = {
  start: { title: '開始閱讀', path: '/start/' },
  ecommerce: { title: '電商專題', path: '/projects/ecommerce/' },
  practice: { title: '實作指南', path: '/practice/ecommerce/' },
};
export const handbookUrl = (entry: HandbookEntry) => {
  const slug = entry.id.split('/').slice(1).join('/');
  return handbookGroups[entry.data.group].path + (slug === 'overview' ? '' : slug + '/');
};
export async function getHandbook(group?: HandbookEntry['data']['group']) {
  const entries = (await getCollection('handbook', (entry) => !entry.data.draft)).sort((a, b) => a.data.order - b.data.order);
  const ids = new Set(entries.map((entry) => entry.id));
  for (const entry of entries) {
    if (!entry.id.startsWith(entry.data.group + '/')) throw new Error(entry.id + ' 的內容類型與目錄不一致');
    for (const id of entry.data.prerequisites) {
      if (!ids.has(id)) throw new Error(entry.id + ' 引用不存在的指南：' + id);
    }
  }
  return group ? entries.filter((entry) => entry.data.group === group) : entries;
}
export const articleUrl = (article: Article) => '/' + article.id.replace(/\/$/, '') + '/';
export const levelLabel = (level: string) => level === 'beginner' ? '入門' : '進階';
export async function getArticles(topic?: TopicId) {
  const articles = (await getCollection('docs', (entry) => !entry.data.draft))
    .sort((a, b) => a.data.order - b.data.order);
  const ids = new Set<string>();
  for (const article of articles) {
    if (!article.id.startsWith(topicFor(article.data.topic)!.path + '/')) {
      throw new Error(article.id + ' 的網址與主題不一致');
    }
    if (ids.has(article.data.articleId)) throw new Error('重複文章 ID：' + article.data.articleId);
    ids.add(article.data.articleId);
  }
  for (const article of articles) {
    for (const id of [...article.data.prerequisites, ...article.data.relatedArticles]) {
      if (!ids.has(id)) throw new Error(article.id + ' 引用不存在的文章：' + id);
    }
  }
  for (const path of learningPaths) {
    for (const id of path.stages.flatMap((stage) => stage.articleIds)) {
      if (!ids.has(id)) throw new Error(path.id + ' 引用不存在的文章：' + id);
    }
  }
  for (const map of knowledgeMaps) {
    for (const domain of map.domains) {
      for (const id of domain.articleIds) {
        if (!ids.has(id)) throw new Error(domain.id + ' 引用不存在的文章：' + id);
      }
    }
  }
  for (const entry of await getHandbook()) {
    for (const id of entry.data.linkedArticles) {
      if (!ids.has(id)) throw new Error(entry.id + ' 引用不存在的文章：' + id);
    }
  }
  const byId = new Map(articles.map((article) => [article.data.articleId, article]));
  for (const group of workNotes.groups) {
    for (const item of group.items) {
      if (!item.articleIds.length) throw new Error(item.title + ' 尚未對應文章');
      for (const id of item.articleIds) {
        if (!ids.has(id)) throw new Error(item.title + ' 引用不存在的文章：' + id);
        if (!item.dates.every((date) => byId.get(id)!.data.noteDates.includes(date))) {
          throw new Error(id + ' 的筆記日期與概念對照不一致');
        }
      }
    }
  }
  return topic ? articles.filter((article) => article.data.topic === topic) : articles;
}

export async function getCatalog() {
  return (await getArticles()).map((article) => ({
    id: article.data.articleId,
    url: articleUrl(article),
    title: article.data.title,
    description: article.data.description ?? '',
    category: article.data.category,
    level: levelLabel(article.data.difficulty),
    tags: article.data.tags,
    topic: article.data.topic,
    kind: 'article',
  }));
}

export async function getSearchCatalog() {
  const articles = await getCatalog();
  const guides = (await getHandbook()).map((entry) => ({
    id: 'handbook-' + entry.id.replaceAll('/', '-'),
    url: handbookUrl(entry),
    title: entry.data.title,
    description: entry.data.description,
    category: entry.data.group,
    level: handbookGroups[entry.data.group].title,
    tags: [handbookGroups[entry.data.group].title],
    topic: entry.data.group,
    kind: 'guide',
  }));
  return [...articles, ...guides];
}
