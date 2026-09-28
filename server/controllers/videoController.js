import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

import Video from "../models/Video.js";
import { getVideoDuration } from "../utils/videoMetadata.js";
import { setProgress, getProgress } from "../utils/downloadProgress.js";

// ==========================================
// PATH / SERVER SETUP
// ==========================================

const VIDEO_FOLDER = process.env.VIDEO_FOLDER || "/var/data/videos";

const SERVER_URL =
  process.env.SERVER_URL || "https://online-movies-uebc.onrender.com";

console.log("Video folder:", VIDEO_FOLDER);
console.log("Server URL:", SERVER_URL);

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

function createVideoFilename(originalFilename) {
  const extension = path.extname(originalFilename || ".mp4") || ".mp4";

  const baseName = path.basename(originalFilename || "video", extension);

  const safeBaseName = baseName
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

  return `${safeBaseName}-${Date.now()}-${uuidv4().slice(0, 8)}${extension}`;
}

function getVideoUrl(videoId) {
  return `${SERVER_URL}/api/videos/stream/${videoId}`;
}

function getExtension(filename) {
  return (
    path
      .extname(filename || "")
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

// ==========================================
// EXPIRY HELPER
// ==========================================

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

// ==========================================
// UPLOAD VIDEO FILE
// ==========================================

export const uploadVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No video uploaded",
      });
    }

    await fs.promises.mkdir(VIDEO_FOLDER, {
      recursive: true,
    });

    const { title = "", cbc = "", expiresAt, sourceUrl = "" } = req.body;

    const expiryDate = getExpiryDate(expiresAt);

    const safeFilename = createVideoFilename(req.file.originalname);

    const outputPath = path.join(VIDEO_FOLDER, safeFilename);

    await fs.promises.writeFile(outputPath, req.file.buffer);

    const stats = await fs.promises.stat(outputPath);

    let duration = 0;

    try {
      duration = await getVideoDuration(outputPath);
    } catch (error) {
      console.warn(
        "Could not determine uploaded video duration:",
        error.message,
      );
    }

    const extension = getExtension(safeFilename);

    const newVideo = new Video({
      title: title.trim() || getTitleFromFilename(safeFilename),

      publicId: `upload-${Date.now()}-${uuidv4().slice(0, 8)}`,

      sourceUrl,

      filename: safeFilename,

      thumbnailUrl: "",

      duration,

      format: extension,

      size: stats.size,

      cbc: String(cbc || "").trim(),

      expiresAt: expiryDate,
    });

    newVideo.videoUrl = getVideoUrl(newVideo._id.toString());

    await newVideo.save();

    console.log("=================================");
    console.log("LOCAL VIDEO UPLOADED");
    console.log("=================================");
    console.log("Filename:", safeFilename);
    console.log("Size:", stats.size);
    console.log("Duration:", duration);
    console.log("Video ID:", newVideo._id);
    console.log("Expires:", newVideo.expiresAt);
    console.log("Video URL:", newVideo.videoUrl);
    console.log("=================================");

    return res.status(201).json({
      message: "Video uploaded successfully",

      video: newVideo,

      watchUrl: `/watch/${newVideo._id}`,
    });
  } catch (error) {
    console.error("UPLOAD VIDEO ERROR:", error);

    return res.status(500).json({
      message: error.message || "Upload failed",
    });
  }
};

// ==========================================
// CREATE VIDEO FROM EXISTING URL
// ==========================================

