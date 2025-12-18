const searchesContainer = document.getElementById("searchesContainer");
const languageFilter = document.getElementById("languageFilter");
const refreshBtn = document.getElementById("refreshBtn");

async function fetchRecentSearches() {
  const res = await fetch("/api/recent-searches");
  if (!res.ok) {
    console.error("Failed to fetch recent searches");
    return [];
  }
  return res.json();
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function renderSearches(searches) {
  const lang = languageFilter.value;
  searchesContainer.innerHTML = "";

  if (!searches.length) {
    searchesContainer.innerHTML = "<p>No searches tracked yet.</p>";
    return;
  }

  for (const search of searches) {
    const card = document.createElement("div");
    card.className = "search-card";

    const header = document.createElement("div");
    header.className = "search-header";

    const queryWrapper = document.createElement("div");
    queryWrapper.style.display = "flex";
    queryWrapper.style.alignItems = "center";
    queryWrapper.style.gap = "8px";

    const searchIcon = document.createElement("div");
    searchIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-color);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
    
    const queryDiv = document.createElement("div");
    queryDiv.className = "search-query";
    queryDiv.textContent = search.raw_query;

    queryWrapper.appendChild(searchIcon);
    queryWrapper.appendChild(queryDiv);

    const metaDiv = document.createElement("div");
    metaDiv.className = "search-meta";
    metaDiv.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
      ${formatDate(search.created_at)}
      <span style="margin: 0 4px">•</span>
      <span style="text-transform: capitalize;">${search.source || "unknown"}</span>
    `;

    header.appendChild(queryWrapper);
    header.appendChild(metaDiv);
    card.appendChild(header);

    const repoList = document.createElement("ul");
    repoList.className = "repo-list";

    const repos = (search.repos || []).filter((r) => {
      if (!lang) return true;
      return (r.language || "").toLowerCase() === lang.toLowerCase();
    });

    if (!repos.length) {
      const li = document.createElement("li");
      li.style.color = "var(--text-secondary)";
      li.style.fontStyle = "italic";
      li.textContent = "No repos found for this search.";
      repoList.appendChild(li);
    } else {
      for (const repo of repos) {
        const li = document.createElement("li");
        li.className = "repo-item";

        const nameSpan = document.createElement("span");
        nameSpan.className = "repo-name";

        const link = document.createElement("a");
        link.href = repo.html_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = repo.full_name;

        nameSpan.appendChild(link);

        const metaSpan = document.createElement("span");
        metaSpan.className = "repo-meta";
        
        // Star Icon
        const starIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color: #eab308;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        
        metaSpan.innerHTML = `
          <span style="display: flex; align-items: center; gap: 4px;">${starIcon} ${repo.stargazers_count || 0}</span>
          <span style="width: 4px; height: 4px; background: var(--text-secondary); border-radius: 50%;"></span>
          <span>${repo.language || "Unknown"}</span>
        `;

        li.appendChild(nameSpan);
        li.appendChild(metaSpan);
        repoList.appendChild(li);
      }
    }

    card.appendChild(repoList);
    searchesContainer.appendChild(card);
  }
}

async function refresh() {
  const data = await fetchRecentSearches();
  renderSearches(data);
}

languageFilter.addEventListener("change", refresh);
refreshBtn.addEventListener("click", refresh);

refresh();
