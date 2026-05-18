import crypto from "crypto";
import bcrypt from "bcryptjs";
export function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateApiKey() {
  return "sk_live_" + crypto.randomBytes(32).toString("hex");
}
