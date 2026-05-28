-- ============================================================
--  GitHub Profile Analyzer — Database Schema
--  Run: mysql -u root -p < sql/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS github_analyzer
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE github_analyzer;

-- ── 1. Main profiles table ──────────────────────────────────
--    One row per GitHub user; re-analysis updates in place.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS github_profiles (
  id              INT AUTO_INCREMENT PRIMARY KEY,

  -- Identity
  username        VARCHAR(100)  NOT NULL UNIQUE,
  name            VARCHAR(255),
  bio             TEXT,
  location        VARCHAR(255),
  company         VARCHAR(255),
  email           VARCHAR(255),
  blog            VARCHAR(500),
  avatar_url      VARCHAR(500),
  github_url      VARCHAR(500),

  -- Raw GitHub counts
  public_repos    INT           NOT NULL DEFAULT 0,
  public_gists    INT           NOT NULL DEFAULT 0,
  followers       INT           NOT NULL DEFAULT 0,
  following       INT           NOT NULL DEFAULT 0,

  -- Computed metrics
  account_age_days      INT           NOT NULL DEFAULT 0,
  follower_ratio        DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  repos_per_year        DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  activity_score        DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  influence_tier        ENUM(
                          'Newcomer',
                          'Explorer',
                          'Contributor',
                          'Influencer',
                          'Star'
                        ) NOT NULL DEFAULT 'Newcomer',

  -- JSON insight blobs
  top_languages         JSON,   -- {"JavaScript":12,"Python":5}
  topic_tags            JSON,   -- {"web":8,"api":4}
  repo_size_distribution JSON,  -- {"small":5,"medium":3,"large":2}

  -- Profile health flags
  has_profile_readme    TINYINT(1)    NOT NULL DEFAULT 0,
  is_hireable           TINYINT(1)    NOT NULL DEFAULT 0,
  is_verified_email     TINYINT(1)    NOT NULL DEFAULT 0,
  profile_completeness  INT           NOT NULL DEFAULT 0,  -- 0–100

  -- GitHub timestamps
  github_created_at     DATETIME,
  github_updated_at     DATETIME,

  -- Record management
  analyzed_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_refreshed_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_username      (username),
  INDEX idx_influence_tier (influence_tier),
  INDEX idx_followers      (followers DESC),
  INDEX idx_activity_score (activity_score DESC),
  INDEX idx_analyzed_at    (analyzed_at DESC)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 2. Repository details ────────────────────────────────────
--    Top 10 repos (by stars) per user; replaced on each analysis.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_repositories (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  profile_id      INT           NOT NULL,

  repo_name       VARCHAR(255)  NOT NULL,
  full_name       VARCHAR(500),
  description     TEXT,
  html_url        VARCHAR(500),
  language        VARCHAR(100),

  stargazers      INT           NOT NULL DEFAULT 0,
  forks           INT           NOT NULL DEFAULT 0,
  watchers        INT           NOT NULL DEFAULT 0,
  open_issues     INT           NOT NULL DEFAULT 0,

  is_fork         TINYINT(1)    NOT NULL DEFAULT 0,
  is_archived     TINYINT(1)    NOT NULL DEFAULT 0,
  topics          JSON,

  repo_created_at DATETIME,
  repo_pushed_at  DATETIME,

  FOREIGN KEY (profile_id)
    REFERENCES github_profiles(id)
    ON DELETE CASCADE,

  INDEX idx_profile_id (profile_id),
  INDEX idx_stargazers  (stargazers DESC)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 3. Analysis history ──────────────────────────────────────
--    Snapshot written on every analysis; enables trend tracking.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analysis_history (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  profile_id      INT           NOT NULL,
  username        VARCHAR(100)  NOT NULL,

  followers_snapshot        INT,
  following_snapshot        INT,
  public_repos_snapshot     INT,
  activity_score_snapshot   DECIMAL(10,4),

  analyzed_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (profile_id)
    REFERENCES github_profiles(id)
    ON DELETE CASCADE,

  INDEX idx_profile_id (profile_id),
  INDEX idx_analyzed_at (analyzed_at DESC)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
