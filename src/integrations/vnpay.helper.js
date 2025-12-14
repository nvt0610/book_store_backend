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

/**
 * Verify VNPAY return / IPN signature.
 *
 * IMPORTANT:
 * - VNPAY signs the RFC1738 query string (space = '+')
 * - Express already decodes query params, so we MUST re-stringify
 *   using RFC1738 to match VNPAY's original signing string.
 * - Always remove vnp_SecureHash and vnp_SecureHashType before hashing.
 *
 * @param {Object} query - req.query from Express
 * @param {string} hashSecret - VNPAY hash secret
 * @returns {{ ok: boolean, reason?: string }}
 */
export function verifyVnpayReturn(query, hashSecret) {
  // Clone query to avoid mutating original object
  const params = { ...query };

  const receivedHash = params.vnp_SecureHash;
  if (!receivedHash) {
    console.error("[VNPAY VERIFY] Missing vnp_SecureHash", params);
    return { ok: false, reason: "Missing vnp_SecureHash" };
  }

  // Remove hash fields
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  // Keep only vnp_* params and sort by key ASC
  const sortedParams = Object.keys(params)
    .filter((k) => k.startsWith("vnp_"))
    .sort()
    .reduce((acc, k) => {
      acc[k] = params[k];
      return acc;
    }, {});

  /**
   * CRITICAL:
   * - Use RFC1738 encoding
   * - Space must be converted to '+'
   * - This MUST match VNPAY signing behavior
   */
  const signData = qs.stringify(sortedParams, {
    encode: true,
    format: "RFC1738",
  });

  const calculatedHash = crypto
    .createHmac("sha512", hashSecret)
    .update(signData, "utf-8")
    .digest("hex");

  // Debug mismatch
  if (calculatedHash !== receivedHash) {
    console.error("[VNPAY VERIFY] Signature mismatch", {
      signData,
      calculatedHash,
      receivedHash,
      sortedParams,
    });

    return { ok: false, reason: "Invalid signature" };
  }

  console.log("[VNPAY VERIFY] Signature valid", {
    vnp_TxnRef: sortedParams.vnp_TxnRef,
    vnp_ResponseCode: sortedParams.vnp_ResponseCode,
  });

  return { ok: true };
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
