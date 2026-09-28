import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    publicId: {
      type: String,
      required: true,
    },

    // URL served by Render
    videoUrl: {
      type: String,
      required: true,
    },

    // IMPORTANT:
    // Original URL used to download the movie.
    // This is what allows restoration after Render redeploys.
    sourceUrl: {
      type: String,
      default: "",
      trim: true,
    },

    // Actual filename inside /server/videos
    filename: {
      type: String,
      default: "",
      trim: true,
    },

    thumbnailUrl: {
      type: String,
      default: "",
    },

    duration: {
      type: Number,
      default: 0,
    },

    format: {
      type: String,
      default: "",
    },

    size: {
      type: Number,
      default: 0,
    },

    cbc: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("Video", videoSchema);
