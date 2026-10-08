-- PostgreSQL 18 教學 schema；只在新的 lab volume 初始化。
CREATE TABLE products (
    id integer PRIMARY KEY,
    name text NOT NULL CONSTRAINT products_name_not_empty CHECK (length(trim(name)) > 0),
    price numeric(12, 2) NOT NULL CONSTRAINT products_price_nonnegative CHECK (price >= 0),
    version bigint NOT NULL DEFAULT 1 CONSTRAINT products_version_positive CHECK (version > 0)
);
COMMENT ON TABLE products IS '商品查詢的權威資料；每列代表一項商品，供 Cache-Aside 實驗使用。';
COMMENT ON COLUMN products.id IS '固定商品識別碼；本實驗由初始化資料指定。';
COMMENT ON COLUMN products.name IS '可公開顯示的商品名稱，不包含客戶個資；禁止空白名稱。';
COMMENT ON COLUMN products.price IS '商品單價，單位為新臺幣元，兩位小數；不可為負數。';
COMMENT ON COLUMN products.version IS '商品資料版本；每次修改遞增，用於觀察快取舊值，不代表跨系統交易。';

CREATE TABLE orders (
    id uuid PRIMARY KEY,
    product_id integer NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity integer NOT NULL CONSTRAINT orders_quantity_positive CHECK (quantity > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE orders IS '已成立的教學訂單；每列代表一筆商品訂單，與對應 Outbox 事件在同一本地交易建立。';
COMMENT ON COLUMN orders.id IS '應用程式產生的訂單 UUID，作為背景通知的業務冪等識別碼。';
COMMENT ON COLUMN orders.product_id IS '訂購商品的識別碼；商品仍被訂單引用時禁止刪除。';
COMMENT ON COLUMN orders.quantity IS '訂購件數，必須大於零；本案例不包含付款或庫存扣減。';
COMMENT ON COLUMN orders.created_at IS '訂單建立時間點，以 timestamptz 儲存；程式與事件輸出使用 UTC。';

CREATE TABLE outbox_messages (
    message_id uuid PRIMARY KEY,
    order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    payload jsonb NOT NULL CONSTRAINT outbox_payload_object CHECK (jsonb_typeof(payload) = 'object'),
    trace_parent text,
    occurred_at timestamptz NOT NULL,
    published_at timestamptz
);
CREATE INDEX outbox_unpublished_order ON outbox_messages (occurred_at, message_id) WHERE published_at IS NULL;
COMMENT ON TABLE outbox_messages IS '待發布的 orders.placed.v1 整合事件；每筆訂單一列，發布重試沿用同一 message_id。';
COMMENT ON COLUMN outbox_messages.message_id IS '事件 UUID；同一事件重試時保持穩定，對應 AMQP MessageId 與 Inbox 鍵。';
COMMENT ON COLUMN outbox_messages.order_id IS '產生事件的訂單識別碼；唯一約束限制本教學流程每筆訂單只有一個成立事件。';
COMMENT ON COLUMN outbox_messages.payload IS '版本 1 的 OrderPlaced JSON 契約；只含訂單與商品識別碼、件數及時間，不含個資。';
COMMENT ON COLUMN outbox_messages.trace_parent IS '建立訂單時的 W3C traceparent，供延遲發布時傳播；NULL 表示當時沒有追蹤 context，不含個資。';
COMMENT ON COLUMN outbox_messages.occurred_at IS '事件發生的 UTC 時間點；與事件內容及訂單建立時間一致。';
COMMENT ON COLUMN outbox_messages.published_at IS '收到 broker confirm 後記錄的 UTC 時間點；NULL 表示尚待發布，不代表沒有曾經送達。';
COMMENT ON INDEX outbox_unpublished_order IS '支援背景發布器按發生時間及事件 ID 批次讀取尚未確認的事件。';

CREATE TABLE inbox_messages (
    consumer_name text NOT NULL,
    message_id uuid NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer_name, message_id)
);
COMMENT ON TABLE inbox_messages IS '消費端成功處理的事件紀錄；每個邏輯 consumer 對每個事件一列，與通知結果一起提交。';
COMMENT ON COLUMN inbox_messages.consumer_name IS '穩定的邏輯消費者名稱；本實驗為 notifications-v1，不使用程序或 Pod ID。';
COMMENT ON COLUMN inbox_messages.message_id IS '已處理事件的穩定 UUID；與 consumer_name 組成去重主鍵，沒有快取 TTL。';
COMMENT ON COLUMN inbox_messages.processed_at IS '處理交易的時間點，now() 使用交易開始時間；不表示外部郵件已送達。';

CREATE TABLE notifications (
    order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
    message_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE notifications IS '模擬通知完成的持久化結果；每筆訂單最多一列，沒有實際呼叫郵件服務。';
COMMENT ON COLUMN notifications.order_id IS '通知所屬訂單；主鍵同時限制同一訂單的業務效果最多記錄一次。';
COMMENT ON COLUMN notifications.message_id IS '首次建立通知結果的事件 UUID，供診斷與 Inbox 對照；不包含個資。';
COMMENT ON COLUMN notifications.created_at IS '模擬通知交易的時間點，now() 使用交易開始時間；與對應 Inbox 紀錄在同一交易提交。';

INSERT INTO products (id, name, price) VALUES (1, 'C# 實務筆記', 100.00), (2, '分散式系統入門', 150.00);
