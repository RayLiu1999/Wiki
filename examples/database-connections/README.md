# C# 資料庫連線設計範例

此範例以 .NET 10、MySqlConnector 2.5.0 與 Npgsql 10.0.3 示範穩定 DataSource、短期借還連線、參數化查詢與取消。兩個 driver 的設定各自管理，不表示電商必須同時寫入兩種資料庫。

預設／`--validate` 只建構設定與 DataSource，不建立資料庫連線。`--probe mysql` 或 `--probe postgresql` 才從指定的環境變數取得連線資訊，對使用者的測試資料庫執行 `SELECT 1`。程式強制驗證 TLS 主機名稱與憑證，需事先準備相符環境和信任鏈；這不是既有 Compose 的啟動範例。

連線池 20、開啟逾時 5 秒、命令逾時 3 秒為教學數值，沒有高併發保證。MySQL 取消等待為 2 秒，Npgsql 為 2000 毫秒。Price query 方法需要已存在且相容的 `products(id, price)`，目前僅編譯，未執行資料查詢或 schema 變更。

下載、執行方式與負載驗證規劃見網站 `/practice/ecommerce/database-validation/`。本目錄不產生大批資料、不執行 migration，也沒有上億筆壓測結果。
