  require("dotenv").config();
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");

// node-fetch (for Node < 18 or to be safe)
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 4001;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// === SQLite DB setup ===
const db = new sqlite3.Database(path.join(__dirname, "data.db"));

db.serialize(() => {
  // Original searches table (for backward compatibility)
  db.run(`
    CREATE TABLE IF NOT EXISTS searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_query TEXT NOT NULL,
      cleaned_query TEXT,
      source TEXT,
      url TEXT,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      html_url TEXT NOT NULL,
      description TEXT,
      stargazers_count INTEGER,
      language TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (search_id) REFERENCES searches(id) ON DELETE CASCADE
    )
  `);

  // New unified visits table for all page visits
  db.run(`
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT,
      domain TEXT,
      type TEXT NOT NULL,
      query TEXT,
      extracted_keywords TEXT,
      source TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // Migration: Add extracted_keywords column if it doesn't exist (for existing databases)
  db.run(`ALTER TABLE visits ADD COLUMN extracted_keywords TEXT`, (err) => {
    if (err && !err.message.includes("duplicate column")) {
      // Ignore "duplicate column" errors - means column already exists
      if (!err.message.includes("duplicate")) {
        console.log("Migration note:", err.message);
      }
    }
  });

  // Repos linked to visits (for page visits with extracted keywords)
  db.run(`
    CREATE TABLE IF NOT EXISTS visit_repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      html_url TEXT NOT NULL,
      description TEXT,
      stargazers_count INTEGER,
      language TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE
    )
  `);
});

// === Helpers ===
function cleanQuery(raw) {
  if (!raw) return "";
  let q = raw.toLowerCase();

  const phrasesToStrip = [
    "how to",
    "how do i",
    "what is",
    "tutorial",
    "guide",
    "in javascript",
    "in typescript",
    "in python",
  ];

  phrasesToStrip.forEach((p) => {
    q = q.replace(p, "");
  });

  return q.trim();
}

// Extract meaningful keywords from page titles for GitHub search
function extractKeywordsFromTitle(title, domain) {
  if (!title) return null;

  let text = title.toLowerCase();

  // Remove platform names and common suffixes
  const platformPatterns = [
    /\s*[-–—|]\s*youtube$/i,
    /\s*[-–—|]\s*twitter$/i,
    /\s*[-–—|]\s*x$/i,
    /\s*[-–—|]\s*reddit$/i,
    /\s*[-–—|]\s*github$/i,
    /\s*[-–—|]\s*stack overflow$/i,
    /\s*[-–—|]\s*medium$/i,
    /\s*[-–—|]\s*dev\.to$/i,
    /\s*[-–—|]\s*linkedin$/i,
    /\s*[-–—|]\s*facebook$/i,
    /\s*[-–—|]\s*instagram$/i,
    /\s*[-–—|]\s*tiktok$/i,
    /\s*[-–—|]\s*amazon$/i,
    /\s*[-–—|]\s*wikipedia$/i,
    /\(\d+\)\s*/g, // Remove notification counts like "(3)"
    /^\(\d+\)\s*/g,
  ];

  platformPatterns.forEach((pattern) => {
    text = text.replace(pattern, "");
  });

  // Stop words to remove
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "dare",
    "and", "or", "but", "if", "then", "else", "when", "where", "why",
    "how", "what", "which", "who", "whom", "this", "that", "these",
    "those", "i", "you", "he", "she", "it", "we", "they", "me", "him",
    "her", "us", "them", "my", "your", "his", "its", "our", "their",
    "of", "in", "to", "for", "with", "on", "at", "by", "from", "up",
    "about", "into", "over", "after", "beneath", "under", "above",
    "video", "watch", "official", "full", "new", "latest", "best",
    "top", "free", "online", "live", "hd", "4k", "2024", "2025", "2026",
    "part", "episode", "ep", "vs", "review", "reaction", "explained",
    "music", "song", "lyrics", "ft", "feat", "remix", "cover",
  ]);

  // Split into words and filter
  const words = text
    .replace(/[^\w\s]/g, " ") // Remove punctuation
    .split(/\s+/)
    .filter((word) => {
      return (
        word.length > 2 && // Skip very short words
        !stopWords.has(word) &&
        !/^\d+$/.test(word) // Skip pure numbers
      );
    });

  if (words.length === 0) return null;

  // Take first 4 meaningful words for the search
  const keywords = words.slice(0, 4).join(" ");

  // Skip if too short or generic
  if (keywords.length < 4) return null;

  return keywords;
}

async function searchGithubRepositories(query) {
  if (!GITHUB_TOKEN || !query) {
    console.warn("No GITHUB_TOKEN set or empty query; skipping GitHub search.");
    return [];
  }

  const params = new URLSearchParams({
    q: query,
    sort: "stars",
    order: "desc",
    per_page: "5",
  });

  const res = await fetch(
    `https://api.github.com/search/repositories?${params.toString()}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "User-Agent": "search-tracker-app",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("GitHub API error:", res.status, text);
    return [];
  }

  const data = await res.json();
  return data.items || [];
}

