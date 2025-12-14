import sharp from "sharp";
import path from "path";
import fs from "fs";

// Base directory where all images will be stored
const baseDir = path.join(process.cwd(), "src", "public", "img");

// Subfolders for each image size
const folders = {
  original: path.join(baseDir, "original"),
  thumb: path.join(baseDir, "thumb"),
  medium: path.join(baseDir, "medium"),
  large: path.join(baseDir, "large"),
};

// Ensure all target folders exist
for (const dir of Object.values(folders)) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export const uploadService = {
  async processImage(file) {
    if (!file) return null;

    // Remove original extension and force output to WebP
    const filename = file.filename.replace(/\.[^.]+$/, "");
    const ext = ".webp";

    // Public URLs returned to frontend
    const paths = {
      original: `/img/original/${filename}${ext}`,
      thumb: `/img/thumb/${filename}-thumb${ext}`,
      medium: `/img/medium/${filename}-medium${ext}`,
      large: `/img/large/${filename}-large${ext}`,
    };

    // Temporary uploaded file path
    const inputPath = path.join(baseDir, file.filename);

    // Initialize Sharp and auto-rotate based on EXIF metadata
    const image = sharp(inputPath).rotate();

    // ---------- ORIGINAL (keep original dimensions) ----------
    await image
      .clone()
      .webp({ quality: 82 })
      .toFile(path.join(folders.original, `${filename}${ext}`));

    // ---------- THUMB (square 150x150) ----------
    await image
      .clone()
      .resize(150, 150, {
        fit: "cover", // center-crop to fill the square
        position: "centre",
      })
      .webp({ quality: 60 })
      .toFile(path.join(folders.thumb, `${filename}-thumb${ext}`));

    // ---------- MEDIUM (max width 500, keep aspect ratio) ----------
    await image
      .clone()
      .resize({
        width: 500,
        fit: "inside", // preserve aspect ratio
        withoutEnlargement: true,
      })
      .webp({ quality: 75 })
      .toFile(path.join(folders.medium, `${filename}-medium${ext}`));

    // ---------- LARGE (max width 1000, keep aspect ratio) ----------
    await image
      .clone()
      .resize({
        width: 1000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toFile(path.join(folders.large, `${filename}-large${ext}`));

    // Remove temporary uploaded file
    fs.unlink(inputPath, () => {});

    return paths;
  },
};
