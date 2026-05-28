require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const { testConnection } = require("./config/database");
const profileRoutes = require("./routes/profileRoutes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Rate limiting: 100 requests per 15 minutes per IP
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests. Please wait before trying again.",
    },
  })
);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    service: "GitHub Profile Analyzer API",
    version: "1.0.0",
    status: "running",
    endpoints: {
      analyzeProfile:  "POST   /api/profiles/analyze/:username  ?force=true",
      listProfiles:    "GET    /api/profiles                    ?page&limit&sortBy&order",
      getProfile:      "GET    /api/profiles/:username",
      deleteProfile:   "DELETE /api/profiles/:username",
      healthCheck:     "GET    /health",
    },
  });
});

app.get("/health", async (req, res) => {
  try {
    const { pool } = require("./config/database");
    await pool.execute("SELECT 1");
    res.json({ status: "ok", db: "connected", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "degraded", db: "disconnected" });
  }
});

app.use("/api/profiles", profileRoutes);

// ─── Error Handling ──────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────
async function start() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`\n🚀 GitHub Profile Analyzer running on http://localhost:${PORT}`);
    console.log(`📖 API docs available at http://localhost:${PORT}/\n`);
  });
}

start();
