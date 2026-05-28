const express = require("express");
const { param, query, validationResult } = require("express-validator");
const {
  analyzeProfile,
  listProfiles,
  getProfile,
  deleteProfile,
} = require("../controllers/profileController");

const router = express.Router();

// Validation middleware
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

const usernameParam = param("username")
  .trim()
  .isLength({ min: 1, max: 100 })
  .matches(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/)
  .withMessage(
    "Invalid GitHub username format (1-39 alphanumeric chars, hyphens allowed, no leading/trailing hyphen)"
  );

/**
 * @route   POST /api/profiles/analyze/:username
 * @desc    Analyze a GitHub profile and store insights
 * @query   ?force=true  – bypass cache and re-fetch from GitHub
 */
router.post(
  "/analyze/:username",
  usernameParam,
  handleValidation,
  analyzeProfile
);

/**
 * @route   GET /api/profiles
 * @desc    List all stored profiles (paginated & sortable)
 * @query   page, limit, sortBy (username|followers|public_repos|activity_score|analyzed_at), order (ASC|DESC)
 */
router.get(
  "/",
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("sortBy")
      .optional()
      .isIn(["username", "followers", "public_repos", "activity_score", "analyzed_at"]),
    query("order").optional().isIn(["ASC", "DESC"]),
  ],
  handleValidation,
  listProfiles
);

/**
 * @route   GET /api/profiles/:username
 * @desc    Get full stored profile data for a single user
 */
router.get("/:username", usernameParam, handleValidation, getProfile);

/**
 * @route   DELETE /api/profiles/:username
 * @desc    Delete a stored profile
 */
router.delete("/:username", usernameParam, handleValidation, deleteProfile);

module.exports = router;
