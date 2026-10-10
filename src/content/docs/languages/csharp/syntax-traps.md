---
title: "C# 後端語法與關鍵陷阱速查"
description: "直擊電商後端常見的浮點數金額精度災難、null 寬容運算子虛假安全，以及模式比對最佳實務。"
articleId: "csharp-syntax-traps"
topic: "csharp"
category: "syntax-runtime"
order: 1
tags: ["C#", "語法陷阱", "decimal", "Nullable", "Pattern Matching", "後端實務"]
articleType: "reference"
prerequisites: []
relatedArticles: ["csharp-value-reference-types", "csharp-cancellation-disposable"]
applicableVersions: "C# 12+ / 14、.NET 8+ / .NET 10"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "涉及金額與計費一律嚴格使用 decimal；避免使用 ! 壓制編譯器警告；領域狀態判斷優先採用 Pattern Matching。"
sources:
  - title: "Microsoft Learn：C# 浮點數型別"
    url: "https://learn.microsoft.com/zh-tw/dotnet/csharp/language-reference/builtin-types/floating-point-numeric-types"
  - title: "Microsoft Learn：可為 Null 的參考型別"
    url: "https://learn.microsoft.com/zh-tw/dotnet/csharp/nullable-references"
---

## 案發現場

每月結算對帳時，財務系統頻繁出現幾分錢的神秘差額；線上訂單微服務在尖峰時刻莫名拋出 `NullReferenceException` 導致結帳失敗；明明程式碼編譯時完全沒有任何警告，為什麼跑在生產環境卻處處踩雷？

這正是誤用 `double` 處理金額、以及濫用 `!` 運算子「掩耳盜鈴」壓制 null 警告所引發的典型後端事故。

## 致命反模式 vs. 正確解法

### 坑一：使用 float/double 計算金額（精度遺失災難）

二進位浮點數（`float` / `double`）無法精確表示大部分十進位小數（如 0.1）。累積計算後會產生不可預期的微小誤差。

```csharp
// 💣 Bad：使用 double 計算促銷折價，產生 0.0000000000000001 誤差
double price = 0.1 + 0.2; // 結果為 0.30000000000000004
```

~~~csharp title="Program.cs"
// ✅ Good：金額、庫存、稅率一律強制使用 128 位元十進位 decimal
decimal unitPrice = 99.99m;
int quantity = 3;
decimal total = unitPrice * quantity;
Console.WriteLine($"金額計算精確: {total}");

// 模式比對（Pattern Matching）安全評估狀態
OrderStatus status = OrderStatus.Paid;
string result = status switch
{
    OrderStatus.Paid => "可出貨",
    OrderStatus.Pending => "等待付款",
    OrderStatus.Cancelled or OrderStatus.Refunded => "已終止",
    _ => "未知狀態"
};
Console.WriteLine($"訂單狀態: {result}");

enum OrderStatus { Pending, Paid, Cancelled, Refunded }
~~~

預期輸出：
```text
金額計算精確: 299.97
訂單狀態: 可出貨
```

### 坑二：使用 !（Null-forgiving）假裝安全

在啟動 Nullable 檢查的專案中，開發者常因厭煩警告而隨手加上 `!`，欺騙編譯器：

```csharp
// 💣 Bad：欺騙編譯器，執行期如果為 null 依然噴出 NullReferenceException
string name = dto.User!.Profile!.Nickname!;

// ✅ Good：善用 Null-conditional 或 Pattern Matching 進行防禦
if (dto.User?.Profile?.Nickname is { Length: > 0 } nickname)
{
    ProcessUser(nickname);
}
```

## 踩坑與避坑指南

* **字串拼接陷阱**：在迴圈中頻繁使用 `+` 或字串插值會引發大量字串分配。若拼接超過 4 個片段或在迴圈中進行，應改用 `StringBuilder` 或 `DefaultInterpolatedStringHandler`。
* **Record 與 DTO 選擇**：不可變資料載體優先選用 `record`（內建值比對相等性與 `with` 表達式）；但在 EF Core 實體映射中需謹慎，避免非預期的變更追蹤行為。
* **避坑原則（什麼時候不要用 Pattern Matching？）**：
  * 當比對邏輯涉及大量跨實體的遠端 I/O 查詢時，不應硬塞進 switch 表達式中，會嚴重破壞可讀性與偵錯中斷點設置。

## 線上排查指令

線上若懷疑發生金額精度異常或溢位：

```bash
# 檢查生產環境日誌中是否有未捕捉的 NRE 或溢位例外
grep -E "NullReferenceException|OverflowException" /var/log/app/*.log | tail -n 20

# 透過 dotnet-counters 檢視程式是否因大量字串暫存物件引發 Gen 0 GC 暴增
dotnet-counters monitor System.Runtime --counters gc-count,alloc-rate
```
