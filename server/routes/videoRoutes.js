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
import { getProgress } from "../utils/progressStore.js";

const router = express.Router();

// ======================================================
// ADMIN ROUTES
// ======================================================

// Upload video
router.post("/upload", adminAuth, upload.single("video"), uploadVideo);

// Create video from external URL
router.post("/create-url", adminAuth, createVideoFromUrl);

// Create video from existing local file
router.post("/create-local", adminAuth, createLocalVideo);

// Start WeTransfer download
router.post("/create-watchable", adminAuth, createWatchableFromWeTransfer);

// Download progress (existing controller)
router.get("/download-progress/:jobId", adminAuth, getDownloadProgress);

// Live progress polling
router.get("/progress/:jobId", adminAuth, (req, res) => {
  const progress = getProgress(req.params.jobId);

  if (!progress) {
    return res.status(404).json({
      success: false,
      message: "Download progress not found",
    });
  }

  return res.json({
    success: true,
    progress,
  });
});

// Update video
router.put("/:id", adminAuth, updateVideo);

// Delete video
router.delete("/:id", adminAuth, deleteVideo);

// ======================================================
// PUBLIC ROUTES
// ======================================================

// Get all videos
router.get("/", getVideos);

// Stream local video
router.get("/stream/:id", streamVideo);

// Get single video
router.get("/:id", getVideo);

export default router;
