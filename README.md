# Browse & Search Tracker

Track **all your browsing activity** in Firefox and automatically discover related GitHub repositories.

This project consists of:

- **Firefox WebExtension** – Tracks all page visits and search queries, including single-page app navigation (YouTube, Twitter, etc.)
- **Node.js + Express + SQLite backend** – Logs visits, extracts keywords from page titles, fetches matching GitHub repositories, and serves a modern dashboard UI.

> All processing happens locally. The only external network call is from the backend to the GitHub REST API (optional, if you configure a token).

---

## ✨ Features

### 🔍 Comprehensive Page Tracking
- **Search Engine Queries** - Captures searches from Google, DuckDuckGo, Bing, Yahoo, Startpage, Ecosia
- **All Page Visits** - Tracks every page you visit, not just searches
- **Same-Tab Navigation** - Detects URL changes within the same tab
- **Single-Page Apps** - Tracks History API changes (YouTube, Twitter, etc.)
- **Smart Deduplication** - Prevents duplicate entries with intelligent debouncing

### 🧠 Intelligent Keyword Extraction
For every page visit, the system:
- Extracts meaningful keywords from page titles
- Removes platform names (YouTube, Twitter, etc.)
- Filters out stop words and generic terms
- Uses extracted keywords to search GitHub for relevant repos

### 🐙 GitHub Repository Suggestions
- Automatically searches GitHub for **every visit** with extractable keywords
- Returns top 5 repositories sorted by stars
- Shows repo name, star count, and programming language
- Filter repos by language in the dashboard

### 📊 Modern Dashboard
Beautiful glassmorphism UI at `http://localhost:4001`:
- **Stats Panel** - Total visits, searches, and page visits
- **Tab Navigation** - Filter by All Activity, Searches, or Page Visits
- **Domain Filter** - Filter by most visited domains
- **Language Filter** - Filter repos by programming language
- **Keywords Badge** - See what keywords were extracted from page titles
- **Responsive Design** - Works on desktop and mobile

---

## 🏗 Project Structure

```text
search-tracker/
├── search-tracker-backend/
│   ├── server.js           # Express server with SQLite
│   ├── package.json
│   ├── .env                # PORT and GITHUB_TOKEN config
│   ├── data.db             # SQLite database (created at runtime)
│   └── public/
│       ├── index.html      # Dashboard HTML
│       ├── styles.css      # Glassmorphism styles
│       └── app.js          # Dashboard JavaScript
└── firefox-search-tracker-extension/
    ├── manifest.json       # Extension manifest (v2)
    └── background.js       # Navigation tracking logic
```

---

## 🚀 Installation

### 1. Clone the repository
```bash
git clone https://github.com/Archit-bit/Search-Tracker.git
cd search-tracker
```

### 2. Set up the backend
```bash
cd search-tracker-backend
npm install
```

### 3. Configure environment
Create a `.env` file:
```env
PORT=4001
GITHUB_TOKEN=your_github_personal_access_token
```

> Get a GitHub token from [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens)

### 4. Start the server
```bash
npm start
```

### 5. Install the Firefox extension
1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on..."
3. Select `firefox-search-tracker-extension/manifest.json`

### 6. Open the dashboard
Navigate to `http://localhost:4001`

---

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/log-visit` | POST | Log a page visit (called by extension) |
| `/api/recent-visits` | GET | Get recent visits with repos |
| `/api/recent-searches` | GET | Get recent search queries with repos |
| `/api/visit-stats` | GET | Get visit statistics |
| `/api/health` | GET | Health check |

---

## 🔮 Database Schema

### `visits` table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| url | TEXT | Full page URL |
| title | TEXT | Page title |
| domain | TEXT | Domain name |
| type | TEXT | 'search' or 'page_visit' |
| query | TEXT | Search query (if search) |
| extracted_keywords | TEXT | Keywords extracted from title |
| source | TEXT | Navigation source |
| created_at | TEXT | ISO timestamp |

### `visit_repos` table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| visit_id | INTEGER | Foreign key to visits |
| full_name | TEXT | Repository full name |
| html_url | TEXT | Repository URL |
| description | TEXT | Repository description |
| stargazers_count | INTEGER | Star count |
| language | TEXT | Primary language |
| created_at | TEXT | ISO timestamp |

---

## 🛡 Privacy

- **100% Local** - All data stays on your machine
- **No External Tracking** - Only GitHub API calls (optional)
- **No Analytics** - No data is sent to third parties
- **Skip Patterns** - Internal browser pages are automatically ignored

---

## 📝 License

MIT License - feel free to use, modify, and distribute.
