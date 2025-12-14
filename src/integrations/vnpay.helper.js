import crypto from "crypto";
import qs from "qs";
import { URL } from "url";

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatVnpayDate(date = new Date()) {
  // VNPAY requires GMT+7 time string yyyyMMddHHmmss
  // We format using local time (your server is Asia/Ho_Chi_Minh in docs).
  const yyyy = date.getFullYear();
  const MM = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const HH = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
}

export function buildSignedQuery(params = {}, hashSecret) {
  // Only keep vnp_* keys (per docs)
  const input = {};
  for (const [k, v] of Object.entries(params)) {
    if (!k.startsWith("vnp_")) continue;
    if (v === undefined || v === null || v === "") continue;
    input[k] = String(v);
  }

  // Sort key ASC
  const keys = Object.keys(input).sort();

  // Create hashData: key=urlencode(key)=urlencode(value) joined by &
  // Create query: same keys joined by &
  let hashData = "";
  let query = "";

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = input[k];

    const ek = encodeURIComponent(k);
    const ev = encodeURIComponent(v);

    const part = `${ek}=${ev}`;
    if (i === 0) {
      hashData += part;
      query += part;
    } else {
      hashData += `&${part}`;
      query += `&${part}`;
    }
  }

  const secureHash = crypto
    .createHmac("sha512", hashSecret)
    .update(hashData)
    .digest("hex");

  return { query, secureHash, signedParams: input };
}

export function buildPaymentUrl(paymentUrlBase, params, hashSecret) {
  const sortedParams = Object.keys(params)
    .filter(
      (k) => k.startsWith("vnp_") && params[k] !== undefined && params[k] !== ""
    )
    .sort()
    .reduce((acc, k) => {
      acc[k] = params[k];
      return acc;
    }, {});

  const signData = qs.stringify(sortedParams, {
    encode: true,
    format: "RFC1738",
  });

  const secureHash = crypto
    .createHmac("sha512", hashSecret)
    .update(signData)
    .digest("hex");

  return `${paymentUrlBase}?${signData}&vnp_SecureHash=${secureHash}`;
}

export function verifyVnpayReturn(req, hashSecret) {
  const params = { ...req.query };

  const receivedHash = params.vnp_SecureHash;
  if (!receivedHash) {
    return { ok: false, reason: "Missing vnp_SecureHash" };
  }

  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  const sortedParams = Object.keys(params)
    .filter((k) => k.startsWith("vnp_"))
    .sort()
    .reduce((acc, k) => {
      acc[k] = params[k];
      return acc;
    }, {});

  const signData = qs.stringify(sortedParams, {
    encode: true,
    format: "RFC1738",
  });

  const calculatedHash = crypto
    .createHmac("sha512", hashSecret)
    .update(signData)
    .digest("hex");

  return calculatedHash === receivedHash
    ? { ok: true }
    : { ok: false, reason: "Invalid signature" };
}

export function getClientIp(req) {
  // Best-effort; VNPAY expects vnp_IpAddr
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress || req.ip || "127.0.0.1";
}

export function toVnpAmount(amountDecimal) {
  // VNPAY amount = VND * 100
  // Use integer cents to avoid float issues
  const n = Number(amountDecimal);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
