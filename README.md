# Browse & Search Tracker

Track **all your browsing activity** in Firefox and automatically discover related GitHub repositories with **AI-powered analysis**.

This project consists of:

- **Firefox WebExtension** – Tracks all page visits and search queries, including single-page app navigation (YouTube, Twitter, etc.)
- **Node.js + Express + SQLite backend** – Logs visits, uses AI to extract keywords, fetches GitHub repositories, and serves a modern dashboard UI.
- **Google Gemini AI Integration** – Intelligently analyzes page content and provides repo summaries

> All processing happens locally. External calls: GitHub REST API (for repos) and Google Gemini API (for AI features).

---

## ✨ Features

### 🔍 Comprehensive Page Tracking
- **Search Engine Queries** - Captures searches from Google, DuckDuckGo, Bing, Yahoo, Startpage, Ecosia
- **All Page Visits** - Tracks every page you visit, not just searches
- **Same-Tab Navigation** - Detects URL changes within the same tab
- **Single-Page Apps** - Tracks History API changes (YouTube, Twitter, etc.)
- **Smart Deduplication** - Prevents duplicate entries with intelligent debouncing

### 🤖 AI-Powered Features (Gemini)
- **Smart Keyword Extraction** - AI analyzes page titles to extract relevant technical keywords
- **Optimized GitHub Queries** - AI generates better search queries for more relevant repos
- **Repo Summaries** - Each discovered repo gets an AI-generated summary explaining what it does
- **Browsing Insights** - AI analyzes your browsing patterns and provides learning recommendations
- **Relevance Analysis** - AI explains why each repo matches your interests

### 🐙 GitHub Repository Suggestions
- Automatically searches GitHub for **every visit** with extractable keywords
- Returns top 5 repositories sorted by stars
- **AI-generated summaries** for each repo
- Shows repo name, star count, language, and summary
- Filter repos by language in the dashboard

### 📊 Modern Dashboard
Beautiful glassmorphism UI at `http://localhost:4001`:
- **AI Status Badge** - Shows if AI features are enabled
- **Stats Panel** - Total visits, searches, and page visits
- **Tab Navigation** - All Activity, Searches, Page Visits, AI Insights
- **AI Insights Tab** - View AI analysis of your browsing patterns
- **Domain Filter** - Filter by most visited domains
- **Language Filter** - Filter repos by programming language
- **Responsive Design** - Works on desktop and mobile

---

## 🏗 Project Structure

```text
search-tracker/
├── search-tracker-backend/
│   ├── server.js           # Express server with SQLite + Gemini AI
│   ├── package.json
│   ├── .env                # PORT, GITHUB_TOKEN, GEMINI_API_KEY
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
GEMINI_API_KEY=your_gemini_api_key
```

> **GitHub Token**: Get from [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens)
> 
> **Gemini API Key**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey) (free tier available)

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
| `/api/recent-visits` | GET | Get recent visits with repos and AI summaries |
| `/api/recent-searches` | GET | Get recent search queries with repos |
| `/api/visit-stats` | GET | Get visit statistics |
| `/api/insights` | GET | Get AI-generated browsing insights |
| `/api/ai-status` | GET | Check AI status and features |
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
| extracted_keywords | TEXT | AI-extracted keywords from title |
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
| ai_summary | TEXT | AI-generated summary |
| created_at | TEXT | ISO timestamp |

---

## 🤖 AI Features in Detail

### Smart Keyword Extraction
When you visit a page, the AI:
1. Analyzes the page title and domain
2. Identifies technical/programming keywords
3. Removes generic words and platform names
4. Returns focused keywords for GitHub search

### Repo Summaries
For each discovered repository, the AI:
1. Reads the repo name and description
2. Considers the context (what you were browsing)
3. Generates a 1-2 sentence summary
4. Explains why it's relevant to your interests

### Browsing Insights
The AI Insights tab provides:
- **Topics** - Main technologies you're exploring
- **Skills** - Skills being developed
- **Learning Style** - How you prefer to learn
- **Learning Path** - Suggested next steps
- **Repo Analysis** - Detailed analysis of top repos with relevance explanations

---

## 🛡 Privacy

- **Local Processing** - All data stays on your machine
- **Optional AI** - Works without Gemini (basic keyword extraction)
- **No Tracking** - No analytics or third-party tracking
- **Skip Patterns** - Internal browser pages are automatically ignored

---

## 📝 License

MIT License - feel free to use, modify, and distribute.
