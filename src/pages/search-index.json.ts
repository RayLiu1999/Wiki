import type { APIRoute } from 'astro';
import { getArticles, articleUrl } from '../lib/catalog';
export const GET: APIRoute = async () => new Response(JSON.stringify(
  (await getArticles()).map((article) => ({
    id: article.data.articleId,
    url: articleUrl(article),
    title: article.data.title,
    description: article.data.description,
    text: [article.data.title, article.data.description, ...article.data.tags, article.body ?? ''].join(' '),
  })),
), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
