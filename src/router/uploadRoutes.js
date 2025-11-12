import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// Tạo thư mục nếu chưa có
const uploadDir = path.join(process.cwd(), "src", "public", "img");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Cấu hình multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Chỉ chấp nhận ảnh JPEG/PNG!"));
  },
});

// Route upload đơn
router.post("/single", upload.single("file"), (req, res) => {
  const filename = req.file.filename;
  const url = `${req.protocol}://${req.get("host")}/img/${filename}`;
  return res.status(200).json({
    success: true,
    message: "Uploaded successfully",
    data: { url },
  });
});

// Route upload nhiều file
router.post("/multiple", upload.array("files", 5), (req, res) => {
  const urls = req.files.map(
    (f) => `${req.protocol}://${req.get("host")}/img/${f.filename}`
  );
  return res.status(200).json({
    success: true,
    message: "Uploaded multiple files successfully",
    data: { urls },
  });
});

export default router;
