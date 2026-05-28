const { pool } = require("../config/database");

/**
 * Upsert a full profile record into the DB.
 * Returns the inserted/updated profile id.
 */
async function upsertProfile(profileData) {
  const {
    username, name, bio, location, company, email, blog, avatarUrl, githubUrl,
    publicRepos, publicGists, followers, following,
    accountAgeDays, followerRatio, reposPerYear, activityScore, influenceTier,
    topLanguages, topTopics, repoSizes,
    hasReadme, isHireable, profileCompleteness,
    githubCreatedAt, githubUpdatedAt,
  } = profileData;

  const sql = `
    INSERT INTO github_profiles (
      username, name, bio, location, company, email, blog, avatar_url, github_url,
      public_repos, public_gists, followers, following,
      account_age_days, follower_ratio, repos_per_year, activity_score, influence_tier,
      top_languages, topic_tags, repo_size_distribution,
      has_profile_readme, is_hireable, profile_completeness,
      github_created_at, github_updated_at, analyzed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?,
              ?, ?, ?,
              ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      name = VALUES(name), bio = VALUES(bio), location = VALUES(location),
      company = VALUES(company), email = VALUES(email), blog = VALUES(blog),
      avatar_url = VALUES(avatar_url), github_url = VALUES(github_url),
      public_repos = VALUES(public_repos), public_gists = VALUES(public_gists),
      followers = VALUES(followers), following = VALUES(following),
      account_age_days = VALUES(account_age_days), follower_ratio = VALUES(follower_ratio),
      repos_per_year = VALUES(repos_per_year), activity_score = VALUES(activity_score),
      influence_tier = VALUES(influence_tier), top_languages = VALUES(top_languages),
      topic_tags = VALUES(topic_tags), repo_size_distribution = VALUES(repo_size_distribution),
      has_profile_readme = VALUES(has_profile_readme), is_hireable = VALUES(is_hireable),
      profile_completeness = VALUES(profile_completeness),
      github_created_at = VALUES(github_created_at),
      github_updated_at = VALUES(github_updated_at),
      last_refreshed_at = NOW()
  `;

  const values = [
    username, name || null, bio || null, location || null, company || null,
    email || null, blog || null, avatarUrl || null, githubUrl || null,
    publicRepos, publicGists, followers, following,
    accountAgeDays, followerRatio, reposPerYear, activityScore, influenceTier,
    JSON.stringify(topLanguages), JSON.stringify(topTopics), JSON.stringify(repoSizes),
    hasReadme ? 1 : 0, isHireable ? 1 : 0, profileCompleteness,
    githubCreatedAt ? new Date(githubCreatedAt) : null,
    githubUpdatedAt ? new Date(githubUpdatedAt) : null,
  ];

  const [result] = await pool.execute(sql, values);

  // Get the actual profile id (insertId is 0 on UPDATE, so fetch by username)
  const [rows] = await pool.execute(
    "SELECT id FROM github_profiles WHERE username = ?",
    [username]
  );
  return rows[0].id;
}

/**
 * Replace all stored repos for a profile
 */
async function upsertRepositories(profileId, repos) {
  // Delete old entries first
  await pool.execute(
    "DELETE FROM profile_repositories WHERE profile_id = ?",
    [profileId]
  );

  if (!repos || repos.length === 0) return;

  const sql = `
    INSERT INTO profile_repositories (
      profile_id, repo_name, full_name, description, html_url, language,
      stargazers, forks, watchers, open_issues, is_fork, is_archived,
      topics, repo_created_at, repo_pushed_at
    ) VALUES ?
  `;

  const values = repos.map((r) => [
    profileId,
    r.name,
    r.full_name,
    r.description || null,
    r.html_url,
    r.language || null,
    r.stargazers_count || 0,
    r.forks_count || 0,
    r.watchers_count || 0,
    r.open_issues_count || 0,
    r.fork ? 1 : 0,
    r.archived ? 1 : 0,
    JSON.stringify(r.topics || []),
    r.created_at ? new Date(r.created_at) : null,
    r.pushed_at ? new Date(r.pushed_at) : null,
  ]);

  await pool.query(sql, [values]);
}

/**
 * Save a snapshot to analysis_history
 */
async function saveHistory(profileId, snapshot) {
  await pool.execute(
    `INSERT INTO analysis_history
       (profile_id, username, followers_snapshot, following_snapshot,
        public_repos_snapshot, activity_score_snapshot)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      profileId,
      snapshot.username,
      snapshot.followers,
      snapshot.following,
      snapshot.publicRepos,
      snapshot.activityScore,
    ]
  );
}

/**
 * Get all analyzed profiles (paginated, sortable)
 */
async function getAllProfiles({ page = 1, limit = 20, sortBy = "analyzed_at", order = "DESC" } = {}) {
  const allowed = ["analyzed_at", "followers", "public_repos", "activity_score", "username"];
  const col = allowed.includes(sortBy) ? sortBy : "analyzed_at";
  const dir = order.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const offset = (page - 1) * limit;

  const [rows] = await pool.execute(
    `SELECT id, username, name, avatar_url, location, public_repos, followers,
            following, activity_score, influence_tier, top_languages,
            profile_completeness, analyzed_at, last_refreshed_at
     FROM github_profiles
     ORDER BY ${col} ${dir}
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const [[{ total }]] = await pool.execute(
    "SELECT COUNT(*) AS total FROM github_profiles"
  );

  return { profiles: rows, total, page, limit };
}

/**
 * Get a single profile with its top repos and history
 */
async function getProfileByUsername(username) {
  const [[profile]] = await pool.execute(
    "SELECT * FROM github_profiles WHERE username = ?",
    [username]
  );
  if (!profile) return null;

  const [repos] = await pool.execute(
    `SELECT repo_name, full_name, description, html_url, language,
            stargazers, forks, watchers, topics, repo_created_at, repo_pushed_at
     FROM profile_repositories
     WHERE profile_id = ?
     ORDER BY stargazers DESC`,
    [profile.id]
  );

  const [history] = await pool.execute(
    `SELECT followers_snapshot, following_snapshot, public_repos_snapshot,
            activity_score_snapshot, analyzed_at
     FROM analysis_history
     WHERE profile_id = ?
     ORDER BY analyzed_at DESC
     LIMIT 10`,
    [profile.id]
  );

  return { ...profile, repositories: repos, history };
}

/**
 * Check if a profile exists and when it was last refreshed
 */
async function getProfileMeta(username) {
  const [[row]] = await pool.execute(
    "SELECT id, last_refreshed_at FROM github_profiles WHERE username = ?",
    [username]
  );
  return row || null;
}

module.exports = {
  upsertProfile,
  upsertRepositories,
  saveHistory,
  getAllProfiles,
  getProfileByUsername,
  getProfileMeta,
};
