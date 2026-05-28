const {
  fetchUserProfile,
  fetchUserRepos,
  checkProfileReadme,
  computeInsights,
  selectTopRepos,
} = require("../services/githubService");

const {
  upsertProfile,
  upsertRepositories,
  saveHistory,
  getAllProfiles,
  getProfileByUsername,
  getProfileMeta,
} = require("../models/profileModel");

const CACHE_MINUTES = parseInt(process.env.CACHE_DURATION_MINUTES) || 60;

/**
 * POST /api/profiles/analyze/:username
 * Fetch from GitHub, compute insights, persist to DB
 */
async function analyzeProfile(req, res) {
  const { username } = req.params;
  const { force = false } = req.query; // ?force=true bypasses cache

  try {
    // Check if recently analyzed (skip re-fetch if fresh)
    if (!force) {
      const meta = await getProfileMeta(username);
      if (meta) {
        const ageMinutes =
          (Date.now() - new Date(meta.last_refreshed_at)) / 60000;
        if (ageMinutes < CACHE_MINUTES) {
          const cached = await getProfileByUsername(username);
          return res.json({
            success: true,
            message: `Profile loaded from cache (refreshed ${Math.floor(ageMinutes)}m ago). Use ?force=true to re-analyze.`,
            cached: true,
            data: cached,
          });
        }
      }
    }

    // 1. Fetch GitHub data in parallel
    const [githubProfile, repos, hasReadme] = await Promise.all([
      fetchUserProfile(username),
      fetchUserRepos(username),
      checkProfileReadme(username),
    ]);

    // 2. Compute derived insights
    const insights = computeInsights(githubProfile, repos, hasReadme);

    // 3. Build DB payload
    const profilePayload = {
      username: githubProfile.login,
      name: githubProfile.name,
      bio: githubProfile.bio,
      location: githubProfile.location,
      company: githubProfile.company,
      email: githubProfile.email,
      blog: githubProfile.blog,
      avatarUrl: githubProfile.avatar_url,
      githubUrl: githubProfile.html_url,
      publicRepos: githubProfile.public_repos,
      publicGists: githubProfile.public_gists,
      followers: githubProfile.followers,
      following: githubProfile.following,
      isHireable: githubProfile.hireable,
      githubCreatedAt: githubProfile.created_at,
      githubUpdatedAt: githubProfile.updated_at,
      ...insights,
      topLanguages: insights.topLanguages,
      topTopics: insights.topTopics,
      repoSizes: insights.repoSizes,
      profileCompleteness: insights.profileCompleteness,
    };

    // 4. Persist to MySQL
    const profileId = await upsertProfile(profilePayload);
    const topRepos = selectTopRepos(repos, 10);
    await upsertRepositories(profileId, topRepos);
    await saveHistory(profileId, {
      username: githubProfile.login,
      followers: githubProfile.followers,
      following: githubProfile.following,
      publicRepos: githubProfile.public_repos,
      activityScore: insights.activityScore,
    });

    // 5. Return the full saved record
    const saved = await getProfileByUsername(githubProfile.login);

    return res.status(201).json({
      success: true,
      message: `Profile for '${githubProfile.login}' analyzed and stored successfully.`,
      cached: false,
      data: saved,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
}

/**
 * GET /api/profiles
 * List all analyzed profiles (paginated)
 */
async function listProfiles(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const sortBy = req.query.sortBy || "analyzed_at";
    const order = req.query.order || "DESC";

    const result = await getAllProfiles({ page, limit, sortBy, order });

    return res.json({
      success: true,
      data: result.profiles,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
        hasNext: result.page * result.limit < result.total,
        hasPrev: result.page > 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/profiles/:username
 * Fetch a single stored profile with repos and history
 */
async function getProfile(req, res) {
  try {
    const { username } = req.params;
    const profile = await getProfileByUsername(username);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: `Profile '${username}' not found. Use POST /api/profiles/analyze/${username} to analyze it first.`,
      });
    }

    return res.json({ success: true, data: profile });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * DELETE /api/profiles/:username
 * Remove a stored profile
 */
async function deleteProfile(req, res) {
  try {
    const { username } = req.params;
    const [result] = await require("../config/database").pool.execute(
      "DELETE FROM github_profiles WHERE username = ?",
      [username]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: `Profile '${username}' not found.` });
    }

    return res.json({
      success: true,
      message: `Profile '${username}' deleted successfully.`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { analyzeProfile, listProfiles, getProfile, deleteProfile };
