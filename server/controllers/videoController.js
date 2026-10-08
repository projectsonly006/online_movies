import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

import Video from "../models/Video.js";
import { getVideoDuration } from "../utils/videoMetadata.js";
import { setProgress, getProgress } from "../utils/downloadProgress.js";

// ==========================================
// PATH SETUP
// ==========================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIDEO_FOLDER = path.join(__dirname, "..", "videos");

const SERVER_URL =
  process.env.SERVER_URL || "https://online-movies-uebc.onrender.com";

// ==========================================
// HELPERS
// ==========================================

function getSafeFilename(filename, fallback = "download.mp4") {
  let safeFilename = path.basename(String(filename || "").trim());

  if (!safeFilename || safeFilename === ".") {
    safeFilename = fallback;
  }

  return safeFilename;
}

function getVideoUrl(filename) {
  return `${SERVER_URL}/videos/${encodeURIComponent(filename)}`;
}

function getExtension(filename) {
  return path.extname(filename).replace(".", "").toLowerCase() || "mp4";
}

function getTitleFromFilename(filename) {
  return path.basename(filename, path.extname(filename));
}

function createJobId() {
  return `job-${Date.now()}-${uuidv4().slice(0, 8)}`;
}

function sanitizeFilename(filename) {
  return String(filename || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

// ==========================================
// DOWNLOAD WETRANSFER FILE
// ==========================================

async function downloadWeTransferVideo(
  sourceUrl,
  outputPath,
  expectedSize = 0,
  filename = "download.mp4",
  jobId = null,
) {
  console.log("=================================");
  console.log("WETRANSFER DOWNLOAD");
  console.log("=================================");
  console.log("SOURCE:", sourceUrl);
  console.log("OUTPUT:", outputPath);
  console.log("JOB:", jobId);

  await fs.promises.mkdir(path.dirname(outputPath), {
    recursive: true,
  });

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140 Safari/537.36",

    Accept: "*/*",

    "Accept-Language": "en-US,en;q=0.9",
  };

  const response = await axios.get(sourceUrl, {
    responseType: "stream",

    maxRedirects: 10,

    timeout: 0,

    headers,

    validateStatus: (status) => status >= 200 && status < 400,
  });

  const contentType = String(
    response.headers["content-type"] || "",
  ).toLowerCase();

  const contentLength = Number(response.headers["content-length"] || 0);

  console.log("STATUS:", response.status);
  console.log("CONTENT TYPE:", contentType);
  console.log("CONTENT LENGTH:", contentLength);

  // ==========================================
  // INVALID RESPONSE
  // ==========================================

  if (
    contentType.includes("text/html") ||
    contentType.includes("application/json")
  ) {
    response.data.destroy();

    throw new Error(
      "WeTransfer returned a webpage/JSON response instead of the video file. " +
        "The transfer may require a different download URL or may be unavailable.",
    );
  }

  // ==========================================
  // TOTAL SIZE
  // ==========================================

  const totalBytes = contentLength || Number(expectedSize) || 0;

  let downloadedBytes = 0;

  const startTime = Date.now();

  if (jobId) {
    setProgress(jobId, {
      status: "downloading",

      percentage: 0,

      downloadedBytes: 0,

      totalBytes,

      downloadedMB: 0,

      totalMB: Number((totalBytes / 1024 / 1024).toFixed(2)),

      speedMBps: 0,

      filename,
    });
  }

  // ==========================================
  // WRITE FILE
  // ==========================================

  const writer = fs.createWriteStream(outputPath);

  const downloadPromise = new Promise((resolve, reject) => {
    let settled = false;

    const fail = (error) => {
      if (settled) return;

      settled = true;

      reject(error);
    };

    const complete = () => {
      if (settled) return;

      settled = true;

      resolve();
    };

    response.data.on("data", (chunk) => {
      downloadedBytes += chunk.length;

      const elapsed = (Date.now() - startTime) / 1000;

      const downloadedMB = downloadedBytes / 1024 / 1024;

      const totalMB = totalBytes / 1024 / 1024;

      const percentage =
        totalBytes > 0
          ? Math.min(
              100,
              Number(((downloadedBytes / totalBytes) * 100).toFixed(2)),
            )
          : 0;

      const speedMBps =
        elapsed > 0 ? downloadedBytes / 1024 / 1024 / elapsed : 0;

      process.stdout.write(
        `\rDownloaded ${downloadedMB.toFixed(2)} MB` +
          (totalBytes ? ` / ${totalMB.toFixed(2)} MB` : "") +
          ` (${percentage}%)` +
          ` | ${speedMBps.toFixed(2)} MB/s`,
      );

      if (jobId) {
        setProgress(jobId, {
          status: "downloading",

          percentage,

          downloadedBytes,

          totalBytes,

          downloadedMB: Number(downloadedMB.toFixed(2)),

          totalMB: Number(totalMB.toFixed(2)),

          speedMBps: Number(speedMBps.toFixed(2)),

          filename,
        });
      }
    });

    response.data.on("error", (error) => {
      console.error("\nDownload stream error:", error);

      writer.destroy();

      fail(error);
    });

    writer.on("error", (error) => {
      console.error("\nFile write error:", error);

      response.data.destroy();

      fail(error);
    });

    writer.on("finish", complete);

    response.data.pipe(writer);
  });

  try {
    await downloadPromise;
  } catch (error) {
    try {
      await fs.promises.unlink(outputPath);
    } catch {}

    throw error;
  }

  console.log("\n=================================");
  console.log("DOWNLOAD COMPLETE");
  console.log("=================================");

  const stats = await fs.promises.stat(outputPath);

  if (!stats.isFile() || stats.size === 0) {
    try {
      await fs.promises.unlink(outputPath);
    } catch {}

    throw new Error("Downloaded video file is empty.");
  }

  console.log("DOWNLOADED SIZE:", stats.size);

  if (expectedSize > 0 && stats.size !== Number(expectedSize)) {
    console.warn(
      `Expected ${expectedSize} bytes but downloaded ${stats.size} bytes`,
    );
  }

  if (jobId) {
    setProgress(jobId, {
      status: "processing",

      percentage: 100,

      downloadedBytes: stats.size,

      totalBytes: totalBytes || stats.size,

      downloadedMB: Number((stats.size / 1024 / 1024).toFixed(2)),

      totalMB: Number(((totalBytes || stats.size) / 1024 / 1024).toFixed(2)),

      speedMBps: 0,

      filename,
    });
  }

  return {
    path: outputPath,

    filename,

    size: stats.size,

    expectedSize: Number(expectedSize) || contentLength,

    contentType,
  };
}

// ==========================================
// CREATE WATCHABLE FROM WETRANSFER
// ==========================================

export const createWatchableFromWeTransfer = async (req, res) => {
  let jobId = null;

  try {
    const {
      sourceUrl = "",
      title = "",
      filename = "",
      cbc = "",
      duration = 0,
      format = "mp4",
      size = 0,
    } = req.body || {};

    // ==========================================
    // VALIDATE SOURCE URL
    // ==========================================

    if (!sourceUrl.trim()) {
      return res.status(400).json({
        success: false,
        code: "MISSING_SOURCE_URL",
        message: "WeTransfer URL is required",
      });
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(sourceUrl.trim());
    } catch {
      return res.status(400).json({
        success: false,
        code: "INVALID_URL",
        message: "Invalid URL",
      });
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    if (hostname !== "we.tl" && !hostname.endsWith(".wetransfer.com")) {
      return res.status(400).json({
        success: false,
        code: "INVALID_SOURCE",
        message: "Only WeTransfer URLs are supported",
      });
    }

    // ==========================================
    // JOB ID
    // ==========================================

    jobId = createJobId();

    setProgress(jobId, {
      status: "starting",

      percentage: 0,

      downloadedBytes: 0,

      totalBytes: Number(size) || 0,

      downloadedMB: 0,

      totalMB: Number((Number(size) / 1024 / 1024).toFixed(2)),

      speedMBps: 0,

      filename: filename || "",
    });

    // ==========================================
    // DETERMINE FILENAME
    // ==========================================

    let safeFilename = sanitizeFilename(filename);

    if (!safeFilename) {
      safeFilename = `video-${Date.now()}.mp4`;
    }

    safeFilename = getSafeFilename(safeFilename, `video-${Date.now()}.mp4`);

    // Make sure extension exists
    if (!path.extname(safeFilename)) {
      safeFilename += `.${format || "mp4"}`;
    }

    // Prevent accidental overwrite
    const extension = getExtension(safeFilename);

    const baseName = path.basename(safeFilename, path.extname(safeFilename));

    safeFilename = `${baseName}-${Date.now()}.${extension}`;

    const outputPath = path.join(VIDEO_FOLDER, safeFilename);

    // ==========================================
    // DOWNLOAD
    // ==========================================

    console.log("=================================");
    console.log("CREATING WATCHABLE VIDEO");
    console.log("=================================");
    console.log("JOB ID:", jobId);
    console.log("SOURCE:", sourceUrl);
    console.log("FILENAME:", safeFilename);
    console.log("OUTPUT:", outputPath);
    console.log("=================================");

    const result = await downloadWeTransferVideo(
      sourceUrl.trim(),
      outputPath,
      Number(size) || 0,
      safeFilename,
      jobId,
    );

    // ==========================================
    // GET ACTUAL DURATION
    // ==========================================

    let actualDuration = Number(duration) || 0;

    try {
      actualDuration = await getVideoDuration(outputPath);
    } catch (error) {
      console.warn("Could not determine video duration:", error.message);
    }

    // ==========================================
    // VERIFY FILE
    // ==========================================

    const stats = await fs.promises.stat(outputPath);

    if (!stats.isFile() || stats.size <= 0) {
      throw new Error("Downloaded video is invalid or empty.");
    }

    // ==========================================
    // LOCAL VIDEO URL
    // ==========================================

    const videoUrl = getVideoUrl(safeFilename);

    // ==========================================
    // CREATE MONGODB RECORD
    // ==========================================

    const newVideo = await Video.create({
      title:
        title.trim() || getTitleFromFilename(safeFilename) || "Untitled Video",

      publicId: `wetransfer-${Date.now()}`,

      videoUrl,

      sourceUrl: sourceUrl.trim(),

      filename: safeFilename,

      thumbnailUrl: "",

      duration: actualDuration,

      format: getExtension(safeFilename),

      size: stats.size,

      cbc: cbc.trim(),
    });

    // ==========================================
    // COMPLETE
    // ==========================================

    setProgress(jobId, {
      status: "completed",

      percentage: 100,

      downloadedBytes: stats.size,

      totalBytes: stats.size,

      downloadedMB: Number((stats.size / 1024 / 1024).toFixed(2)),

      totalMB: Number((stats.size / 1024 / 1024).toFixed(2)),

      speedMBps: 0,

      filename: safeFilename,

      videoId: newVideo._id.toString(),
    });

    console.log("=================================");
    console.log("VIDEO READY");
    console.log("=================================");
    console.log("VIDEO ID:", newVideo._id);
    console.log("VIDEO URL:", videoUrl);
    console.log("FILE:", safeFilename);
    console.log("SIZE:", stats.size);
    console.log("DURATION:", actualDuration);
    console.log("=================================");

    return res.status(201).json({
      success: true,

      message: "Video downloaded and ready to watch",

      jobId,

      video: {
        id: newVideo._id,

        title: newVideo.title,

        videoUrl: newVideo.videoUrl,

        sourceUrl: newVideo.sourceUrl,

        filename: newVideo.filename,

        thumbnailUrl: newVideo.thumbnailUrl,

        duration: newVideo.duration,

        format: newVideo.format,

        size: newVideo.size,

        cbc: newVideo.cbc,
      },

      watchUrl: `/watch/${newVideo._id}`,
    });
  } catch (error) {
    console.error("CREATE WATCHABLE VIDEO ERROR:", error);

    if (jobId) {
      setProgress(jobId, {
        status: "error",

        percentage: 0,

        error: error.message || "Download failed",

        filename: req.body?.filename || "",

        videoId: null,
      });
    }

    return res.status(500).json({
      success: false,

      code: "VIDEO_DOWNLOAD_FAILED",

      message: error.message || "Failed to download video",

      jobId,
    });
  }
};

// ==========================================
// GET DOWNLOAD PROGRESS
// ==========================================

export const getDownloadProgress = async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "jobId is required",
      });
    }

    const progress = getProgress(jobId);

    if (!progress) {
      return res.status(404).json({
        success: false,
        message: "Download job not found",
      });
    }

    return res.json(progress);
  } catch (error) {
    console.error("GET DOWNLOAD PROGRESS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get download progress",
    });
  }
};

