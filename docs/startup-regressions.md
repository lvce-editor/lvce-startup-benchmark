# Heap and first-paint changes in October 2026

The step near the chart's `0.120.3` axis label starts at **0.119.24**.
The later first-paint step starts at **0.121.4**. They have different causes.
Markers use the first affected published server versions, rather than axis ticks.

## Heap: runtime configuration

The published report's measured mean main-page heap changes from 1,207,403 bytes
in [0.119.23](https://lvce-editor.github.io/lvce-startup-benchmark/raw/0.119.23.json)
to 1,392,971 bytes in
[0.119.24](https://lvce-editor.github.io/lvce-startup-benchmark/raw/0.119.24.json).
Each has ten successful measured iterations, excluding its warmup.

[lvce-editor#15626](https://github.com/lvce-editor/lvce-editor/pull/15626),
commit `f514c31d1959182298bed7d894139c6420c1998f`, moved build-time runtime
configuration into `index.html`. The 0.119.24 package contains a roughly 7 KiB
JSON configuration with the asset directory, platform and worker URLs.
The renderer parses that configuration in `getConfiguredWorkerUrl` for several
startup lookups and again for worker initialization. Previously these production
paths were substituted into bundles during the build. Parsing and passing the
runtime configuration introduces page allocations, including worker URL strings
and objects; not all of the sampled increase remains after collection.

A repeat on Linux, Node 24.15.0, Playwright 1.61.0 / Chromium 149.0.7827.55 (build 1228), with a
fresh browser/context per iteration and workspace `/tmp`, produced these medians:

| Server | Sampled heap, bytes | Heap after forced GC, bytes |
| --- | ---: | ---: |
| 0.119.23 | 1,177,104 | 975,792 |
| 0.119.24 | 1,364,212 | 1,044,316 |
| 0.119.24, cache parsed worker configuration | 1,325,156 | 1,057,628 |

These diagnostic runs used 15 measured iterations after two warmups, sequentially.
All variants routed every request through Playwright `route.fetch`/`route.fulfill`
to keep request interception consistent. GC was requested only **after** the
normal heap and paint measurements. The cache variant changes only the renderer's
`getConfiguredWorkerUrl` implementation: reuse the last parsed object when the
configuration text is unchanged. No installed artifact was modified on disk.

Caching reduces some transient allocation but retains another 13,312 bytes after
GC. It therefore does not establish a net memory improvement and is not shipped.
The normal unmodified benchmark also reproduced the step: median sampled heap
1,192,704 → 1,369,344 bytes (12 iterations, two warmups). This is a startup footprint
change, not evidence of a growing leak. The benchmark samples the page's heap,
not an aggregate of all workers, and does not force GC in published measurements.
Historical data and the measurement method remain unchanged.

## First paint: render-blocking module

The published first-paint mean changes from 49.86 ms in
[0.121.3](https://lvce-editor.github.io/lvce-startup-benchmark/raw/0.121.3.json)
to 64.29 ms in
[0.121.4](https://lvce-editor.github.io/lvce-startup-benchmark/raw/0.121.4.json).
[lvce-editor#15818](https://github.com/lvce-editor/lvce-editor/pull/15818),
commit `03e6bb096c83a124f2bb3b02b55d07558ede25c4`, replaced the separate startup
appearance script with `blocking="render"` on the renderer module. First paint
now waits for that module, so the saved appearance can be applied before painting.
This preserves the background-flash fix introduced by
[lvce-editor#15810](https://github.com/lvce-editor/lvce-editor/pull/15810).

In the same sequential diagnostic setup, median first paint changed from 80.20 ms
(0.121.3) to 99.91 ms (0.121.4). Removing only `blocking="render"` from the served
0.121.4 HTML brought it back to 83.19 ms. The unmodified benchmark
independently reproduced the adjacent-version increase (61.25 → 89.97 ms means;
12 iterations, with one unavailable paint entry in 0.121.4 excluded).
Absolute timings vary with machine load and request interception; comparisons
use the same browser, workspace and iteration settings. The attribute experiment
isolates the additional wait. Removing it in production would discard the
flash-prevention guarantee, so this investigation keeps that behavior.

## Reproduce the unmodified comparison

```sh
npm ci
npx playwright install chromium
npm run benchmark -- --versions 0.119.23,0.119.24,0.121.3,0.121.4 \
  --iterations 12 --warmups 2 --workspace /tmp --output results/comparison
```

Use a single benchmark process at a time. Inspect non-warmup successful results
in each version's raw JSON; exclude missing paint values. For the GC experiment,
request CDP `HeapProfiler.collectGarbage` and `Runtime.getHeapUsage` after the
normal measurements. The two markers annotate heap and first paint independently;
no recovery release is claimed.
