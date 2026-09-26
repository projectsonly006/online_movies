import fs from "fs";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";

import Video from "../models/Video.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIDEO_FOLDER = path.join(__dirname, "..", "videos");

const SERVER_URL =
  process.env.SERVER_URL || "https://online-movies-uebc.onrender.com";

// ==========================================
// DOWNLOAD FILE
// ==========================================

async function downloadFile(url, outputPath) {
  console.log("=================================");
  console.log("RESTORE DOWNLOAD");
  console.log("=================================");
  console.log("URL:", url);
  console.log("OUTPUT:", outputPath);

  const response = await axios.get(url, {
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

  console.log("STATUS:", response.status);
  console.log("CONTENT TYPE:", contentType);

  if (response.status !== 200) {
    response.data.destroy();

    throw new Error(`Download returned HTTP ${response.status}`);
  }

  if (contentType.toLowerCase().includes("text/html")) {
    response.data.destroy();

    throw new Error("Source returned HTML instead of video");
  }

  await fs.promises.mkdir(path.dirname(outputPath), {
    recursive: true,
  });

  const writer = fs.createWriteStream(outputPath);

  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
    response.data.on("error", reject);
  });

  const stats = await fs.promises.stat(outputPath);

  console.log("RESTORE COMPLETE");
  console.log("SIZE:", stats.size);

  return stats.size;
}

// ==========================================
// RESTORE VIDEOS
// ==========================================

export default async function restoreVideos() {
  try {
    console.log("=================================");
    console.log("STARTING VIDEO RESTORE");
    console.log("=================================");

    await fs.promises.mkdir(VIDEO_FOLDER, {
      recursive: true,
    });

    const videos = await Video.find({
      sourceUrl: {
        $exists: true,
        $ne: "",
      },
    });

    console.log(`Found ${videos.length} videos with restore sources.`);

    for (const video of videos) {
      try {
        // ==========================================
        // DETERMINE FILENAME
        // ==========================================

        let filename = video.filename;

        if (!filename && video.videoUrl) {
          try {
            const parsed = new URL(video.videoUrl);

            filename = decodeURIComponent(path.basename(parsed.pathname));
          } catch {
            filename = "";
          }
        }

        if (!filename) {
          console.warn(
            `Skipping ${video._id}: filename could not be determined.`,
          );

          continue;
        }

        filename = path.basename(filename);

        const filePath = path.join(VIDEO_FOLDER, filename);

        // ==========================================
        // CHECK IF ALREADY EXISTS
        // ==========================================

        try {
          const stats = await fs.promises.stat(filePath);

          if (stats.isFile() && stats.size > 0) {
            console.log(`✓ Already exists: ${filename} (${stats.size} bytes)`);

            continue;
          }
        } catch {
          // File doesn't exist.
        }

        // ==========================================
        // FILE MISSING
        // ==========================================

        console.log("=================================");
        console.log("MISSING VIDEO");
        console.log("=================================");

        console.log("Title:", video.title);
        console.log("ID:", video._id.toString());
        console.log("Filename:", filename);
        console.log("Source:", video.sourceUrl);

        // ==========================================
        // DOWNLOAD
        // ==========================================

        const size = await downloadFile(video.sourceUrl, filePath);

        // ==========================================
        // UPDATE DATABASE
        // ==========================================

        const newVideoUrl = `${SERVER_URL}/videos/${encodeURIComponent(filename)}`;

        await Video.findByIdAndUpdate(video._id, {
          videoUrl: newVideoUrl,
          filename,
          size,
        });

        console.log(`✓ Restored: ${video.title}`);
      } catch (error) {
        console.error(`✗ Failed to restore ${video.title}:`, error.message);
      }
    }

    console.log("=================================");
    console.log("VIDEO RESTORE FINISHED");
    console.log("=================================");
  } catch (error) {
    console.error("VIDEO RESTORE ERROR:", error);
  }
}
