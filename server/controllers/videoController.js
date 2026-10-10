import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { Readable } from "node:stream";
import Video from "../models/Video.js";
import { getVideoDuration } from "../utils/videoMetadata.js";
import { setProgress, getProgress } from "../utils/downloadProgress.js";

// ======================================================
// PATH SETUP
// ======================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIDEO_FOLDER = path.join(__dirname, "..", "videos");

const SERVER_URL =
  process.env.SERVER_URL || "https://online-movies-uebc.onrender.com";

await fs.promises.mkdir(VIDEO_FOLDER, {
  recursive: true,
});

// ======================================================
// MULTER
// ======================================================

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, VIDEO_FOLDER);
  },

  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname) || ".mp4";

    const baseName = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, " ")
      .trim();

    const safeBaseName = baseName || "video";

    cb(
      null,
      `${safeBaseName}-${Date.now()}-${uuidv4().slice(0, 8)}${extension}`,
    );
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024,
  },
});

// ======================================================
// HELPERS
// ======================================================

function sanitizeFilename(filename) {
  return String(filename || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

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
  return (
    path
      .extname(String(filename || ""))
      .replace(".", "")
      .toLowerCase() || "mp4"
  );
}

function getTitleFromFilename(filename) {
  return path.basename(filename, path.extname(filename));
}

function createJobId() {
  return `job-${Date.now()}-${uuidv4().slice(0, 8)}`;
}

// ======================================================
// URL DETECTION
// ======================================================

function getHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isWeTransferShareUrl(value) {
  const hostname = getHostname(value);

  return (
    hostname === "we.tl" ||
    hostname === "wetransfer.com" ||
    hostname.endsWith(".wetransfer.com")
  );
}

function isWeTransferDirectUrl(value) {
  const hostname = getHostname(value);

  return hostname === "wetransfer.net" || hostname.endsWith(".wetransfer.net");
}

function isSupportedWeTransferUrl(value) {
  return isWeTransferShareUrl(value) || isWeTransferDirectUrl(value);
}

// ======================================================
// HTTP HEADERS
// ======================================================

function getBrowserHeaders() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36",

    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9," +
      "image/avif,image/webp,image/apng,*/*;q=0.8",

    "Accept-Language": "en-US,en;q=0.9",

    "Cache-Control": "no-cache",

    Pragma: "no-cache",
  };
}

function getDownloadHeaders() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36",

    Accept: "*/*",

    "Accept-Language": "en-US,en;q=0.9",

    Referer: "https://wetransfer.com/",

    Connection: "keep-alive",
  };
}

// ======================================================
// CHECK RESPONSE
// ======================================================

function looksLikeHtmlOrJson(contentType) {
  const type = String(contentType || "").toLowerCase();

  return (
    type.includes("text/html") ||
    type.includes("application/json") ||
    type.includes("text/plain")
  );
}

// ======================================================
// RESOLVE WETRANSFER SHARE URL
// ======================================================

