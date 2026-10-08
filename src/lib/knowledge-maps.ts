export interface KnowledgeDomain {
  id: string;
  title: string;
  priority: 'P0' | 'P1' | '核心與深入';
  focus: string;
  outcome: string;
  articleIds: string[];
}
export interface KnowledgeMap {
  id: string;
  title: string;
  description: string;
  domains: KnowledgeDomain[];
}

export const knowledgeMaps: KnowledgeMap[] = [
  {
    id: 'dotnet-backend', title: 'C#／.NET 後端知識地圖',
    description: '保留六個 P0 與四個 P1 領域，從型別、框架與資料一路深入 Runtime 和工程實務。基礎、深入與情境應用各有閱讀目的。',
    domains: [
      { id: 'D01', title: 'C# 型別系統', priority: 'P0', focus: 'class、struct、record、interface、generic、nullable、ref/out/in', outcome: '根據資料語意選型別，解釋複製、相等、預設狀態與參數別名。', articleIds: ['csharp-getting-started', 'csharp-variables', 'csharp-value-reference-types', 'csharp-classes', 'csharp-records-invariants', 'csharp-structs-equality', 'csharp-interfaces', 'csharp-collections', 'csharp-generics', 'csharp-nullable', 'csharp-parameter-passing', 'csharp-type-operators'] },
      { id: 'D02', title: 'OOP 與語言特性', priority: 'P0', focus: 'virtual、abstract、sealed、override、delegate、event、extension method', outcome: '解釋動態分派、替換點、組合與訂閱的生命週期。', articleIds: ['csharp-control-flow', 'csharp-methods', 'csharp-class-design', 'csharp-interfaces', 'csharp-delegates', 'csharp-extensions-attributes'] },
      { id: 'D03', title: '物件建立與設計模式', priority: 'P1', focus: 'Factory、Builder、Strategy、Decorator、DI、Options Pattern', outcome: '從需求變動點選擇建立、組合與設定方式，說明抽象的成本。', articleIds: ['architecture-creation-patterns', 'architecture-behavior-patterns', 'aspnet-core-dependency-injection', 'aspnet-core-options', 'architecture-application-patterns'] },
      { id: 'D04', title: '非同步與並行', priority: 'P0', focus: 'async/await、Task、ValueTask、CancellationToken、lock、SemaphoreSlim', outcome: '畫出等待、例外與取消流程，分清程序內競爭和跨程序一致性。', articleIds: ['csharp-async-await', 'csharp-await-state-machine', 'csharp-async-coordination', 'csharp-cancellation', 'csharp-configure-await', 'csharp-thread-safety', 'csharp-channels', 'csharp-exceptions'] },
      { id: 'D05', title: '生命週期與資源管理', priority: 'P0', focus: 'Singleton、Scoped、Transient、IDisposable、IAsyncDisposable、GC', outcome: '指出資源所有者與 scope，核對成功、例外和取消時的清理。', articleIds: ['csharp-disposable', 'csharp-async-disposable', 'aspnet-core-dependency-injection', 'dotnet-hosting', 'dotnet-background-services', 'dotnet-gc-memory'] },
      { id: 'D06', title: 'ASP.NET Core', priority: 'P0', focus: 'Middleware、Routing、Model Binding、Filter、Authentication、Authorization', outcome: '按 HTTP 請求順序解釋輸入、驗證、權限、端點與回應。', articleIds: ['aspnet-core-http-contracts', 'aspnet-core-routing', 'aspnet-core-model-binding', 'aspnet-core-middleware', 'aspnet-core-filters', 'aspnet-core-authentication', 'aspnet-core-api-styles-aot', 'aspnet-core-grpc', 'aspnet-core-dapr'] },
      { id: 'D07', title: '資料存取', priority: 'P0', focus: 'EF Core、DbContext、LINQ、Transaction、Tracking、Concurrency、MySQL／PostgreSQL', outcome: '閱讀查詢與提交邊界，設計庫存並行和相容的資料更新。', articleIds: ['data-access-sql-foundations', 'csharp-linq', 'csharp-query-abstractions', 'data-access-ef-core', 'data-access-tracking', 'data-access-concurrency', 'data-access-transactions', 'data-access-batch-updates', 'data-access-type-mapping', 'data-access-pools-locks', 'data-access-migrations', 'data-access-csharp-connections', 'data-access-mysql-dotnet', 'data-access-postgresql-dotnet', 'data-access-concurrent-crud', 'data-access-isolation-locking', 'data-access-large-table-queries'] },
      { id: 'D08', title: 'Infrastructure', priority: 'P1', focus: 'HttpClientFactory、Redis、Message Queue、BackgroundService、Connection Pool', outcome: '管理外部連線和背景程序，解釋逾時、故障、重送與停止。', articleIds: ['aspnet-core-http-client-factory', 'aspnet-core-http-resilience', 'dotnet-background-services', 'data-access-pools-locks', 'data-access-pool-capacity', 'data-access-replication-recovery', 'redis-getting-started', 'redis-data-types-ttl', 'redis-dotnet-integration', 'redis-cache-aside', 'redis-concurrency', 'redis-reliability', 'rabbitmq-getting-started', 'rabbitmq-routing', 'rabbitmq-dotnet-integration', 'rabbitmq-acknowledgements', 'rabbitmq-retries-idempotency', 'rabbitmq-queues-ordering'] },
      { id: 'D09', title: 'Runtime 與效能', priority: 'P1', focus: 'CLR、JIT、ThreadPool、GC、Memory、Reflection、Profiling', outcome: '以量測區分 CPU、等待、配置、保留和池耗盡，核對調整前後。', articleIds: ['dotnet-clr-jit', 'dotnet-gc-memory', 'dotnet-threadpool', 'dotnet-reflection', 'dotnet-profiling', 'aspnet-core-api-styles-aot', 'csharp-structs-equality', 'data-access-load-validation'] },
      { id: 'D10', title: '架構與工程實務', priority: 'P1', focus: 'DDD、Clean Architecture、CQRS、AOP、Testing、Observability', outcome: '從規則找一致性邊界，驗證用例並追查交付與運作結果。', articleIds: ['architecture-domain-modeling', 'architecture-clean-architecture', 'architecture-application-patterns', 'architecture-cross-cutting', 'architecture-communication-boundaries', 'architecture-outbox-inbox', 'engineering-business-tests', 'engineering-cache-messaging-tests', 'engineering-metrics-tracing', 'dotnet-sdk-packages', 'dotnet-time-zones', 'dotnet-identifiers', 'engineering-ci-cd', 'engineering-iac', 'engineering-slo-alerts', 'engineering-recovery-cost'] },
    ],
  },
  {
    id: 'cloud-native', title: '雲端部署與維運知識地圖',
    description: '先學 Kubernetes 共通原理，再理解 GKE 的身分、網路與服務整合；從容器進入可交付、可診斷和可恢復的系統。',
    domains: [
      { id: 'C01', title: '容器與執行環境', priority: '核心與深入', focus: 'Image、Container、Dockerfile、multi-stage、程序、權限、訊號', outcome: '解釋 API／Worker 映像如何建立、設定及停止。', articleIds: ['containers-image-runtime', 'containers-compose'] },
      { id: 'C02', title: '網路與協定基礎', priority: '核心與深入', focus: 'IP、Port、DNS、HTTP／TLS、L4／L7、VPC、路由', outcome: '沿請求逐層指出端點、連線和驗證位置。', articleIds: ['networking-request-path', 'aspnet-core-http-contracts', 'gke-gateway-networking'] },
      { id: 'C03', title: 'Kubernetes 模型與工作負載', priority: '核心與深入', focus: '期望狀態、控制器、Node、Pod、Deployment、Job、Namespace', outcome: '區分宣告、排程、啟動和服務可用的狀態。', articleIds: ['kubernetes-workloads', 'kubernetes-services-gateway'] },
      { id: 'C04', title: 'Kubernetes 服務、設定與安全', priority: '核心與深入', focus: 'Service、Gateway API、ConfigMap、Secret、ServiceAccount、RBAC', outcome: '說明流量、設定、程序身分及各層權限。', articleIds: ['kubernetes-services-gateway', 'kubernetes-configuration-security', 'gke-workload-identity'] },
      { id: 'C05', title: '資源、儲存與可靠性', priority: '核心與深入', focus: 'requests／limits、探針、停止、更新、PV／PVC、PDB', outcome: '處理未就緒、OOM、更新和持久資料的不同問題。', articleIds: ['kubernetes-probes-resources', 'kubernetes-storage', 'dotnet-gc-memory', 'dotnet-background-services'] },
      { id: 'C06', title: 'GCP 與 GKE 平台', priority: '核心與深入', focus: 'Project、區域、IAM、VPC、Artifact Registry、模式、版本', outcome: '理解 Autopilot／Standard 的管理範圍及雲端前提。', articleIds: ['gke-platform-modes', 'gke-workload-identity'] },
      { id: 'C07', title: 'GKE 與外部服務整合', priority: '核心與深入', focus: 'Gateway、TLS、Cloud SQL（MySQL／PostgreSQL）、連線預算、Redis、RabbitMQ、Secret Manager', outcome: '分別核對網路、雲端權限、服務登入與資料責任。', articleIds: ['gke-gateway-networking', 'gke-data-services', 'gke-workload-identity', 'data-access-pools-locks', 'data-access-mysql-dotnet', 'data-access-postgresql-dotnet', 'data-access-pool-capacity', 'data-access-replication-recovery', 'redis-reliability', 'rabbitmq-queues-ordering'] },
      { id: 'C08', title: '自動化交付與 IaC', priority: '核心與深入', focus: 'CI/CD、OIDC、映像 digest、Kustomize、Helm、Terraform、Migration', outcome: '追溯程式、映像、環境和資料變更，說明回復條件。', articleIds: ['engineering-ci-cd', 'engineering-iac', 'data-access-migrations', 'dotnet-sdk-packages'] },
      { id: 'C09', title: '觀測、擴縮與日常維運', priority: '核心與深入', focus: '日誌、指標、Trace、HPA、SLO、告警、RPO／RTO、成本', outcome: '用端到端證據檢查容量、品質與實際恢復結果。', articleIds: ['kubernetes-autoscaling', 'engineering-metrics-tracing', 'engineering-slo-alerts', 'engineering-recovery-cost', 'dotnet-threadpool', 'dotnet-profiling', 'data-access-load-validation'] },
    ],
  },
  {
    id: 'database-scale', title: 'C# 與資料庫容量知識地圖',
    description: '比較 MySQL 與 PostgreSQL，從 C# 連線、併發 CRUD 到上億筆資料的查詢與維護。以容量預算、正確性與量測決定設定。',
    domains: [
      { id: 'DB01', title: 'C# 與資料庫連線', priority: '核心與深入', focus: 'ADO.NET、EF provider、Dapper、MySqlConnector、Npgsql、DataSource、DbContext', outcome: '說明每次操作如何借還連線，以及 driver、ORM 和程序生命週期的差異。', articleIds: ['data-access-csharp-connections', 'data-access-mysql-dotnet', 'data-access-postgresql-dotnet', 'data-access-ef-core', 'csharp-async-disposable'] },
      { id: 'DB02', title: '池與整體工作量', priority: '核心與深入', focus: '每程序池、HPA、rollout、入場上限、有界等待、deadline、PgBouncer', outcome: '列出所有池與使用者的連線預算，分開 HTTP 併發、session 和正在執行的工作。', articleIds: ['data-access-pool-capacity', 'data-access-pools-locks', 'data-access-postgresql-dotnet', 'kubernetes-autoscaling', 'csharp-async-coordination'] },
      { id: 'DB03', title: '高併發 CRUD 與交易', priority: '核心與深入', focus: '冪等、條件更新、樂觀並行、MVCC、隔離、死鎖、完整交易重試', outcome: '以重複下單和熱 SKU 證明唯一性、庫存與未知提交結果的處理。', articleIds: ['data-access-concurrent-crud', 'data-access-isolation-locking', 'data-access-concurrency', 'data-access-transactions', 'architecture-outbox-inbox'] },
      { id: 'DB04', title: '大表查詢與索引', priority: '核心與深入', focus: '查詢形狀、複合索引、EXPLAIN、投影、N+1、keyset pagination', outcome: '讓查詢只讀所需範圍，核對真實掃描成本、穩定排序與權限。', articleIds: ['data-access-large-table-queries', 'data-access-sql-foundations', 'data-access-tracking', 'csharp-query-abstractions'] },
      { id: 'DB05', title: '大量寫入與維護', priority: '核心與深入', focus: '批次、COPY、Bulk Copy、checkpoint、autovacuum、purge、保留', outcome: '讓匯入、回填與清理可續跑，核對鎖、日誌、複寫和前台影響。', articleIds: ['data-access-bulk-retention', 'data-access-batch-updates', 'data-access-migrations'] },
      { id: 'DB06', title: '分割、封存與分片', priority: '核心與深入', focus: 'partition pruning、唯一性、外鍵、archive、shard key、分析模型', outcome: '按維護與容量證據選方案，解釋跨區段／分片的一致性與恢復成本。', articleIds: ['data-access-partitioning-sharding', 'data-access-large-table-queries', 'data-access-bulk-retention', 'architecture-communication-boundaries'] },
      { id: 'DB07', title: '複寫、雲端與復原', priority: '核心與深入', focus: '讀副本延遲、read-after-write、failover、Cloud SQL、PITR、RPO／RTO', outcome: '區分池、Proxy、HA 與備份，驗證故障路由和實際還原結果。', articleIds: ['data-access-replication-recovery', 'gke-data-services', 'gke-workload-identity', 'engineering-recovery-cost'] },
      { id: 'DB08', title: '診斷、容量驗證與變更', priority: '核心與深入', focus: 'p95／p99、到達率、等待、SQL／鎖指標、長時間負載、相容 Migration', outcome: '以代表性資料與業務不變量核對調整，不把範例參數當成吞吐保證。', articleIds: ['data-access-load-validation', 'data-access-pool-capacity', 'data-access-migrations', 'dotnet-profiling', 'engineering-metrics-tracing'] },
    ],
  },
];
export const knowledgeMapUrl = (id: string) => '/knowledge-maps/' + id + '/';
export const depthLabels = { basic: '基礎', deep: '深入', applied: '情境應用' };
