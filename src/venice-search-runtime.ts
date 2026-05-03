import {
  buildSearchCacheKey,
  postTrustedWebToolsJson,
  readCachedSearchPayload,
  readConfiguredSecretString,
  readNumberParam,
  readProviderEnvValue,
  readStringParam,
  resolveSearchCacheTtlMs,
  resolveSearchTimeoutSeconds,
  resolveSiteName,
  type SearchConfigRecord,
  wrapWebContent,
  writeCachedSearchPayload,
} from "openclaw/plugin-sdk/provider-web-search";
import type { WebSearchProviderToolExecutionContext } from "openclaw/plugin-sdk/provider-web-search";

const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
const DEFAULT_RESULT_COUNT = 10;
const VENICE_MAX_RESULTS = 20;
const VENICE_QUERY_MAX_LENGTH = 400;

type VeniceSearchProvider = "brave" | "google";

type VeniceSearchResult = {
  title: string;
  url: string;
  content: string;
  date?: string;
};

type VeniceSearchResponse = {
  query: string;
  results: VeniceSearchResult[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampVeniceCount(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(VENICE_MAX_RESULTS, Math.floor(parsed)));
}

function resolveVeniceProviderChoice(
  argProvider: string | undefined,
  searchConfig: Record<string, unknown> | undefined,
): VeniceSearchProvider {
  const fromArg = argProvider?.toLowerCase();
  if (fromArg === "brave" || fromArg === "google") {
    return fromArg;
  }
  const scoped = isRecord(searchConfig?.["venice-search"])
    ? (searchConfig["venice-search"] as Record<string, unknown>)
    : undefined;
  const fromConfig =
    typeof scoped?.searchProvider === "string"
      ? scoped.searchProvider.toLowerCase()
      : undefined;
  if (fromConfig === "brave" || fromConfig === "google") {
    return fromConfig;
  }
  return "brave";
}

function resolveVeniceBaseUrl(searchConfig: Record<string, unknown> | undefined): string {
  const scoped = isRecord(searchConfig?.["venice-search"])
    ? (searchConfig["venice-search"] as Record<string, unknown>)
    : undefined;
  const raw = scoped?.baseUrl;
  const resolved = readConfiguredSecretString(
    raw,
    "plugins.entries.venice-web-search.config.webSearch.baseUrl",
  );
  if (!resolved) {
    return DEFAULT_BASE_URL;
  }
  return resolved.replace(/\/+$/, "");
}

function resolveVeniceApiKey(searchConfig: Record<string, unknown> | undefined): string | undefined {
  const topLevel = readConfiguredSecretString(
    searchConfig?.apiKey,
    "tools.web.search.apiKey",
  );
  if (topLevel) {
    return topLevel;
  }
  const scoped = isRecord(searchConfig?.["venice-search"])
    ? (searchConfig["venice-search"] as Record<string, unknown>)
    : undefined;
  const scopedKey = readConfiguredSecretString(
    scoped?.apiKey,
    "plugins.entries.venice-web-search.config.webSearch.apiKey",
  );
  if (scopedKey) {
    return scopedKey;
  }
  return readProviderEnvValue(["VENICE_API_KEY"]);
}

export async function executeVeniceSearch(
  args: Record<string, unknown>,
  searchConfig: SearchConfigRecord | undefined,
  execContext?: WebSearchProviderToolExecutionContext,
): Promise<Record<string, unknown>> {
  const rawQuery = readStringParam(args, "query", { required: true });
  const query = rawQuery.trim();
  if (!query) {
    throw new Error("Venice search requires a non-empty query.");
  }
  if (query.length > VENICE_QUERY_MAX_LENGTH) {
    throw new Error(
      `Venice search query must be ${VENICE_QUERY_MAX_LENGTH} characters or fewer (got ${query.length}).`,
    );
  }

  const apiKey = resolveVeniceApiKey(searchConfig);
  if (!apiKey) {
    throw new Error(
      "Venice API key not configured. Set VENICE_API_KEY or plugins.entries.venice-web-search.config.webSearch.apiKey.",
    );
  }

  const count = clampVeniceCount(readNumberParam(args, "count"), DEFAULT_RESULT_COUNT);
  const provider = resolveVeniceProviderChoice(readStringParam(args, "search_provider"), searchConfig);
  const baseUrl = resolveVeniceBaseUrl(searchConfig);
  const timeoutSeconds = resolveSearchTimeoutSeconds(searchConfig);
  const cacheTtlMs = resolveSearchCacheTtlMs(searchConfig);

  const cacheKey = buildSearchCacheKey(["venice-search", provider, query, count, baseUrl]);
  const cached = readCachedSearchPayload(cacheKey);
  if (cached) {
    return cached;
  }

  const startedAt = Date.now();
  const data = await postTrustedWebToolsJson<VeniceSearchResponse>(
    {
      url: `${baseUrl}/augment/search`,
      apiKey,
      timeoutSeconds,
      signal: execContext?.signal,
      errorLabel: "Venice Search",
      body: {
        query,
        limit: count,
        search_provider: provider,
      },
    },
    async (response) => (await response.json()) as VeniceSearchResponse,
  );

  const results = Array.isArray(data?.results) ? data.results : [];
  const payload: Record<string, unknown> = {
    query: typeof data?.query === "string" ? data.query : query,
    provider: "venice-search",
    searchBackend: provider,
    count: results.length,
    tookMs: Date.now() - startedAt,
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: "venice-search",
      wrapped: true,
    },
    results: results.map((result) => ({
      title: result?.title ? wrapWebContent(String(result.title), "web_search") : "",
      url: typeof result?.url === "string" ? result.url : "",
      snippet: result?.content
        ? wrapWebContent(String(result.content), "web_search")
        : "",
      date: typeof result?.date === "string" && result.date ? result.date : undefined,
      siteName: resolveSiteName(typeof result?.url === "string" ? result.url : undefined),
    })),
  };

  writeCachedSearchPayload(cacheKey, payload, cacheTtlMs);
  return payload;
}
