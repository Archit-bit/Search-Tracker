  require("dotenv").config();
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// node-fetch (for Node < 18 or to be safe)
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 4001;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Initialize Gemini AI
let genAI = null;
let geminiModel = null;

if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  console.log("✨ Gemini AI initialized successfully");
} else {
  console.warn("⚠️  No GEMINI_API_KEY set - AI features disabled");
}

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
      ai_summary TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add ai_summary column if it doesn't exist
  db.run(`ALTER TABLE visit_repos ADD COLUMN ai_summary TEXT`, (err) => {
    if (err && !err.message.includes("duplicate")) {
      // Ignore duplicate column errors
    }
  });
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

// === AI-Powered Functions ===

// Use Gemini to extract meaningful keywords from page title
async function extractKeywordsWithAI(title, domain, url) {
  if (!geminiModel || !title) {
    return null;
  }

  try {
    const prompt = `You are a technical keyword extractor. Given a webpage title and domain, extract the most relevant technical/programming keywords that would be useful for searching GitHub repositories.

Page Title: "${title}"
Domain: ${domain || "unknown"}
URL: ${url || ""}

Rules:
1. Focus on programming languages, frameworks, libraries, tools, and technical concepts
2. Ignore generic words, platform names (YouTube, Medium, etc.), and non-technical terms
3. Return 2-5 keywords separated by spaces
4. If no technical keywords found, return "NONE"
5. Only return the keywords, nothing else

Examples:
- "How to build a REST API with Node.js and Express - YouTube" → "REST API Node.js Express"
- "React Hooks Tutorial for Beginners" → "React Hooks"
- "Funny Cat Videos Compilation" → "NONE"
- "ESP32 WiFi Setup Guide" → "ESP32 WiFi"
- "Machine Learning with Python and TensorFlow" → "Machine Learning Python TensorFlow"

Keywords:`;

    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // If AI returned NONE or empty, return null
    if (!text || text === "NONE" || text.length < 2) {
      console.log(`  🤖 AI: No technical keywords found for "${title}"`);
      return null;
    }

    console.log(`  🤖 AI extracted keywords: "${text}" from "${title}"`);
    return text.slice(0, 100); // Limit length
  } catch (error) {
    console.error("AI keyword extraction error:", error.message);
    return null;
  }
}

// Use AI to generate optimal GitHub search query
async function generateGitHubQueryWithAI(title, domain, keywords) {
  if (!geminiModel) {
    return keywords; // Fallback to basic keywords
  }

  try {
    const prompt = `You are a GitHub search expert. Generate an optimal GitHub repository search query based on the following:

Page Title: "${title}"
Domain: ${domain || "unknown"}
Extracted Keywords: ${keywords || "none"}

Rules:
1. Create a concise search query (2-4 terms) that will find relevant repositories
2. Focus on the main technology/framework/tool
3. Add relevant qualifiers like language if obvious
4. Return ONLY the search query, nothing else
5. If no good query possible, return the original keywords or "SKIP"

Examples:
- Title: "Building Microservices with Go", Keywords: "Microservices Go" → "microservices golang"
- Title: "React Native Mobile App Tutorial", Keywords: "React Native" → "react-native mobile app"
- Title: "ESP32 Arduino Projects", Keywords: "ESP32 Arduino" → "esp32 arduino projects"

Search Query:`;

    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    if (!text || text === "SKIP" || text.length < 2) {
      return keywords;
    }

    console.log(`  🤖 AI optimized query: "${text}"`);
    return text.slice(0, 100);
  } catch (error) {
    console.error("AI query generation error:", error.message);
    return keywords;
  }
}

// Analyze browsing patterns and repos, generate comprehensive insights
async function generateBrowsingInsights(visits, repos) {
  if (!geminiModel || !visits || visits.length === 0) {
    return null;
  }

  try {
    // Create a summary of recent visits
    const visitSummary = visits.slice(0, 20).map(v => ({
      title: v.title?.slice(0, 60),
      domain: v.domain,
      type: v.type,
      keywords: v.extracted_keywords
    }));

    // Create repo summary with full details
    const repoSummary = repos.slice(0, 15).map(r => ({
      name: r.full_name,
      url: r.html_url,
      description: r.description?.slice(0, 100),
      stars: r.stargazers_count,
      language: r.language
    }));

    const prompt = `You are a developer learning analyst. Analyze browsing history and discovered GitHub repos to provide actionable insights.

BROWSING HISTORY:
${JSON.stringify(visitSummary, null, 2)}

DISCOVERED REPOS:
${JSON.stringify(repoSummary, null, 2)}

Analyze this data and provide comprehensive insights. For each repo you mention, explain WHY it's relevant to the user's interests.

Return JSON in this EXACT format:
{
  "topics": ["main topic 1", "main topic 2", "main topic 3"],
  "learning_style": "Brief description of how the user learns (videos, docs, tutorials, etc.)",
  "skills": ["skill being developed 1", "skill being developed 2"],
  "suggestions": [
    "Specific suggestion based on browsing patterns",
    "Another actionable suggestion"
  ],
  "repo_analysis": [
    {
      "name": "owner/repo-name",
      "url": "https://github.com/owner/repo-name",
      "stars": 1234,
      "language": "JavaScript",
      "summary": "2-3 sentence summary of what this repo does and why it's relevant to the user's interests",
      "relevance": "Why this matches their browsing patterns"
    }
  ],
  "learning_path": "A suggested learning path based on current interests (2-3 sentences)"
}

Pick the 5 most relevant repos from the list and analyze them. Be specific and actionable.`;

    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // Try to parse JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Ensure repo_analysis has valid URLs
      if (parsed.repo_analysis) {
        parsed.repo_analysis = parsed.repo_analysis.map(r => ({
          ...r,
          url: r.url || `https://github.com/${r.name}`
        }));
      }
      return parsed;
    }

    return { raw: text };
  } catch (error) {
    console.error("AI insights generation error:", error.message);
    return null;
  }
}

