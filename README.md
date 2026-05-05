# @workingdevshero/venice-web-search-plugin

OpenClaw native plugin that registers a `venice-search` web search provider
backed by [Venice AI's `/augment/search`](https://docs.venice.ai/api-reference/endpoint/augment/search)
endpoint. Routes web searches through either Brave Search (Zero Data Retention)
or Google Search via Venice's privacy-preserving infrastructure.

## What it does

- Adds Venice as a selectable provider for the OpenClaw `web_search` tool
  (`tools.web.search.provider = "venice-search"`)
- Sends queries to `POST https://api.venice.ai/api/v1/augment/search` with
  `query`, `limit`, and `search_provider` as documented in the Venice spec
- Wraps results with `wrapWebContent` so the LLM sees them flagged as
  untrusted external content
- Caches identical queries through the standard plugin-SDK search cache
- Uses `postTrustedWebToolsJson` for SSRF-safe Bearer-auth POSTs with timeouts
  and the OpenClaw cancellation `AbortSignal`

## Requirements

- `openclaw >= 2026.5.4`
- A Venice API key — create one at <https://venice.ai/settings/api>

## Install

From ClawHub (recommended):

```bash
openclaw plugins install clawhub:@workingdevshero/venice-web-search-plugin
openclaw plugins enable venice-web-search
openclaw gateway restart
```

From npm:

```bash
openclaw plugins install npm:@workingdevshero/venice-web-search-plugin
openclaw plugins enable venice-web-search
openclaw gateway restart
```

From a local checkout (for development):

```bash
git clone https://github.com/workingdevshero/venice-web-search-plugin
cd venice-web-search-plugin
npm install
npm run build
openclaw plugins install ./
openclaw plugins enable venice-web-search
openclaw gateway restart
```

Verify the plugin loaded and registered the provider:

```bash
openclaw plugins inspect venice-web-search --runtime --json
```

## Configure

Set the API key:

```bash
openclaw config set plugins.entries.venice-web-search.config.webSearch.apiKey "vn_your_key_here"
```

Select Venice as the active web search provider:

```bash
openclaw config set tools.web.search.provider venice-search
```

Optional config:

| Path                                                                          | Type             | Default                          | Description                                                  |
| ----------------------------------------------------------------------------- | ---------------- | -------------------------------- | ------------------------------------------------------------ |
| `plugins.entries.venice-web-search.config.webSearch.apiKey`                  | string \| secret | (env `VENICE_API_KEY`)           | Venice API key                                               |
| `plugins.entries.venice-web-search.config.webSearch.searchProvider`          | `"brave"` \| `"google"` | `"brave"`                | Default search backend Venice uses                           |
| `plugins.entries.venice-web-search.config.webSearch.baseUrl`                 | string           | `https://api.venice.ai/api/v1`   | Override for trusted Venice-compatible proxies              |

The plugin also reads `tools.web.search.timeoutSeconds` and
`tools.web.search.cacheTtlMinutes` if you've set them globally.

## Tool arguments

When the agent calls `web_search`, the following args are accepted:

| Arg               | Type                       | Range / Values    | Description                                                  |
| ----------------- | -------------------------- | ----------------- | ------------------------------------------------------------ |
| `query`           | string (required)          | 1–400 chars       | The search query                                             |
| `count`           | number                     | 1–20, default 10  | Number of results                                            |
| `search_provider` | `"brave"` \| `"google"`    | —                 | Override the configured backend for a single call            |

## Credential resolution order

1. `tools.web.search.apiKey` (top-level search config)
2. `plugins.entries.venice-web-search.config.webSearch.apiKey`
3. `VENICE_API_KEY` environment variable

Note: the same key works for the bundled Venice model provider, so if you
already use Venice for inference you don't need a separate one.

## Errors

The plugin surfaces Venice's HTTP errors with the response body included:

| Status | Meaning                                                                                  |
| ------ | ---------------------------------------------------------------------------------------- |
| 400    | Invalid request parameters                                                               |
| 401    | Authentication failed — bad or missing API key                                           |
| 402    | Insufficient balance — top up at <https://venice.ai/settings/billing>                    |
| 403    | Unauthorized                                                                             |
| 429    | Rate limit exceeded                                                                      |
| 500    | Venice-side error                                                                        |

## Build

```bash
npm install
npm run build
```

This emits `dist/index.js`, `dist/venice-web-search-provider.js`, and
`dist/venice-search-runtime.js` plus declaration files.
`openclaw.extensions` points at `./src/index.ts` and `runtimeExtensions`
points at `./dist/index.js`, so OpenClaw uses the compiled output at runtime.

## License

MIT
