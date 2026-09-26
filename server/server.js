import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import connectDB from "./config/db.js";
import videoRoutes from "./routes/videoRoutes.js";
import authRoutes from "./routes/authRoutes.js";

dotenv.config();

const app = express();

// ==========================================
// PATH SETUP
// ==========================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const videoFolder = path.join(__dirname, "videos");

console.log("Video folder:", videoFolder);

// ==========================================
// DATABASE
// ==========================================

connectDB();

// ==========================================
// CORS
// ==========================================

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);

// ==========================================
// JSON
// ==========================================

app.use(express.json());

// ==========================================
// SERVE VIDEO FILES
// ==========================================

app.use("/videos", express.static(videoFolder));

app.get("/debug/videos", async (req, res) => {
  try {
    const files = await fs.promises.readdir(videoFolder);

    res.json({
      folder: videoFolder,
      files,
    });
  } catch (error) {
    console.error("DEBUG VIDEOS ERROR:", error);

    res.status(500).json({
      error: error.message,
    });
  }
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/", (req, res) => {
  res.json({
    message: "Video Link API is running",
  });
});

// ==========================================
// AUTH ROUTES
// ==========================================

app.use("/api/auth", authRoutes);

// ==========================================
// VIDEO ROUTES
// ==========================================

app.use("/api/videos", videoRoutes);

// ==========================================
// ERROR HANDLER
// ==========================================

app.use((error, req, res, next) => {
  console.error(error);

  res.status(500).json({
    message: error.message || "Something went wrong",
  });
});

// ==========================================
// SERVER
// ==========================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
