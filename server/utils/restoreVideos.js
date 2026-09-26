import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import Video from "../models/Video.js";

// ==========================================
// PATH
// ==========================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIDEO_FOLDER = path.join(__dirname, "..", "videos");

// ==========================================
// RESTORE VIDEOS
// ==========================================

const restoreVideos = async () => {
  try {
    await fs.promises.mkdir(VIDEO_FOLDER, {
      recursive: true,
    });

    console.log("=================================");
    console.log("CHECKING LOCAL VIDEOS");
    console.log("=================================");

    const videos = await Video.find();

    console.log("Videos in MongoDB:", videos.length);

    for (const video of videos) {
      try {
        if (!video.videoUrl) {
          console.log(`No video URL: ${video.title}`);
          continue;
        }

        const url = new URL(video.videoUrl);

        const filename = decodeURIComponent(path.basename(url.pathname));

        const filePath = path.join(VIDEO_FOLDER, filename);

        const exists = await fs.promises
          .access(filePath)
          .then(() => true)
          .catch(() => false);

        if (exists) {
          console.log(`✅ Exists: ${filename}`);
        } else {
          console.log(`❌ MISSING: ${filename}`);
          console.log(`   Movie: ${video.title}`);
        }
      } catch (error) {
        console.error(`Could not check "${video.title}":`, error.message);
      }
    }

    console.log("=================================");
    console.log("VIDEO CHECK COMPLETE");
    console.log("=================================");
  } catch (error) {
    console.error("RESTORE VIDEOS ERROR:", error);
  }
};

export default restoreVideos;
