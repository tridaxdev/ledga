import ffmpegStatic from "ffmpeg-static"
import ffprobeStatic from "ffprobe-static"

if (!ffmpegStatic) {
    throw new Error("ffmpeg-static binary path not found")
}

if (!ffprobeStatic?.path) {
    throw new Error("ffprobe-static binary path not found")
}

// ffmpeg-static and ffprobe-static export paths to bundled binaries, but in a packaged
// Electron app they point inside the ASAR archive (app.asar/node_modules/...).
// Since binaries can't be executed from within ASAR, electron-builder unpacks them
// to app.asar.unpacked/. We rewrite the paths so child_process finds the real binaries.
export const ffmpegPath = ffmpegStatic.replace("app.asar", "app.asar.unpacked")
export const ffprobePath = ffprobeStatic.path.replace("app.asar", "app.asar.unpacked")
