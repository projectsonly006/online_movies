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
      .select(
        "_id title thumbnailUrl duration format size cbc filename createdAt",
      )
      .sort({
        createdAt: -1,
      });

    const result = await Promise.all(
      videos.map(async (video) => {
        let available = false;

        if (video.filename) {
          const safeFilename = path.basename(video.filename);

          const filePath = path.join(VIDEO_FOLDER, safeFilename);

          try {
            const stats = await fs.promises.stat(filePath);

            available = stats.isFile() && stats.size > 0;
          } catch {
            available = false;
          }
        }

        return {
          _id: video._id,
          title: video.title,
          thumbnailUrl: video.thumbnailUrl,
          duration: video.duration,
          format: video.format,
          size: video.size,
          cbc: video.cbc,
          createdAt: video.createdAt,

          available,
        };
      }),
    );

    return res.json(result);
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

// =========================================
// DELETE VIDEO
// =========================================

export const deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;

    // Check MongoDB ID
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid video ID",
      });
    }

    // Find video first
    const video = await Video.findById(id);

    if (!video) {
      return res.status(404).json({
        message: "Video not found",
      });
    }

    // ==========================================
    // DELETE VIDEO FILE FROM /videos
    // ==========================================

    if (video.filename) {
      const safeFilename = path.basename(video.filename);

      const filePath = path.join(VIDEO_FOLDER, safeFilename);

      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);

          console.log("VIDEO FILE DELETED:", filePath);
        } else {
          console.log("VIDEO FILE NOT FOUND:", filePath);
        }
      } catch (fileError) {
        console.error("VIDEO FILE DELETE ERROR:", fileError.message);

        // Continue deleting MongoDB record
      }
    }

    // ==========================================
    // DELETE FROM MONGODB
    // ==========================================

    await Video.findByIdAndDelete(id);

    console.log("=================================");
    console.log("VIDEO DELETED");
    console.log("VIDEO ID:", id);
    console.log("TITLE:", video.title);
    console.log("=================================");

    return res.json({
      success: true,
      message: "Video deleted successfully",
      videoId: id,
    });
  } catch (error) {
    console.error("DELETE VIDEO ERROR:", error);

    return res.status(500).json({
      message: error.message || "Failed to delete video",
    });
  }
};

// ==========================================
// DOWNLOAD FILE
// ==========================================

// async function downloadWeTransferVideo(
//   signedFileUrl,
//   outputPath,
//   expectedSize = 0,
//   filename = "download.mp4",
//   jobId = null,
// ) {
//   console.log("=================================");
//   console.log("DOWNLOADING FILE");
//   console.log("=================================");

//   console.log("OUTPUT:", outputPath);
//   console.log("EXPECTED SIZE:", expectedSize);
//   console.log("JOB ID:", jobId);

//   await fs.promises.mkdir(path.dirname(outputPath), {
//     recursive: true,
//   });

//   const response = await axios.get(signedFileUrl, {
//     responseType: "stream",

//     timeout: 0,

//     maxRedirects: 10,

//     validateStatus: (status) => status >= 200 && status < 400,

//     headers: {
//       "User-Agent":
//         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
//         "AppleWebKit/537.36 (KHTML, like Gecko) " +
//         "Chrome/140 Safari/537.36",

//       Accept: "*/*",
//     },
//   });

//   const contentType = response.headers["content-type"] || "";

//   const contentLength = Number(response.headers["content-length"] || 0);

//   console.log("STATUS:", response.status);
//   console.log("CONTENT TYPE:", contentType);
//   console.log("CONTENT LENGTH:", contentLength);

//   if (
//     contentType.toLowerCase().includes("text/html") ||
//     contentType.toLowerCase().includes("application/json")
//   ) {
//     response.data.destroy();

//     throw new Error(
//       "Server returned a webpage/JSON response instead of the video file.",
//     );
//   }

//   const totalBytes = contentLength || Number(expectedSize) || 0;

