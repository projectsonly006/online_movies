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

// ==========================================
// UPLOAD VIDEO FILE TO LOCAL /videos FOLDER
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

    const safeFilename = getSafeFilename(
      req.file.originalname,
      `video-${Date.now()}.mp4`,
    );

    const outputPath = path.join(VIDEO_FOLDER, safeFilename);

    // Save uploaded buffer to /videos
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

    const videoUrl = getVideoUrl(safeFilename);

    const newVideo = await Video.create({
      title:
        req.body.title ||
        getTitleFromFilename(safeFilename) ||
        "Untitled Video",

      publicId: `local-upload-${Date.now()}`,

      videoUrl,

      filename: safeFilename,

      thumbnailUrl: "",

      duration,

      format: extension,

      size: stats.size,

      cbc: (req.body.cbc || "").trim(),
    });

    console.log("=================================");
    console.log("LOCAL VIDEO UPLOADED");
    console.log("=================================");
    console.log("Filename:", safeFilename);
    console.log("Size:", stats.size);
    console.log("Duration:", duration);
    console.log("Video ID:", newVideo._id);
    console.log("Video URL:", videoUrl);
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
    } = req.body;

    console.log("=================================");
    console.log("CREATE VIDEO FROM URL");
    console.log("=================================");

    if (!videoUrl) {
      return res.status(400).json({
        message: "videoUrl is required",
      });
    }

    const safeFilename = filename
      ? getSafeFilename(filename)
      : getSafeFilename(
          path.basename(new URL(videoUrl).pathname),
          `video-${Date.now()}.${format || "mp4"}`,
        );

    const newVideo = await Video.create({
      title: title || getTitleFromFilename(safeFilename),

      publicId: `external-${Date.now()}`,

      videoUrl,

      sourceUrl,

      filename: safeFilename,

      thumbnailUrl,

      duration: Number(duration) || 0,

      format: format || getExtension(safeFilename),

      size: Number(size) || 0,

      cbc: cbc.trim(),
    });

    console.log("VIDEO CREATED:", newVideo._id);

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
// CREATE VIDEO FROM LOCAL /videos FOLDER
// ==========================================

export const createLocalVideo = async (req, res) => {
  try {
    const { title = "", filename, cbc = "" } = req.body;

    console.log("=================================");
    console.log("CREATE LOCAL VIDEO");
    console.log("=================================");

    if (!filename) {
      return res.status(400).json({
        message: "filename is required",
      });
    }

    const safeFilename = getSafeFilename(filename);

    const filePath = path.join(VIDEO_FOLDER, safeFilename);

    console.log("File:", filePath);

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

    let duration = 0;

    try {
      duration = await getVideoDuration(filePath);
    } catch (error) {
      console.warn("Could not determine video duration:", error.message);
    }

    const extension = getExtension(safeFilename);

    const videoUrl = getVideoUrl(safeFilename);

    const newVideo = await Video.create({
      title: title || getTitleFromFilename(safeFilename),

      publicId: `local-${Date.now()}`,

      videoUrl,

      filename: safeFilename,

      thumbnailUrl: "",

      duration,

      format: extension,

      size: stats.size,

      cbc: cbc.trim(),
    });

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
      .select("_id title thumbnailUrl duration format size cbc createdAt")
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

    const { videoUrl, title, thumbnailUrl, cbc } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid video ID",
      });
    }

    const video = await Video.findByIdAndUpdate(
      id,
      {
        ...(videoUrl !== undefined && { videoUrl }),

        ...(title !== undefined && { title }),

        ...(thumbnailUrl !== undefined && {
          thumbnailUrl,
        }),

        ...(cbc !== undefined && { cbc }),
      },
      {
        new: true,
        runValidators: true,
      },
    );

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
// DOWNLOAD FILE
// ==========================================

