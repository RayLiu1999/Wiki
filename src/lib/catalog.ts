import { getCollection, type CollectionEntry } from 'astro:content';
import { topicFor, type TopicId } from './taxonomy';
import { learningPaths } from './learning-paths';
import workNotes from '../data/work-notes.json';
export { categories, categoryFor, topics, topicFor, topicUrl } from './taxonomy';

export type Article = CollectionEntry<'docs'>;
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
  }));
}