//   let downloadedBytes = 0;

//   const startTime = Date.now();

//   if (jobId) {
//     setProgress(jobId, {
//       status: "downloading",

//       percentage: 0,

//       downloadedBytes: 0,

//       totalBytes,

//       downloadedMB: 0,

//       totalMB: Number((totalBytes / 1024 / 1024).toFixed(2)),

//       speedMBps: 0,

//       filename,
//     });
//   }

//   const writer = fs.createWriteStream(outputPath);

//   const downloadPromise = new Promise((resolve, reject) => {
//     let settled = false;

//     const fail = (error) => {
//       if (settled) return;

//       settled = true;

//       reject(error);
//     };

//     const complete = () => {
//       if (settled) return;

//       settled = true;

//       resolve();
//     };

//     response.data.on("data", (chunk) => {
//       downloadedBytes += chunk.length;

//       const elapsed = (Date.now() - startTime) / 1000;

//       const downloadedMB = downloadedBytes / 1024 / 1024;

//       const totalMB = totalBytes / 1024 / 1024;

//       const percentage =
//         totalBytes > 0
//           ? Math.min(
//               100,
//               Number(((downloadedBytes / totalBytes) * 100).toFixed(2)),
//             )
//           : 0;

//       const speedMBps =
//         elapsed > 0 ? downloadedBytes / 1024 / 1024 / elapsed : 0;

//       process.stdout.write(
//         `\rDownloaded: ${downloadedMB.toFixed(2)} MB / ${totalMB.toFixed(
//           2,
//         )} MB (${percentage}%) | ${speedMBps.toFixed(2)} MB/s`,
//       );

//       if (jobId) {
//         setProgress(jobId, {
//           status: "downloading",

//           percentage,

//           downloadedBytes,

//           totalBytes,

//           downloadedMB: Number(downloadedMB.toFixed(2)),

//           totalMB: Number(totalMB.toFixed(2)),

//           speedMBps: Number(speedMBps.toFixed(2)),

//           filename,
//         });
//       }
//     });

//     response.data.on("error", (error) => {
//       console.error("\nDownload stream error:", error);

//       writer.destroy();

//       fail(error);
//     });

//     writer.on("error", (error) => {
//       console.error("\nFile write error:", error);

//       response.data.destroy();

//       fail(error);
//     });

//     writer.on("finish", complete);

//     response.data.pipe(writer);
//   });

//   try {
//     await downloadPromise;
//   } catch (error) {
//     try {
//       await fs.promises.unlink(outputPath);
//     } catch {}

//     throw error;
//   }

//   console.log("\n=================================");
//   console.log("DOWNLOAD COMPLETE");
//   console.log("=================================");

//   const stats = await fs.promises.stat(outputPath);

//   if (stats.size === 0) {
//     throw new Error("Downloaded file is empty");
//   }

//   if (expectedSize > 0 && stats.size !== Number(expectedSize)) {
//     console.warn(
//       `Expected ${expectedSize} bytes but downloaded ${stats.size} bytes`,
//     );
//   }

//   if (jobId) {
//     setProgress(jobId, {
//       status: "processing",

//       percentage: 100,

//       downloadedBytes: stats.size,

//       totalBytes: totalBytes || stats.size,

//       downloadedMB: Number((stats.size / 1024 / 1024).toFixed(2)),

//       totalMB: Number(((totalBytes || stats.size) / 1024 / 1024).toFixed(2)),

//       speedMBps: 0,

//       filename,
//     });
//   }

//   return {
//     path: outputPath,

//     filename,

//     size: stats.size,

//     expectedSize: Number(expectedSize) || contentLength,

//     contentType,
//   };
// }

// ==========================================
// TEST DOWNLOAD VIDEO
// ==========================================

// export const testDownloadVideo = async (req, res) => {
//   try {
//     const {
//       signedFileUrl,
//       sourceUrl = "",
//       filename = "download.mp4",
//       expectedSize = 0,
//       title = "",
//       cbc = "",
//       jobId,
//     } = req.body;

