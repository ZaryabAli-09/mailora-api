import { verifyToken } from "../utils/jwt.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { User } from "../models/user.model.js";

// Middleware to protect routes that require authentication.
export async function protectRoute(req, res, next) {
  try {
    const token =
      req.cookies?.authToken || req.headers?.authorization?.split(" ")[1];

    if (!token) {
      throw new ApiError(401, "Authentication token is missing");
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      throw new ApiError(401, "Invalid authentication token");
    }

    const id = decoded._id;

    if (!id) {
      throw new ApiError(401, "Invalid authentication token");
    }

    const user = await User.findById(id).select("-passwordHash -otp");

    if (!user) {
      throw new ApiError(401, "User not found");
    }

    if (user.accountStatus === "suspended") {
      throw new ApiError(403, "Account is suspended");
    }

    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
}
