// background.js

// Firefox uses `browser`, Chrome uses `chrome`.
// This makes it work in Firefox and Chromium-based browsers.
const api = typeof browser !== "undefined" ? browser : chrome;

// Known search engines + common query parameter keys
const SEARCH_HOST_PATTERNS = [
  "google.",
  "duckduckgo.",
  "bing.com",
  "yahoo.",
  "startpage.",
  "ecosia.",
];

const QUERY_PARAM_KEYS = ["q", "query", "text", "p"];

function isSearchEngineHost(hostname) {
  return SEARCH_HOST_PATTERNS.some((pattern) => hostname.includes(pattern));
}

function getSearchQuery(url) {
  try {
    const u = new URL(url);

    if (!isSearchEngineHost(u.hostname)) return null;

    for (const key of QUERY_PARAM_KEYS) {
      const value = u.searchParams.get(key);
      if (value) return value;
    }

    return null;
  } catch (e) {
    console.error("getSearchQuery: invalid URL", url, e);
    return null;
  }
}

async function sendSearchToBackend(query, url) {
  try {
    const body = {
      query,
      source: "search_engine",
      url,
    };

    console.log("Sending to backend:", body);

    await fetch("http://localhost:4000/api/log-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    console.log("Sent search to backend successfully.");
  } catch (err) {
    console.error("Failed to send search to backend:", err);
  }
}

// Listen to ALL completed navigations, then filter
api.webNavigation.onCompleted.addListener((details) => {
  const url = details.url;
  console.log("Navigation completed:", url);

  const query = getSearchQuery(url);
  if (!query) return;

  const decoded = decodeURIComponent(query);
  console.log("Detected search query:", decoded);

  sendSearchToBackend(decoded, url);
});