//     if (!signedFileUrl) {
//       return res.status(400).json({
//         message: "signedFileUrl is required",
//       });
//     }

//     if (!jobId) {
//       return res.status(400).json({
//         message: "jobId is required",
//       });
//     }

//     const safeFilename = getSafeFilename(filename, `video-${Date.now()}.mp4`);

//     const outputPath = path.join(VIDEO_FOLDER, safeFilename);

//     await fs.promises.mkdir(VIDEO_FOLDER, {
//       recursive: true,
//     });

//     const result = await downloadWeTransferVideo(
//       signedFileUrl,
//       outputPath,
//       Number(expectedSize) || 0,
//       safeFilename,
//       jobId,
//     );

//     let duration = 0;

//     try {
//       duration = await getVideoDuration(outputPath);
//     } catch (error) {
//       console.warn("Could not determine video duration:", error.message);
//     }

//     const extension = getExtension(safeFilename);

//     const videoUrl = getVideoUrl(safeFilename);

//     const newVideo = await Video.create({
//       title: title || getTitleFromFilename(safeFilename),

//       publicId: `wetransfer-${Date.now()}`,

//       videoUrl,

//       sourceUrl,

//       filename: safeFilename,

//       thumbnailUrl: "",

//       duration,

//       format: extension,

//       size: result.size,

//       cbc: cbc.trim(),
//     });

//     setProgress(jobId, {
//       status: "completed",

//       percentage: 100,

//       downloadedBytes: result.size,

//       totalBytes: result.size,

//       downloadedMB: Number((result.size / 1024 / 1024).toFixed(2)),

//       totalMB: Number((result.size / 1024 / 1024).toFixed(2)),

//       speedMBps: 0,

//       filename: safeFilename,

//       videoId: newVideo._id.toString(),
//     });

//     return res.status(201).json({
//       message: "Video downloaded and ready to watch",

//       video: {
//         id: newVideo._id,

//         title: newVideo.title,

//         videoUrl: newVideo.videoUrl,

//         thumbnailUrl: newVideo.thumbnailUrl,

//         duration: newVideo.duration,

//         format: newVideo.format,

//         size: newVideo.size,

//         cbc: newVideo.cbc,
//       },

//       watchUrl: `/watch/${newVideo._id}`,
//     });
//   } catch (error) {
//     console.error("CREATE WATCHABLE VIDEO ERROR:", error);

//     const jobId = req.body?.jobId;

//     if (jobId) {
//       setProgress(jobId, {
//         status: "error",

//         percentage: 0,

//         error: error.message || "Download failed",

//         filename: req.body?.filename || "",

//         videoId: null,
//       });
//     }

//     return res.status(500).json({
//       message: error.message || "Failed to create watchable video",
//     });
//   }
// };

// ==========================================
// CREATE WATCHABLE FROM SIGNED URL
// BACKGROUND DOWNLOAD
// ==========================================

