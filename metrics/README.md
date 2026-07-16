# Metrics

Normalized, versioned [Metrics snapshots](../CONTEXT.md), one directory per month
(`<YYYY-MM>/`), written by `contentos metrics-ingest`. The monthly review Beat reads only these
files; raw LinkedIn/Vercel exports are never committed here.

```
<YYYY-MM>/
  linkedin-posts.csv   # one row per LinkedIn post
  site.csv             # one row per site metric
```

Format, input contract, and how the review produces the LinkedIn CSV from the raw export:
[docs/agents/metrics-ingest.md](../docs/agents/metrics-ingest.md).