export const createVideoFromUrl = async (req, res) => {
  try {
    const {
      title = "",
      videoUrl,
      thumbnailUrl = "",
      duration = 0,
      format = "mp4",
      size = 0,
      cbc = "",
      sourceUrl = "",
      filename = "",
      expiresAt,
    } = req.body;

    if (!videoUrl) {
      return res.status(400).json({
        message: "videoUrl is required",
      });
    }

    const expiryDate = getExpiryDate(expiresAt);

    let safeFilename;

    try {
      safeFilename = filename
        ? getSafeFilename(filename)
        : getSafeFilename(
            path.basename(new URL(videoUrl).pathname),
            `video-${Date.now()}.${format || "mp4"}`,
          );
    } catch {
      safeFilename = getSafeFilename(
        filename,
        `video-${Date.now()}.${format || "mp4"}`,
      );
    }

    const extension = getExtension(safeFilename || `video.${format}`);

    const newVideo = new Video({
      title: title.trim() || getTitleFromFilename(safeFilename),

      publicId: `url-${Date.now()}-${uuidv4().slice(0, 8)}`,

      sourceUrl,

      filename: safeFilename,

      thumbnailUrl,

      duration: Number(duration) || 0,

      format: extension,

      size: Number(size) || 0,

      cbc: String(cbc || "").trim(),

      expiresAt: expiryDate,
    });

    /*
     * IMPORTANT:
     * This URL points to our server's stream endpoint.
     */
    newVideo.videoUrl = getVideoUrl(newVideo._id.toString());

    await newVideo.save();

    return res.status(201).json({
      message: "Video link created successfully",

      video: newVideo,

      watchUrl: `/watch/${newVideo._id}`,
    });
  } catch (error) {
    console.error("CREATE FROM URL ERROR:", error);

    return res.status(500).json({
      message: error.message || "Failed to create video link",
    });
  }
};

// ==========================================
// CREATE VIDEO FROM LOCAL FILE
// ==========================================

export const createLocalVideo = async (req, res) => {
  try {
    const {
      title = "",
      filename,
      cbc = "",
      expiresAt,
      sourceUrl = "",
    } = req.body;

    if (!filename) {
      return res.status(400).json({
        message: "filename is required",
      });
    }

    const safeFilename = getSafeFilename(filename);

    const filePath = path.join(VIDEO_FOLDER, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        message: "Video file not found",
      });
    }

    const stats = await fs.promises.stat(filePath);

    if (!stats.isFile()) {
      return res.status(400).json({
        message: "The specified path is not a file",
      });
    }

    const expiryDate = getExpiryDate(expiresAt);

    let duration = 0;

    try {
      duration = await getVideoDuration(filePath);
    } catch (error) {
      console.warn("Could not determine video duration:", error.message);
    }

    const extension = getExtension(safeFilename);

    const newVideo = new Video({
      title: title.trim() || getTitleFromFilename(safeFilename),

      publicId: `local-${Date.now()}-${uuidv4().slice(0, 8)}`,

      sourceUrl,

      filename: safeFilename,

      thumbnailUrl: "",

      duration,

      format: extension,

      size: stats.size,

      cbc: String(cbc || "").trim(),

      expiresAt: expiryDate,
    });

    newVideo.videoUrl = getVideoUrl(newVideo._id.toString());

    await newVideo.save();

    return res.status(201).json({
      message: "Local video added successfully",

      video: newVideo,

      watchUrl: `/watch/${newVideo._id}`,
    });
  } catch (error) {
    console.error("CREATE LOCAL VIDEO ERROR:", error);

    return res.status(500).json({
      message: error.message || "Failed to add local video",
    });
  }
};

// ==========================================
// GET ALL VIDEOS
// ==========================================

