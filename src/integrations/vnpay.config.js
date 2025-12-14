import config from "../config/env.js";

const vnpayConfig = {
  tmnCode: config.vnpay.tmnCode,
  hashSecret: config.vnpay.hashSecret,
  paymentUrl: config.vnpay.paymentUrl,
  returnUrl: config.vnpay.returnUrl,
  ipnUrl: config.vnpay.ipnUrl,

  version: "2.1.0",
  command: "pay",
  currCode: "VND",
};

export default vnpayConfig;
