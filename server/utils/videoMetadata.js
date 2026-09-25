import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function getVideoDuration(filePath) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);

    const duration = Number.parseFloat(stdout.trim());

    if (!Number.isFinite(duration)) {
      return 0;
    }

    return duration;
  } catch (error) {
    console.error("FFprobe error:", error);
    return 0;
  }
}