export const getVideos = async (req, res) => {
  try {
    const videos = await Video.find()
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

    if (
      !id ||
      id === "undefined" ||
      id === "null" ||
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        message: "Invalid video ID",
        receivedId: id,
      });
    }

    const video = await Video.findById(id);

    if (!video) {
      return res.status(404).json({
        message: "Video not found",
      });
    }

    return res.json({
      id: video._id,

      title: video.title,

      videoUrl: video.videoUrl,

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

    const { videoUrl, title, thumbnailUrl, cbc, expiresAt } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid video ID",
      });
    }

    let expiryDate;

    if (expiresAt !== undefined) {
      expiryDate = getExpiryDate(expiresAt);

      if (expiresAt && !expiryDate) {
        return res.status(400).json({
          message: "Invalid expiresAt date",
        });
      }
    }

    const updateData = {};

    if (videoUrl !== undefined) {
      updateData.videoUrl = videoUrl;
    }

    if (title !== undefined) {
      updateData.title = title;
    }

    if (thumbnailUrl !== undefined) {
      updateData.thumbnailUrl = thumbnailUrl;
    }

    if (cbc !== undefined) {
      updateData.cbc = cbc;
    }

    if (expiresAt !== undefined) {
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
// DOWNLOAD WETRANSFER FILE
// ==========================================

async function downloadWeTransferVideo(
  signedFileUrl,
  outputPath,
  expectedSize = 0,
  filename = "download.mp4",
  jobId = null,
) {
  await fs.promises.mkdir(path.dirname(outputPath), {
    recursive: true,
  });

  const response = await axios.get(signedFileUrl, {
    responseType: "stream",

    timeout: 0,

    maxRedirects: 10,

    validateStatus: (status) => status >= 200 && status < 400,

    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140 Safari/537.36",

      Accept: "*/*",
    },
  });

  const contentType = response.headers["content-type"] || "";

  const contentLength = Number(response.headers["content-length"] || 0);

  if (
    contentType.toLowerCase().includes("text/html") ||
    contentType.toLowerCase().includes("application/json")
  ) {
    response.data.destroy();

    throw new Error(
      "Server returned a webpage/JSON response instead of the video file.",
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
        `\rDownloaded: ${downloadedMB.toFixed(2)} MB / ${totalMB.toFixed(
          2,
        )} MB (${percentage}%) | ${speedMBps.toFixed(2)} MB/s`,
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

  const stats = await fs.promises.stat(outputPath);

  if (stats.size === 0) {
    throw new Error("Downloaded file is empty");
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
// TEST DOWNLOAD VIDEO
// ==========================================

export const testDownloadVideo = async (req, res) => {
  try {
    const {
      signedFileUrl,
      sourceUrl = "",
      filename = "download.mp4",
      expectedSize = 0,
      title = "",
      cbc = "",
      jobId,
      expiresAt,
    } = req.body;

    if (!signedFileUrl) {
      return res.status(400).json({
        message: "signedFileUrl is required",
      });
    }

    if (!jobId) {
      return res.status(400).json({
        message: "jobId is required",
      });
    }

    const expiryDate = getExpiryDate(expiresAt);

    const safeFilename = getSafeFilename(filename, `video-${Date.now()}.mp4`);

    const outputPath = path.join(VIDEO_FOLDER, safeFilename);

    const result = await downloadWeTransferVideo(
      signedFileUrl,
      outputPath,
      Number(expectedSize) || 0,
      safeFilename,
      jobId,
    );

    let duration = 0;

    try {
      duration = await getVideoDuration(outputPath);
    } catch (error) {
      console.warn("Could not determine video duration:", error.message);
    }

    const extension = getExtension(safeFilename);

    const newVideo = new Video({
      title: title || getTitleFromFilename(safeFilename),

      publicId: `wetransfer-${Date.now()}-${uuidv4().slice(0, 8)}`,

      sourceUrl,

      filename: safeFilename,

      thumbnailUrl: "",

      duration,

      format: extension,

      size: result.size,

      cbc: String(cbc || "").trim(),

      expiresAt: expiryDate,
    });

    newVideo.videoUrl = getVideoUrl(newVideo._id.toString());

    await newVideo.save();

    setProgress(jobId, {
      status: "completed",

      percentage: 100,

      downloadedBytes: result.size,

      totalBytes: result.size,

      downloadedMB: Number((result.size / 1024 / 1024).toFixed(2)),

      totalMB: Number((result.size / 1024 / 1024).toFixed(2)),

      speedMBps: 0,

      filename: safeFilename,

      videoId: newVideo._id.toString(),
    });

    return res.status(201).json({
      message: "Video downloaded and ready to watch",

      video: {
        id: newVideo._id,

        title: newVideo.title,

        videoUrl: newVideo.videoUrl,

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
    console.error("CREATE WATCHABLE VIDEO ERROR:", error);

    const jobId = req.body?.jobId;

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
      message: error.message || "Failed to create watchable video",
    });
  }
};

// ==========================================
// CREATE WATCHABLE FROM WETRANSFER
// ==========================================

export const createWatchableFromWeTransfer = async (req, res) => {
  const {
    signedFileUrl,
    sourceUrl = "",
    title = "",
    filename = "",
    cbc = "",
    expiresAt,
    jobId: clientJobId,
  } = req.body;

  if (!signedFileUrl) {
    return res.status(400).json({
      success: false,

      message: "signedFileUrl is required",
    });
  }

  const expiryDate = getExpiryDate(expiresAt);

  if (expiresAt && !expiryDate) {
    return res.status(400).json({
      success: false,

      message: "Invalid expiresAt date",
    });
  }

  const jobId = clientJobId || createJobId();

  setProgress(jobId, {
    status: "starting",

    percentage: 0,

    downloadedBytes: 0,

    totalBytes: 0,

    downloadedMB: 0,

    totalMB: 0,

    speedMBps: 0,

    filename: filename || "",

    videoId: null,

    error: null,
  });

  res.status(202).json({
    success: true,

    message: "Video download started",

    jobId,

    videoId: null,
  });

  try {
    const parsedUrl = new URL(signedFileUrl);

    let safeFilename = filename;

    if (!safeFilename) {
      safeFilename = path.basename(parsedUrl.pathname);
    }

    safeFilename = getSafeFilename(safeFilename, `video-${Date.now()}.mp4`);

    if (!path.extname(safeFilename)) {
      safeFilename += ".mp4";
    }

    safeFilename = createVideoFilename(safeFilename);

    const outputPath = path.join(VIDEO_FOLDER, safeFilename);

    await fs.promises.mkdir(VIDEO_FOLDER, {
      recursive: true,
    });

    console.log("=================================");

    console.log("BACKGROUND VIDEO DOWNLOAD");

    console.log("JOB ID:", jobId);

    console.log("FILENAME:", safeFilename);

    console.log("OUTPUT:", outputPath);

    console.log("EXPIRES:", expiryDate);

    console.log("=================================");

    const downloaded = await downloadWeTransferVideo(
      signedFileUrl,
      outputPath,
      0,
      safeFilename,
      jobId,
    );

    let duration = 0;

    try {
      duration = await getVideoDuration(outputPath);
    } catch (error) {
      console.warn("Could not determine duration:", error.message);
    }

    const extension = getExtension(safeFilename);

    const newVideo = new Video({
      title: title || getTitleFromFilename(safeFilename),

      publicId: `wetransfer-${Date.now()}-${uuidv4().slice(0, 8)}`,

      sourceUrl,

      filename: safeFilename,

      thumbnailUrl: "",

      duration,

      format: extension,

      size: downloaded.size,

      cbc: String(cbc || "").trim(),

      /*
       * EACH VIDEO GETS ITS OWN EXPIRY DATE
       */
      expiresAt: expiryDate,
    });

    newVideo.videoUrl = getVideoUrl(newVideo._id.toString());

    await newVideo.save();

    console.log("VIDEO CREATED:", newVideo._id);

    console.log("VIDEO URL:", newVideo.videoUrl);

    console.log("EXPIRES AT:", newVideo.expiresAt);

    setProgress(jobId, {
      status: "completed",

      percentage: 100,

      downloadedBytes: downloaded.size,

      totalBytes: downloaded.size,

      downloadedMB: Number((downloaded.size / 1024 / 1024).toFixed(2)),

      totalMB: Number((downloaded.size / 1024 / 1024).toFixed(2)),

      speedMBps: 0,

      filename: safeFilename,

      videoId: newVideo._id.toString(),

      video: {
        id: newVideo._id.toString(),

        title: newVideo.title,

        videoUrl: newVideo.videoUrl,

        thumbnailUrl: newVideo.thumbnailUrl || "",

        duration: newVideo.duration,

        format: newVideo.format,

        size: newVideo.size,

        cbc: newVideo.cbc || "",

        expiresAt: newVideo.expiresAt,
      },

      watchUrl: `/watch/${newVideo._id}`,
    });

    console.log("=================================");

    console.log("JOB COMPLETED");

    console.log("JOB ID:", jobId);

    console.log("VIDEO ID:", newVideo._id.toString());

    console.log("=================================");
  } catch (error) {
    console.error("BACKGROUND DOWNLOAD ERROR:", error);

    setProgress(jobId, {
      status: "error",

      percentage: 0,

      error: error.message || "Download failed",

      filename: filename || "",

      videoId: null,
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
        message: "jobId is required",
      });
    }

    const progress = getProgress(jobId);

    if (!progress) {
      return res.status(404).json({
        message: "Download job not found",
      });
    }

    return res.json(progress);
  } catch (error) {
    console.error("GET DOWNLOAD PROGRESS ERROR:", error);

    return res.status(500).json({
      message: "Failed to get download progress",
    });
  }
};

// ==========================================
// STREAM VIDEO
// ==========================================

export const streamVideo = async (req, res) => {
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

    let filename = video.filename;

    if (!filename && video.videoUrl) {
      try {
        const url = new URL(video.videoUrl);

        filename = decodeURIComponent(path.basename(url.pathname));
      } catch {
        return res.status(400).json({
          message: "Invalid stored video URL",
        });
      }
    }

    if (!filename) {
      return res.status(404).json({
        message: "Video filename not found",
      });
    }

    filename = path.basename(filename);

    const filePath = path.join(VIDEO_FOLDER, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        message: "Video file not found",
      });
    }

    const stat = await fs.promises.stat(filePath);

    if (!stat.isFile()) {
      return res.status(400).json({
        message: "Video path is not a file",
      });
    }

    const fileSize = stat.size;

    const extension = path.extname(filename).replace(".", "").toLowerCase();

    const mimeTypes = {
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      mkv: "video/x-matroska",
      avi: "video/x-msvideo",
      m4v: "video/x-m4v",
    };

    const contentType = mimeTypes[extension] || "video/mp4";

    const range = req.headers.range;

    // ==========================================
    // NO RANGE
    // ==========================================

    if (!range) {
      res.writeHead(200, {
        "Content-Length": fileSize,

        "Content-Type": contentType,

        "Accept-Ranges": "bytes",

        "Cache-Control": "no-cache",
      });

      const stream = fs.createReadStream(filePath);

      stream.on("error", (error) => {
        console.error("VIDEO STREAM ERROR:", error);

        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.destroy(error);
        }
      });

      stream.pipe(res);

      return;
    }

    // ==========================================
    // RANGE REQUEST
    // ==========================================

    const rangeMatch = range.match(/bytes=(\d*)-(\d*)/);

    if (!rangeMatch) {
      return res.status(416).json({
        message: "Invalid range request",
      });
    }

    let start = rangeMatch[1] !== "" ? parseInt(rangeMatch[1], 10) : 0;

    let end = rangeMatch[2] !== "" ? parseInt(rangeMatch[2], 10) : fileSize - 1;

    if (rangeMatch[1] === "" && rangeMatch[2] !== "") {
      const suffixLength = parseInt(rangeMatch[2], 10);

      start = Math.max(0, fileSize - suffixLength);

      end = fileSize - 1;
    }

    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start < 0 ||
      start >= fileSize ||
      end < start
    ) {
      return res.status(416).set("Content-Range", `bytes */${fileSize}`).json({
        message: "Requested range not satisfiable",
      });
    }

    end = Math.min(end, fileSize - 1);

    const chunkSize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,

      "Accept-Ranges": "bytes",

      "Content-Length": chunkSize,

      "Content-Type": contentType,

      "Cache-Control": "no-cache",
    });

    const stream = fs.createReadStream(filePath, {
      start,
      end,
    });

    stream.on("error", (error) => {
      console.error("VIDEO STREAM ERROR:", error);

      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.destroy(error);
      }
    });

    stream.pipe(res);
  } catch (error) {
    console.error("STREAM VIDEO ERROR:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        message: "Failed to stream video",
      });
    }

    res.end();
  }
};

// ==========================================
// DELETE EXPIRED VIDEOS
// ==========================================
//
// Call this periodically.
// Each video uses its own expiresAt.
//
// ==========================================

export const deleteExpiredVideos = async () => {
  try {
    const now = new Date();

    const expiredVideos = await Video.find({
      expiresAt: {
        $exists: true,
        $ne: null,
        $lte: now,
      },
    });

    console.log(`Found ${expiredVideos.length} expired videos`);

    for (const video of expiredVideos) {
      try {
        if (video.filename) {
          const filename = path.basename(video.filename);

          const filePath = path.join(VIDEO_FOLDER, filename);

          if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);

            console.log("Deleted file:", filePath);
          }
        }

        await Video.findByIdAndDelete(video._id);

        console.log("Deleted database record:", video._id.toString());
      } catch (error) {
        console.error("Failed to delete expired video:", video._id, error);
      }
    }

    return {
      deleted: expiredVideos.length,
    };
  } catch (error) {
    console.error("DELETE EXPIRED VIDEOS ERROR:", error);

    return {
      deleted: 0,
      error: error.message,
    };
  }
};