async function downloadWeTransferVideo(
  signedFileUrl,
  outputPath,
  expectedSize = 0,
  filename = "download.mp4",
  jobId = null,
) {
  console.log("=================================");
  console.log("DOWNLOADING FILE");
  console.log("=================================");

  console.log("OUTPUT:", outputPath);
  console.log("EXPECTED SIZE:", expectedSize);
  console.log("JOB ID:", jobId);

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

  console.log("STATUS:", response.status);
  console.log("CONTENT TYPE:", contentType);
  console.log("CONTENT LENGTH:", contentLength);

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

  console.log("\n=================================");
  console.log("DOWNLOAD COMPLETE");
  console.log("=================================");

  const stats = await fs.promises.stat(outputPath);

  if (stats.size === 0) {
    throw new Error("Downloaded file is empty");
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

    const safeFilename = getSafeFilename(filename, `video-${Date.now()}.mp4`);

    const outputPath = path.join(VIDEO_FOLDER, safeFilename);

    await fs.promises.mkdir(VIDEO_FOLDER, {
      recursive: true,
    });

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

    const videoUrl = getVideoUrl(safeFilename);

    const newVideo = await Video.create({
      title: title || getTitleFromFilename(safeFilename),

      publicId: `wetransfer-${Date.now()}`,

      videoUrl,

      sourceUrl,

      filename: safeFilename,

      thumbnailUrl: "",

      duration,

      format: extension,

      size: result.size,

      cbc: cbc.trim(),
    });

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
// CREATE WATCHABLE FROM SIGNED URL
// BACKGROUND DOWNLOAD
// ==========================================

export const createWatchableFromWeTransfer = async (req, res) => {
  const {
    signedFileUrl,
    sourceUrl = "",
    title = "",
    filename = "",
    cbc = "",
    jobId: clientJobId,
  } = req.body;

  if (!signedFileUrl) {
    return res.status(400).json({
      success: false,
      message: "signedFileUrl is required",
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

  // ==========================================
  // BACKGROUND WORK
  // ==========================================

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

    const outputPath = path.join(VIDEO_FOLDER, safeFilename);

    await fs.promises.mkdir(VIDEO_FOLDER, {
      recursive: true,
    });

    console.log("=================================");
    console.log("BACKGROUND VIDEO DOWNLOAD");
    console.log("=================================");
    console.log("JOB ID:", jobId);
    console.log("FILENAME:", safeFilename);
    console.log("OUTPUT:", outputPath);
    console.log("=================================");

    const downloaded = await downloadWeTransferVideo(
      signedFileUrl,
      outputPath,
      0,
      safeFilename,
      jobId,
    );

    setProgress(jobId, {
      status: "processing",

      percentage: 100,

      downloadedBytes: downloaded.size,

      totalBytes: downloaded.size,

      downloadedMB: Number((downloaded.size / 1024 / 1024).toFixed(2)),

      totalMB: Number((downloaded.size / 1024 / 1024).toFixed(2)),

      speedMBps: 0,

      filename: safeFilename,
    });

    // ==========================================
    // VIDEO DURATION
    // ==========================================

    let duration = 0;

    try {
      duration = await getVideoDuration(outputPath);
    } catch (error) {
      console.warn("Could not determine duration:", error.message);
    }

    // ==========================================
    // DATABASE
    // ==========================================

    const extension = getExtension(safeFilename);

    const videoUrl = getVideoUrl(safeFilename);

    const newVideo = await Video.create({
      title: title || getTitleFromFilename(safeFilename),

      publicId: `wetransfer-${Date.now()}`,

      videoUrl,

      sourceUrl,

      filename: safeFilename,

      thumbnailUrl: "",

      duration,

      format: extension,

      size: downloaded.size,

      cbc: cbc.trim(),
    });

    console.log("VIDEO CREATED:", newVideo._id);

    // ==========================================
    // COMPLETE
    // ==========================================

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

    let filename = video.filename;

    // Fallback for older database records
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
      });

      fs.createReadStream(filePath).pipe(res);

      return;
    }

    // ==========================================
    // RANGE
    // ==========================================

    const rangeMatch = range.match(/bytes=(\d*)-(\d*)/);

    if (!rangeMatch) {
      return res.status(416).json({
        message: "Invalid range request",
      });
    }

    let start = rangeMatch[1] !== "" ? parseInt(rangeMatch[1], 10) : 0;

    let end = rangeMatch[2] !== "" ? parseInt(rangeMatch[2], 10) : fileSize - 1;

    // Handle suffix range: bytes=-500
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
