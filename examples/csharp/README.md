# C# 可執行範例

每個 .cs 檔案對應一篇文章的第一個 C# 程式碼區塊。執行全部範例時，會先確認檔案與文章完全一致，再核對 expected.json 的輸出。

~~~sh
pnpm test:examples
~~~

也可以單獨執行：

~~~sh
dotnet run --project examples/csharp/Example.csproj -p:ExampleName=async-await
~~~

Example.csproj 只編譯 ExampleName 指定的檔案，避免多個頂層程式混在同一個專案。所有範例都不需要第三方 NuGet 套件，也不呼叫外部服務。
