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
};