async function resolveWeTransferShareUrl(sourceUrl) {
  console.log("=================================");
  console.log("RESOLVING WETRANSFER SHARE URL");
  console.log("=================================");
  console.log("SOURCE:", sourceUrl);

  const response = await axios.get(sourceUrl, {
    headers: getBrowserHeaders(),

    maxRedirects: 10,

    timeout: 30000,

    responseType: "text",

    validateStatus: (status) => status >= 200 && status < 400,
  });

  const finalUrl = response.request?.res?.responseUrl || sourceUrl;

  const contentType = String(
    response.headers["content-type"] || "",
  ).toLowerCase();

  console.log("STATUS:", response.status);
  console.log("FINAL URL:", finalUrl);
  console.log("CONTENT TYPE:", contentType);

  // --------------------------------------------------
  // If WeTransfer redirected directly to CDN
  // --------------------------------------------------

  if (isWeTransferDirectUrl(finalUrl) && !looksLikeHtmlOrJson(contentType)) {
    return finalUrl;
  }

  const html = String(response.data || "");

  const candidates = [];

  // --------------------------------------------------
  // Extract URLs from page
  // --------------------------------------------------

  const urlRegex = /https?:\/\/[^"'\\\s<>]+/gi;

  const matches = html.match(urlRegex) || [];

  candidates.push(...matches);

  // --------------------------------------------------
  // Common JSON fields
  // --------------------------------------------------

  const patterns = [
    /"downloadUrl"\s*:\s*"([^"]+)"/i,
    /"download_url"\s*:\s*"([^"]+)"/i,
    /"directDownloadUrl"\s*:\s*"([^"]+)"/i,
    /"direct_download_url"\s*:\s*"([^"]+)"/i,
    /"url"\s*:\s*"([^"]+)"/i,
  ];

  for (const regex of patterns) {
    const match = html.match(regex);

    if (match?.[1]) {
      candidates.push(match[1]);
    }
  }

  // --------------------------------------------------
  // Clean URLs
  // --------------------------------------------------

  const cleaned = [
    ...new Set(
      candidates
        .map((url) =>
          String(url)
            .replace(/\\\//g, "/")
            .replace(/\\u0026/g, "&")
            .replace(/\\u003F/g, "?")
            .replace(/\\u003D/g, "=")
            .replace(/&amp;/g, "&")
            .replace(/\\"/g, '"')
            .trim(),
        )
        .filter((url) => /^https?:\/\//i.test(url)),
    ),
  ];

  console.log("URL CANDIDATES:", cleaned.length);

  // --------------------------------------------------
  // Prefer WeTransfer CDN URLs
  // --------------------------------------------------

  const cdnCandidates = cleaned.filter((url) => isWeTransferDirectUrl(url));

  for (const candidate of cdnCandidates) {
    console.log("TESTING CDN:", candidate);

    try {
      const test = await axios.get(candidate, {
        headers: getDownloadHeaders(),

        responseType: "stream",

        maxRedirects: 10,

        timeout: 30000,

        validateStatus: (status) => status >= 200 && status < 400,
      });

      const type = String(test.headers["content-type"] || "").toLowerCase();

      const length = Number(test.headers["content-length"] || 0);

      test.data.destroy();

      console.log("CDN RESPONSE:", type, length);

      if (!looksLikeHtmlOrJson(type)) {
        return candidate;
      }
    } catch (error) {
      console.warn("CDN candidate failed:", error.message);
    }
  }

  throw new Error(
    "Could not resolve the WeTransfer share URL to a direct download URL. " +
      "The transfer may be expired, private, protected, or unavailable.",
  );
}

// ======================================================
// RESOLVE SOURCE
// ======================================================

async function resolveDownloadUrl(sourceUrl) {
  const cleanUrl = String(sourceUrl || "").trim();

  if (!cleanUrl) {
    throw new Error("Download URL is required.");
  }

  // --------------------------------------------------
  // Direct WeTransfer CDN URL
  // --------------------------------------------------

  if (isWeTransferDirectUrl(cleanUrl)) {
    console.log("DIRECT WETRANSFER CDN URL DETECTED");

    return cleanUrl;
  }

  // --------------------------------------------------
  // WeTransfer share URL
  // --------------------------------------------------

  if (isWeTransferShareUrl(cleanUrl)) {
    return await resolveWeTransferShareUrl(cleanUrl);
  }

  throw new Error(
    "Unsupported URL. Only WeTransfer share URLs and WeTransfer CDN URLs are supported.",
  );
}

// ======================================================
// DOWNLOAD FILE
// ======================================================

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

  // --------------------------------------------------
  // Resolve URL
  // --------------------------------------------------

  const downloadUrl = await resolveDownloadUrl(sourceUrl);

  console.log("ACTUAL DOWNLOAD URL:");
  console.log(downloadUrl);

  // --------------------------------------------------
  // Start download
  // --------------------------------------------------

  const response = await axios.get(downloadUrl, {
    responseType: "stream",

    maxRedirects: 10,

    timeout: 0,

    headers: getDownloadHeaders(),

    validateStatus: (status) => status >= 200 && status < 400,
  });

  const contentType = String(
    response.headers["content-type"] || "",
  ).toLowerCase();

  const contentLength = Number(response.headers["content-length"] || 0);

  console.log("STATUS:", response.status);
  console.log("CONTENT TYPE:", contentType);
  console.log("CONTENT LENGTH:", contentLength);

  // --------------------------------------------------
  // NEVER save HTML/JSON as MP4
  // --------------------------------------------------

  if (looksLikeHtmlOrJson(contentType)) {
    response.data.destroy();

    throw new Error(
      `WeTransfer returned ${contentType} instead of a video file.`,
    );
  }

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

  // --------------------------------------------------
  // Write stream
  // --------------------------------------------------

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

  // --------------------------------------------------
  // Detect tiny error files
  // --------------------------------------------------

  if (stats.size < 100000 && contentLength > 100000) {
    try {
      await fs.promises.unlink(outputPath);
    } catch {}

    throw new Error(
      `Download was unexpectedly small (${stats.size} bytes). ` +
        `Expected approximately ${contentLength} bytes.`,
    );
  }

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

// ======================================================
// UPLOAD VIDEO
// ======================================================

export const uploadVideo = async (req, res) => {
  let uploadedFile = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,

        code: "NO_VIDEO_FILE",

        message: "Video file is required",
      });
    }

    uploadedFile = req.file;

    const filePath = req.file.path;

    const stats = await fs.promises.stat(filePath);

    let duration = 0;

    try {
      duration = await getVideoDuration(filePath);
    } catch (error) {
      console.warn("Could not determine video duration:", error.message);
    }

    const videoUrl = getVideoUrl(req.file.filename);

    const video = await Video.create({
      title:
        req.body.title?.trim() ||
        getTitleFromFilename(req.file.originalname) ||
        "Untitled Video",

      publicId: `upload-${Date.now()}-${uuidv4().slice(0, 8)}`,

      videoUrl,

      sourceUrl: "",

      filename: req.file.filename,

      thumbnailUrl: req.body.thumbnailUrl?.trim() || "",

      duration,

      format: getExtension(req.file.originalname),

      size: stats.size,

      cbc: req.body.cbc?.trim() || "",
    });

    return res.status(201).json({
      success: true,

      message: "Video uploaded successfully",

      video: {
        id: video._id,

        title: video.title,

        videoUrl: video.videoUrl,

        sourceUrl: video.sourceUrl,

        filename: video.filename,

        thumbnailUrl: video.thumbnailUrl,

        duration: video.duration,

        format: video.format,

        size: video.size,

        cbc: video.cbc,
      },

      watchUrl: `/watch/${video._id}`,
    });
  } catch (error) {
    console.error("UPLOAD VIDEO ERROR:", error);

    if (uploadedFile?.path) {
      try {
        await fs.promises.unlink(uploadedFile.path);
      } catch {}
    }

    return res.status(500).json({
      success: false,

      code: "UPLOAD_VIDEO_FAILED",

      message: error.message || "Failed to upload video",
    });
  }
};

