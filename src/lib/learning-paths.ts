export const learningPaths = [
  {
    id: 'csharp-beginner', title: 'C# 入門', description: '保留 15 篇核心文章，從第一個程式建立基本輪廓。', audience: '適合第一次接觸 C# 的讀者',
    stages: [
      { title: '先讓程式跑起來', description: '環境、變數、流程控制與方法。', articleIds: ['csharp-getting-started', 'csharp-variables', 'csharp-control-flow', 'csharp-methods'] },
      { title: '理解型別與物件', description: 'class、值型別與空值處理。', articleIds: ['csharp-classes', 'csharp-value-reference-types', 'csharp-nullable'] },
      { title: '讓行為可以重用', description: '介面、多型與函式傳遞。', articleIds: ['csharp-interfaces', 'csharp-delegates'] },
      { title: '把資料整理成結果', description: '泛型集合與 LINQ。', articleIds: ['csharp-collections', 'csharp-linq'] },
      { title: '處理真實世界的工作', description: '例外、資源管理、非同步與取消。', articleIds: ['csharp-exceptions', 'csharp-disposable', 'csharp-async-await', 'csharp-cancellation'] },
    ],
  },
  {
    id: 'dotnet-backend-practice', title: '.NET 後端工作實務', description: '把工作筆記中的型別、服務、資料與診斷觀念連成一條路徑。', audience: '適合熟悉 C# 基本語法的開發者',
    stages: [
      { title: '把資料與邊界說清楚', description: '先分清參數、資料型別與查詢模型。', articleIds: ['csharp-parameter-passing', 'csharp-records-invariants', 'csharp-query-abstractions'] },
      { title: '理解非同步與共享狀態', description: '控制等待、批次作業與並行存取。', articleIds: ['csharp-configure-await', 'csharp-async-coordination', 'csharp-thread-safety', 'csharp-channels'] },
      { title: '建立可靠的 Web 邊界', description: '管理服務生命週期、HTTP、驗證與 Middleware。', articleIds: ['aspnet-core-dependency-injection', 'aspnet-core-model-binding', 'aspnet-core-http-client-factory', 'aspnet-core-http-resilience', 'aspnet-core-authentication', 'aspnet-core-middleware'] },
      { title: '讓規則與資料操作各就其位', description: '領域模型、應用程式模式與資料庫邊界。', articleIds: ['architecture-domain-modeling', 'architecture-application-patterns', 'data-access-ef-core', 'data-access-transactions', 'data-access-pools-locks'] },
      { title: '把部署與診斷串起來', description: '固定工具環境，用行為測試與追蹤確認系統。', articleIds: ['dotnet-sdk-packages', 'dotnet-time-zones', 'engineering-business-tests', 'engineering-metrics-tracing'] },
    ],
  },
  {
    id: 'dotnet-cache-messaging', title: '.NET 快取與可靠訊息處理', description: '用商品查詢與訂單通知，串起 Redis、RabbitMQ、交易與故障恢復。', audience: '適合熟悉 C# 與 Web API，準備處理跨程序工作的開發者',
    stages: [
      { title: '先掌握程序與交易邊界', description: '理解非同步、取消、DI、背景工作與本地交易。', articleIds: ['csharp-async-await', 'csharp-cancellation', 'csharp-channels', 'aspnet-core-dependency-injection', 'dotnet-hosting', 'data-access-transactions'] },
      { title: '讓讀取有可理解的快取行為', description: '從 Redis 資料模型到 .NET 整合與 Cache-Aside。', articleIds: ['redis-getting-started', 'redis-data-types-ttl', 'redis-dotnet-integration', 'redis-cache-aside', 'redis-concurrency', 'redis-reliability'] },
      { title: '把工作交給可確認的訊息流程', description: '理解路由、發布與消費，以及確認各自負責的階段。', articleIds: ['rabbitmq-getting-started', 'rabbitmq-routing', 'rabbitmq-dotnet-integration', 'rabbitmq-acknowledgements'] },
      { title: '面對重送、失敗與資料延遲', description: '安排重試、冪等、訊息順序與 Outbox。', articleIds: ['rabbitmq-retries-idempotency', 'rabbitmq-queues-ordering', 'architecture-communication-boundaries', 'architecture-outbox-inbox'] },
      { title: '用結果與故障演練確認系統', description: '用行為測試與觀測串起商品快取和訂單背景通知。', articleIds: ['engineering-business-tests', 'engineering-metrics-tracing', 'engineering-cache-messaging-tests'] },
    ],
  },
];

export const learningPathUrl = (id: string) => '/learning-paths/' + id + '/';