// === API routes ===

// health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// log a search (called by extension or curl)
app.post("/api/log-search", async (req, res) => {
  const { query, source, url } = req.body || {};

  console.log("> /api/log-search hit:", { query, source, url });

  if (!query) {
    console.log("  -> no query, sending 400");
    return res.status(400).json({ error: "query is required" });
  }

  const cleaned_query = cleanQuery(query);
  const created_at = new Date().toISOString();

  db.run(
    `INSERT INTO searches (raw_query, cleaned_query, source, url, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [query, cleaned_query, source || null, url || null, created_at],
    function (err) {
      if (err) {
        console.error("DB insert error (searches):", err);
        return res.status(500).json({ error: "database error" });
      }

      const searchId = this.lastID;
      console.log(
        `  -> saved search id ${searchId}, cleaned_query="${cleaned_query}"`
      );

      // Fire & forget GitHub call (optional)
      (async () => {
        try {
          const repos = await searchGithubRepositories(cleaned_query || query);
          if (!repos.length) {
            console.log(
              "  -> no repos fetched (token missing/invalid or no results)"
            );
            return;
          }

          const stmt = db.prepare(`
            INSERT INTO repos
            (search_id, full_name, html_url, description, stargazers_count, language, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          for (const repo of repos) {
            stmt.run(
              searchId,
              repo.full_name,
              repo.html_url,
              repo.description || "",
              repo.stargazers_count || 0,
              repo.language || null,
              created_at
            );
          }

          stmt.finalize();
          console.log(
            `  -> saved ${repos.length} repos for search ${searchId}`
          );
        } catch (e) {
          console.error("Error while fetching/saving GitHub repos:", e);
        }
      })();

      res.json({ status: "ok", search_id: searchId });
    }
  );
});

// recent searches + repos
app.get("/api/recent-searches", (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20;

  db.all(
    `SELECT * FROM searches ORDER BY id DESC LIMIT ?`,
    [limit],
    (err, searches) => {
      if (err) {
        console.error("DB select error (searches):", err);
        return res.status(500).json({ error: "database error" });
      }

      if (searches.length === 0) {
        return res.json([]);
      }

      const ids = searches.map((s) => s.id);
      const placeholders = ids.map(() => "?").join(",");

      db.all(
        `SELECT * FROM repos
         WHERE search_id IN (${placeholders})
         ORDER BY stargazers_count DESC`,
        ids,
        (err2, repos) => {
          if (err2) {
            console.error("DB select error (repos):", err2);
            return res.status(500).json({ error: "database error" });
          }

          // Create a map for fast lookup, but keep the original order
          const searchMap = {};
          // We want to return the searches in the same order as 'searches' (which is DESC)
          // So we'll map 'searches' to a new array of objects with repos initialized
          const orderedSearches = searches.map(s => {
            const sWithRepos = { ...s, repos: [] };
            searchMap[s.id] = sWithRepos;
            return sWithRepos;
          });

          for (const r of repos) {
            if (searchMap[r.search_id]) {
              searchMap[r.search_id].repos.push(r);
            }
          }

          res.json(orderedSearches);
        }
      );
    }
  );
});