// ==========================================
// STREAM LOCAL VIDEO
// ==========================================

export const streamVideo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_VIDEO_ID",
        message: "Invalid video ID",
      });
    }

    const video = await Video.findById(id);

    if (!video) {
      return res.status(404).json({
        success: false,
        code: "VIDEO_NOT_FOUND",
        message: "Video not found",
      });
    }

    if (!video.filename) {
      return res.status(404).json({
        success: false,
        code: "VIDEO_FILE_NOT_FOUND",
        message: "Video file is not available",
      });
    }

    const safeFilename = path.basename(video.filename);

    const filePath = path.join(VIDEO_FOLDER, safeFilename);

    let stats;

    try {
      stats = await fs.promises.stat(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        code: "VIDEO_FILE_NOT_FOUND",
        message: "Video file is not available",
      });
    }

    if (!stats.isFile() || stats.size <= 0) {
      return res.status(404).json({
        success: false,
        code: "VIDEO_FILE_NOT_FOUND",
        message: "Video file is empty or unavailable",
      });
    }

    const fileSize = stats.size;

    const range = req.headers.range;

    const extension = getExtension(safeFilename);

    const mimeTypes = {
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      m4v: "video/x-m4v",
    };

    const contentType = mimeTypes[extension] || "video/mp4";

    // ==========================================
    // NO RANGE
    // ==========================================

    if (!range) {
      res.writeHead(200, {
        "Content-Type": contentType,

        "Content-Length": fileSize,

        "Accept-Ranges": "bytes",

        "Cache-Control": "public, max-age=3600",

        "X-Content-Type-Options": "nosniff",
      });

      fs.createReadStream(filePath).pipe(res);

      return;
    }

    // ==========================================
    // RANGE REQUEST
    // ==========================================

    const match = range.match(/bytes=(\d*)-(\d*)/);

    if (!match) {
      return res.status(416).end();
    }

    const start = match[1] ? Number(match[1]) : 0;

    const end = match[2] ? Number(match[2]) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      res.setHeader("Content-Range", `bytes */${fileSize}`);

      return res.status(416).end();
    }

    const chunkSize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,

      "Accept-Ranges": "bytes",

      "Content-Length": chunkSize,

      "Content-Type": contentType,

      "Cache-Control": "public, max-age=3600",

      "X-Content-Type-Options": "nosniff",
    });

    fs.createReadStream(filePath, {
      start,
      end,
    }).pipe(res);
  } catch (error) {
    console.error("STREAM VIDEO ERROR:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to stream video",
      });
    }

    res.destroy();
  }
};

