import axios from "axios";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

import Video from "../models/Video.js";

// ==========================================
// SERVER URL
// ==========================================

const SERVER_URL =
  process.env.SERVER_URL || "https://online-movies-uebc.onrender.com";

// ==========================================
// HELPERS
// ==========================================

function getVideoUrl(videoId) {
  return `${SERVER_URL}/api/videos/stream/${videoId}`;
}

function getExpiryDate(expiresAt) {
  if (!expiresAt) {
    return null;
  }

  const date = new Date(expiresAt);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getExtensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;

    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);

    if (match) {
      return match[1].toLowerCase();
    }
  } catch {}

  return "mp4";
}

function getMimeType(extension) {
  const mimeTypes = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    ogv: "video/ogg",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
  };

  return mimeTypes[extension] || "video/mp4";
}

// ==========================================
// CREATE WATCHABLE VIDEO
// ==========================================
//
// IMPORTANT:
// This DOES NOT download the video.
//
// It only stores the source URL + metadata.
//
// ==========================================

export const createWatchableFromWeTransfer = async (req, res) => {
  try {
    const {
      signedFileUrl,
      title = "",
      cbc = "",
      thumbnailUrl = "",
      duration = 0,
      format = "",
      size = 0,
      expiresAt,
    } = req.body;

    // ==========================================
    // VALIDATE URL
    // ==========================================

    if (!signedFileUrl || typeof signedFileUrl !== "string") {
      return res.status(400).json({
        success: false,
        message: "Video URL is required",
      });
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(signedFileUrl);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid video URL",
      });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        success: false,
        message: "Only HTTP and HTTPS URLs are supported",
      });
    }

    // ==========================================
    // TITLE
    // ==========================================

    const cleanTitle = String(title || "").trim();

    if (!cleanTitle) {
      return res.status(400).json({
        success: false,
        message: "Movie title is required",
      });
    }

    // ==========================================
    // CBC
    // ==========================================

    const cleanCbc = String(cbc || "").trim();

    if (!cleanCbc) {
      return res.status(400).json({
        success: false,
        message: "CBC rating is required",
      });
    }

    // ==========================================
    // EXPIRY
    // ==========================================

    const expiryDate = getExpiryDate(expiresAt);

    if (expiresAt && !expiryDate) {
      return res.status(400).json({
        success: false,
        message: "Invalid expiry date",
      });
    }

    // ==========================================
    // FORMAT
    // ==========================================

    const detectedFormat =
      String(format || "")
        .trim()
        .toLowerCase() || getExtensionFromUrl(signedFileUrl);

    // ==========================================
    // CREATE DATABASE RECORD
    // ==========================================

    const newVideo = new Video({
      title: cleanTitle,

      sourceUrl: signedFileUrl,

      thumbnailUrl: String(thumbnailUrl || "").trim(),

      duration: Number(duration) || 0,

      format: detectedFormat,

      size: Number(size) || 0,

      cbc: cleanCbc,

      expiresAt: expiryDate,

      publicId: `video-${Date.now()}-${uuidv4().slice(0, 8)}`,
    });

    newVideo.save();

    // ==========================================
    // WATCH URL
    // ==========================================

    const watchableUrl = getVideoUrl(newVideo._id.toString());

    return res.status(201).json({
      success: true,

      message: "Movie added successfully",

      video: {
        id: newVideo._id,

        title: newVideo.title,

        videoUrl: watchableUrl,

        thumbnailUrl: newVideo.thumbnailUrl,

        duration: newVideo.duration,

        format: newVideo.format,

        size: newVideo.size,

        cbc: newVideo.cbc,

        expiresAt: newVideo.expiresAt,
      },

      watchUrl: `/watch/${newVideo._id}`,
    });
  } catch (error) {
    console.error("CREATE WATCHABLE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create movie",
    });
  }
};

// ==========================================
// GET ALL VIDEOS
// ==========================================

export const getVideos = async (req, res) => {
  try {
    const videos = await Video.find({
      $or: [
        {
          expiresAt: null,
        },
        {
          expiresAt: {
            $gt: new Date(),
          },
        },
      ],
    })
      .select(
        "_id title thumbnailUrl duration format size cbc createdAt expiresAt",
      )
      .sort({
        createdAt: -1,
      });

    return res.json(videos);
  } catch (error) {
    console.error("GET VIDEOS ERROR:", error);

    return res.status(500).json({
      message: "Failed to fetch videos",
    });
  }
};

// ==========================================
// GET ONE VIDEO
// ==========================================

export const getVideo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid video ID",
      });
    }

    const video = await Video.findById(id);

    if (!video) {
      return res.status(404).json({
        message: "Video not found",
      });
    }

    // ==========================================
    // EXPIRY
    // ==========================================

    if (video.expiresAt && new Date() >= new Date(video.expiresAt)) {
      return res.status(410).json({
        message: "This video has expired",
      });
    }

    return res.json({
      id: video._id,

      title: video.title,

      videoUrl: getVideoUrl(video._id.toString()),

      thumbnailUrl: video.thumbnailUrl || "",

      duration: video.duration || 0,

      format: video.format || "mp4",

      size: video.size || 0,

      cbc: video.cbc || "",

      createdAt: video.createdAt,

      expiresAt: video.expiresAt || null,
    });
  } catch (error) {
    console.error("GET VIDEO ERROR:", error);

    return res.status(500).json({
      message: "Failed to get video",
    });
  }
};

// ==========================================
// UPDATE VIDEO
// ==========================================

