import responseHelper from "../helpers/responseHelper.js";
import { uploadService } from "../services/uploadService.js";

const R = responseHelper;

const uploadController = {
  /**
   * Handle single file upload
   */
  async uploadSingle(req, res) {
    try {
      // Process image into multiple sizes
      const processed = await uploadService.processImage(req.file);

      return R.ok(res, processed, "Uploaded image successfully");
    } catch (err) {
      console.error("[uploadController.uploadSingle]", err);
      return R.internalError(res, err.message);
    }
  },

  /**
   * Handle multiple file upload
   */
  async uploadMultiple(req, res) {
    try {
      if (!req.files || req.files.length === 0) {
        return R.badRequest(res, "No files uploaded");
      }

      const urls = [];

      for (const file of req.files) {
        const processed = await uploadService.processImage(file);

        if (processed) {
          urls.push(processed.original); // trả ảnh original
        }
      }

      return R.ok(res, { urls }, "Uploaded multiple images successfully");
    } catch (err) {
      console.error("[uploadMultiple]", err);
      return R.internalError(res, err.message);
    }
  },
};

export default uploadController;
