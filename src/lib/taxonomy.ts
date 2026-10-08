export const categories = [
  { id: 'basics', name: '語法入門', description: '環境、變數、流程控制與方法', icon: 'code', step: '先讓程式跑起來' },
  { id: 'types', name: '型別與物件', description: 'class、值型別、record 與空值處理', icon: 'box', step: '理解型別與物件' },
  { id: 'oop', name: '物件導向', description: '介面、多型、類別設計與擴充方法', icon: 'network', step: '讓行為可以重用' },
  { id: 'data', name: '資料處理', description: '泛型集合、LINQ 與列舉模型', icon: 'list', step: '把資料整理成結果' },
  { id: 'practice', name: '實務與非同步', description: '資源、非同步、取消與並行控制', icon: 'layers', step: '處理真實世界的工作' },
] as const;

export const topics = {
  csharp: { name: 'C#', path: 'languages/csharp', mark: 'C#', icon: 'code', description: '從基本語法到型別設計、非同步與並行，串起 C# 的核心概念。', categories },
  'aspnet-core': { name: 'ASP.NET Core', path: 'frameworks/aspnet-core', mark: 'Web', icon: 'network', description: '掌握 Web API 的資料繫結、服務生命週期、驗證與服務通訊。', categories: [
    { id: 'web-api', name: 'API 與管線', description: 'Model Binding、Middleware 與 API 型態' },
    { id: 'services', name: '服務與安全', description: 'DI、Options、HTTP 用戶端與授權' },
    { id: 'integration', name: '服務整合', description: 'gRPC 與 Dapr' },
  ] },
  architecture: { name: '架構設計', path: 'architecture', mark: 'DDD', icon: 'box', description: '用領域模型、分層與應用程式模式，把商業規則放在清楚的邊界內。', categories: [
    { id: 'domain-design', name: '領域與分層', description: 'Entity、Value Object、Aggregate 與依賴方向' },
    { id: 'application-patterns', name: '應用程式模式', description: 'Repository、Unit of Work、CQRS 與 Handler' },
    { id: 'object-patterns', name: '建立與組合', description: 'Factory、Builder、Strategy、Decorator 與橫切行為' },
  ] },
  'data-access': { name: '資料存取', path: 'data-access', mark: 'Data', icon: 'list', description: '從 EF Core 與交易深入 C# 連接 MySQL／PostgreSQL、高併發 CRUD、連線容量與大量資料維護。', categories: [
    { id: 'querying', name: '模型與查詢', description: 'EF Core、LINQ 翻譯與型別對應' },
    { id: 'transactions', name: '交易與批次', description: 'Dapper、交易、批次更新' },
    { id: 'database-runtime', name: '部署與連線', description: 'Migration、連線池與鎖' },
    { id: 'database-connections', name: 'C# 與資料庫連線', description: 'DataSource、MySqlConnector、Npgsql 與池容量' },
    { id: 'database-concurrency', name: '高併發與一致性', description: 'CRUD、隔離層級、鎖、冪等與重試' },
    { id: 'database-scale', name: '大量資料與容量', description: '索引、批次、分割、複寫、恢復與負載驗證' },
  ] },
  redis: { name: 'Redis', path: 'infrastructure/redis', mark: 'Redis', icon: 'layers', description: '從資料型別與 TTL 到 .NET 快取、一致性、併發與故障處理，理解 Redis 的使用邊界。', categories: [
    { id: 'redis-basics', name: '基礎與資料模型', description: '共享快取、資料型別、Key 與 TTL' },
    { id: 'redis-caching', name: '快取與應用', description: '.NET 整合、Cache-Aside 與併發控制' },
    { id: 'redis-reliability', name: '可靠性與維運', description: '持久化、淘汰、故障降級與觀測' },
  ] },
  rabbitmq: { name: 'RabbitMQ', path: 'infrastructure/rabbitmq', mark: 'MQ', icon: 'network', description: '掌握訊息路由、.NET 發布與消費、確認、重試及死信，建立可恢復的背景工作。', categories: [
    { id: 'rabbitmq-basics', name: '基礎與路由', description: '工作佇列、Exchange、Binding 與 Routing Key' },
    { id: 'rabbitmq-integration', name: '.NET 整合', description: 'Connection、Channel、Worker 與傳遞確認' },
    { id: 'rabbitmq-reliability', name: '可靠性與維運', description: '冪等、重試、死信、佇列類型與順序' },
  ] },
  containers: { name: '容器與 Docker', path: 'infrastructure/containers', mark: 'Docker', icon: 'box', description: '理解映像、程序、設定與網路，將 .NET API 和 Worker 放進可重現的執行環境。', categories: [
    { id: 'container-basics', name: '映像與執行', description: 'Dockerfile、multi-stage、程序與停止訊號' },
    { id: 'container-environments', name: '多程序環境', description: 'Compose、網路、設定與資料保留' },
  ] },
  networking: { name: '網路與協定', path: 'infrastructure/networking', mark: 'Net', icon: 'network', description: '沿著請求辨識 DNS、TCP、TLS、HTTP、路由與服務認證的責任。', categories: [
    { id: 'network-foundations', name: '請求與連線', description: 'IP、Port、DNS、TLS、L4／L7 與 VPC' },
  ] },
  kubernetes: { name: 'Kubernetes', path: 'platforms/kubernetes', mark: 'K8s', icon: 'layers', description: '從期望狀態到部署、流量、探針、資源及擴縮，理解編排平台的工作方式。', categories: [
    { id: 'k8s-workloads', name: '模型與工作負載', description: 'Pod、Deployment、控制器與服務探索' },
    { id: 'k8s-configuration', name: '設定與安全', description: 'ConfigMap、Secret、ServiceAccount 與 RBAC' },
    { id: 'k8s-reliability', name: '資源與可靠性', description: '探針、停止、儲存、更新與擴縮' },
  ] },
  gke: { name: 'GCP 與 GKE', path: 'platforms/gke', mark: 'GKE', icon: 'network', description: '把 Kubernetes 接到 Google Cloud 的身分、網路、映像及資料服務，學會部署與管理邊界。', categories: [
    { id: 'gke-platform', name: '平台與身分', description: 'Project、Autopilot／Standard、IAM 與工作負載身分' },
    { id: 'gke-integration', name: '網路與資料', description: 'Gateway、TLS、Cloud SQL 與依賴端點' },
  ] },
  dotnet: { name: '.NET 執行環境', path: 'platforms/dotnet', mark: '.NET', icon: 'layers', description: '從 SDK 與 Hosting 深入 CLR、GC、ThreadPool 和效能診斷，理解程式如何執行與管理資源。', categories: [
    { id: 'toolchain', name: 'SDK 與套件', description: 'global.json、NuGet 與集中版本管理' },
    { id: 'runtime-models', name: 'Hosting 模型', description: 'Generic Host、Minimal Hosting 與 Startup' },
    { id: 'time-identifiers', name: '時間與識別碼', description: 'UTC、時區與分散式 ID' },
    { id: 'runtime-performance', name: 'Runtime 與效能', description: 'CLR、JIT、GC、ThreadPool、記憶體與 Profiling' },
  ] },
  engineering: { name: '工程實務', path: 'engineering', mark: 'Ops', icon: 'spark', description: '把行為測試、觀測、版本交付、服務目標與恢復串起來，管理系統完整生命週期。', categories: [
    { id: 'testing', name: '行為測試', description: 'xUnit、NSubstitute 與測試邊界' },
    { id: 'observability', name: '指標與追蹤', description: 'Runtime 指標、OpenTelemetry 與 W3C Trace Context' },
    { id: 'delivery', name: '交付與環境', description: 'CI/CD、IaC、映像與資料相容更新' },
    { id: 'operations', name: '服務與維運', description: 'SLO、告警、恢復、版本與成本' },
  ] },
} as const;

export type TopicId = keyof typeof topics;
export type Topic = (typeof topics)[TopicId];
export const topicIds = Object.keys(topics) as [TopicId, ...TopicId[]];
export const allCategories = Object.values(topics).flatMap((topic) => [...topic.categories]);
export const topicFor = (id: string): Topic | undefined => topics[id as TopicId];
export const topicUrl = (id: string) => {
  const topic = topicFor(id);
  if (!topic) throw new Error('不存在的知識主題：' + id);
  return '/' + topic.path + '/';
};
export const categoryFor = (id: string) => allCategories.find((category) => category.id === id);
