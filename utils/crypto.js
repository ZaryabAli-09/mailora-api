import crypto from "crypto";

export function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateApiKey() {
  return "sk_live_" + crypto.randomBytes(32).toString("hex");
}
