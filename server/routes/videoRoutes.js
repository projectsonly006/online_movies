import express from "express";

import {
  upload,
  uploadVideo,
  createVideoFromUrl,
  createLocalVideo,
  createWatchableFromWeTransfer,
  getVideos,
  getVideo,
  updateVideo,
  deleteVideo,
  getDownloadProgress,
  streamVideo,
} from "../controllers/videoController.js";

import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// ======================================================
// ADMIN
// ======================================================

// Upload video
router.post("/upload", adminAuth, upload.single("video"), uploadVideo);

// Create video from external URL
router.post("/create-url", adminAuth, createVideoFromUrl);

// Create video from an existing local file
router.post("/create-local", adminAuth, createLocalVideo);

// WeTransfer → download → /videos → MongoDB
router.post("/create-watchable", adminAuth, createWatchableFromWeTransfer);

// Download progress
router.get("/download-progress/:jobId", adminAuth, getDownloadProgress);

// Update video
router.put("/:id", adminAuth, updateVideo);

// Delete video
router.delete("/:id", adminAuth, deleteVideo);

// ======================================================
// PUBLIC
// ======================================================

// Get all videos
router.get("/", getVideos);

// IMPORTANT: put stream before /:id
router.get("/stream/:id", streamVideo);

// Get single video
router.get("/:id", getVideo);

export default router;
