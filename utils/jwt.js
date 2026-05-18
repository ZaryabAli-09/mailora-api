import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
const COOKIE_EXPIRES = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateToken(userId, email) {
  return jwt.sign({ _id: userId, email }, SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (error) {
    return null;
  }
}

export function setAuthCookie(res, token) {
  res.cookie(process.env.AUTH_COOKIE_NAME || "authToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: AUTH_COOKIE_EXPIRES,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(process.env.AUTH_COOKIE_NAME || "authToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
  });
}
