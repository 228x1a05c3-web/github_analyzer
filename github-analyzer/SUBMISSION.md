# Submission Checklist

## 1. GitHub Repository

**Steps to create yours:**

```bash
# In the project folder:
git init
git add .
git commit -m "feat: GitHub Profile Analyzer API"

# On github.com: create a new repo, then:
git remote add origin https://github.com/<your-username>/github-profile-analyzer.git
git branch -M main
git push -u origin main
```

Expected URL: `https://github.com/<your-username>/github-profile-analyzer`

---

## 2. Live Deployed API URL

Deploy on **Railway** (free, Node.js + MySQL, no credit card):

1. Go to https://railway.app → **New Project → Deploy from GitHub repo**
2. Select your repository
3. **+ New → Database → MySQL** (Railway injects `MYSQL_*` env vars automatically)
4. In the **Variables** tab, add:

```
DB_HOST      = ${{MySQL.MYSQL_HOST}}
DB_PORT      = ${{MySQL.MYSQL_PORT}}
DB_USER      = ${{MySQL.MYSQL_USER}}
DB_PASSWORD  = ${{MySQL.MYSQL_PASSWORD}}
DB_NAME      = ${{MySQL.MYSQL_DATABASE}}
GITHUB_TOKEN = ghp_<your_token>
NODE_ENV     = production
```

5. In MySQL's **Query** tab, paste contents of `sql/schema.sql`
6. Railway auto-deploys. Public URL: `https://<app>.up.railway.app`

**Verify:** `curl https://<app>.up.railway.app/health`

---

## 3. README

See [`README.md`](README.md) — covers setup, all endpoints, schema, scoring system, and deployment.

---

## 4. Database Schema / Export

See [`sql/schema.sql`](sql/schema.sql) — complete DDL with all 3 tables, indexes, foreign keys, and inline comments.

### Tables

| Table | Purpose |
|---|---|
| `github_profiles` | Primary insights table, one row per user |
| `profile_repositories` | Top 10 repos per profile (stars desc) |
| `analysis_history` | Snapshot log for time-series tracking |

### Export existing data (after populating locally)

```bash
# Schema only
mysqldump -u root -p --no-data github_analyzer > db_schema_export.sql

# Schema + data
mysqldump -u root -p github_analyzer > db_full_export.sql
```
