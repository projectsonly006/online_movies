import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log("Cloudinary:", {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? "LOADED" : "MISSING",

  api_key: process.env.CLOUDINARY_API_KEY ? "LOADED" : "MISSING",

  api_secret: process.env.CLOUDINARY_API_SECRET ? "LOADED" : "MISSING",
});

export default cloudinary;
