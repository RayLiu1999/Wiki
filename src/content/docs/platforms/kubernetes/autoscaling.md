---
title: "HPA、佇列容量與多副本限制"
description: "分清 Pod 擴縮、Node 容量、訊息並行與資料庫連線壓力。"
articleId: "kubernetes-autoscaling"
topic: "kubernetes"
category: "k8s-reliability"
order: 6
tags: ["HPA、佇列容量與多副本限制", "kubernetes"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["kubernetes-probes-resources", "architecture-outbox-inbox"]
relatedArticles: ["data-access-pools-locks", "rabbitmq-retries-idempotency", "data-access-pool-capacity", "data-access-load-validation"]
applicableVersions: "以 Kubernetes 現行核心 API 與 Docker 容器模型說明；GKE 限制另見平台文章。"
verifiedWith: "已核對 Kubernetes／Docker 官方概念；叢集操作與環境驗證狀態見獨立實作指南。"
lastReviewed: "2026-10-10"
takeaway: "分清 Pod 擴縮、Node 容量、訊息並行與資料庫連線壓力。"
noteDates: []
sources: [{"title": "HPA", "url": "https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/"}, {"title": "KEDA concepts", "url": "https://keda.sh/docs/latest/concepts/"}, {"title": "GKE cluster autoscaler", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/concepts/cluster-autoscaler"}]
---

在電商大促與爆款秒殺情境下，流量往往在數分鐘內暴增數十倍。Kubernetes 提供了水平 Pod 自動擴展器（Horizontal Pod Autoscaler, HPA），能依據負載動態增減副本數。然而，「增加 Pod 副本」並非提升整體系統吞吐量的萬靈丹；若未釐清指標本質、佇列特性與下游資料庫連線池預算，盲目擴展反而會瞬間引爆資料庫連鎖崩潰。

## 案發現場

某電商平台在「雙十一」促銷開跑 10 分鐘內，遭遇了前所未見的系統大雪崩：

1. **佇列積壓百萬，Worker 紋絲不動**：促銷開始後，下單事件以每秒數萬筆的速度湧入 RabbitMQ 佇列，訊息積壓飆升至 80 萬筆。然而負責執行扣款與開立發票的後台 Worker，副本數卻始終停留在預設的 2 個。排查發現 HPA 僅綁定了 `targetCPUUtilizationPercentage: 70%`，而 Worker 本質為 I/O 密集型工作，執行緒大部分時間在等待外部 HTTP 支付閘道回應，CPU 使用率僅 12%，因此 HPA 判定無需擴容。
2. **手動擴容擠爆資料庫連線池**：值班工程師情急之下手動將 Worker 副本調增至 80 個。80 個 Worker 同時啟動，每個 Pod 的 ADO.NET / Npgsql 連線池預設上限為 100。數秒之內，資料庫連線數突破 5,000，底層 PostgreSQL 直接觸發 `FATAL: sorry, too many clients already`，連帶導致前台 Web API 連線全部超時，全站徹底停擺。
3. **擴容全數卡在 Pending**：在 API 自動擴縮過程中，HPA 正確計算出需要擴容至 50 個 Pod，但其中 30 個 Pod 狀態卡死在 `Pending`。原因在於底層雲端節點（Node）資源已耗盡，而叢集並未配置 Cluster Autoscaler 或節點擴容速度過慢，無法即時供應虛擬機器。
4. **指標抖動引發反覆震盪（Flapping）**：因未設定冷卻時間，當佇列訊息短暫消化完畢後，HPA 瞬間縮容至 2 個 Pod；下一批流量湧入又瞬間擴容，Pod 頻繁銷毀與建立，造成大量連線中斷與重試風暴。

```mermaid
flowchart TD
    MQ["RabbitMQ 訂單積壓 (800,000 msgs)"] -->|佇列深度指標| KEDA["KEDA / Custom Metrics Adapter"]
    KEDA -->|通知擴展意圖| HPA["Horizontal Pod Autoscaler (HPA)"]
    HPA -->|宣告期望副本數 (需評估 DB 池預算)| Deploy["Worker Deployment"]
    Deploy -->|建立新副本| Pods["Worker Pod 1 ~ N"]
    Pods -->|連線池消耗 (MaxPoolSize)| PgBouncer["PgBouncer 連線池代理 (防護層)"]
    PgBouncer -->|受控連線總數| DB[("核心資料庫 (連線上限預算限制)")]
```

## 反模式與正確解法

### 反模式一：對 I/O 密集型或訊息消費者套用 CPU/Memory 指標

HPA 預設僅依賴 Metrics Server 提供的 CPU 與記憶體指標。對於處理 RabbitMQ、Kafka 訊息或非同步背景工作的 Worker，其瓶頸通常在於非同步 I/O 等待，CPU 指標完全無法真實反映業務負載與訊息積壓嚴重度。

#### 正確解法：引入 KEDA 實現事件驅動擴展

使用 KEDA（Kubernetes Event-driven Autoscaling），讓擴展訊號直接綁定 RabbitMQ 佇列長度（Queue Length）或發布速率：

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-worker-scaler
  namespace: ecommerce-prod
spec:
  scaleTargetRef:
    name: order-worker-deployment
  minReplicaCount: 2
  maxReplicaCount: 30 # 嚴格依據下游資料庫承載力計算上限
  cooldownPeriod: 300 # 縮容冷卻時間 5 分鐘，防止頻繁震盪
  triggers:
  - type: rabbitmq
    metadata:
      protocol: amqp
      queueName: order-created-queue
      mode: QueueLength
      value: "500" # 每累積 500 則訊息自動擴充一個 Worker 副本
    authenticationRef:
      name: keda-rabbitmq-auth
```

### 反模式二：無上限擴展，忽略下游相依服務的容量極限

擴展 Pod 副本並不能無中生有創造下游容量。若每個 Pod 都配置有資料庫連線池、Redis 連線池與外部第三方 API 呼叫配額，單純增加消費者只會將瓶頸向下游轉移，引發全系統雪崩。

#### 正確解法：建立資料庫連線預算公式與前置代理

在定義 `maxReplicaCount` 時，必須依據底層資料庫的最大連線數上限進行嚴格反推：

$$\text{Total Connections} = (\text{Web Replicas} \times \text{Web Pool}) + (\text{Worker Replicas} \times \text{Worker Pool}) + \text{Surge Buffer}$$

例如 PostgreSQL `max_connections = 500`，扣除管理工具與 DBA 保留連線 50，剩餘 450。若 Web API 最大 10 副本，每副本池上限 20（消耗 200）；則 Worker 最多僅能分配 200 連線。若 Worker 每副本池上限為 10，則 Worker 的 `maxReplicaCount` 絕對不能超過 20！
此外，在高併發架構下，應於資料庫前置部署連線池代理（如 PgBouncer），將 Pod 的應用連線轉換為輕量連線，隔離連線暴增壓力。

### 反模式三：未配置擴縮容行為（Behavior）引發系統震盪

當負載短暫驟降時，HPA 預設會快速縮容。如果在 1 分鐘內流量再次湧入，新 Pod 又必須經歷啟動暖機，頻繁擴縮（Flapping）會導致系統處於持續震盪狀態。

#### 正確解法：配置冷卻時間與漸進式縮容策略

在 HPA 的 `behavior` 欄位中，顯式定義平穩期（Stabilization Window）與階梯式縮容上限：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-api-hpa
  namespace: ecommerce-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-api
  minReplicas: 3
  maxReplicas: 25
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 65
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300 # 需持續觀察 5 分鐘確認負載下降才執行縮容
      policies:
      - type: Percent
        value: 10                     # 每分鐘最多縮容當前副本數的 10%
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0   # 擴容無平穩期，負載一來立即反應
      policies:
      - type: Percent
        value: 100                    # 尖峰時允許副本數直接翻倍
        periodSeconds: 15
```

## 踩坑與避坑指南

### 1. 訊息 Worker 擴展前的並行領取與冪等保護
在擴充 Worker 副本之前，必須先確保訊息領取具備防重複處理機制。如果系統使用 Outbox Pattern 由多個 Worker 同時讀取資料庫 Outbox 資料表，若未在 SQL 查詢中使用 `FOR UPDATE SKIP LOCKED` 或分散式租約（Lease），多個 Pod 將同時領取相同的待處理訂單，導致重複請款。
- **避坑建議**：擴展 Consumer 前，必須保證業務具備 Inbox 去重機制與資料庫唯一索引約束，確保重複訊息不會產生業務副作用。

### 2. 縮容過快引發執行中長任務被中斷
當 KEDA 偵測到佇列淨空觸發縮容時，正在處理大筆訂單匯總（耗時 30 秒）的 Worker 可能突然收到終止訊號。若程式未註冊 `IHostApplicationLifetime.ApplicationStopping`，正在處理中的訊息會被中斷，且 RabbitMQ AMQP 連線被切斷導致未發送 ACK，訊息被重新放回隊首（Requeue），引發二次執行。
- **避坑建議**：配置足夠的 `terminationGracePeriodSeconds`（例如 60s），並在 Worker 中攔截取消權杖（CancellationToken），等待當前訊息處理完成並回傳 ACK 後再關閉連線。

### 3. HPA 擴容與 Cluster Autoscaler 的時間差
HPA 能在 15 秒內計算並建立 20 個 Pod，但底層若沒有足夠的 Node 節點，雲端 Cluster Autoscaler 向雲端平台（GCP / AWS）請求開立新虛擬機器通常需要 1~3 分鐘。這段期間所有新 Pod 會卡在 `Pending` 狀態。
- **避坑建議**：在高併發促銷來臨前，應透過排程預先擴展節點池（Pre-warming）；或部署低優先級（PriorityClass）的「佔位 Pod（Balloon/Overprovisioning Pod）」，當重要業務 Pod 排程時，搶佔優先級將佔位 Pod 逐出，實現秒級排程。

## 線上排查指令

針對 HPA 擴縮容異常、KEDA 指標卡死與節點資源短缺問題，可使用下列指令排查：

```bash
# 1. 檢視 HPA 當前指標狀態與目標值比對
kubectl get hpa -n ecommerce-prod -o wide

# 2. 深入排查 HPA 擴容決策歷程與警告事件
kubectl describe hpa order-api-hpa -n ecommerce-prod

# 3. 檢查 KEDA ScaledObject 資源狀態與 Trigger 健全度
kubectl get scaledobjects,triggerauthentications -n ecommerce-prod
kubectl describe scaledobject order-worker-scaler -n ecommerce-prod

# 4. 檢視各 Node 節點的已分配資源比例（判斷是否無法排程）
kubectl describe nodes | grep -A 7 "Allocated resources:"

# 5. 排查因資源不足而卡在 Pending 的 Pod
kubectl get pods -n ecommerce-prod --field-selector status.phase=Pending
```