// === NEW: Log any page visit (search or regular navigation) ===
app.post("/api/log-visit", async (req, res) => {
  const { url, title, domain, type, query, source } = req.body || {};

  console.log("> /api/log-visit hit:", { url, title, domain, type, query, source });

  if (!url) {
    console.log("  -> no url, sending 400");
    return res.status(400).json({ error: "url is required" });
  }

  const created_at = new Date().toISOString();
  
  // Extract keywords from title for page visits
  let extracted_keywords = null;
  let searchQuery = null;

  if (type === "search" && query) {
    searchQuery = cleanQuery(query);
  } else if (title) {
    extracted_keywords = extractKeywordsFromTitle(title, domain);
    searchQuery = extracted_keywords;
  }

  db.run(
    `INSERT INTO visits (url, title, domain, type, query, extracted_keywords, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [url, title || null, domain || null, type || "page_visit", query || null, extracted_keywords, source || null, created_at],
    function (err) {
      if (err) {
        console.error("DB insert error (visits):", err);
        return res.status(500).json({ error: "database error" });
      }

      const visitId = this.lastID;
      console.log(`  -> saved visit id ${visitId}, type="${type}", keywords="${extracted_keywords || query}"`);

      // For search type, also save to searches table (backward compatibility)
      if (type === "search" && query) {
        const cleaned_query = cleanQuery(query);

        db.run(
          `INSERT INTO searches (raw_query, cleaned_query, source, url, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [query, cleaned_query, source || null, url || null, created_at],
          function (err) {
            if (err) {
              console.error("DB insert error (searches):", err);
              return;
            }

            const searchId = this.lastID;
            console.log(`  -> also saved to searches table, id ${searchId}`);

            // Fire & forget GitHub call for searches (saves to repos table)
            (async () => {
              try {
                const repos = await searchGithubRepositories(cleaned_query || query);
                if (!repos.length) {
                  console.log("  -> no repos fetched for search");
                  return;
                }

                const stmt = db.prepare(`
                  INSERT INTO repos
                  (search_id, full_name, html_url, description, stargazers_count, language, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                for (const repo of repos) {
                  stmt.run(
                    searchId,
                    repo.full_name,
                    repo.html_url,
                    repo.description || "",
                    repo.stargazers_count || 0,
                    repo.language || null,
                    created_at
                  );
                }

                stmt.finalize();
                console.log(`  -> saved ${repos.length} repos for search ${searchId}`);
              } catch (e) {
                console.error("Error while fetching/saving GitHub repos for search:", e);
              }
            })();
          }
        );
      }

      // Fetch GitHub repos for ANY visit with valid keywords/query
      if (searchQuery) {
        (async () => {
          try {
            const repos = await searchGithubRepositories(searchQuery);
            if (!repos.length) {
              console.log(`  -> no repos fetched for keywords "${searchQuery}"`);
              return;
            }

            const stmt = db.prepare(`
              INSERT INTO visit_repos
              (visit_id, full_name, html_url, description, stargazers_count, language, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            for (const repo of repos) {
              stmt.run(
                visitId,
                repo.full_name,
                repo.html_url,
                repo.description || "",
                repo.stargazers_count || 0,
                repo.language || null,
                created_at
              );
            }

            stmt.finalize();
            console.log(`  -> saved ${repos.length} repos for visit ${visitId} (keywords: "${searchQuery}")`);
          } catch (e) {
            console.error("Error while fetching/saving GitHub repos for visit:", e);
          }
        })();
      }

      res.json({ status: "ok", visit_id: visitId, keywords: extracted_keywords });
    }
  );
});

// === NEW: Get recent visits (all page visits) with repos ===
app.get("/api/recent-visits", (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const type = req.query.type || null; // 'search', 'page_visit', or null for all

  let query = `SELECT * FROM visits`;
  const params = [];

  if (type) {
    query += ` WHERE type = ?`;
    params.push(type);
  }

  query += ` ORDER BY id DESC LIMIT ?`;
  params.push(limit);

  db.all(query, params, (err, visits) => {
    if (err) {
      console.error("DB select error (visits):", err);
      return res.status(500).json({ error: "database error" });
    }

    if (visits.length === 0) {
      return res.json([]);
    }

    // Get all visit_ids to fetch repos
    const visitIds = visits.map((v) => v.id);
    const placeholders = visitIds.map(() => "?").join(",");

    db.all(
      `SELECT * FROM visit_repos WHERE visit_id IN (${placeholders}) ORDER BY stargazers_count DESC`,
      visitIds,
      (err2, repos) => {
        if (err2) {
          console.error("DB select error (visit_repos):", err2);
          // Return visits without repos on error
          return res.json(visits.map((v) => ({ ...v, repos: [] })));
        }

        // Map repos to visits
        const repoMap = {};
        for (const repo of repos) {
          if (!repoMap[repo.visit_id]) {
            repoMap[repo.visit_id] = [];
          }
          repoMap[repo.visit_id].push(repo);
        }

        const visitsWithRepos = visits.map((v) => ({
          ...v,
          repos: repoMap[v.id] || [],
        }));

        res.json(visitsWithRepos);
      }
    );
  });
});

// === NEW: Get visit statistics ===
app.get("/api/visit-stats", (req, res) => {
  const stats = {};

  db.get(`SELECT COUNT(*) as total FROM visits`, [], (err, row) => {
    if (err) return res.status(500).json({ error: "database error" });
    stats.total_visits = row.total;

    db.get(`SELECT COUNT(*) as total FROM visits WHERE type = 'search'`, [], (err, row) => {
      if (err) return res.status(500).json({ error: "database error" });
      stats.total_searches = row.total;

      db.get(`SELECT COUNT(*) as total FROM visits WHERE type = 'page_visit'`, [], (err, row) => {
        if (err) return res.status(500).json({ error: "database error" });
        stats.total_page_visits = row.total;

        db.all(
          `SELECT domain, COUNT(*) as count FROM visits 
           WHERE domain IS NOT NULL 
           GROUP BY domain ORDER BY count DESC LIMIT 10`,
          [],
          (err, domains) => {
            if (err) return res.status(500).json({ error: "database error" });
            stats.top_domains = domains;
            res.json(stats);
          }
        );
      });
    });
  });
});

// Dashboard static files from /public
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
