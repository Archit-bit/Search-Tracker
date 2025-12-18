require("dotenv").config();
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");

// node-fetch (for Node < 18 or to be safe)
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 4000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// === SQLite DB setup ===
const db = new sqlite3.Database(path.join(__dirname, "data.db"));

db.serialize(() => {
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

// Dashboard static files from /public
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
