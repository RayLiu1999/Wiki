import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'DevWiki',
      disable404Route: true,
      description: '以繁體中文串起軟體知識，從 C# 開始。',
      defaultLocale: 'root',
      locales: { root: { label: '繁體中文', lang: 'zh-TW' } },
      customCss: ['./src/styles/site.css'],
      components: {
        Header: './src/components/Header.astro',
        ThemeProvider: './src/components/ThemeProvider.astro',
        PageFrame: './src/components/overrides/PageFrame.astro',
        TwoColumnContent: './src/components/overrides/TwoColumnContent.astro',
        ContentPanel: './src/components/overrides/ContentPanel.astro',
        PageTitle: './src/components/overrides/PageTitle.astro',
        PageSidebar: './src/components/overrides/PageSidebar.astro',
        Footer: './src/components/overrides/ArticleFooter.astro',
      },
      expressiveCode: { themes: ['github-light', 'github-dark'] },
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 2 },
      head: [
        { tag: 'link', attrs: { rel: 'manifest', href: '/manifest.webmanifest' } },
        { tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#7357ce' } },
      ],
      sidebar: [{ label: 'C# 核心知識', items: [{ autogenerate: { directory: 'languages/csharp' } }] }],
    }),
  ],
});