// ======================================================
// CREATE WATCHABLE FROM WETRANSFER
// ======================================================

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

    const cleanSourceUrl = String(sourceUrl).trim();

    if (!cleanSourceUrl) {
      return res.status(400).json({
        success: false,

        code: "MISSING_SOURCE_URL",

        message: "WeTransfer URL is required",
      });
    }

    // --------------------------------------------------
    // IMPORTANT:
    // Accept BOTH share URLs and CDN URLs.
    // --------------------------------------------------

    if (!isSupportedWeTransferUrl(cleanSourceUrl)) {
      return res.status(400).json({
        success: false,

        code: "INVALID_SOURCE",

        message:
          "Only WeTransfer share URLs or WeTransfer CDN URLs are supported",
      });
    }

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

    // --------------------------------------------------
    // Filename
    // --------------------------------------------------

    let safeFilename = sanitizeFilename(filename);

    if (!safeFilename) {
      safeFilename = `video-${Date.now()}.mp4`;
    }

    safeFilename = getSafeFilename(safeFilename, `video-${Date.now()}.mp4`);

    if (!path.extname(safeFilename)) {
      safeFilename += `.${format || "mp4"}`;
    }

    const extension = getExtension(safeFilename);

    const baseName = path.basename(safeFilename, path.extname(safeFilename));

    safeFilename = `${baseName}-${Date.now()}-${uuidv4().slice(
      0,
      6,
    )}.${extension}`;

    const outputPath = path.join(VIDEO_FOLDER, safeFilename);

    console.log("=================================");
    console.log("CREATING WATCHABLE VIDEO");
    console.log("=================================");
    console.log("JOB ID:", jobId);
    console.log("SOURCE:", cleanSourceUrl);
    console.log("FILENAME:", safeFilename);
    console.log("OUTPUT:", outputPath);

    // --------------------------------------------------
    // Download
    // --------------------------------------------------

    await downloadWeTransferVideo(
      cleanSourceUrl,
      outputPath,
      Number(size) || 0,
      safeFilename,
      jobId,
    );

    // --------------------------------------------------
    // Duration
    // --------------------------------------------------

    let actualDuration = Number(duration) || 0;

    try {
      actualDuration = await getVideoDuration(outputPath);
    } catch (error) {
      console.warn("Could not determine video duration:", error.message);
    }

    // --------------------------------------------------
    // Verify file
    // --------------------------------------------------

    const stats = await fs.promises.stat(outputPath);

    if (!stats.isFile() || stats.size <= 0) {
      throw new Error("Downloaded video is invalid or empty.");
    }

    // --------------------------------------------------
    // Create URL
    // --------------------------------------------------

    const videoUrl = getVideoUrl(safeFilename);

    // --------------------------------------------------
    // MongoDB
    // --------------------------------------------------

    const newVideo = await Video.create({
      title:
        title.trim() || getTitleFromFilename(safeFilename) || "Untitled Video",

      publicId: `wetransfer-${Date.now()}-${uuidv4().slice(0, 8)}`,

      videoUrl,

      sourceUrl: cleanSourceUrl,

      filename: safeFilename,

      thumbnailUrl: "",

      duration: actualDuration,

      format: getExtension(safeFilename),

      size: stats.size,

      cbc: cbc.trim(),
    });

    // --------------------------------------------------
    // Complete
    // --------------------------------------------------

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

