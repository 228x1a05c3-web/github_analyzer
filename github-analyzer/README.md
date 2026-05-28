# GitHub Profile Analyzer API

> A production-grade Node.js + Express + MySQL backend service that fetches GitHub user profiles via the GitHub public API, computes rich developer insights, and stores them in a relational database.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-blue)](https://expressjs.com)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-orange)](https://mysql.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## Live API

```
https://<your-railway-app>.up.railway.app
```

> See [Deployment](#deployment) section for how to get your own live URL in ~5 minutes using Railway.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Local Setup](#local-setup)
5. [Environment Variables](#environment-variables)
6. [Database Schema](#database-schema)
7. [API Reference](#api-reference)
8. [Deployment (Railway)](#deployment)
9. [GitHub Repository Setup](#github-repository-setup)
10. [Influence Scoring System](#influence-scoring-system)
11. [Rate Limits](#rate-limits)

---

## Features

| Feature | Details |
|---|---|
| **GitHub Data Fetching** | User profile, all public repos, profile README detection — all in parallel |
| **Computed Insights** | Activity score (0–100), influence tier, follower ratio, repos/year |
| **Language Breakdown** | Top 10 programming languages aggregated across all repos |
| **Repository Storage** | Top 10 repos by stars with full metadata (forks, issues, topics, dates) |
| **Profile Completeness** | 0–100 score across 8 fields (bio, location, email, blog, etc.) |
| **Influence Tiers** | Newcomer → Explorer → Contributor → Influencer → Star |
| **Analysis History** | Re-analysis saves time-series snapshots for trend tracking |
| **Smart Caching** | Skips GitHub re-fetch if analyzed within 60 min; bypass with `?force=true` |
| **Pagination & Sorting** | List endpoint supports `page`, `limit`, `sortBy`, `order` |
| **Rate Limiting** | 100 req/15 min per IP (configurable) |
| **Input Validation** | `express-validator` on all routes with descriptive error messages |

---

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **Database**: MySQL 8.0 via `mysql2` (promise-based connection pool)
- **External API**: GitHub REST API v3
- **Libraries**: `axios`, `cors`, `morgan`, `dotenv`, `express-rate-limit`, `express-validator`

---

## Project Structure

```
github-analyzer/
├── src/
│   ├── index.js                    # Express app bootstrap
│   ├── config/
│   │   └── database.js             # MySQL connection pool
│   ├── controllers/
│   │   └── profileController.js    # Route handlers (analyze, list, get, delete)
│   ├── models/
│   │   └── profileModel.js         # All DB queries (upsert, fetch, history)
│   ├── routes/
│   │   └── profileRoutes.js        # Route definitions + validation rules
│   ├── services/
│   │   └── githubService.js        # GitHub API client + insight computation engine
│   └── middleware/
│       └── errorHandler.js         # Global 404 + error handler
├── sql/
│   └── schema.sql                  # Full DB schema — run once to initialise
├── .env.example                    # Environment variable template
├── .gitignore
├── package.json
└── README.md
```

---

## Local Setup

### Prerequisites

- Node.js 18+
- MySQL 8.0+ (running locally or via Docker)

### Step 1 — Clone the repo

```bash
git clone https://github.com/<your-username>/github-profile-analyzer.git
cd github-profile-analyzer
```

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Create the database

Log into MySQL and run the schema:

```bash
mysql -u root -p < sql/schema.sql
```

Or manually:

```sql
CREATE DATABASE github_analyzer;
USE github_analyzer;
-- then paste contents of sql/schema.sql
```

### Step 4 — Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your values (see [Environment Variables](#environment-variables)).

### Step 5 — Start the server

```bash
# Development with auto-restart
npm run dev

# Production
npm start
```

Server starts at **http://localhost:3000**

Visit `http://localhost:3000` for the endpoint index, or `http://localhost:3000/health` to verify the DB connection.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `DB_HOST` | Yes | `localhost` | MySQL host |
| `DB_PORT` | No | `3306` | MySQL port |
| `DB_USER` | Yes | — | MySQL username |
| `DB_PASSWORD` | Yes | — | MySQL password |
| `DB_NAME` | Yes | `github_analyzer` | MySQL database name |
| `GITHUB_TOKEN` | Recommended | — | GitHub PAT — raises rate limit from 60 to 5,000 req/hr |
| `CACHE_DURATION_MINUTES` | No | `60` | Minutes before a profile is eligible for re-fetch |

> **Getting a GitHub token**: Go to https://github.com/settings/tokens → *Generate new token (classic)* → no scopes required for public data.

---

## Database Schema

The schema lives in [`sql/schema.sql`](sql/schema.sql). Three tables:

### `github_profiles` — main insights table

```sql
id                    INT PK AUTO_INCREMENT
username              VARCHAR(100) UNIQUE
name, bio, location, company, email, blog
avatar_url, github_url
public_repos          INT
public_gists          INT
followers             INT
following             INT
account_age_days      INT
follower_ratio        DECIMAL(10,4)   -- followers / following
repos_per_year        DECIMAL(10,4)   -- repos / account age in years
activity_score        DECIMAL(10,4)   -- composite 0-100 score
influence_tier        ENUM('Newcomer','Explorer','Contributor','Influencer','Star')
top_languages         JSON            -- {"JavaScript":12,"Python":5}
topic_tags            JSON            -- aggregated repo topics
repo_size_distribution JSON           -- {"small":5,"medium":3,"large":2}
has_profile_readme    TINYINT(1)
is_hireable           TINYINT(1)
profile_completeness  INT             -- 0-100
github_created_at     DATETIME
analyzed_at           DATETIME
last_refreshed_at     DATETIME
```

### `profile_repositories` — top 10 repos per user

```sql
id, profile_id (FK), repo_name, full_name, description
html_url, language, stargazers, forks, watchers
open_issues, is_fork, is_archived, topics (JSON)
repo_created_at, repo_pushed_at
```

### `analysis_history` — time-series snapshots

```sql
id, profile_id (FK), username
followers_snapshot, following_snapshot
public_repos_snapshot, activity_score_snapshot
analyzed_at
```

---

## API Reference

Base URL: `http://localhost:3000` (local) or your deployed URL.

---

### `POST /api/profiles/analyze/:username`

Fetches the GitHub profile, computes all insights, and stores them in MySQL. If the profile was analyzed within the cache window, returns the cached version.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `force` | `true` / `false` | Bypass cache and re-fetch from GitHub |

**Example:**
```bash
curl -X POST http://localhost:3000/api/profiles/analyze/torvalds

# Force re-analysis
curl -X POST "http://localhost:3000/api/profiles/analyze/torvalds?force=true"
```

**Response `201 Created`:**
```json
{
  "success": true,
  "message": "Profile for 'torvalds' analyzed and stored successfully.",
  "cached": false,
  "data": {
    "id": 1,
    "username": "torvalds",
    "name": "Linus Torvalds",
    "public_repos": 7,
    "followers": 230000,
    "following": 0,
    "activity_score": "95.2500",
    "influence_tier": "Star",
    "top_languages": { "C": 4, "Python": 2 },
    "profile_completeness": 75,
    "has_profile_readme": 0,
    "analyzed_at": "2026-05-28T10:00:00.000Z",
    "repositories": [
      {
        "repo_name": "linux",
        "language": "C",
        "stargazers": 180000,
        "forks": 55000,
        "topics": ["kernel", "os"]
      }
    ],
    "history": []
  }
}
```

---

### `GET /api/profiles`

Returns all analyzed profiles from the database with pagination and sorting.

**Query params:**

| Param | Default | Options |
|---|---|---|
| `page` | `1` | any integer |
| `limit` | `20` | `1`–`100` |
| `sortBy` | `analyzed_at` | `username`, `followers`, `public_repos`, `activity_score`, `analyzed_at` |
| `order` | `DESC` | `ASC`, `DESC` |

**Example:**
```bash
curl "http://localhost:3000/api/profiles?sortBy=followers&order=DESC&limit=5"
```

**Response `200 OK`:**
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 5,
    "totalPages": 9,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

### `GET /api/profiles/:username`

Returns the full stored profile for one user, including their top repositories and the last 10 analysis snapshots.

```bash
curl http://localhost:3000/api/profiles/torvalds
```

**Response `200 OK`:** Full profile object (same as analyze response) + `repositories[]` + `history[]`.

**`404 Not Found`** if the username has never been analyzed.

---

### `DELETE /api/profiles/:username`

Removes a profile and all associated repository and history records (CASCADE).

```bash
curl -X DELETE http://localhost:3000/api/profiles/torvalds
```

---

### `GET /health`

DB connectivity check for monitoring/uptime tools.

```json
{ "status": "ok", "db": "connected", "timestamp": "2026-05-28T10:00:00.000Z" }
```

---

## Deployment

**Railway** is the easiest way to deploy this stack — it hosts both Node.js and MySQL for free with no credit card required to start.

### Step-by-step

**1. Push to GitHub first** (see [GitHub Repository Setup](#github-repository-setup))

**2. Create a Railway account** at https://railway.app and click **New Project → Deploy from GitHub repo** → select your repo.

**3. Add a MySQL plugin**: Inside your Railway project, click **+ New** → **Database** → **MySQL**. Railway auto-sets `MYSQL_*` environment variables.

**4. Set environment variables** in Railway's **Variables** tab:

```
DB_HOST      = ${{MySQL.MYSQL_HOST}}
DB_PORT      = ${{MySQL.MYSQL_PORT}}
DB_USER      = ${{MySQL.MYSQL_USER}}
DB_PASSWORD  = ${{MySQL.MYSQL_PASSWORD}}
DB_NAME      = ${{MySQL.MYSQL_DATABASE}}
GITHUB_TOKEN = ghp_xxxxxxxxxxxxxxxxxxxx
NODE_ENV     = production
```

**5. Run the schema** — in Railway's MySQL service, open the **Query** tab and paste the contents of `sql/schema.sql`.

**6. Deploy** — Railway auto-deploys on every push to `main`.

**7. Get your URL** — Railway provides a public URL like `https://github-profile-analyzer-production.up.railway.app`.

---

## GitHub Repository Setup

```bash
# Inside the project folder
git init
git add .
git commit -m "feat: initial GitHub Profile Analyzer API"

# Create a repo on github.com, then:
git remote add origin https://github.com/<your-username>/github-profile-analyzer.git
git branch -M main
git push -u origin main
```

> Make sure `.env` is in `.gitignore` (it already is) — never commit real credentials.

---

## Influence Scoring System

### Influence Tiers

| Tier | Activity Score |
|---|---|
| Newcomer | 0 – 9.99 |
| Explorer | 10 – 29.99 |
| Contributor | 30 – 54.99 |
| Influencer | 55 – 79.99 |
| Star | 80 – 100 |

### Activity Score Formula (0–100)

```
score = followers_score (35%)
      + repos_score     (25%)
      + stars_score     (25%)
      + completeness    (15%)

followers_score = min(followers / 1000, 1) × 35
repos_score     = min(public_repos / 100, 1) × 25
stars_score     = min(total_stars / 500, 1) × 25
completeness    = (profile_completeness / 100) × 15
```

### Profile Completeness Breakdown

| Field | Points |
|---|---|
| Name | 15 |
| Bio | 20 |
| Email | 15 |
| Location | 10 |
| Blog/Website | 10 |
| Company | 10 |
| Twitter username | 5 |
| Profile README | 15 |
| **Total** | **100** |

---

## Rate Limits

| Layer | Limit |
|---|---|
| This API (per IP) | 100 requests / 15 minutes |
| GitHub API (no token) | 60 requests / hour |
| GitHub API (with token) | 5,000 requests / hour |

---

## License

MIT
