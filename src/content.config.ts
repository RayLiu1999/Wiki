import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        articleId: z.string().regex(/^csharp-[a-z0-9-]+$/),
        topic: z.literal('csharp'),
        category: z.enum(['basics', 'types', 'oop', 'data', 'practice']),
        order: z.number().int().positive(),
        tags: z.array(z.string()).min(1),
        difficulty: z.enum(['beginner', 'intermediate']),
        prerequisites: z.array(z.string()).default([]),
        relatedArticles: z.array(z.string()).default([]),
        applicableVersions: z.string().min(1),
        verifiedWith: z.string().min(1),
        lastReviewed: z.coerce.date(),
        takeaway: z.string().min(1),
        sources: z.array(z.object({ title: z.string(), url: z.url() })).min(1),
      }),
    }),
  }),
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
