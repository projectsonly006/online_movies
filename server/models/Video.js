import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    videoUrl: {
      type: String,
      required: true,
    },

    sourceUrl: {
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

    cbc: {
      type: String,
      default: "",
      trim: true,
    },

    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("Video", videoSchema);
