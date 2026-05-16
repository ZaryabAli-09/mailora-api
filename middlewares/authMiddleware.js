import { verifyToken } from "../utils/jwt.js";
import { errorResponse } from "../utils/apiResponse.js";

export function protectRoute(req, res, next) {
  try {
    const token = req.cookies?.authToken;

    if (!token) {
      return errorResponse(
        res,
        "No authentication token provided",
        401,
        null,
        "UnauthorizedError",
      );
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return errorResponse(
        res,
        "Invalid or expired token",
        401,
        null,
        "UnauthorizedError",
      );
    }

    req.user = decoded;
    next();
  } catch (error) {
    return errorResponse(
      res,
      "Authentication failed",
      401,
      null,
      "UnauthorizedError",
    );
  }
}
