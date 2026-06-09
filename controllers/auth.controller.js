import { User } from "../models/user.model.js";
import {
  hashPassword,
  verifyPassword,
  generateOtp,
  generateApiKey,
} from "../utils/crypto.js";
import { generateToken, setAuthCookie } from "../utils/jwt.js";
import { sendOtpEmail } from "../configs/nodemailer.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";

export async function signUp(req, res, next) {
  try {
    let { email, username, password } = req.body;

    // Normalize and validate input
    email = email?.toLowerCase().trim();
    username = username?.trim();
    password = password?.trim();

    // Basic validation
    if (!email || !username || !password) {
      throw new ApiError(400, "Email, username, and password are required");
    }

    // Check if email is already registered with an activated account
    const existingUser = await User.findOne({
      email: email,
      accountStatus: { $eq: "activated" },
    });
    if (existingUser) {
      throw new ApiError(409, "Email is already registered");
    }

    const otp = generateOtp();
    const passwordHash = hashPassword(password);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await User({
      email,
      username,
      passwordHash,
      otp: { code: otp, expiresAt },
    }).save();

    const emailSent = await sendOtpEmail(email, otp); // Send OTP email

    if (!emailSent) {
      await User.findOneAndDelete({ email: email }); // Clean up user if email fails to send
      throw new ApiError(500, "Failed to send OTP email");
    }

    return res.json(new ApiResponse({ email }, "OTP sent successfully"));
  } catch (error) {
    next(error);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    let { email, otp } = req.body;

    email = email?.toLowerCase().trim();
    otp = otp?.trim();

    if (!email || !otp) {
      throw new ApiError(400, "Email and OTP are required");
    }

    const user = await User.findOne({ email: email });
    if (!user || !user.otp) {
      throw new ApiError(410, "OTP expired or not found");
    }

    if (user.otp.expiresAt < new Date()) {
      throw new ApiError(410, "OTP expired");
    }

    if (user.otp.code !== otp) {
      throw new ApiError(400, "Invalid OTP");
    }

    const apiKey = generateApiKey();

    const token = generateToken(user._id, user.email);

    await User.findByIdAndUpdate(
      user._id,
      { otp: null, apiKey, accountStatus: "activated" },
      { new: true },
    );

    setAuthCookie(res, token);

    return res.json(
      new ApiResponse(
        {
          userId: user._id,
          username: user.username,
          email: user.email,
          apiKey,
        },
        "Account verified successfully",
        200,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    let { email, password } = req.body;

    email = email?.toLowerCase().trim();

    if (!email || !password) {
      throw new ApiError(400, "Email and password are required");
    }

    const user = await User.findOne({ email: email });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new ApiError(401, "Invalid email or password");
    }

    if (user.accountStatus === "suspended") {
      throw new ApiError(403, "Account is suspended");
    }

    const token = generateToken(user._id, user.email);
    setAuthCookie(res, token);

    return res.status(200).json(
      new ApiResponse(
        {
          userId: user._id,
          username: user.username,
          email: user.email,
          apiKey: user.apiKey,
        },
        "Logged in successfully",
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    res.clearCookie(process.env.AUTH_COOKIE_NAME || "authToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return res.json(new ApiResponse(null, "Logged out successfully", 200));
  } catch (error) {
    next(error);
  }
}

export async function getCurrentUser(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select("-passwordHash -otp");
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return res.json(new ApiResponse(user, "User retrieved successfully"));
  } catch (error) {
    next(error);
  }
}

export async function regenerateApiKey(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const newApiKey = generateApiKey();
    user.apiKey = newApiKey;
    await user.save();

    return res.json(
      new ApiResponse(
        { apiKey: newApiKey },
        "API key regenerated successfully",
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function revokeApiKey(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    user.apiKey = null;
    await user.save();

    return res.json(new ApiResponse(null, "API key revoked successfully"));
  } catch (error) {
    next(error);
  }
}
