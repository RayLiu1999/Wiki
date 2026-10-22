import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { topicIds, topicFor, allCategories } from './lib/taxonomy';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        articleId: z.string().regex(/^[a-z][a-z0-9-]+$/),
        topic: z.enum(topicIds),
        category: z.enum(allCategories.map((category) => category.id)),
        order: z.number().int().positive(),
        tags: z.array(z.string()).min(1),
        articleType: z.enum(['deep-dive', 'troubleshooting', 'reference']).default('deep-dive'),
        difficulty: z.enum(['beginner', 'advanced']),
        prerequisites: z.array(z.string()).default([]),
        relatedArticles: z.array(z.string()).default([]),
        applicableVersions: z.string().min(1),
        lastReviewed: z.coerce.date(),
        takeaway: z.string().min(1),
        omitSections: z.array(z.object({ section: z.string().min(1), reason: z.string().min(1) })).default([]),
        sources: z.array(z.object({ title: z.string(), url: z.url() })).min(1),
      }).superRefine((data, context) => {
        if (!topicFor(data.topic)?.categories.some((category) => category.id === data.category)) {
          context.addIssue({ code: 'custom', path: ['category'], message: '分類必須屬於文章主題。' });
        }
      }),
    }),
  }),
  handbook: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/handbook' }),
    schema: z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      group: z.enum(['start', 'ecommerce']),
      order: z.number().int().nonnegative(),
      linkedArticles: z.array(z.string()).default([]),
      prerequisites: z.array(z.string()).default([]),
      sources: z.array(z.object({ title: z.string(), url: z.url() })).min(1),
      draft: z.boolean().default(false),
    }),
  }),
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
