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

    const queryDiv = document.createElement("div");
    queryDiv.className = "search-query";
    queryDiv.textContent = search.raw_query;

    const metaDiv = document.createElement("div");
    metaDiv.className = "search-meta";
    metaDiv.textContent = `${search.source || "unknown"} • ${formatDate(
      search.created_at
    )}`;

    header.appendChild(queryDiv);
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
      li.textContent = "No repos (yet) for this search.";
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
        metaSpan.textContent = ` — ⭐ ${repo.stargazers_count || 0} • ${
          repo.language || "Unknown"
        }`;

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