// Generate AI summaries for a batch of repos
async function generateRepoSummaries(repos, context) {
  if (!geminiModel || !repos || repos.length === 0) {
    return repos.map(r => ({ ...r, ai_summary: null }));
  }

  try {
    const repoList = repos.map(r => ({
      name: r.full_name,
      description: r.description?.slice(0, 150),
      stars: r.stargazers_count,
      language: r.language
    }));

    const prompt = `You are a GitHub repo summarizer. Generate concise, helpful summaries for each repo.

Context: User was browsing "${context || 'various topics'}"

Repos to summarize:
${JSON.stringify(repoList, null, 2)}

For each repo, provide a 1-2 sentence summary that explains:
1. What the repo does
2. Why someone interested in "${context || 'this topic'}" might find it useful

Return JSON array in this EXACT format (same order as input):
[
  { "name": "owner/repo", "summary": "Your concise summary here" },
  ...
]

Only return the JSON array, nothing else.`;

    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // Parse JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const summaries = JSON.parse(jsonMatch[0]);
      
      // Map summaries back to repos
      return repos.map(repo => {
        const summary = summaries.find(s => s.name === repo.full_name);
        return {
          ...repo,
          ai_summary: summary?.summary || null
        };
      });
    }

    return repos.map(r => ({ ...r, ai_summary: null }));
  } catch (error) {
    console.error("AI repo summary error:", error.message);
    return repos.map(r => ({ ...r, ai_summary: null }));
  }
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
  
  // Extract keywords from title for page visits (with AI if available)
  let extracted_keywords = null;
  let searchQuery = null;

  if (type === "search" && query) {
    searchQuery = cleanQuery(query);
    extracted_keywords = query; // Store original query as keywords
  } else if (title) {
    // Try AI extraction first, fall back to basic extraction
    if (geminiModel) {
      extracted_keywords = await extractKeywordsWithAI(title, domain, url);
    }
    
    // Fallback to basic extraction if AI failed or not available
    if (!extracted_keywords) {
      extracted_keywords = extractKeywordsFromTitle(title, domain);
    }
    
    // Use AI to optimize the GitHub search query
    if (extracted_keywords && geminiModel) {
      searchQuery = await generateGitHubQueryWithAI(title, domain, extracted_keywords);
    } else {
      searchQuery = extracted_keywords;
    }
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
            let repos = await searchGithubRepositories(searchQuery);
            if (!repos.length) {
              console.log(`  -> no repos fetched for keywords "${searchQuery}"`);
              return;
            }

            // Generate AI summaries for repos
            const context = title || searchQuery;
            repos = await generateRepoSummaries(repos, context);
            console.log(`  🤖 Generated AI summaries for ${repos.length} repos`);

            const stmt = db.prepare(`
              INSERT INTO visit_repos
              (visit_id, full_name, html_url, description, stargazers_count, language, ai_summary, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const repo of repos) {
              stmt.run(
                visitId,
                repo.full_name,
                repo.html_url,
                repo.description || "",
                repo.stargazers_count || 0,
                repo.language || null,
                repo.ai_summary || null,
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
            stats.ai_enabled = !!geminiModel;
            res.json(stats);
          }
        );
      });
    });
  });
});

// === AI Insights Endpoint ===
app.get("/api/insights", async (req, res) => {
  if (!geminiModel) {
    return res.status(400).json({ 
      error: "AI not configured",
      message: "Set GEMINI_API_KEY in .env to enable AI insights"
    });
  }

  // Fetch visits and repos in parallel
  db.all(`SELECT * FROM visits ORDER BY id DESC LIMIT 30`, [], async (err, visits) => {
    if (err) {
      console.error("DB select error:", err);
      return res.status(500).json({ error: "database error" });
    }

    if (visits.length === 0) {
      return res.json({ 
        message: "Not enough browsing data yet",
        insights: null 
      });
    }

    // Also fetch repos from visit_repos table
    db.all(
      `SELECT DISTINCT full_name, html_url, description, stargazers_count, language 
       FROM visit_repos 
       ORDER BY stargazers_count DESC 
       LIMIT 20`,
      [],
      async (err2, repos) => {
        if (err2) {
          console.error("DB select error (repos):", err2);
          repos = []; // Continue without repos
        }

        try {
          console.log(`🤖 Generating insights from ${visits.length} visits and ${repos.length} repos...`);
          const insights = await generateBrowsingInsights(visits, repos || []);
          res.json({ 
            insights,
            visit_count: visits.length,
            repo_count: repos?.length || 0,
            generated_at: new Date().toISOString()
          });
        } catch (error) {
          console.error("Insights generation error:", error);
          res.status(500).json({ error: "Failed to generate insights" });
        }
      }
    );
  });
});

// === AI Status Endpoint ===
app.get("/api/ai-status", (req, res) => {
  res.json({
    enabled: !!geminiModel,
    model: geminiModel ? "gemini-2.0-flash" : null,
    features: geminiModel ? [
      "Smart keyword extraction",
      "Optimized GitHub queries",
      "Browsing insights"
    ] : []
  });
});

// Dashboard static files from /public
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  if (geminiModel) {
    console.log(`🤖 AI features enabled with Gemini`);
  }
});
