import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";

import vnpayConfig from "../integrations/vnpay.config.js";
import { verifyVnpayReturn } from "../integrations/vnpay.helper.js";
import { isAllowedVnpayIp } from "../integrations/vnpay.security.js";
import vnpayService from "../services/vnpayService.js";
import env from "../config/env.js";

const R = responseHelper;

const ALLOWED_LOCALES = ["vn", "en"];

const vnpayController = {
  /**
   * POST /api/vnpay/create
   * body: { order_id, bankCode?, locale? }
   */
  async create(req, res) {
    try {
      const { order_id, bankCode, locale } = req.body || {};

      // required
      validate.uuid(order_id, "order_id");

      // optional
      if (bankCode) {
        validate.trimString(bankCode, "bankCode");
      }

      if (locale) {
        validate.trimString(locale, "locale");
        validate.enum(locale, ALLOWED_LOCALES, "locale");
      }

      const result = await vnpayService.createPaymentUrl(
        { order_id, bankCode, locale },
        req
      );

      return R.ok(res, result, "VNPAY payment url created");
    } catch (err) {
      console.error("[vnpayController.create]", err);
      return R.badRequest(res, err.message);
    }
  },

  /**
   * GET /api/vnpay/ipn
   * VNPAY server calls this endpoint
   */
  async ipn(req, res) {
    try {
      // 1. IP whitelist (server-to-server)
      if (!isAllowedVnpayIp(req)) {
        return res.json({
          RspCode: "97",
          Message: "Invalid IP address",
        });
      }

      // 2. Signature verify
      const verify = verifyVnpayReturn(req.query, vnpayConfig.hashSecret);
      if (!verify.ok) {
        return res.json({
          RspCode: "97",
          Message: "Invalid signature",
        });
      }

      // 3. Business logic
      const result = await vnpayService.handleIpn(req.query);
      return res.json(result);
    } catch (err) {
      console.error("[vnpayController.ipn]", err);
      return res.json({
        RspCode: "99",
        Message: "Unknown error",
      });
    }
  },

  /**
   * GET /api/vnpay/return
   * Browser redirect; UI only, no DB update.
   */
  async returnUrl(req, res) {
    try {
      const verify = verifyVnpayReturn(req.query, vnpayConfig.hashSecret);

      if (!verify.ok) {
        const redirectUrl = new URL("/checkout", env.app.frontendUrl);
        redirectUrl.searchParams.set("success", "0");
        redirectUrl.searchParams.set("code", "INVALID_SIGNATURE");
        return res.redirect(redirectUrl.toString());
      }

      await vnpayService.maybeCompleteFromReturn(req.query);

      const result = vnpayService.buildReturnResult(req.query);

      const redirectUrl = new URL("/checkout/result", env.app.frontendUrl);

      redirectUrl.searchParams.set("success", result.success ? "1" : "0");
      redirectUrl.searchParams.set("code", result.code);
      redirectUrl.searchParams.set("payment_id", result.payment_id);

      return res.redirect(redirectUrl.toString());
    } catch (err) {
      console.error("[vnpayController.returnUrl]", err);
      return res.status(500).send("Server error");
    }
  },
};

export default vnpayController;
