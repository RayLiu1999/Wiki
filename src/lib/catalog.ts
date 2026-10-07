import { getCollection, type CollectionEntry } from 'astro:content';

export const categories = [
  { id: 'basics', name: '語法入門', description: '環境、變數、流程控制與方法', icon: 'code', step: '先讓程式跑起來' },
  { id: 'types', name: '型別與物件', description: 'class、值型別與空值處理', icon: 'box', step: '理解型別與物件' },
  { id: 'oop', name: '物件導向', description: '介面、多型與函式傳遞', icon: 'network', step: '讓行為可以重用' },
  { id: 'data', name: '資料處理', description: '泛型集合與 LINQ 查詢', icon: 'list', step: '把資料整理成結果' },
  { id: 'practice', name: '實務與非同步', description: '例外、資源管理、async 與取消作業', icon: 'layers', step: '處理真實世界的工作' },
] as const;

export type Article = CollectionEntry<'docs'>;
export const articleUrl = (article: Article) => '/' + article.id.replace(/\/$/, '') + '/';
export const levelLabel = (level: string) => level === 'beginner' ? '入門' : '進階';
export const categoryFor = (id: string) => categories.find((category) => category.id === id);

export async function getArticles() {
  const articles = (await getCollection('docs', (entry) => !entry.data.draft))
    .sort((a, b) => a.data.order - b.data.order);
  const ids = new Set<string>();
  for (const article of articles) {
    if (ids.has(article.data.articleId)) throw new Error('重複文章 ID：' + article.data.articleId);
    ids.add(article.data.articleId);
  }
  for (const article of articles) {
    for (const id of [...article.data.prerequisites, ...article.data.relatedArticles]) {
      if (!ids.has(id)) throw new Error(article.id + ' 引用不存在的文章：' + id);
    }
  }
  return articles;
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
  }));
}
