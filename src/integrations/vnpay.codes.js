// src/integrations/vnpay/vnpay.codes.js

export const VNPAY_RESPONSE_CODE = {
  SUCCESS: "00",
  INVALID_SIGNATURE: "97",
  ORDER_NOT_FOUND: "01",
  INVALID_AMOUNT: "04",
  ALREADY_CONFIRMED: "02",
  UNKNOWN_ERROR: "99",
};

export const VNPAY_TRANSACTION_STATUS = {
  SUCCESS: "00",
  PENDING: "01",
  ERROR: "02",
  REVERSED: "04",
  REFUND_PROCESSING: "05",
  REFUND_SENT: "06",
  FRAUD_SUSPECT: "07",
  REFUND_REJECTED: "09",
};

/**
 * Các trạng thái được coi là thanh toán THÀNH CÔNG
 */
export const VNPAY_SUCCESS_STATUS = {
  RESPONSE_CODE: ["00"],
  TRANSACTION_STATUS: ["00"],
};

/**
 * Mapping trạng thái VNPAY → DB payment.status
 */
export const VNPAY_TO_PAYMENT_STATUS = {
  "00": "COMPLETED",
  "01": "PENDING",
  "02": "INACTIVE",
  "04": "INACTIVE",
  "05": "INACTIVE",
  "06": "INACTIVE",
  "07": "INACTIVE",
  "09": "INACTIVE",
};
