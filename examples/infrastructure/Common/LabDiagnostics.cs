using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace DevWiki.Labs;

public static class LabDiagnostics
{
    public static readonly ActivitySource Traces = new("DevWiki.Labs");
    public static readonly Meter Metrics = new("DevWiki.Labs");
    public static readonly Counter<long> CacheHits = Metrics.CreateCounter<long>("lab.cache.hits");
    public static readonly Counter<long> CacheMisses = Metrics.CreateCounter<long>("lab.cache.misses");
    public static readonly Counter<long> CacheErrors = Metrics.CreateCounter<long>("lab.cache.errors");
    public static readonly Counter<long> Processed = Metrics.CreateCounter<long>("lab.messages.processed");
    public static readonly Counter<long> Duplicates = Metrics.CreateCounter<long>("lab.messages.duplicates");
    public static readonly Counter<long> Retried = Metrics.CreateCounter<long>("lab.messages.retried");
    public static readonly Counter<long> DeadLettered = Metrics.CreateCounter<long>("lab.messages.dead_lettered");
}
