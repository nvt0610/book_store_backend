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

export function isVnpaySuccess(vnpQuery) {
  return (
    VNPAY_SUCCESS_STATUS.RESPONSE_CODE.includes(
      String(vnpQuery.vnp_ResponseCode)
    ) &&
    VNPAY_SUCCESS_STATUS.TRANSACTION_STATUS.includes(
      String(vnpQuery.vnp_TransactionStatus)
    )
  );
}
