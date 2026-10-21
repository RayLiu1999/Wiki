import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://devwiki.invalid',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'DevWiki',
      disable404Route: true,
      description: '用電商案例串起 .NET 後端、Kubernetes、GKE 與維運。',
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
      sidebar: [
        { label: 'C#', items: [{ autogenerate: { directory: 'languages/csharp' } }] },
        { label: 'ASP.NET Core', items: [{ autogenerate: { directory: 'frameworks/aspnet-core' } }] },
        { label: '應用安全', items: [{ autogenerate: { directory: 'security' } }] },
        { label: '架構設計', items: [{ autogenerate: { directory: 'architecture' } }] },
        { label: '資料存取', items: [{ autogenerate: { directory: 'data-access' } }] },
        { label: 'Redis', items: [{ autogenerate: { directory: 'infrastructure/redis' } }] },
        { label: 'RabbitMQ', items: [{ autogenerate: { directory: 'infrastructure/rabbitmq' } }] },
        { label: '容器與網路', items: [{ autogenerate: { directory: 'infrastructure/containers-networking' } }] },
        { label: 'Kubernetes', items: [{ autogenerate: { directory: 'platforms/kubernetes' } }] },
        { label: 'GCP 與 GKE', items: [{ autogenerate: { directory: 'platforms/gke' } }] },
        { label: '.NET 執行環境', items: [{ autogenerate: { directory: 'platforms/dotnet' } }] },
        { label: '工程實務', items: [{ autogenerate: { directory: 'engineering' } }] },
      ],
    }),
  ],
});
