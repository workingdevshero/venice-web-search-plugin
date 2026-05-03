import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createVeniceWebSearchProvider } from "./venice-web-search-provider.js";

export default definePluginEntry({
  id: "venice-web-search",
  name: "Venice AI Web Search",
  description:
    "Venice AI web search provider. Brave Search (Zero Data Retention) and Google Search via Venice's privacy-preserving infrastructure.",
  register(api) {
    api.registerWebSearchProvider(createVeniceWebSearchProvider());
  },
});
