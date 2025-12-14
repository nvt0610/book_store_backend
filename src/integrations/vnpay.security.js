import { getClientIp } from "./vnpay.helper.js";

export const VNPAY_IP_WHITELIST = [
  "113.160.92.202",
  "113.160.92.203",
];

export function isAllowedVnpayIp(req) {
  const ip = getClientIp(req);
  return VNPAY_IP_WHITELIST.includes(ip);
}
