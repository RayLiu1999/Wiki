import type { APIRoute } from 'astro';
import { getArticles, getHandbook, getSearchCatalog, handbookUrl } from '../lib/catalog';
export const GET: APIRoute = async () => {
  const articles = await getArticles();
  const guides = await getHandbook();
  const bodies = new Map([
    ...articles.map((entry) => [entry.data.articleId, entry.body ?? ''] as const),
    ...guides.map((entry) => ['handbook-' + entry.id.replaceAll('/', '-'), entry.body ?? ''] as const),
  ]);
  if (new Set(guides.map(handbookUrl)).size !== guides.length) throw new Error('重複指南網址');
  return new Response(JSON.stringify((await getSearchCatalog()).map((entry) => ({ ...entry, text: [entry.title, entry.description, ...entry.tags, bodies.get(entry.id)].join(' ') }))), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
