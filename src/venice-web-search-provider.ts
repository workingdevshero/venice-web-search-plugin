import type {
  SearchConfigRecord,
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
} from "openclaw/plugin-sdk/provider-web-search";
import {
  mergeScopedSearchConfig,
  resolveProviderWebSearchPluginConfig,
} from "openclaw/plugin-sdk/provider-web-search";
import { createWebSearchProviderContractFields } from "openclaw/plugin-sdk/provider-web-search-contract";

export const VENICE_PROVIDER_ID = "venice-search";
export const VENICE_PLUGIN_ID = "venice-web-search";
export const VENICE_CREDENTIAL_PATH = `plugins.entries.${VENICE_PLUGIN_ID}.config.webSearch.apiKey`;

type VeniceRuntime = typeof import("./venice-search-runtime.js");
let veniceRuntimePromise: Promise<VeniceRuntime> | undefined;
function loadVeniceRuntime(): Promise<VeniceRuntime> {
  veniceRuntimePromise ??= import("./venice-search-runtime.js");
  return veniceRuntimePromise;
}

const VeniceSearchSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Search query string (1-400 characters).",
    },
    count: {
      type: "number",
      description: "Number of results to return (1-20). Defaults to 10.",
      minimum: 1,
      maximum: 20,
    },
    search_provider: {
      type: "string",
      enum: ["brave", "google"],
      description:
        "Which search backend Venice should use. 'brave' uses Brave Search with Zero Data Retention; 'google' uses Google Search via Venice's anonymizing proxy. Falls back to the value configured in plugin settings (default: brave).",
    },
  },
  required: ["query"],
} satisfies Record<string, unknown>;

function createVeniceToolDefinition(
  searchConfig?: SearchConfigRecord,
): WebSearchProviderToolDefinition {
  return {
    description:
      "Search the web using Venice AI. Routes to Brave Search (Zero Data Retention) or Google Search via Venice's privacy-preserving infrastructure. Returns titles, URLs, content snippets, and dates.",
    parameters: VeniceSearchSchema,
    execute: async (args, context) => {
      const { executeVeniceSearch } = await loadVeniceRuntime();
      return await executeVeniceSearch(args, searchConfig, context);
    },
  };
}

export function createVeniceWebSearchProvider(): WebSearchProviderPlugin {
  return {
    id: VENICE_PROVIDER_ID,
    label: "Venice AI Search",
    hint: "Brave (ZDR) or Google search via Venice's privacy infrastructure",
    onboardingScopes: ["text-inference"],
    requiresCredential: true,
    credentialLabel: "Venice API Key",
    credentialNote:
      "Create a Venice API key at https://venice.ai/settings/api. The same key works for Venice model inference.",
    envVars: ["VENICE_API_KEY"],
    placeholder: "vn_...",
    signupUrl: "https://venice.ai/settings/api",
    docsUrl: "https://docs.venice.ai/api-reference/endpoint/augment/search",
    autoDetectOrder: 50,
    credentialPath: VENICE_CREDENTIAL_PATH,
    ...createWebSearchProviderContractFields({
      credentialPath: VENICE_CREDENTIAL_PATH,
      searchCredential: { type: "scoped", scopeId: VENICE_PROVIDER_ID },
      configuredCredential: { pluginId: VENICE_PLUGIN_ID },
      selectionPluginId: VENICE_PLUGIN_ID,
    }),
    createTool: (ctx) => createVeniceToolDefinition(
      mergeScopedSearchConfig(
        ctx.searchConfig,
        VENICE_PROVIDER_ID,
        resolveProviderWebSearchPluginConfig(ctx.config, VENICE_PLUGIN_ID),
        { mirrorApiKeyToTopLevel: true },
      ),
    ),
  };
}
