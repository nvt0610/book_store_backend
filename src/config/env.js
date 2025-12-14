// src/config/env.js
import dotenv from "dotenv";
dotenv.config();

function getEnv(key, defaultValue) {
  const value = process.env[key];
  if (value !== undefined) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Missing env variable: ${key}`);
}

export default {
  app: {
    port: parseInt(getEnv("PORT", 3000)),
    nodeEnv: getEnv("NODE_ENV", "development"),
    publicUrl: getEnv("APP_PUBLIC_URL"),
  },

  db: {
    url: getEnv("DATABASE_URL"),
  },

  jwt: {
    secret: getEnv("JWT_SECRET"),
    accessTtl: getEnv("ACCESS_TOKEN_TTL", "15m"),
    refreshTtl: getEnv("REFRESH_TOKEN_TTL", "7d"),
  },

  log: {
    level: getEnv("LOG_LEVEL", "info"),
  },

  // =====================
  // VNPAY
  // =====================
  vnpay: {
    tmnCode: getEnv("VNPAY_TMN_CODE"),
    hashSecret: getEnv("VNPAY_HASH_SECRET"),
    paymentUrl: getEnv(
      "VNPAY_PAYMENT_URL",
      "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"
    ),
    returnUrl: getEnv("VNPAY_RETURN_URL"),
    ipnUrl: getEnv("VNPAY_IPN_URL"),
  },
};
