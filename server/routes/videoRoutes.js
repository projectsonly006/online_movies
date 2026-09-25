import express from "express";

import {
  uploadVideo,
  createVideoFromUrl,
  createLocalVideo,
  getVideos,
  getVideo,
  updateVideo,
  testDownloadVideo,
  createVideoFromWeTransfer,
  createWatchableFromWeTransfer,
  getDownloadProgress,
  streamVideo,
} from "../controllers/videoController.js";

import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// ==========================================
// ADMIN ONLY - CREATE / MODIFY VIDEOS
// ==========================================

router.post("/upload", adminAuth, uploadVideo);

router.post("/create-url", adminAuth, createVideoFromUrl);

router.post("/create-local", adminAuth, createLocalVideo);

router.post("/test-download", adminAuth, testDownloadVideo);

router.post("/create-wetransfer", adminAuth, createVideoFromWeTransfer);

router.post("/create-watchable", adminAuth, createWatchableFromWeTransfer);

router.put("/:id", adminAuth, updateVideo);

// ==========================================
// PUBLIC - DOWNLOAD PROGRESS
// ==========================================

router.get("/download-progress/:jobId", getDownloadProgress);

// ==========================================
// PUBLIC - VIEW VIDEOS
// ==========================================

router.get("/", getVideos);

router.get("/stream/:id", streamVideo);

router.get("/:id", getVideo);

export default router;
