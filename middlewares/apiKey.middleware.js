import { User } from "../models/user.model.js";
import { ApiError } from "../utils/apiError.js";

export async function apiKeyAuth(req, res, next) {
  try {
    const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
    
    if (!apiKey) {
      throw new ApiError(401, "API key is required");
    }

    if (!apiKey.startsWith("sk_live_")) {
      throw new ApiError(401, "Invalid API key format");
    }

    const user = await User.findOne({ apiKey }).select("-passwordHash -otp");
    if (!user) {
      throw new ApiError(401, "Invalid API key");
    }

    if (user.accountStatus === "suspended") {
      throw new ApiError(403, "Account is suspended");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}