export const createWatchableFromWeTransfer = async (req, res) => {
  try {
    const {
      sourceUrl = "",
      title = "",
      filename = "",
      cbc = "",
      duration = 0,
      format = "mp4",
      size = 0,
    } = req.body;

    if (!sourceUrl) {
      return res.status(400).json({
        success: false,
        message: "WeTransfer URL is required",
      });
    }

    // Make sure it is actually a WeTransfer URL
    let parsedUrl;

    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid URL",
      });
    }

    if (
      parsedUrl.hostname !== "we.tl" &&
      !parsedUrl.hostname.endsWith(".wetransfer.com")
    ) {
      return res.status(400).json({
        success: false,
        message: "Only WeTransfer URLs are supported",
      });
    }

    const newVideo = await Video.create({
      title: title.trim() || "Untitled Video",

      publicId: `wetransfer-${Date.now()}`,

      // We are NOT storing a local video URL
      videoUrl: "",

      // This is the important part
      sourceUrl: sourceUrl.trim(),

      filename: filename.trim(),

      thumbnailUrl: "",

      duration: Number(duration) || 0,

      format: format || "mp4",

      size: Number(size) || 0,

      cbc: cbc.trim(),
    });

    console.log("=================================");
    console.log("WETRANSFER VIDEO CREATED");
    console.log("VIDEO ID:", newVideo._id);
    console.log("SOURCE:", newVideo.sourceUrl);
    console.log("NO VIDEO DOWNLOADED");
    console.log("=================================");

    return res.status(201).json({
      success: true,

      message: "WeTransfer video added successfully",

      video: {
        id: newVideo._id,
        title: newVideo.title,
        videoUrl: "",
        sourceUrl: newVideo.sourceUrl,
        duration: newVideo.duration,
        format: newVideo.format,
        size: newVideo.size,
        cbc: newVideo.cbc,
      },

      watchUrl: `/watch/${newVideo._id}`,
    });
  } catch (error) {
    console.error("CREATE WETRANSFER VIDEO ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create video",
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

    // ==========================================
    // GET ORIGINAL WETRANSFER URL
    // ==========================================

    const sourceUrl = video.sourceUrl?.trim();

    if (!sourceUrl) {
      return res.status(410).json({
        success: false,
        code: "VIDEO_LINK_EXPIRED",
        message: "This video is no longer available.",
      });
    }

    console.log("=================================");
    console.log("WETRANSFER STREAM");
    console.log("VIDEO ID:", id);
    console.log("SOURCE:", sourceUrl);
    console.log("RANGE:", req.headers.range || "none");
    console.log("=================================");

    // ==========================================
    // REQUEST CURRENT FILE FROM WETRANSFER
    // ==========================================

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140 Safari/537.36",

      Accept: "*/*",
    };

    // IMPORTANT:
    // Pass the browser's Range header to WeTransfer.
    // This allows seeking inside the video.
    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    const response = await axios.get(sourceUrl, {
      responseType: "stream",

      maxRedirects: 10,

      timeout: 30000,

      headers,

      validateStatus: (status) => status >= 200 && status < 500,
    });

    const contentType =
      response.headers["content-type"] ||
      response.headers["Content-Type"] ||
      "";

    const status = response.status;

    console.log("WETRANSFER STATUS:", status);
    console.log("CONTENT TYPE:", contentType);
    console.log("FINAL URL:", response.request?.res?.responseUrl || "unknown");

    // ==========================================
    // EXPIRED / NOT FOUND
    // ==========================================

    if (status === 404 || status === 410 || status === 403) {
      response.data.destroy();

      return res.status(410).json({
        success: false,
        code: "VIDEO_LINK_EXPIRED",
        message: "This video is no longer available.",
      });
    }

    // ==========================================
    // WETRANSFER RETURNED HTML
    // ==========================================

    if (contentType.toLowerCase().includes("text/html")) {
      response.data.destroy();

      return res.status(410).json({
        success: false,
        code: "VIDEO_LINK_EXPIRED",
        message:
          "The WeTransfer video could not be accessed. The transfer may have expired.",
      });
    }

    // ==========================================
    // WETRANSFER RETURNED JSON ERROR
    // ==========================================

    if (contentType.toLowerCase().includes("application/json")) {
      response.data.destroy();

      return res.status(410).json({
        success: false,
        code: "VIDEO_LINK_EXPIRED",
        message: "This WeTransfer transfer is no longer available.",
      });
    }

    // ==========================================
    // DETERMINE CONTENT TYPE
    // ==========================================

    let finalContentType = contentType;

    if (!finalContentType || finalContentType === "application/octet-stream") {
      const extension = path
        .extname(video.filename || "")
        .replace(".", "")
        .toLowerCase();

      const mimeTypes = {
        mp4: "video/mp4",
        webm: "video/webm",
        mov: "video/quicktime",
        m4v: "video/x-m4v",
      };

      finalContentType = mimeTypes[extension] || "application/octet-stream";
    }

    // ==========================================
    // HEADERS
    // ==========================================

    const responseHeaders = {
      "Content-Type": finalContentType,

      "Accept-Ranges": response.headers["accept-ranges"] || "bytes",

      "Cache-Control": "no-store",

      "X-Content-Type-Options": "nosniff",
    };

    // Content-Length
    if (response.headers["content-length"]) {
      responseHeaders["Content-Length"] = response.headers["content-length"];
    }

    // Content-Range
    if (response.headers["content-range"]) {
      responseHeaders["Content-Range"] = response.headers["content-range"];
    }

    // ==========================================
    // RETURN CORRECT STATUS
    // ==========================================

    if (status === 206) {
      res.writeHead(206, responseHeaders);
    } else {
      res.writeHead(200, responseHeaders);
    }

    // ==========================================
    // PIPE DIRECTLY TO BROWSER
    //
    // NOTHING IS SAVED TO DISK
    // ==========================================

    response.data.on("error", (error) => {
      console.error("WETRANSFER STREAM ERROR:", error);

      if (!res.destroyed) {
        res.destroy(error);
      }
    });

    req.on("close", () => {
      if (!res.destroyed) {
        response.data.destroy();
      }
    });

    response.data.pipe(res);
  } catch (error) {
    console.error("WETRANSFER STREAM FAILED:", error.message);

    if (error.response) {
      console.error("STATUS:", error.response.status);
    }

    if (!res.headersSent) {
      return res.status(410).json({
        success: false,
        code: "VIDEO_LINK_EXPIRED",
        message:
          "This video is no longer available. The WeTransfer link may have expired.",
      });
    }

    res.destroy();
  }
};

