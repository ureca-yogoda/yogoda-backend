import { randomBytes } from "node:crypto";

export function createCouponNumber() {
  return randomBytes(6)
    .toString("hex")
    .toUpperCase()
    .match(/.{1,4}/g)!
    .join("-");
}

export function createBarcodeValue() {
  return randomBytes(16).toString("hex").toUpperCase();
}
