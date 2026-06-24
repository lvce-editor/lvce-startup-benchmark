# LVCE Startup Benchmark

Benchmark startup performance for published `@lvce-editor/server` versions.

```sh
npm ci
npx playwright install chromium
npm run benchmark -- --versions latest --iterations 10 --warmups 1
npm run benchmark -- --versions 0.84.7,0.84.6 --profile
npm run benchmark -- --recent-versions 100 --iterations 10
```

The benchmark installs requested server versions as npm aliases in `.tmp/server-store`,
launches each version on a free local port, opens it with Playwright Chromium,
waits for the browser `load` event, and writes results to `results/`.
CI caches `.tmp/server-store` so repeat runs can reuse prepared server installs.

Generate the static report locally with:

```sh
npm run report -- --input results --output .tmp/pages
```

CI uploads the raw `results/` directory as an artifact. On `main` pushes, it also
publishes the generated report to GitHub Pages.

## Metrics

- Navigation timing from `performance.getEntriesByType('navigation')`
- Total loaded transfer, encoded, and decoded sizes from navigation and resource timing entries
- Wall-clock navigation time
- DOM node count
- Chrome DOM counters
- Runtime heap usage
- Chrome performance metrics
- Optional Chrome trace JSON files with `--profile`

## CLI

```sh
npm run benchmark -- [options]
```

Options:

- `--versions <csv>`: npm versions or tags of `@lvce-editor/server`
- `--recent-versions <n>`: resolve and benchmark the latest `n` published versions
- `--iterations <n>`: measured iterations per version (default: 10)
- `--warmups <n>`: warmup iterations per version
- `--timeout <ms>`: navigation and server startup timeout
- `--port-base <n>`: first port to try
- `--workspace <path>`: workspace path passed to the server
- `--url-path <path>`: URL path to visit
- `--output <dir>`: results directory
- `--profile`: record Playwright traces
- `--headed`: run Chromium headed

Node 24 or newer is required.
