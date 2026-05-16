import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const COOKIE_EXPIRES = 7 * 24 * 60 * 60 * 1000 // 7 days

export function generateToken(userId, email) {
  return jwt.sign({ userId, email }, SECRET, { expiresIn: '7d' })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET)
  } catch (error) {
    return null
  }
}

export function setAuthCookie(res, token) {
  res.cookie('authToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_EXPIRES,
  })
}

export function clearAuthCookie(res) {
  res.clearCookie('authToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  })
}
