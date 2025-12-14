import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";

import vnpayConfig from "../integrations/vnpay.config.js";
import { verifyVnpayReturn } from "../integrations/vnpay.helper.js";
import vnpayService from "../services/vnpayService.js";

const R = responseHelper;

const vnpayController = {
  /**
   * POST /api/vnpay/create
   * body: { order_id, bankCode?, locale? }
   */
  async create(req, res) {
    try {
      const { order_id, bankCode, locale } = req.body || {};

      validate.uuid(order_id, "order_id");
      if (bankCode) validate.trimString(bankCode, "bankCode");
      if (locale) validate.trimString(locale, "locale");

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
      const verify = verifyVnpayReturn(req.query, vnpayConfig.hashSecret);
      if (!verify.ok) {
        return res.json({ RspCode: "97", Message: "Invalid signature" });
      }

      const result = await vnpayService.handleIpn(req.query);
      return res.json(result);
    } catch (err) {
      console.error("[vnpayController.ipn]", err);
      return res.json({ RspCode: "99", Message: "Unknow error" });
    }
  },

  /**
   * GET /api/vnpay/return
   * Browser redirect; verify signature and show result (no DB update).
   * If you later have FE domain, you can redirect there.
   */
  async returnUrl(req, res) {
    try {
      const verify = verifyVnpayReturn(req, vnpayConfig.hashSecret);

      if (!verify.ok) {
        console.error("[VNPAY] Invalid signature", verify.debug);
        return res.status(400).send("Invalid signature");
      }

      const result = vnpayService.buildReturnResult(req.query);

      // ==========================
      // Redirect FE
      // ==========================
      const redirectBase = process.env.VNPAY_RETURN_REDIRECT_URL;
      if (redirectBase) {
        const url = new URL(redirectBase);
        url.searchParams.set("success", result.success ? "1" : "0");
        url.searchParams.set("code", result.code);
        url.searchParams.set("payment_id", result.payment_id);
        return res.redirect(url.toString());
      }

      // ==========================
      // Fallback HTML (DEV)
      // ==========================
      const msg = result.success
        ? "Giao dịch thành công"
        : "Giao dịch không thành công";

      return res.send(`
      <html>
        <head>
          <meta charset="utf-8">
          <title>VNPAY Return</title>
        </head>
        <body style="font-family: Arial; padding: 24px;">
          <h2>${msg}</h2>
          <p><b>ResponseCode:</b> ${result.code}</p>
          <p><b>TxnRef (payment_id):</b> ${result.payment_id}</p>
          <p><b>OrderInfo:</b> ${result.orderInfo}</p>
        </body>
      </html>
    `);
    } catch (err) {
      console.error("[vnpayController.returnUrl]", err);
      return res.status(500).send("Server error");
    }
  },
};

export default vnpayController;
