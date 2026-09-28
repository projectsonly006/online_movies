import axios from "axios";
import Video from "../models/Video.js";

/*
|--------------------------------------------------------------------------
| Resolve WeTransfer URL
|--------------------------------------------------------------------------
|
| This attempts to follow redirects and obtain the final URL.
|
| IMPORTANT:
| A WeTransfer URL may redirect to a temporary/signed URL.
| That URL may expire later.
|
*/

const resolveVideoUrl = async (sourceUrl) => {
  const response = await axios.head(sourceUrl, {
    maxRedirects: 10,
    timeout: 30000,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const finalUrl = response.request?.res?.responseUrl;

  if (!finalUrl) {
    throw new Error("Could not resolve the video URL");
  }

  return finalUrl;
};

/*
|--------------------------------------------------------------------------
| CREATE WATCHABLE
|--------------------------------------------------------------------------
*/

export const createWatchableFromWeTransfer = async (req, res) => {
  try {
    const { title, signedFileUrl, cbc } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({
        message: "Movie title is required",
      });
    }

    if (!signedFileUrl?.trim()) {
      return res.status(400).json({
        message: "WeTransfer URL is required",
      });
    }

    if (!cbc?.trim()) {
      return res.status(400).json({
        message: "CBC rating is required",
      });
    }

    const sourceUrl = signedFileUrl.trim();

    console.log("Resolving video URL:", sourceUrl);

    const videoUrl = await resolveVideoUrl(sourceUrl);

    console.log("Resolved video URL:", videoUrl);

    const video = await Video.create({
      title: title.trim(),
      sourceUrl,
      videoUrl,
      cbc: cbc.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Movie added successfully",
      video,
    });
  } catch (error) {
    console.error("CREATE WATCHABLE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create watchable video",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET ALL VIDEOS
|--------------------------------------------------------------------------
*/

export const getVideos = async (req, res) => {
  try {
    const videos = await Video.find({
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      videos,
    });
  } catch (error) {
    console.error("GET VIDEOS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load videos",
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET SINGLE VIDEO
|--------------------------------------------------------------------------
*/

export const getVideo = async (req, res) => {
  try {
    const { id } = req.params;

    const video = await Video.findById(id).lean();

    if (!video) {
      return res.status(404).json({
        message: "Video not found",
      });
    }

    if (video.expiresAt && new Date(video.expiresAt) <= new Date()) {
      return res.status(410).json({
        message: "Video URL has expired",
      });
    }

    return res.json(video);
  } catch (error) {
    console.error("GET VIDEO ERROR:", error);

    return res.status(500).json({
      message: "Failed to load video",
    });
  }
};

/*
|--------------------------------------------------------------------------
| DELETE VIDEO
|--------------------------------------------------------------------------
*/

export const deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;

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
