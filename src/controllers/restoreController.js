// src/controllers/restoreController.js

import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";
import restoreService from "../services/restoreService.js";

const R = responseHelper;

// Whitelist cĂ¡c báº£ng Ä‘Æ°á»£c phĂ©p restore
const ALLOWED_TABLES = [
  "users",
  "categories",
  "authors",
  "publishers",
  "products",
  "addresses",
  "orders",
  "order_items",
  "payments",
  "carts",
];

const restoreController = {
  async restore(req, res) {
    try {
      const { table, id } = req.body;

      validate.required(table, "table");
      validate.required(id, "id");
      validate.uuid(id, "id");

      if (!ALLOWED_TABLES.includes(table)) {
        return R.badRequest(res, `Table '${table}' is not allowed to restore`);
      }

      const restored = await restoreService.restore(table, id);

      return restored
        ? R.ok(res, { restored: true }, "Record restored successfully")
        : R.notFound(res, "Record not found or not soft-deleted");
    } catch (err) {
      console.error("[restoreController.restore]", err);
      return R.internalError(res, err.message);
    }
  },
};

export default restoreController;
