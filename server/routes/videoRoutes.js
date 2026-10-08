import express from "express";

import {
  uploadVideo,
  createVideoFromUrl,
  createLocalVideo,
  getVideos,
  getVideo,
  updateVideo,
  // createWatchableFromWeTransfer,
  // streamVideo,
  deleteVideo,
  // checkVideoAvailability,
  getDownloadProgress,
} from "../controllers/videoController.js";

import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// ADMIN
router.post("/upload", adminAuth, uploadVideo);
router.post("/create-url", adminAuth, createVideoFromUrl);
router.post("/create-local", adminAuth, createLocalVideo);
// router.post("/create-watchable", adminAuth, createWatchableFromWeTransfer);

router.get("/download-progress/:jobId", adminAuth, getDownloadProgress);

router.put("/:id", adminAuth, updateVideo);
router.delete("/:id", adminAuth, deleteVideo);

// PUBLIC
router.get("/", getVideos);
// router.get("/stream/:id", streamVideo);
// router.get("/availability/:id", checkVideoAvailability);
router.get("/:id", getVideo);

export default router;