// ======================================================
// DOWNLOAD PROGRESS
// ======================================================

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

// ======================================================
// STREAM LOCAL VIDEO
// ======================================================

export const streamVideo = async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const controller = new AbortController();
  let upstreamStream = null;

  try {
    const { id } = req.params;
    const range = req.headers.range;

    console.log(`\n[${requestId}] ===== VIDEO STREAM REQUEST =====`);
    console.log(`[${requestId}] Video ID:`, id);
    console.log(`[${requestId}] Range:`, range || "none");
    console.log(`[${requestId}] Time:`, new Date().toISOString());

    // 1. Validate video ID
    if (!mongoose.Types.ObjectId.isValid(id || "")) {
      return res.status(400).json({
        success: false,
        message: "Invalid video ID",
      });
    }

    // 2. Load video metadata from MongoDB
    const video = await Video.findById(id);

    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Video not found",
      });
    }

    // 3. Use the original WeTransfer download URL.
    // Do not depend on a local file or VIDEO_FOLDER.
    const sourceUrl = video.sourceUrl;

    if (!sourceUrl) {
      return res.status(404).json({
        success: false,
        message: "Video source URL is missing",
      });
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid video source URL",
      });
    }

    // Only allow HTTPS WeTransfer source URLs.
    if (
      parsedUrl.protocol !== "https:" ||
      !(
        parsedUrl.hostname === "wetransfer.com" ||
        parsedUrl.hostname.endsWith(".wetransfer.com") ||
        parsedUrl.hostname.endsWith(".wetransfer.net")
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Unsupported video source",
      });
    }

    console.log(`[${requestId}] Title:`, video.title);
    console.log(`[${requestId}] Format:`, video.format);
    console.log(`[${requestId}] Forwarding request to WeTransfer`);

    // 4. Forward the browser's byte-range request.
    const headers = {
      Accept: "video/*, application/octet-stream, */*",
      "User-Agent": "OnlineMovies/1.0",
    };

    if (range) {
      headers.Range = range;
    }

    // Fetch follows redirects to the actual file location.
    const upstream = await fetch(sourceUrl, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: controller.signal,
    });

    console.log(`[${requestId}] Upstream status:`, upstream.status);
    console.log(
      `[${requestId}] Upstream content type:`,
      upstream.headers.get("content-type"),
    );
    console.log(
      `[${requestId}] Upstream content length:`,
      upstream.headers.get("content-length"),
    );
    console.log(
      `[${requestId}] Upstream content range:`,
      upstream.headers.get("content-range"),
    );

    // 5. Handle upstream errors, including expired URLs.
    if (!upstream.ok) {
      const status = upstream.status;

      console.error(`[${requestId}] Upstream request failed:`, status);

      if (upstream.body) {
        await upstream.body.cancel().catch(() => {});
      }

      if (status === 416) {
        const contentRange = upstream.headers.get("content-range");

        if (contentRange) {
          res.setHeader("Content-Range", contentRange);
        }

        return res.status(416).end();
      }

      if (status === 401 || status === 403 || status === 404) {
        return res.status(502).json({
          success: false,
          code:
            status === 403 || status === 401
              ? "SOURCE_URL_EXPIRED_OR_FORBIDDEN"
              : "SOURCE_FILE_NOT_FOUND",
          message:
            status === 403 || status === 401
              ? "The WeTransfer download URL may have expired. Obtain a fresh source URL."
              : "The video is no longer available from its source.",
        });
      }

      return res.status(502).json({
        success: false,
        message: "Unable to retrieve video from WeTransfer",
      });
    }

    if (!upstream.body) {
      return res.status(502).json({
        success: false,
        message: "WeTransfer returned an empty response",
      });
    }

    // 6. Forward the upstream response headers.
    const contentType =
      video.format?.toLowerCase() === "mp4"
        ? "video/mp4"
        : upstream.headers.get("content-type") || "application/octet-stream";

    res.status(upstream.status);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const contentLength = upstream.headers.get("content-length");

    const contentRange = upstream.headers.get("content-range");

    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    if (contentRange) {
      res.setHeader("Content-Range", contentRange);
    }

    const lastModified = upstream.headers.get("last-modified");

    if (lastModified) {
      res.setHeader("Last-Modified", lastModified);
    }

    const etag = upstream.headers.get("etag");

    if (etag) {
      res.setHeader("ETag", etag);
    }

    // 7. Stream without saving the file on Render.
    upstreamStream = Readable.fromWeb(upstream.body);

    upstreamStream.on("error", (error) => {
      console.error(`[${requestId}] Upstream stream error:`, error.message);

      if (!res.destroyed) {
        res.destroy(error);
      }
    });

    res.on("close", () => {
      console.log(`[${requestId}] Browser connection closed`, {
        writableEnded: res.writableEnded,
        destroyed: res.destroyed,
      });

      // Stop fetching if the client disconnects early.
      if (!res.writableEnded) {
        controller.abort();
        upstreamStream?.destroy();
      }
    });

    upstreamStream.on("end", () => {
      console.log(`[${requestId}] Upstream stream ended`);
    });

    upstreamStream.pipe(res);
  } catch (error) {
    if (error.name === "AbortError") {
      console.log(`[${requestId}] Upstream fetch aborted`);
      return;
    }

    console.error(`[${requestId}] VIDEO STREAM ERROR:`, error);

    if (!res.headersSent && !res.destroyed) {
      return res.status(502).json({
        success: false,
        message: "Failed to stream video from its source",
      });
    }

    if (!res.destroyed) {
      res.destroy(error);
    }
  }
};

