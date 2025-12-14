import dashboardService from "../services/dashboardService.js";
import responseHelper from "../helpers/responseHelper.js";

const R = responseHelper;

const dashboardController = {
  async getSummary(req, res) {
    try {
      const data = await dashboardService.getSummary();
      return R.ok(res, data, "Fetched dashboard summary successfully");
    } catch (err) {
      console.error("[dashboardController.getSummary]", err);
      return R.internalError(res, err.message);
    }
  },
};

export default dashboardController;
