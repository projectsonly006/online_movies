import express from "express";

import {
  uploadVideo,
  createVideoFromUrl,
  createLocalVideo,
  getVideos,
  getVideo,
  updateVideo,
  testDownloadVideo,
  createWatchableFromWeTransfer,
  getDownloadProgress,
  streamVideo,
} from "../controllers/videoController.js";

import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// ==========================================
// ADMIN ONLY - CREATE / MODIFY VIDEOS
// ==========================================

// Upload video file to local /videos folder
router.post("/upload", adminAuth, uploadVideo);

// Create video from an existing external URL
router.post("/create-url", adminAuth, createVideoFromUrl);

// Create video from an existing local /videos file
router.post("/create-local", adminAuth, createLocalVideo);

// Test direct download of a signed URL
router.post("/test-download", adminAuth, testDownloadVideo);

// Start background WeTransfer download
router.post("/create-watchable", adminAuth, createWatchableFromWeTransfer);

// Update video
router.put("/:id", adminAuth, updateVideo);

// ==========================================
// PUBLIC - DOWNLOAD PROGRESS
// ==========================================

router.get("/download-progress/:jobId", getDownloadProgress);

// ==========================================
// PUBLIC - VIDEO LIST
// ==========================================

router.get("/", getVideos);

// ==========================================
// PUBLIC - VIDEO STREAM
// ==========================================

router.get("/stream/:id", streamVideo);

// ==========================================
// PUBLIC - SINGLE VIDEo
// ==========================================

router.get("/:id", getVideo);

export default router;
