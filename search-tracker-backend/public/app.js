// DOM Elements
const visitsContainer = document.getElementById("visitsContainer");
const languageFilter = document.getElementById("languageFilter");
const domainFilter = document.getElementById("domainFilter");
const refreshBtn = document.getElementById("refreshBtn");
const tabButtons = document.querySelectorAll(".tab-btn");
const aiStatusEl = document.getElementById("aiStatus");
const insightsPanel = document.getElementById("insightsPanel");
const insightsContent = document.getElementById("insightsContent");
const refreshInsightsBtn = document.getElementById("refreshInsights");

// Stats elements
const totalVisitsEl = document.getElementById("totalVisits");
const totalSearchesEl = document.getElementById("totalSearches");
const totalPagesEl = document.getElementById("totalPages");

// State
let allVisits = [];
let currentTab = "all";
let aiEnabled = false;
let cachedInsights = null;

// === API Functions ===
async function fetchRecentVisits() {
  const res = await fetch("/api/recent-visits?limit=100");
  if (!res.ok) {
    console.error("Failed to fetch recent visits");
    return [];
  }
  return res.json();
}

async function fetchStats() {
  const res = await fetch("/api/visit-stats");
  if (!res.ok) {
    console.error("Failed to fetch stats");
    return null;
  }
  return res.json();
}

