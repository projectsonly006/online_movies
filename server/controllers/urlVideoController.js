import fs from "fs";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const videoFolder = path.join(__dirname, "..", "videos");

export const videoFromUrl = async (req, res) => {
  try {
    const { url, title } = req.body;

    if (!url) {
      return res.status(400).json({
        message: "Video URL is required",
      });
    }

    // Make sure videos directory exists
    await fs.promises.mkdir(videoFolder, {
      recursive: true,
    });

    const filename = `video-${Date.now()}.mkv`; // ,mp4

    const filePath = path.join(videoFolder, filename);

    console.log("Downloading:", url);

    const response = await axios({
      method: "GET",
      url,
      responseType: "stream",
      timeout: 120000,
    });

    const writer = fs.createWriteStream(filePath);

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log("Saved:", filePath);

    const videoUrl = `http://localhost:${process.env.PORT || 5000}/videos/${filename}`;

    res.status(201).json({
      message: "Video downloaded successfully",
      title: title || "Untitled Video",
      videoUrl,
    });
  } catch (error) {
    console.error("URL VIDEO ERROR:", error.message);

    res.status(500).json({
      message: "Failed to download video",
      error: error.message,
    });
  }
};