export const updateVideo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid video ID",
      });
    }

    const {
      title,
      videoUrl,
      thumbnailUrl,
      cbc,
      duration,
      format,
      size,
      expiresAt,
    } = req.body;

    const updateData = {};

    if (title !== undefined) {
      updateData.title = String(title).trim();
    }

    if (videoUrl !== undefined) {
      try {
        const parsedUrl = new URL(videoUrl);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error();
        }

        updateData.sourceUrl = videoUrl;
      } catch {
        return res.status(400).json({
          message: "Invalid video URL",
        });
      }
    }

    if (thumbnailUrl !== undefined) {
      updateData.thumbnailUrl = String(thumbnailUrl).trim();
    }

    if (cbc !== undefined) {
      updateData.cbc = String(cbc).trim();
    }

    if (duration !== undefined) {
      updateData.duration = Number(duration) || 0;
    }

    if (format !== undefined) {
      updateData.format = String(format).trim();
    }

    if (size !== undefined) {
      updateData.size = Number(size) || 0;
    }

    if (expiresAt !== undefined) {
      const expiryDate = getExpiryDate(expiresAt);

      if (expiresAt && !expiryDate) {
        return res.status(400).json({
          message: "Invalid expiresAt date",
        });
      }

      updateData.expiresAt = expiryDate;
    }

    const video = await Video.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!video) {
      return res.status(404).json({
        message: "Video not found",
      });
    }

    return res.json({
      success: true,

      message: "Video updated successfully",

      video,
    });
  } catch (error) {
    console.error("UPDATE VIDEO ERROR:", error);

    return res.status(500).json({
      message: error.message || "Failed to update video",
    });
  }
};

// ==========================================
// DELETE VIDEO
// ==========================================

export const deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid video ID",
      });
    }

    const video = await Video.findByIdAndDelete(id);

    if (!video) {
      return res.status(404).json({
        message: "Video not found",
      });
    }

    return res.json({
      success: true,
      message: "Video deleted successfully",
    });
  } catch (error) {
    console.error("DELETE VIDEO ERROR:", error);

    return res.status(500).json({
      message: "Failed to delete video",
    });
  }
};

// ==========================================
// STREAM / PROXY VIDEO
// ==========================================
//
// Browser -> our server -> source server
//
// NO FILE IS SAVED.
// ==========================================

export const streamVideo = async (req, res) => {
  let upstream = null;

  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid video ID",
      });
    }

    const video = await Video.findById(id);

    if (!video) {
      return res.status(404).json({
        message: "Video not found",
      });
    }

    // ==========================================
    // CHECK EXPIRY
    // ==========================================

    if (video.expiresAt && new Date() >= new Date(video.expiresAt)) {
      return res.status(410).json({
        message: "This video has expired",
      });
    }

    if (!video.sourceUrl) {
      return res.status(404).json({
        message: "Source video URL not found",
      });
    }

    // ==========================================
    // REQUEST RANGE
    // ==========================================

    const range = req.headers.range;

    const requestHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

      Accept: "video/*,*/*;q=0.8",
    };

    if (range) {
      requestHeaders.Range = range;
    }

    // ==========================================
    // REQUEST SOURCE
    // ==========================================

    upstream = await axios.get(video.sourceUrl, {
      responseType: "stream",

      timeout: 30000,

      maxRedirects: 10,

      validateStatus: (status) => status >= 200 && status < 400,

      headers: requestHeaders,
    });

    const upstreamStatus = upstream.status;

    const contentType =
      upstream.headers["content-type"] || getMimeType(video.format || "mp4");

    const contentLength = upstream.headers["content-length"];

    const contentRange = upstream.headers["content-range"];

    const acceptRanges = upstream.headers["accept-ranges"] || "bytes";

    // ==========================================
    // IMPORTANT
    // ==========================================

    if (
      contentType.toLowerCase().includes("text/html") ||
      contentType.toLowerCase().includes("application/json")
    ) {
      upstream.data.destroy();

      return res.status(502).json({
        message:
          "The source URL returned a webpage instead of a video file. Use the direct video/download URL.",
      });
    }

    // ==========================================
    // RESPONSE HEADERS
    // ==========================================

    const headers = {
      "Content-Type": contentType,

      "Accept-Ranges": acceptRanges,

      "Cache-Control": "no-store",

      "Access-Control-Allow-Origin": "*",

      "Access-Control-Allow-Headers": "Range",

      "Access-Control-Expose-Headers":
        "Content-Length, Content-Range, Accept-Ranges",
    };

    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }

    if (contentRange) {
      headers["Content-Range"] = contentRange;
    }

    // ==========================================
    // SEND STATUS
    // ==========================================

    res.writeHead(upstreamStatus === 206 ? 206 : 200, headers);

    // ==========================================
    // STREAM DIRECTLY
    // ==========================================

    upstream.data.on("error", (error) => {
      console.error("UPSTREAM VIDEO ERROR:", error.message);

      if (!res.headersSent) {
        res.status(502).end();
      } else {
        res.destroy();
      }
    });

    req.on("close", () => {
      if (upstream?.data) {
        upstream.data.destroy();
      }
    });

    upstream.data.pipe(res);
  } catch (error) {
    console.error("STREAM VIDEO ERROR:", error.response?.status, error.message);

    if (upstream?.data) {
      upstream.data.destroy();
    }

    if (!res.headersSent) {
      return res.status(502).json({
        message:
          "Unable to stream the source video. The source link may be expired or may not be a direct video URL.",
      });
    }

    res.destroy();
  }
};
