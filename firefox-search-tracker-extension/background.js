// background.js

// Firefox uses `browser`, Chrome uses `chrome`.
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

// Pages to skip (internal browser pages, extensions, etc.)
const SKIP_PATTERNS = [
  "about:",
  "moz-extension://",
  "chrome-extension://",
  "chrome://",
  "file://",
  "localhost:4001", // Skip our own dashboard
];

// Track recently logged URLs to avoid duplicates
const recentlyLogged = new Map();
const DEBOUNCE_MS = 1500; // Don't log same URL within 1.5 seconds

// Track last URL per tab to detect actual navigation
const tabUrls = new Map();

function shouldSkipUrl(url) {
  return SKIP_PATTERNS.some((pattern) => url.includes(pattern));
}

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

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return null;
  }
}

// Normalize URL for comparison (remove hash, some tracking params)
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // Remove hash
    u.hash = "";
    // Remove common tracking params
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "fbclid", "gclid"];
    trackingParams.forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return url;
  }
}

async function sendToBackend(data) {
  try {
    console.log("Sending to backend:", data);

    await fetch("http://localhost:4001/api/log-visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    console.log("Sent to backend successfully.");
  } catch (err) {
    console.error("Failed to send to backend:", err);
  }
}

function isDuplicate(url) {
  const normalized = normalizeUrl(url);
  const lastTime = recentlyLogged.get(normalized);
  if (lastTime && Date.now() - lastTime < DEBOUNCE_MS) {
    return true;
  }
  recentlyLogged.set(normalized, Date.now());
  
  // Clean up old entries (keep map size manageable)
  if (recentlyLogged.size > 100) {
    const now = Date.now();
    for (const [key, time] of recentlyLogged.entries()) {
      if (now - time > DEBOUNCE_MS * 10) {
        recentlyLogged.delete(key);
      }
    }
  }
  
  return false;
}

function isNewNavigation(tabId, url) {
  const normalized = normalizeUrl(url);
  const lastUrl = tabUrls.get(tabId);
  
  if (lastUrl === normalized) {
    return false; // Same URL, not a new navigation
  }
  
  tabUrls.set(tabId, normalized);
  return true;
}

async function handleNavigation(details, source = "navigation") {
  // Only track main frame (not iframes)
  if (details.frameId !== 0) return;

  const url = details.url;

  // Skip internal pages and our own dashboard
  if (shouldSkipUrl(url)) return;

  // Check if this is actually a new navigation for this tab
  if (!isNewNavigation(details.tabId, url)) {
    console.log("Same URL, skipping:", url);
    return;
  }

  // Debounce duplicate URLs across tabs
  if (isDuplicate(url)) {
    console.log("Duplicate URL (debounced), skipping:", url);
    return;
  }

  console.log(`Navigation detected (${source}):`, url);

  // Try to get page title using tabs API
  try {
    const tab = await api.tabs.get(details.tabId);
    const title = tab.title || "";
    const domain = extractDomain(url);
    const query = getSearchQuery(url);

    const data = {
      url,
      title,
      domain,
      type: query ? "search" : "page_visit",
      query: query ? decodeURIComponent(query) : null,
      source: query ? "search_engine" : source,
    };

    sendToBackend(data);
  } catch (err) {
    console.error("Failed to get tab info:", err);
    
    // Still send without title
    const domain = extractDomain(url);
    const query = getSearchQuery(url);

    const data = {
      url,
      title: "",
      domain,
      type: query ? "search" : "page_visit",
      query: query ? decodeURIComponent(query) : null,
      source: query ? "search_engine" : source,
    };

    sendToBackend(data);
  }
}

// Listen to standard page loads (new tabs, link clicks, address bar navigation)
api.webNavigation.onCompleted.addListener((details) => {
  handleNavigation(details, "page_load");
});

// Listen to History API changes (single-page apps like YouTube, Twitter, etc.)
api.webNavigation.onHistoryStateUpdated.addListener((details) => {
  handleNavigation(details, "history_update");
});

// Listen to URL fragment/hash changes (some SPAs use this)
api.webNavigation.onReferenceFragmentUpdated.addListener((details) => {
  handleNavigation(details, "fragment_update");
});

// Clean up when tab is closed
api.tabs.onRemoved.addListener((tabId) => {
  tabUrls.delete(tabId);
});

console.log("Browse & Search Tracker extension loaded - tracking all navigations.");
