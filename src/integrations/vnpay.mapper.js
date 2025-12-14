import { VNPAY_SUCCESS_STATUS } from "./vnpay.codes.js";

export function mapVnpayToGatewayPayload(vnpQuery = {}) {
  // Store only vnp_* keys, keep full raw for audit
  const payload = {};
  for (const [k, v] of Object.entries(vnpQuery)) {
    if (k.startsWith("vnp_")) payload[k] = v;
  }
  return payload;
}

export function parseVnpPayDate(vnpPayDate) {
  // yyyyMMddHHmmss -> ISO-ish (optional)
  // We'll store payment_date = now() in DB; payload keeps raw.
  return vnpPayDate || null;
}

export function isVnpaySuccess(vnpQuery = {}) {
  const responseCode = String(vnpQuery.vnp_ResponseCode || "");
  const transactionStatus = String(vnpQuery.vnp_TransactionStatus || "");

  return (
    VNPAY_SUCCESS_STATUS.RESPONSE_CODE.has(responseCode) &&
    VNPAY_SUCCESS_STATUS.TRANSACTION_STATUS.has(transactionStatus)
  );
}
