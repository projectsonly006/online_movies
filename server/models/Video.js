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

    videoUrl: {
      type: String,
      required: true,
    },

    // Original source used to restore the video
    sourceUrl: {
      type: String,
      default: "",
    },

    // Actual filename stored in /videos
    filename: {
      type: String,
      default: "",
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
