import express from "express";

import {
  createWatchableFromWeTransfer,
  getVideos,
  getVideo,
  deleteVideo,
} from "../controllers/videoController.js";

import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// Admin
router.post("/create-watchable", adminAuth, createWatchableFromWeTransfer);

router.delete("/:id", adminAuth, deleteVideo);

// Public
router.get("/", getVideos);

router.get("/:id", getVideo);

export default router;
