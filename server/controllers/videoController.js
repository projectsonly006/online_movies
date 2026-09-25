import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import axios from "axios";

import Video from "../models/Video.js";
import cloudinary from "../config/cloudinary.js";
import { getVideoDuration } from "../utils/videoMetadata.js";

import { setProgress, getProgress } from "../utils/downloadProgress.js";
import { v4 as uuidv4 } from "uuid";

// ==========================================
// PATH SETUP
// ==========================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIDEO_FOLDER = path.join(__dirname, "..", "videos");

console.log("Video folder:", VIDEO_FOLDER);

// ==========================================
// UPLOAD VIDEO FILE TO CLOUDINARY
// ==========================================

export const uploadVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No video uploaded",
      });
    }

    const video = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "video",
          folder: "video-link-app",
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        },
      );

      uploadStream.end(req.file.buffer);
    });

    const newVideo = await Video.create({
      title: req.body.title || "Untitled Video",

      publicId: video.public_id,

      videoUrl: video.secure_url,

      thumbnailUrl: video.secure_url
        .replace("/video/upload/", "/video/upload/so_0/")
        .replace(".mkv", ".jpg"),

      duration: video.duration || 0,

      format: video.format || "mp4",

      size: req.file.size,

      cbc: req.body.cbc || "",
    });

    return res.status(201).json({
      message: "Video uploaded successfully",

      video: newVideo,

      watchUrl: `/watch/${newVideo._id}`,
    });
  } catch (error) {
    console.error("UPLOAD ERROR:", error);

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
    console.log("🔥 FROM-URL REQUEST");
    console.log(req.body);

    const {
      title,
      videoUrl,
      thumbnailUrl = "",
      duration = 0,
      format = "mp4",
      size = 0,
      cbc = "",
    } = req.body;

    if (!videoUrl) {
      return res.status(400).json({
        message: "videoUrl is required",
      });
    }

    const newVideo = await Video.create({
      title: title || "Untitled Video",

      publicId: `external-${Date.now()}`,

      videoUrl,

      thumbnailUrl,

      duration: Number(duration) || 0,

      format,

      size: Number(size) || 0,

      cbc,
    });

    console.log("✅ VIDEO CREATED:", newVideo._id);

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
    const { title, filename, cbc = "" } = req.body;

    console.log("=================================");
    console.log("CREATE LOCAL VIDEO");
    console.log("Filename:", filename);
    console.log("Video folder:", VIDEO_FOLDER);
    console.log("=================================");

    if (!filename) {
      return res.status(400).json({
        message: "filename is required",
      });
    }

    const safeFilename = path.basename(filename);

    const filePath = path.join(VIDEO_FOLDER, safeFilename);

    console.log("Checking file:", filePath);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        message: "Video file not found",
        filePath,
      });
    }

    const stats = fs.statSync(filePath);

    if (!stats.isFile()) {
      return res.status(400).json({
        message: "The specified path is not a file",
      });
    }

    console.log("Getting video duration...");

    const duration = await getVideoDuration(filePath);

    console.log("=================================");
    console.log("LOCAL VIDEO FOUND");
    console.log("File:", filePath);
    console.log("Size:", stats.size);
    console.log("Duration:", duration);
    console.log("=================================");

    const extension = path.extname(safeFilename).replace(".", "").toLowerCase();

    const newVideo = await Video.create({
      title: title || path.basename(safeFilename, path.extname(safeFilename)),

      publicId: `local-${Date.now()}`,

      // videoUrl:
      //   `http://localhost:${process.env.PORT || 5000}` +
      //   `/videos/${encodeURIComponent(safeFilename)}`,

      videoUrl: `https://online-movies-uebc.onrender.com/videos/${encodeURIComponent(safeFilename)}`,

      thumbnailUrl: "",

      duration,

      format: extension || "mp4",

      size: stats.size,

      cbc,
    });

    console.log("=================================");
    console.log("✅ LOCAL VIDEO CREATED");
    console.log("ID:", newVideo._id);
    console.log("URL:", newVideo.videoUrl);
    console.log("Duration:", newVideo.duration);
    console.log("Size:", newVideo.size);
    console.log("=================================");

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

    console.log("=================================");
    console.log("GET VIDEO REQUEST");
    console.log("ID:", id);
    console.log("URL:", req.originalUrl);
    console.log("=================================");

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

    console.log("VIDEO FOUND:", video._id);

    return res.json({
      id: video._id,

      title: video.title,

      // videoUrl: video.videoUrl,

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

    console.log("UPDATE VIDEO ID:", id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid video ID",
      });
    }

    const video = await Video.findByIdAndUpdate(
      id,
      {
        ...(videoUrl !== undefined && {
          videoUrl,
        }),

        ...(title !== undefined && {
          title,
        }),

        ...(thumbnailUrl !== undefined && {
          thumbnailUrl,
        }),

        ...(cbc !== undefined && {
          cbc,
        }),
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
// DOWNLOAD WETRANSFER FILE
// ==========================================

async function downloadWeTransferVideo(
  signedFileUrl,
  outputPath,
  expectedSize = 0,
  filename = "download.mkv",
  jobId = null,
) {
  console.log("=================================");
  console.log("DOWNLOADING WETRANSFER FILE");
  console.log("=================================");

  console.log("OUTPUT:", outputPath);
  console.log("EXPECTED SIZE:", expectedSize);
  console.log("JOB ID:", jobId);

  await fs.promises.mkdir(path.dirname(outputPath), {
    recursive: true,
  });

  // ==========================================
  // START DOWNLOAD
  // ==========================================

  const response = await axios.get(signedFileUrl, {
    responseType: "stream",

    timeout: 0,

    maxRedirects: 10,

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

  console.log("=================================");
  console.log("WETRANSFER FILE RESPONSE");
  console.log("=================================");

  console.log("STATUS:", response.status);
  console.log("CONTENT TYPE:", contentType);
  console.log("CONTENT LENGTH:", contentLength);

  console.log("=================================");

  // ==========================================
  // VALIDATE RESPONSE
  // ==========================================

  if (response.status !== 200) {
    response.data.destroy();

    throw new Error(`Download returned HTTP ${response.status}`);
  }

  if (contentType.toLowerCase().includes("text/html")) {
    response.data.destroy();

    throw new Error("Server returned HTML instead of video");
  }

  // ==========================================
  // TOTAL SIZE
  // ==========================================

  const totalBytes = contentLength || Number(expectedSize) || 0;

  // ==========================================
  // PROGRESS VARIABLES
  // ==========================================

  let downloadedBytes = 0;

  const startTime = Date.now();

  // ==========================================
  // INITIAL PROGRESS
  // ==========================================

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
  // CREATE FILE
  // ==========================================

  const writer = fs.createWriteStream(outputPath);

  // ==========================================
  // DOWNLOAD PROGRESS
  // ==========================================

  response.data.on("data", (chunk) => {
    downloadedBytes += chunk.length;

    const elapsed = (Date.now() - startTime) / 1000;

    const downloadedMB = downloadedBytes / 1024 / 1024;

    const totalMB = totalBytes / 1024 / 1024;

    const percentage =
      totalBytes > 0
        ? Number(((downloadedBytes / totalBytes) * 100).toFixed(2))
        : 0;

    const speedMBps = elapsed > 0 ? downloadedBytes / 1024 / 1024 / elapsed : 0;

    // ==========================================
    // TERMINAL
    // ==========================================

    process.stdout.write(
      `\rDownloaded: ${downloadedMB.toFixed(2)} MB / ${totalMB.toFixed(
        2,
      )} MB (${percentage}%) | ${speedMBps.toFixed(2)} MB/s`,
    );

    // ==========================================
    // FRONTEND PROGRESS
    // ==========================================

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

  // ==========================================
  // DOWNLOAD ERROR
  // ==========================================

  response.data.on("error", (error) => {
    console.error("\nDownload stream error:", error);

    if (jobId) {
      setProgress(jobId, {
        status: "error",

        percentage: 0,

        error: error.message,

        filename,
      });
    }

    writer.destroy(error);
  });

  // ==========================================
  // FILE WRITE ERROR
  // ==========================================

  writer.on("error", (error) => {
    console.error("\nFile write error:", error);

    if (jobId) {
      setProgress(jobId, {
        status: "error",

        percentage: 0,

        error: error.message,

        filename,
      });
    }

    response.data.destroy(error);
  });

  // ==========================================
  // PIPE
  // ==========================================

  response.data.pipe(writer);

  // ==========================================
  // WAIT FOR DOWNLOAD
  // ==========================================

  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);

    writer.on("error", reject);

    response.data.on("error", reject);
  });

  console.log("\n=================================");

  console.log("DOWNLOAD COMPLETE");

  console.log("=================================");

  // ==========================================
  // FILE STATS
  // ==========================================

  const stats = await fs.promises.stat(outputPath);

  console.log("SIZE:", stats.size);

  // ==========================================
  // 100% / PROCESSING
  // ==========================================

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
// RESOLVE WETRANSFER URL
// ==========================================

async function resolveWeTransferUrl(wetransferUrl) {
  console.log("=================================");
  console.log("RESOLVING WETRANSFER URL");
  console.log("=================================");

  console.log("INPUT:", wetransferUrl);

  const response = await axios.get(wetransferUrl, {
    responseType: "text",

    maxRedirects: 10,

    timeout: 120000,

    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140 Safari/537.36",

      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  const html = response.data;

  console.log("PAGE STATUS:", response.status);

  console.log("HTML LENGTH:", html.length);

  const nextDataMatch = html.match(
    /<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s,
  );

  if (!nextDataMatch) {
    throw new Error(
      "Could not find WeTransfer transfer data. The link may be expired or WeTransfer changed its page format.",
    );
  }

  let nextData;

  try {
    nextData = JSON.parse(nextDataMatch[1]);
  } catch {
    throw new Error("Could not parse WeTransfer transfer data");
  }

  const transfer = nextData?.props?.pageProps?.initialTransfer;

  if (!transfer) {
    throw new Error("Could not find WeTransfer transfer information");
  }

  const item = transfer.items?.[0];

  if (!item) {
    throw new Error("No file found in WeTransfer transfer");
  }

  console.log("=================================");

  console.log("WETRANSFER INFORMATION");

  console.log("=================================");

  console.log("TRANSFER ID:", transfer.id);

  console.log("SECURITY HASH:", transfer.security_hash);

  console.log("ITEM ID:", item.id);

  console.log("FILENAME:", item.name);

  console.log("SIZE:", item.size);

  console.log("=================================");

  return {
    transferId: transfer.id,

    securityHash: transfer.security_hash,

    itemId: item.id,

    filename: item.name,

    size: Number(item.size || 0),
  };
}

// ==========================================
// TEST DOWNLOAD VIDEO
// ==========================================

export const testDownloadVideo = async (req, res) => {
  try {
    const {
      signedFileUrl,
      filename = "download.mkv",
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

    const safeFilename = path.basename(filename);

    if (!safeFilename || safeFilename === ".") {
      return res.status(400).json({
        message: "Valid filename is required",
      });
    }

    const outputPath = path.join(VIDEO_FOLDER, safeFilename);

    const result = await downloadWeTransferVideo(
      signedFileUrl,
      outputPath,
      Number(expectedSize) || 0,
      safeFilename,
      jobId,
    );

    setProgress(jobId, {
      status: "processing",
      percentage: 100,
      filename: safeFilename,
    });

    console.log("Getting video duration...");

    const duration = await getVideoDuration(outputPath);

    console.log("Video duration:", duration);

    const extension = path.extname(safeFilename).replace(".", "").toLowerCase();

    // const videoUrl =`http://localhost:${process.env.PORT || 5000}` +`/videos/${encodeURIComponent(safeFilename)}`;

    const videoUrl =
      `https://online-movies-uebc.onrender.com` +
      `/videos/${encodeURIComponent(safeFilename)}`;

    const newVideo = await Video.create({
      title: title || path.basename(safeFilename, path.extname(safeFilename)),

      publicId: `wetransfer-${Date.now()}`,

      videoUrl,

      thumbnailUrl: "",

      duration,

      format: extension || "mp4",

      size: result.size,

      cbc,
    });

    // ==========================================
    // FINISHED
    // ==========================================

    setProgress(jobId, {
      status: "completed",

      percentage: 100,

      downloadedBytes: result.size,

      totalBytes: result.size,

      downloadedMB: Number((result.size / 1024 / 1024).toFixed(2)),

      totalMB: Number((result.size / 1024 / 1024).toFixed(2)),

      speedMBps: 0,

      filename: safeFilename,

      videoId: newVideo._id,
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
    console.error("=================================");
    console.error("CREATE WATCHABLE VIDEO ERROR");
    console.error("=================================");

    console.error(error);

    const jobId = req.body?.jobId;

    if (jobId) {
      setProgress(jobId, {
        status: "error",
        percentage: 0,
        error: error.message || "Download failed",
      });
    }

    return res.status(500).json({
      message: error.message || "Failed to create watchable video",
    });
  }
};

// ==========================================
// CREATE VIDEO FROM NORMAL WETRANSFER LINK
// ==========================================

export const createVideoFromWeTransfer = async (req, res) => {
  try {
    const { url, title } = req.body;

    console.log("=================================");

    console.log("CREATE VIDEO FROM WETRANSFER");

    console.log("=================================");

    console.log("URL:", url);

    if (!url) {
      return res.status(400).json({
        message: "WeTransfer URL is required",
      });
    }

    // ==========================================
    // 1. GET WETRANSFER PAGE
    // ==========================================

    const pageResponse = await axios.get(url, {
      responseType: "text",

      maxRedirects: 10,

      timeout: 120000,

      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/140 Safari/537.36",

        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const html = pageResponse.data;

    console.log("PAGE STATUS:", pageResponse.status);

    console.log("HTML LENGTH:", html.length);

    // ==========================================
    // 2. NEXT DATA
    // ==========================================

    const nextDataMatch = html.match(
      /<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s,
    );

    if (!nextDataMatch) {
      throw new Error(
        "Could not find WeTransfer transfer data. The link may be invalid or WeTransfer changed its page.",
      );
    }

    let nextData;

    try {
      nextData = JSON.parse(nextDataMatch[1]);
    } catch {
      throw new Error("Failed to parse WeTransfer page data");
    }

    // ==========================================
    // 3. TRANSFER
    // ==========================================

    const transfer = nextData?.props?.pageProps?.initialTransfer;

    if (!transfer) {
      throw new Error("Could not find transfer information in WeTransfer page");
    }

    const transferId = transfer.id;

    const recipientId = transfer.security_hash;

    const item = transfer.items?.[0];

    if (!item) {
      throw new Error("No file found in this WeTransfer transfer");
    }

    const itemId = item.id;

    const filename = item.name;

    const expectedSize = Number(item.size || 0);

    console.log("=================================");

    console.log("TRANSFER INFORMATION");

    console.log("=================================");

    console.log("TRANSFER ID:", transferId);

    console.log("RECIPIENT ID:", recipientId);

    console.log("ITEM ID:", itemId);

    console.log("FILENAME:", filename);

    console.log("SIZE:", expectedSize);

    // ==========================================
    // 4. DOWNLOAD URL
    // ==========================================

    const downloadUrl =
      `https://wetransfer.com/downloads/${transferId}/${recipientId}` +
      `?itemId=${encodeURIComponent(itemId)}`;

    console.log("DOWNLOAD URL:");

    console.log(downloadUrl);

    // ==========================================
    // 5. DOWNLOAD
    // ==========================================

    const fileResponse = await axios.get(downloadUrl, {
      responseType: "stream",

      maxRedirects: 10,

      timeout: 0,

      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/140 Safari/537.36",

        Accept: "*/*",
      },
    });

    const contentType = fileResponse.headers["content-type"] || "";

    console.log("DOWNLOAD STATUS:", fileResponse.status);

    console.log("CONTENT TYPE:", contentType);

    if (contentType.toLowerCase().includes("text/html")) {
      fileResponse.data.destroy();

      throw new Error("WeTransfer returned HTML instead of the video file.");
    }

    const safeFilename = path.basename(filename);

    const outputPath = path.join(VIDEO_FOLDER, safeFilename);

    await fs.promises.mkdir(VIDEO_FOLDER, {
      recursive: true,
    });

    // ==========================================
    // CREATE A JOB
    // ==========================================

    const jobId = `job-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    setProgress(jobId, {
      status: "starting",

      percentage: 0,

      downloadedBytes: 0,

      totalBytes: expectedSize,

      downloadedMB: 0,

      totalMB: Number((expectedSize / 1024 / 1024).toFixed(2)),

      speedMBps: 0,

      filename: safeFilename,
    });

    // ==========================================
    // DOWNLOAD
    // ==========================================

    const result = await downloadWeTransferVideo(
      // IMPORTANT:
      // We need the actual response URL.
      // Axios follows redirects automatically.
      fileResponse.request?.res?.responseUrl || downloadUrl,

      outputPath,

      expectedSize,

      safeFilename,

      jobId,
    );

    // ==========================================
    // DURATION
    // ==========================================

    setProgress(jobId, {
      status: "processing",

      percentage: 100,

      filename: safeFilename,
    });

    const duration = await getVideoDuration(outputPath);

    console.log("DURATION:", duration);

    // ==========================================
    // EXTENSION
    // ==========================================

    const extension = path.extname(safeFilename).replace(".", "").toLowerCase();

    // ==========================================
    // VIDEO URL
    // ==========================================

    // const videoUrl =
    //   `http://localhost:${process.env.PORT || 5000}` +
    //   `/videos/${encodeURIComponent(safeFilename)}`;

    const videoUrl =
      `https://online-movies-uebc.onrender.com` +
      `/videos/${encodeURIComponent(safeFilename)}`;

    // ==========================================
    // DATABASE
    // ==========================================

    const newVideo = await Video.create({
      title: title || path.basename(safeFilename, path.extname(safeFilename)),

      publicId: `wetransfer-${Date.now()}`,

      videoUrl,

      thumbnailUrl: "",

      duration,

      format: extension || "mp4",

      size: result.size,
    });

    // ==========================================
    // COMPLETE
    // ==========================================

    setProgress(jobId, {
      status: "completed",

      percentage: 100,

      downloadedBytes: result.size,

      totalBytes: result.size,

      downloadedMB: Number((result.size / 1024 / 1024).toFixed(2)),

      totalMB: Number((result.size / 1024 / 1024).toFixed(2)),

      speedMBps: 0,

      filename: safeFilename,

      videoId: newVideo._id,
    });

    console.log("=================================");

    console.log("VIDEO CREATED");

    console.log("ID:", newVideo._id);

    console.log("JOB ID:", jobId);

    console.log("=================================");

    return res.status(201).json({
      message: "Video created successfully",

      jobId,

      video: newVideo,

      watchUrl: `/watch/${newVideo._id}`,
    });
  } catch (error) {
    console.error("=================================");

    console.error("CREATE WETRANSFER VIDEO ERROR");

    console.error("=================================");

    console.error(error);

    return res.status(500).json({
      message: error.message || "Failed to create video from WeTransfer",
    });
  }
};

// ==========================================
// CREATE WATCHABLE FROM SIGNED WETRANSFER URL
// ==========================================

// ==========================================
// CREATE WATCHABLE FROM SIGNED WETRANSFER URL
// ==========================================

export const createWatchableFromWeTransfer = async (req, res) => {
  try {
    const {
      signedFileUrl,
      title = "",
      filename = "",
      cbc = "",
      jobId: clientJobId,
    } = req.body;

    // ==========================================
    // VALIDATE URL
    // ==========================================

    if (!signedFileUrl) {
      return res.status(400).json({
        success: false,
        message: "signedFileUrl is required",
      });
    }

    // ==========================================
    // CREATE JOB ID
    // ==========================================

    const jobId = clientJobId || uuidv4();

    console.log("=================================");
    console.log("NEW DOWNLOAD JOB");
    console.log("JOB ID:", jobId);
    console.log("=================================");

    // ==========================================
    // INITIAL PROGRESS
    // ==========================================

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

    // ==========================================
    // IMPORTANT:
    // RETURN IMMEDIATELY
    // ==========================================

    res.status(202).json({
      success: true,

      message: "Video download started",

      jobId,

      videoId: null,
    });

    // ==========================================
    // BACKGROUND DOWNLOAD
    // ==========================================

    try {
      // ========================================
      // VALIDATE URL
      // ========================================

      let parsedUrl;

      try {
        parsedUrl = new URL(signedFileUrl);
      } catch {
        throw new Error("Invalid download URL");
      }

      // ========================================
      // DETERMINE FILENAME
      // ========================================

      const urlFilename = path.basename(parsedUrl.pathname);

      let safeFilename = filename || urlFilename;

      if (!safeFilename || safeFilename === ".") {
        safeFilename = `video-${Date.now()}.mp4`;
      }

      safeFilename = path.basename(safeFilename);

      // ========================================
      // ADD EXTENSION IF MISSING
      // ========================================

      if (!path.extname(safeFilename)) {
        safeFilename += ".mp4";
      }

      // ========================================
      // OUTPUT PATH
      // ========================================

      const outputPath = path.join(VIDEO_FOLDER, safeFilename);

      await fs.promises.mkdir(VIDEO_FOLDER, {
        recursive: true,
      });

      console.log("=================================");
      console.log("DOWNLOAD INFORMATION");
      console.log("=================================");

      console.log("JOB ID:", jobId);
      console.log("SIGNED URL:", signedFileUrl);
      console.log("FILENAME:", safeFilename);
      console.log("OUTPUT:", outputPath);

      console.log("=================================");

      // ========================================
      // DOWNLOAD
      // ========================================

      const downloaded = await downloadWeTransferVideo(
        signedFileUrl,
        outputPath,
        0,
        safeFilename,
        jobId,
      );

      console.log("=================================");
      console.log("DOWNLOAD FINISHED");
      console.log("JOB ID:", jobId);
      console.log("SIZE:", downloaded.size);
      console.log("=================================");

      // ========================================
      // PROCESSING
      // ========================================

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

      // ========================================
      // GET VIDEO DURATION
      // ========================================

      console.log("Getting video duration...");

      let duration = 0;

      try {
        duration = await getVideoDuration(outputPath);

        console.log("VIDEO DURATION:", duration);
      } catch (error) {
        console.warn("Could not determine video duration:", error.message);
      }

      // ========================================
      // EXTENSION
      // ========================================

      const extension =
        path.extname(safeFilename).replace(".", "").toLowerCase() || "mp4";

      // ========================================
      // VIDEO URL
      // ========================================

      // const serverUrl =
      //   process.env.SERVER_URL ||
      //   `http://localhost:${process.env.PORT || 5000}`;

      const serverUrl =
        process.env.SERVER_URL || "https://online-movies-uebc.onrender.com";

      const videoUrl = `${serverUrl}/videos/${encodeURIComponent(filename)}`;

      // ========================================
      // CREATE MONGODB RECORD
      // ========================================

      console.log("Creating MongoDB video...");

      const newVideo = await Video.create({
        title: title || path.basename(safeFilename, path.extname(safeFilename)),

        publicId: `external-${Date.now()}`,

        videoUrl,

        thumbnailUrl: "",

        duration,

        format: extension,

        size: downloaded.size,

        cbc: cbc.trim(),
      });

      console.log("=================================");
      console.log("VIDEO CREATED");
      console.log("VIDEO ID:", newVideo._id.toString());
      console.log("JOB ID:", jobId);
      console.log("CBC RECEIVED:", cbc);

      console.log("=================================");

      // ========================================
      // COMPLETED
      // ========================================

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

          // videoUrl: newVideo.videoUrl,

          thumbnailUrl: newVideo.thumbnailUrl || "",

          duration: newVideo.duration,

          format: newVideo.format,

          size: newVideo.size,

          cbc: newVideo.cbc || "",
        },

        watchUrl: `/watch/${newVideo._id.toString()}`,
      });

      console.log("=================================");
      console.log("JOB COMPLETED");
      console.log("JOB ID:", jobId);
      console.log("VIDEO ID:", newVideo._id.toString());
      console.log("=================================");
    } catch (error) {
      console.error("=================================");
      console.error("BACKGROUND DOWNLOAD ERROR");
      console.error("=================================");

      console.error(error);

      setProgress(jobId, {
        status: "error",

        percentage: 0,

        error: error.message || "Download failed",

        filename: filename || "",

        videoId: null,
      });
    }
  } catch (error) {
    console.error("CREATE WATCHABLE ERROR:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,

        message: error.message || "Failed to start video download",
      });
    }
  }
};

// ==========================================
// GET DOWNLOAD PROGRESS
// ==========================================

export const getDownloadProgress = async (req, res) => {
  try {
    const { jobId } = req.params;

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

export const streamVideo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
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

    // Extract filename from stored URL
    const url = new URL(video.videoUrl);
    const filename = decodeURIComponent(path.basename(url.pathname));

    const filePath = path.join(VIDEO_FOLDER, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        message: "Video file not found",
      });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    const range = req.headers.range;

    // ==========================================
    // NO RANGE REQUEST
    // ==========================================

    if (!range) {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
      });

      fs.createReadStream(filePath).pipe(res);

      return;
    }

    // ==========================================
    // RANGE REQUEST
    // ==========================================

    const parts = range.replace(/bytes=/, "").split("-");

    const start = parseInt(parts[0], 10);

    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      return res.status(416).json({
        message: "Requested range not satisfiable",
      });
    }

    const chunkSize = end - start + 1;

    const stream = fs.createReadStream(filePath, {
      start,
      end,
    });

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "video/mp4",
    });

    stream.pipe(res);
  } catch (error) {
    console.error("STREAM VIDEO ERROR:", error);

    return res.status(500).json({
      message: "Failed to stream video",
    });
  }
};