// ======================================================
// CREATE LOCAL VIDEO
// ======================================================

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

    if (!filename.trim()) {
      return res.status(400).json({
        success: false,

        code: "MISSING_FILENAME",

        message: "Filename is required",
      });
    }

    let safeFilename = sanitizeFilename(filename);

    safeFilename = getSafeFilename(safeFilename, `video-${Date.now()}.mp4`);

    const filePath = path.join(VIDEO_FOLDER, safeFilename);

    let stats;

    try {
      stats = await fs.promises.stat(filePath);
      console.log("FILE EXISTS:", stats.isFile());
      console.log("FILE SIZE:", stats.size);
      console.log("EXPECTED SIZE FROM DB:", video.size);
      console.log("FILE MODIFIED:", stats.mtime);
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

    let actualDuration = Number(duration) || 0;

    try {
      actualDuration = await getVideoDuration(filePath);
    } catch (error) {
      console.warn("Could not determine video duration:", error.message);
    }

    const localVideoUrl = videoUrl.trim() || getVideoUrl(safeFilename);

    const newVideo = await Video.create({
      title:
        title.trim() || getTitleFromFilename(safeFilename) || "Untitled Video",

      publicId: `local-${Date.now()}-${uuidv4().slice(0, 8)}`,

      videoUrl: localVideoUrl,

      sourceUrl: "",

      filename: safeFilename,

      thumbnailUrl: thumbnailUrl.trim(),

      duration: actualDuration,

      format: getExtension(safeFilename) || format || "mp4",

      size: stats.size || Number(size) || 0,

      cbc: cbc.trim(),
    });

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

// ======================================================
// CREATE VIDEO FROM DIRECT URL
// ======================================================

export const createVideoFromUrl = async (req, res) => {
  try {
    const {
      title = "",
      sourceUrl = "",
      filename = "",
      thumbnailUrl = "",
      duration = 0,
      format = "mp4",
      size = 0,
      cbc = "",
    } = req.body || {};

    if (!sourceUrl.trim()) {
      return res.status(400).json({
        success: false,

        code: "MISSING_SOURCE_URL",

        message: "Video URL is required",
      });
    }

    try {
      new URL(sourceUrl.trim());
    } catch {
      return res.status(400).json({
        success: false,

        code: "INVALID_URL",

        message: "Invalid video URL",
      });
    }

    let safeFilename = sanitizeFilename(filename);

    if (!safeFilename) {
      safeFilename = `video-${Date.now()}.${format || "mp4"}`;
    }

    safeFilename = getSafeFilename(safeFilename, `video-${Date.now()}.mp4`);

    if (!path.extname(safeFilename)) {
      safeFilename += `.${format || "mp4"}`;
    }

    const newVideo = await Video.create({
      title:
        title.trim() || getTitleFromFilename(safeFilename) || "Untitled Video",

      publicId: `url-${Date.now()}-${uuidv4().slice(0, 8)}`,

      videoUrl: sourceUrl.trim(),

      sourceUrl: sourceUrl.trim(),

      filename: safeFilename,

      thumbnailUrl: thumbnailUrl.trim(),

      duration: Number(duration) || 0,

      format: getExtension(safeFilename),

      size: Number(size) || 0,

      cbc: cbc.trim(),
    });

    return res.status(201).json({
      success: true,

      message: "Video URL created successfully",

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
    console.error("CREATE VIDEO FROM URL ERROR:", error);

    return res.status(500).json({
      success: false,

      code: "CREATE_VIDEO_FROM_URL_FAILED",

      message: error.message || "Failed to create video from URL",
    });
  }
};

// ======================================================
// GET ALL VIDEOS
// ======================================================

export const getVideos = async (req, res) => {
  try {
    const videos = await Video.find()
      .select(
        "-sourceUrl -createdAt -updatedAt -__v -size -format -duration -_id",
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      videos,
      count: videos.length,
    });
  } catch (error) {
    console.error("GET VIDEOS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get videos",
    });
  }
};

// ======================================================
// GET SINGLE VIDEO
// ======================================================

export const getVideo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,

        code: "INVALID_VIDEO_ID",

        message: "Invalid video ID",
      });
    }

    const video = await Video.findById(id)
      .select(
        "-sourceUrl -createdAt -updatedAt -__v -size -format -duration -_id",
      )
      .lean();

    if (!video) {
      return res.status(404).json({
        success: false,

        code: "VIDEO_NOT_FOUND",

        message: "Video not found",
      });
    }

    return res.json({
      success: true,

      video,
    });
  } catch (error) {
    console.error("GET VIDEO ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to get video",
    });
  }
};

// ======================================================
// UPDATE VIDEO
// ======================================================

export const updateVideo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,

        code: "INVALID_VIDEO_ID",

        message: "Invalid video ID",
      });
    }

    const allowedFields = [
      "title",
      "videoUrl",
      "sourceUrl",
      "thumbnailUrl",
      "duration",
      "format",
      "size",
      "cbc",
      "filename",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const video = await Video.findByIdAndUpdate(id, updates, {
      new: true,

      runValidators: true,
    });

    if (!video) {
      return res.status(404).json({
        success: false,

        code: "VIDEO_NOT_FOUND",

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
      success: false,

      message: "Failed to update video",
    });
  }
};

// ======================================================
// DELETE VIDEO
// ======================================================

export const deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
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

    if (video.filename) {
      const safeFilename = path.basename(video.filename);

      const filePath = path.join(VIDEO_FOLDER, safeFilename);

      try {
        await fs.promises.unlink(filePath);

        console.log("Deleted video file:", filePath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.warn("Could not delete video file:", error.message);
        }
      }
    }

    await Video.findByIdAndDelete(id);

    return res.json({
      success: true,

      message: "Video deleted successfully",
    });
  } catch (error) {
    console.error("DELETE VIDEO ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to delete video",
    });
  }
};