async function fetchAIStatus() {
  try {
    const res = await fetch("/api/ai-status");
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchInsights() {
  try {
    const res = await fetch("/api/insights");
    if (!res.ok) {
      const data = await res.json();
      return { error: data.error || "Failed to fetch insights" };
    }
    return res.json();
  } catch (error) {
    return { error: "Failed to connect to API" };
  }
}

// === Helper Functions ===
function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function truncate(str, maxLen) {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}

function getFaviconUrl(domain) {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

// === Render Functions ===
function renderAIStatus(status) {
  if (!status) {
    aiStatusEl.innerHTML = "";
    return;
  }

  aiEnabled = status.enabled;

  if (status.enabled) {
    aiStatusEl.innerHTML = `
      <div class="ai-badge enabled">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path></svg>
        🤖 AI Powered (${status.model})
      </div>
    `;
  } else {
    aiStatusEl.innerHTML = `
      <div class="ai-badge disabled">
        ⚠️ AI Disabled - Add GEMINI_API_KEY to .env
      </div>
    `;
  }
}

function renderStats(stats) {
  if (!stats) return;
  
  totalVisitsEl.textContent = stats.total_visits || 0;
  totalSearchesEl.textContent = stats.total_searches || 0;
  totalPagesEl.textContent = stats.total_page_visits || 0;

  // Populate domain filter
  if (stats.top_domains && stats.top_domains.length) {
    domainFilter.innerHTML = '<option value="">All Domains</option>';
    stats.top_domains.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.domain;
      opt.textContent = `${d.domain} (${d.count})`;
      domainFilter.appendChild(opt);
    });
  }
}

function renderInsights(data) {
  if (!data) {
    insightsContent.innerHTML = '<p class="loading">Loading insights...</p>';
    return;
  }

  if (data.error) {
    insightsContent.innerHTML = `
      <div class="insights-error">
        <p>⚠️ ${data.error}</p>
        ${data.message ? `<p class="hint">${data.message}</p>` : ""}
      </div>
    `;
    return;
  }

  if (!data.insights) {
    insightsContent.innerHTML = '<p>Not enough data yet. Keep browsing!</p>';
    return;
  }

  const insights = data.insights;
  
  let html = '<div class="insights-grid">';

  if (insights.topics && insights.topics.length) {
    html += `
      <div class="insight-card">
        <h4>📚 Topics You're Exploring</h4>
        <div class="insight-tags">
          ${insights.topics.map(t => `<span class="tag">${t}</span>`).join("")}
        </div>
      </div>
    `;
  }

  if (insights.skills && insights.skills.length) {
    html += `
      <div class="insight-card">
        <h4>💪 Skills Being Developed</h4>
        <div class="insight-tags">
          ${insights.skills.map(s => `<span class="tag skill">${s}</span>`).join("")}
        </div>
      </div>
    `;
  }

  if (insights.learning_style) {
    html += `
      <div class="insight-card">
        <h4>🎯 Learning Style</h4>
        <p>${insights.learning_style}</p>
      </div>
    `;
  }

  if (insights.learning_path) {
    html += `
      <div class="insight-card">
        <h4>🛤️ Suggested Learning Path</h4>
        <p>${insights.learning_path}</p>
      </div>
    `;
  }

  if (insights.suggestions && insights.suggestions.length) {
    html += `
      <div class="insight-card">
        <h4>💡 Actionable Suggestions</h4>
        <ul>
          ${insights.suggestions.map(s => `<li>${s}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  // New: Repo Analysis with summaries
  if (insights.repo_analysis && insights.repo_analysis.length) {
    html += `
      <div class="insight-card full-width">
        <h4>🤖 AI Repo Analysis</h4>
        <p class="section-desc">Based on your browsing patterns, here are the most relevant repositories:</p>
        <div class="repo-analysis-list">
          ${insights.repo_analysis.map(repo => `
            <div class="repo-analysis-card">
              <div class="repo-analysis-header">
                <a href="${repo.url}" target="_blank" rel="noopener noreferrer" class="repo-analysis-name">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                  ${repo.name}
                </a>
                <div class="repo-analysis-meta">
                  <span class="stars">⭐ ${repo.stars?.toLocaleString() || 0}</span>
                  ${repo.language ? `<span class="lang">${repo.language}</span>` : ""}
                </div>
              </div>
              <p class="repo-summary">${repo.summary || "No summary available"}</p>
              ${repo.relevance ? `<p class="repo-relevance"><strong>Why it's relevant:</strong> ${repo.relevance}</p>` : ""}
              <a href="${repo.url}" target="_blank" rel="noopener noreferrer" class="repo-link-btn">
                View on GitHub →
              </a>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  // Legacy: recommended_repos fallback
  if (!insights.repo_analysis && insights.recommended_repos && insights.recommended_repos.length) {
    html += `
      <div class="insight-card full-width">
        <h4>🐙 Recommended Repos to Explore</h4>
        <div class="insight-tags">
          ${insights.recommended_repos.map(r => `
            <a href="https://github.com/search?q=${encodeURIComponent(r)}&type=repositories" 
               target="_blank" rel="noopener noreferrer" class="tag repo">${r}</a>
          `).join("")}
        </div>
      </div>
    `;
  }

  html += '</div>';
  
  // Stats footer
  let footer = [];
  if (data.visit_count) footer.push(`${data.visit_count} visits analyzed`);
  if (data.repo_count) footer.push(`${data.repo_count} repos discovered`);
  if (data.generated_at) footer.push(`Generated ${formatDate(data.generated_at)}`);
  
  if (footer.length) {
    html += `<p class="insights-footer">${footer.join(" • ")}</p>`;
  }

  insightsContent.innerHTML = html;
}

function renderReposList(repos, lang) {
  if (!repos || repos.length === 0) return "";

  const filteredRepos = repos.filter((r) => {
    if (!lang) return true;
    return (r.language || "").toLowerCase() === lang.toLowerCase();
  });

  if (filteredRepos.length === 0) {
    return `<div class="repos-section"><p class="no-repos">No repos match the selected language filter.</p></div>`;
  }

  // Check if any repo has AI summary
  const hasAISummaries = filteredRepos.some(r => r.ai_summary);

  const repoItems = filteredRepos.map((repo) => {
    const starIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color: #eab308;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    
    // If repo has AI summary, show expanded card
    if (repo.ai_summary) {
      return `
        <div class="repo-card-expanded">
          <div class="repo-card-header">
            <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer" class="repo-card-name">
              ${repo.full_name}
            </a>
            <span class="repo-card-meta">
              ${starIcon} ${(repo.stargazers_count || 0).toLocaleString()}
              ${repo.language ? `<span class="repo-lang">${repo.language}</span>` : ""}
            </span>
          </div>
          <p class="repo-card-summary">🤖 ${repo.ai_summary}</p>
          <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer" class="repo-card-link">
            View on GitHub →
          </a>
        </div>
      `;
    }

    // Standard chip for repos without AI summary
    return `
      <div class="repo-chip">
        <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer">
          <span class="repo-chip-name">${repo.full_name}</span>
          <span class="repo-chip-meta">
            ${starIcon} ${repo.stargazers_count || 0}
            ${repo.language ? `<span class="repo-lang">${repo.language}</span>` : ""}
          </span>
        </a>
      </div>
    `;
  }).join("");

  return `
    <div class="repos-section">
      <div class="repos-header">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
        ${hasAISummaries ? "🤖 AI-Analyzed Repos" : (aiEnabled ? "AI-Suggested Repos" : "Recommended Repos")}
      </div>
      <div class="${hasAISummaries ? 'repos-cards' : 'repos-grid'}">
        ${repoItems}
      </div>
    </div>
  `;
}

function renderVisits(visits) {
  const selectedDomain = domainFilter.value;
  const selectedLang = languageFilter.value;

  // Filter visits
  let filtered = visits;

  // Filter by tab
  if (currentTab !== "all" && currentTab !== "insights") {
    filtered = filtered.filter((v) => v.type === currentTab);
  }

  // Filter by domain
  if (selectedDomain) {
    filtered = filtered.filter((v) => v.domain === selectedDomain);
  }

  visitsContainer.innerHTML = "";

  if (!filtered.length) {
    visitsContainer.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p>No activity tracked yet. Start browsing!</p>
      </div>
    `;
    return;
  }

  for (const visit of filtered) {
    const card = document.createElement("div");
    card.className = `visit-card ${visit.type}`;

    const isSearch = visit.type === "search";
    const icon = isSearch
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

    const favicon = visit.domain
      ? `<img src="${getFaviconUrl(visit.domain)}" alt="" class="favicon" onerror="this.style.display='none'">`
      : "";

    const displayTitle = isSearch
      ? visit.query || visit.title || "Search"
      : visit.title || visit.domain || "Page Visit";

    // Show extracted keywords badge if available
    const keywordsBadge = visit.extracted_keywords
      ? `<span class="keywords-badge" title="Keywords used for GitHub search">🔑 ${truncate(visit.extracted_keywords, 30)}</span>`
      : "";

    // AI badge if keywords were extracted
    const aiBadge = visit.extracted_keywords && aiEnabled
      ? `<span class="ai-mini-badge">🤖</span>`
      : "";

    // Render repos from the visit directly
    const reposHtml = renderReposList(visit.repos, selectedLang);

    card.innerHTML = `
      <div class="visit-header">
        <div class="visit-icon ${visit.type}">${icon}</div>
        <div class="visit-info">
          <div class="visit-title">
            ${favicon}
            <a href="${visit.url}" target="_blank" rel="noopener noreferrer">${truncate(displayTitle, 60)}</a>
            ${aiBadge}
          </div>
          <div class="visit-meta">
            <span class="visit-type-badge ${visit.type}">${isSearch ? "Search" : "Page"}</span>
            <span class="visit-domain">${visit.domain || "—"}</span>
            <span class="visit-time">${formatDate(visit.created_at)}</span>
          </div>
          ${keywordsBadge ? `<div class="visit-keywords">${keywordsBadge}</div>` : ""}
        </div>
      </div>
      ${reposHtml}
    `;

    visitsContainer.appendChild(card);
  }
}

// === Event Handlers ===
async function handleTabClick(e) {
  const tab = e.currentTarget.dataset.tab;
  currentTab = tab;

  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  if (tab === "insights") {
    insightsPanel.style.display = "block";
    visitsContainer.style.display = "none";
    document.querySelector(".controls").style.display = "none";
    
    if (!cachedInsights) {
      insightsContent.innerHTML = '<p class="loading">🤖 Analyzing your browsing patterns...</p>';
      cachedInsights = await fetchInsights();
    }
    renderInsights(cachedInsights);
  } else {
    insightsPanel.style.display = "none";
    visitsContainer.style.display = "flex";
    document.querySelector(".controls").style.display = "flex";
    renderVisits(allVisits);
  }
}

async function refreshInsightsHandler() {
  insightsContent.innerHTML = '<p class="loading">🤖 Generating fresh insights...</p>';
  cachedInsights = await fetchInsights();
  renderInsights(cachedInsights);
}

async function refresh() {
  // Fetch all data in parallel
  const [visits, stats, aiStatus] = await Promise.all([
    fetchRecentVisits(),
    fetchStats(),
    fetchAIStatus(),
  ]);

  allVisits = visits;

  renderAIStatus(aiStatus);
  renderStats(stats);
  
  if (currentTab !== "insights") {
    renderVisits(visits);
  }
}

// === Initialize ===
tabButtons.forEach((btn) => btn.addEventListener("click", handleTabClick));
languageFilter.addEventListener("change", () => renderVisits(allVisits));
domainFilter.addEventListener("change", () => renderVisits(allVisits));
refreshBtn.addEventListener("click", refresh);
refreshInsightsBtn.addEventListener("click", refreshInsightsHandler);

refresh();
