# Main-thread task duration increases in October 2026

The first affected available server packages are **0.124.19** and **0.125.10**.
Both steps coincide with moving more worker creation into the page's early
startup path. Changing only the HTML `preloadWorkers` configuration in the same
published packages reduces the measured task duration. This is evidence for the
preload contribution, rather than evidence of slower application JavaScript.

No runtime fix or recovery release is claimed. Reverting the preload policy is
a diagnostic intervention; it also reverses intentional early worker startup.

## Release boundaries

The [published raw results](https://lvce-editor.github.io/lvce-startup-benchmark/)
snapshot retrieved on October 27, 2026 shows these adjacent available packages
(ten successful measured samples each):

| Before | Mean task duration | After | Mean task duration |
| --- | ---: | --- | ---: |
| [0.124.17](https://lvce-editor.github.io/lvce-startup-benchmark/raw/0.124.17.json) | 40.33 ms | [0.124.19](https://lvce-editor.github.io/lvce-startup-benchmark/raw/0.124.19.json) | 55.96 ms |
| [0.125.9](https://lvce-editor.github.io/lvce-startup-benchmark/raw/0.125.9.json) | 59.14 ms | [0.125.10](https://lvce-editor.github.io/lvce-startup-benchmark/raw/0.125.10.json) | 97.46 ms |

Version 0.124.18 is absent from the report and unavailable in the npm registry
(`ETARGET` on October 27, 2026). Its source tag predates the preload configuration
change in 0.124.19. Axis labels such as 0.125.3 are not regression boundaries.

[lvce-editor#16173](https://github.com/lvce-editor/lvce-editor/pull/16173),
commit `1a16184f9ba3`, shipped configurable early worker creation in 0.124.19,
using renderer-process 30.76.0 and
[renderer-process#955](https://github.com/lvce-editor/renderer-process/pull/955).
The page starts extension-management and file-system workers early, in addition
to the existing renderer, editor and syntax workers.

[lvce-editor#16189](https://github.com/lvce-editor/lvce-editor/pull/16189),
commit `e1c3d41a8168`, expands the configured preload list from five to nine workers
in 0.125.10: activity bar, main area, status bar and icon theme are added.
[renderer-process#959](https://github.com/lvce-editor/renderer-process/pull/959)
provides their early creation path. Other commits shipped in these intervals;
the configuration-only experiment below separates the preload contribution.

## Reproduction without profiling

Linux, Node 24.15.0, Playwright 1.61.0 / Chromium 149.0.7827.55 (build 1228),
workspace `/tmp`, fresh browser/context per sample, sequential versions,
ten measured samples after two warmups:

```sh
npm ci
npx playwright install chromium
npm run benchmark -- --versions 0.124.17,0.124.19,0.125.9,0.125.10 \
  --iterations 10 --warmups 2 --workspace /tmp --output results/task-comparison
```

| Server | Task mean | Task median | Script mean | Load mean |
| --- | ---: | ---: | ---: | ---: |
| 0.124.17 | 42.75 ms | 42.15 ms | 4.70 ms | 92.17 ms |
| 0.124.19 | 54.22 ms | 55.23 ms | 5.73 ms | 94.47 ms |
| 0.125.9 | 55.62 ms | 54.93 ms | 5.03 ms | 97.09 ms |
| 0.125.10 | 66.23 ms | 69.28 ms | 5.11 ms | 94.93 ms |

All 40 measured samples succeeded. Both task-duration steps reproduce, but the
later step is smaller than in the profiled published report. The difference
between `TaskDuration` and `ScriptDuration` must not be described as extra
JavaScript execution. Absolute timings depend on machine load and profiling.

## Controlled preload reduction

In a separate diagnostic harness, intercept only the document request using
Playwright `route.fetch` / `route.fulfill`. The control fulfils the unchanged
response. The variant changes only the JSON `preloadWorkers` array to
`["rendererWorker", "editorWorker", "syntaxHighlightingWorker"]`. Worker URLs,
bundles, render-blocking attributes and all other configuration stay unchanged.
The installed packages are never patched on disk. Use the same normal measurement
sequence, browser and workspace for all variants, without profiling, with twelve
measured samples after two warmups:

| Server | Control mean / median | Original three preloads mean / median |
| --- | ---: | ---: |
| 0.124.19 | 42.94 / 42.76 ms | 38.95 / 36.95 ms |
| 0.125.10 | 58.04 / 58.22 ms | 39.63 / 40.66 ms |

All 48 measured samples succeeded. Keeping the earlier five-worker list on
0.125.10 gives a 43.20 ms median (twelve successful measured samples). This
isolates an additional contribution from the four application worker preloads.
Request interception changes timing, so compare each intervention against its
intercepted control, not against the unmodified run's absolute numbers.
The first step's controlled reduction is smaller than its adjacent-version
increase; these measurements do not establish that preloading explains every
millisecond of that increase.

## Measurement window and traces

`measureStartup` stops the optional trace immediately after `load`. It then reads
navigation timing, DOM nodes, resource sizes, DOM counters and heap usage, awaits
paint timing collection, and finally samples `Performance.getMetrics`.
Consequently `TaskDuration` includes page work during these probes, after the
trace has ended. The asynchronous paint probe yields through an animation frame
and a timer. Worker initialization and page messages can progress in this window.

Separate profiling runs show module evaluation and browser loading/initialization
work, but a load-bounded trace cannot account for the entire later task-duration
sample. Three profiled samples per version gave task means 49.68, 53.63, 60.11 and
82.40 ms respectively; the last mean has only two successes because the historical
server exited before the third navigation (`ERR_CONNECTION_REFUSED`). It is not
used as the primary distribution. Profiling also changes the amount of worker
loading completed before resource and performance sampling; traced and untraced
results must remain separate.

## Historical package limitation

A longer profiled diagnostic run reproduced the server exit and captured its
stderr: `MODULE_NOT_FOUND` for
`node_modules/shared-process/src/sharedProcessMain.js`. The installed server
resolves a sibling `../../shared-process` path, while npm installs the dependency
as `@lvce-editor/shared-process`. The log ends with
`[server] shared process disconnected`. A 500 ms teardown grace after all metrics
does not prevent it. This is a packaging limitation encountered when startup
progresses far enough to request the shared process, not evidence that the
preload experiment breaks worker initialization. A successful navigation sample
therefore does not establish editor usability for these historical packages.

To finish the profiling comparison despite that exit, a separate diagnostic
starts a fresh server before **every** sample for both policies. It uses the same
metric collection, profiling enabled, ten measured samples after two warmups,
and a 500 ms teardown grace **after** all metrics have been read:

| Server | Preload policy | Task mean / median | Task range | Page workers at sample |
| --- | --- | ---: | ---: | ---: |
| 0.124.19 | Control | 51.28 / 52.76 ms | 41.02–61.74 ms | 5 |
| 0.124.19 | Original three | 55.42 / 47.07 ms | 36.62–138.31 ms | 3 |
| 0.125.10 | Control | 80.39 / 76.94 ms | 57.14–114.84 ms | 9 |
| 0.125.10 | Original three | 61.65 / 48.50 ms | 34.38–135.55 ms | 3 |

All 40 measured navigation samples succeeded. The larger step's reduction repeats
under profiling. The smaller first-step effect is noisy: its median decreases,
but its mean increases because of a slow sample. These results support a preload
contribution, particularly to the later increase, without establishing a complete
explanation or a stable production performance win. They use a different server
lifecycle from the published run and must remain a separate comparison.

## Outcome and remaining question

Restoring the smaller preload list lowers this metric on the same artifacts,
but removes an intentional startup policy. Delaying workers or sampling earlier
could also lower the chart without reducing work needed to make the editor usable.
Neither is established here as a safe production improvement. The startup
appearance and worker behavior therefore remain unchanged, as do historical
results and the benchmark's measurement method.

The next discriminating experiment is a paired comparison of total page CPU and
worker initialization through the **same editor-ready milestone**, including
opening a file, with the nine-worker and smaller preload policies. Extend a
separate diagnostic trace through the existing final metrics sample and that
milestone. This would distinguish worthwhile parallel startup from work merely
moved into this measurement window, before choosing a production preload change.
