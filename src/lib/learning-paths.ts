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
  {
    id: 'dotnet-deep-dive', title: '.NET 深入：型別、非同步與 Runtime', description: '沿型別能力、資源生命週期和效能證據，補齊深入學習的缺口。', audience: '適合已能製作 API，想解釋底層行為的開發者',
    stages: [
      { title: '把型別契約讀清楚', description: '泛型、相等性與資料不變量。', articleIds: ['csharp-generics', 'csharp-structs-equality', 'csharp-records-invariants', 'csharp-parameter-passing'] },
      { title: '理解等待與所有權', description: 'await 流程、ValueTask、釋放與背景工作。', articleIds: ['csharp-await-state-machine', 'csharp-async-coordination', 'csharp-async-disposable', 'dotnet-background-services'] },
      { title: '從執行機制到診斷', description: 'CLR、GC、執行緒池、反射與量測。', articleIds: ['dotnet-clr-jit', 'dotnet-gc-memory', 'dotnet-threadpool', 'dotnet-reflection', 'dotnet-profiling'] },
      { title: '連回設計與框架', description: '建立、組合與跨功能責任。', articleIds: ['architecture-creation-patterns', 'architecture-behavior-patterns', 'aspnet-core-options', 'architecture-cross-cutting'] },
    ],
  },
  {
    id: 'cloud-native-foundations', title: '容器與 Kubernetes 基礎', description: '先沿請求與程序理解容器，再掌握 Kubernetes 的期望狀態、設定和可靠性。', audience: '適合能執行後端程式、準備學習部署的開發者',
    stages: [
      { title: '辨識程序與連線', description: '映像、Compose、DNS 和 HTTP 路徑。', articleIds: ['containers-image-runtime', 'containers-compose', 'networking-request-path'] },
      { title: '宣告工作與入口', description: 'Pod、Deployment、Service 與 Gateway。', articleIds: ['kubernetes-workloads', 'kubernetes-services-gateway'] },
      { title: '讓程序正確運作', description: '設定、權限、探針、資源與儲存。', articleIds: ['kubernetes-configuration-security', 'kubernetes-probes-resources', 'kubernetes-storage'] },
      { title: '理解容量邊界', description: '擴縮、連線池和背景程序停止。', articleIds: ['kubernetes-autoscaling', 'data-access-pools-locks', 'dotnet-background-services'] },
    ],
  },
  {
    id: 'gke-delivery-operations', title: 'GKE、交付與日常維運', description: '把共同部署模型接到 Google Cloud，追查映像、權限、資料與服務品質。', audience: '適合已理解 Kubernetes 的後端開發者',
    stages: [
      { title: '理解平台與整合', description: '模式、身分、入口和外部資料服務。', articleIds: ['gke-platform-modes', 'gke-workload-identity', 'gke-gateway-networking', 'gke-data-services'] },
      { title: '交付可追溯版本', description: 'CI/CD、IaC 與新舊資料相容。', articleIds: ['engineering-ci-cd', 'engineering-iac', 'data-access-migrations'] },
      { title: '以結果維運', description: '觀測、容量、品質與恢復。', articleIds: ['engineering-metrics-tracing', 'kubernetes-autoscaling', 'engineering-slo-alerts', 'engineering-recovery-cost'] },
    ],
  },
];

export const learningPathUrl = (id: string) => '/learning-paths/' + id + '/';
