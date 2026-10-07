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
];

export const learningPathUrl = (id: string) => '/learning-paths/' + id + '/';
