import express from "express";

import {
  createWatchableFromWeTransfer,
  getVideos,
  getVideo,
  updateVideo,
  deleteVideo,
  streamVideo,
} from "../controllers/videoController.js";

import { protectAdmin } from "../middleware/adminAuth.js";

const router = express.Router();

// ==========================================
// PUBLIC
// ==========================================

router.get("/", getVideos);

router.get("/:id", getVideo);

router.get("/stream/:id", streamVideo);

// ==========================================
// ADMIN
// ==========================================

router.post("/create-watchable", protectAdmin, createWatchableFromWeTransfer);

router.put("/:id", protectAdmin, updateVideo);

router.delete("/:id", protectAdmin, deleteVideo);

export default router;