// ==========================================
// CREATE LOCAL VIDEO
// ==========================================

export const createLocalVideo = async (req, res) => {
  try {
    const {
      title = "",
      filename = "",
      videoUrl = "",
      thumbnailUrl = "",
      duration = 0,
      format = "mp4",
      size = 0,
      cbc = "",
    } = req.body || {};

    // ==========================================
    // VALIDATE FILENAME
    // ==========================================

    if (!filename.trim()) {
      return res.status(400).json({
        success: false,
        code: "MISSING_FILENAME",
        message: "Filename is required",
      });
    }

    // ==========================================
    // SANITIZE FILENAME
    // ==========================================

    let safeFilename = sanitizeFilename(filename);

    safeFilename = getSafeFilename(safeFilename, `video-${Date.now()}.mp4`);

    // ==========================================
    // FIND LOCAL FILE
    // ==========================================

    const filePath = path.join(VIDEO_FOLDER, safeFilename);

    let stats;

    try {
      stats = await fs.promises.stat(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        code: "VIDEO_FILE_NOT_FOUND",
        message: `Video file does not exist: ${safeFilename}`,
      });
    }

    if (!stats.isFile() || stats.size <= 0) {
      return res.status(400).json({
        success: false,
        code: "INVALID_VIDEO_FILE",
        message: "Video file is empty or invalid",
      });
    }

    // ==========================================
    // GET ACTUAL DURATION
    // ==========================================

    let actualDuration = Number(duration) || 0;

    try {
      actualDuration = await getVideoDuration(filePath);
    } catch (error) {
      console.warn("Could not determine video duration:", error.message);
    }

    // ==========================================
    // VIDEO URL
    // ==========================================

    const localVideoUrl = videoUrl.trim() || getVideoUrl(safeFilename);

    // ==========================================
    // CREATE MONGODB RECORD
    // ==========================================

    const newVideo = await Video.create({
      title:
        title.trim() || getTitleFromFilename(safeFilename) || "Untitled Video",

      publicId: `local-${Date.now()}`,

      videoUrl: localVideoUrl,

      sourceUrl: "",

      filename: safeFilename,

      thumbnailUrl: thumbnailUrl.trim(),

      duration: actualDuration,

      format: getExtension(safeFilename) || format || "mp4",

      size: stats.size || Number(size) || 0,

      cbc: cbc.trim(),
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(201).json({
      success: true,

      message: "Local video created successfully",

      video: {
        id: newVideo._id,

        title: newVideo.title,

        videoUrl: newVideo.videoUrl,

        sourceUrl: newVideo.sourceUrl,

        filename: newVideo.filename,

        thumbnailUrl: newVideo.thumbnailUrl,

        duration: newVideo.duration,

        format: newVideo.format,

        size: newVideo.size,

        cbc: newVideo.cbc,
      },

      watchUrl: `/watch/${newVideo._id}`,
    });
  } catch (error) {
    console.error("CREATE LOCAL VIDEO ERROR:", error);

    return res.status(500).json({
      success: false,
      code: "CREATE_LOCAL_VIDEO_FAILED",
      message: error.message || "Failed to create local video",
    });
  }
};
