const axios = require("axios");

const GITHUB_API_BASE = "https://api.github.com";

// Build axios instance with auth header if token is provided
const githubClient = axios.create({
  baseURL: GITHUB_API_BASE,
  timeout: 10000,
  headers: {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "GitHub-Profile-Analyzer/1.0",
    ...(process.env.GITHUB_TOKEN && {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    }),
  },
});

/**
 * Fetch basic user profile from GitHub API
 */
async function fetchUserProfile(username) {
  try {
    const { data } = await githubClient.get(`/users/${username}`);
    return data;
  } catch (err) {
    if (err.response?.status === 404) {
      throw { status: 404, message: `GitHub user '${username}' not found.` };
    }
    if (err.response?.status === 403) {
      throw {
        status: 429,
        message:
          "GitHub API rate limit exceeded. Add a GITHUB_TOKEN in .env for higher limits.",
      };
    }
    throw {
      status: 502,
      message: `GitHub API error: ${err.response?.data?.message || err.message}`,
    };
  }
}

/**
 * Fetch up to 100 public repositories for a user (sorted by stars)
 */
async function fetchUserRepos(username) {
  try {
    const { data } = await githubClient.get(`/users/${username}/repos`, {
      params: { per_page: 100, sort: "updated", type: "public" },
    });
    return data;
  } catch (err) {
    console.warn(`Could not fetch repos for ${username}:`, err.message);
    return [];
  }
}

/**
 * Check if a user has a profile README (username/username repo)
 */
async function checkProfileReadme(username) {
  try {
    await githubClient.get(`/repos/${username}/${username}/readme`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute derived insights from raw GitHub data
 */
function computeInsights(profile, repos, hasReadme) {
  const createdAt = new Date(profile.created_at);
  const now = new Date();
  const accountAgeDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
  const accountAgeYears = accountAgeDays / 365;

  // Follower-to-following ratio
  const followerRatio =
    profile.following > 0
      ? parseFloat((profile.followers / profile.following).toFixed(4))
      : profile.followers > 0
      ? parseFloat(profile.followers.toFixed(4))
      : 0;

  // Repos created per year of account age
  const reposPerYear =
    accountAgeYears > 0
      ? parseFloat((profile.public_repos / accountAgeYears).toFixed(4))
      : profile.public_repos;

  // --- Language Distribution ---
  const languageCounts = {};
  repos.forEach((repo) => {
    if (repo.language) {
      languageCounts[repo.language] = (languageCounts[repo.language] || 0) + 1;
    }
  });
  // Sort by count desc, top 10
  const topLanguages = Object.fromEntries(
    Object.entries(languageCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
  );

  // --- Topic Tags ---
  const topicCounts = {};
  repos.forEach((repo) => {
    (repo.topics || []).forEach((topic) => {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });
  });
  const topTopics = Object.fromEntries(
    Object.entries(topicCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
  );

  // --- Repository Size Distribution ---
  const repoSizes = { small: 0, medium: 0, large: 0 };
  repos.forEach((repo) => {
    if (repo.size < 1000) repoSizes.small++;
    else if (repo.size < 10000) repoSizes.medium++;
    else repoSizes.large++;
  });

  // --- Profile Completeness Score (0-100) ---
  let completeness = 0;
  if (profile.name) completeness += 15;
  if (profile.bio) completeness += 20;
  if (profile.location) completeness += 10;
  if (profile.email) completeness += 15;
  if (profile.blog) completeness += 10;
  if (profile.company) completeness += 10;
  if (profile.twitter_username) completeness += 5;
  if (hasReadme) completeness += 15;

  // --- Composite Activity Score (0-100) ---
  // Weights: followers(35) + repos(25) + stars(25) + completeness(15)
  const totalStars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);
  const followerScore = Math.min(profile.followers / 1000, 1) * 35;
  const repoScore = Math.min(profile.public_repos / 100, 1) * 25;
  const starScore = Math.min(totalStars / 500, 1) * 25;
  const completenessScore = (completeness / 100) * 15;
  const activityScore = parseFloat(
    (followerScore + repoScore + starScore + completenessScore).toFixed(4)
  );

  // --- Influence Tier ---
  let influenceTier = "Newcomer";
  if (activityScore >= 80) influenceTier = "Star";
  else if (activityScore >= 55) influenceTier = "Influencer";
  else if (activityScore >= 30) influenceTier = "Contributor";
  else if (activityScore >= 10) influenceTier = "Explorer";

  return {
    accountAgeDays,
    followerRatio,
    reposPerYear,
    topLanguages,
    topTopics,
    repoSizes,
    profileCompleteness: completeness,
    activityScore,
    influenceTier,
    hasReadme,
  };
}

/**
 * Pick the top N repos by star count for storage
 */
function selectTopRepos(repos, limit = 10) {
  return [...repos]
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    .slice(0, limit);
}

module.exports = {
  fetchUserProfile,
  fetchUserRepos,
  checkProfileReadme,
  computeInsights,
  selectTopRepos,
};