// ==========================================
// CHECK VIDEO AVAILABILITY
// ==========================================

export const checkVideoAvailability = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        available: false,
        code: "INVALID_VIDEO_ID",
        message: "Invalid video ID",
      });
    }

    const video = await Video.findById(id);

    if (!video) {
      return res.status(404).json({
        available: false,
        code: "VIDEO_NOT_FOUND",
        message: "Video not found",
      });
    }

    const sourceUrl = video.sourceUrl?.trim();

    if (!sourceUrl) {
      return res.status(410).json({
        available: false,
        code: "VIDEO_LINK_EXPIRED",
        message: "This video is no longer available.",
      });
    }

    try {
      const response = await axios.get(sourceUrl, {
        responseType: "stream",

        maxRedirects: 10,

        timeout: 15000,

        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/140 Safari/537.36",

          Accept: "*/*",
        },

        validateStatus: (status) => status >= 200 && status < 500,
      });

      const status = response.status;

      const contentType = response.headers["content-type"] || "";

      response.data.destroy();

      // Expired / unavailable
      if (status === 403 || status === 404 || status === 410) {
        return res.status(410).json({
          available: false,
          code: "VIDEO_LINK_EXPIRED",
          message: "This video is no longer available.",
        });
      }

      // WeTransfer returned its webpage
      if (contentType.includes("text/html")) {
        return res.status(410).json({
          available: false,
          code: "VIDEO_LINK_EXPIRED",
          message: "The WeTransfer video is no longer available.",
        });
      }

      return res.json({
        available: true,
        code: "VIDEO_AVAILABLE",
        message: "Video is available",
      });
    } catch (error) {
      console.error("WETRANSFER AVAILABILITY ERROR:", error.message);

      return res.status(410).json({
        available: false,
        code: "VIDEO_LINK_EXPIRED",
        message: "This video is no longer available.",
      });
    }
  } catch (error) {
    console.error("CHECK VIDEO AVAILABILITY ERROR:", error);

    return res.status(500).json({
      available: false,
      code: "VIDEO_AVAILABILITY_ERROR",
      message: "Unable to check video availability.",
    });
  }
};
