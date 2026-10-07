await Task.Delay(1).ConfigureAwait(false);
await Task.Delay(1).ConfigureAwait(ConfigureAwaitOptions.None);
await Task.CompletedTask.ConfigureAwait(ConfigureAwaitOptions.ForceYielding);
Console.WriteLine("沒有要求回原同步內容");
Console.WriteLine((int)ConfigureAwaitOptions.ContinueOnCapturedContext);
