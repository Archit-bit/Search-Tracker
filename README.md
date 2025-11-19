# Search → GitHub Tracker

Track what you search in Firefox and automatically discover related GitHub repositories.

This project consists of:

- **Firefox WebExtension** – Listens to your search engine queries (from the address bar / new tab) and sends them to a local backend.
- **Node.js + Express + SQLite backend** – Logs your searches, optionally fetches matching GitHub repositories, and serves a small dashboard UI.

> All processing happens locally. The only external network call is from the backend to the GitHub REST API (optional, if you configure a token).

---

## ✨ Features

- 🔍 Automatically detects search queries from:
  - Firefox address bar / new tab
  - Supported engines (Google, DuckDuckGo, Bing, etc.)
- 🧠 Logs each search with:
  - Raw query
  - Cleaned query (for GitHub search)
  - Source (search engine)
  - Full URL
  - Timestamp
- 🐙 (Optional) Calls the **GitHub Search API** to suggest repositories for each query.
- 📊 Simple dashboard at `http://localhost:4000`:
  - List recent searches
  - See recommended repos (name, stars, language, links)
  - Filter repos by language

---

## 🏗 Project structure

```text
search-tracker/
├── search-tracker-backend/
│   ├── server.js
│   ├── package.json
│   ├── .env                # created by install.sh or manually
│   ├── data.db             # SQLite database (created at runtime)
│   └── public/
│       ├── index.html
│       ├── styles.css
│       └── app.js
└── firefox-search-tracker-extension/
    ├── manifest.json
    └── background.js
