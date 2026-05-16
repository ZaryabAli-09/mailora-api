import User from "../models/User.js";
import {
  hashPassword,
  verifyPassword,
  generateOtp,
  generateApiKey,
} from "../utils/crypto.js";
import { generateToken, setAuthCookie } from "../utils/jwt.js";
import { sendOtpEmail } from "../configs/nodemailer.js";
import { successResponse, errorResponse } from "../utils/apiResponse.js";

export async function requestOtp(req, res, next) {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return errorResponse(
        res,
        "Email, username, and password are required",
        400,
        null,
        "ValidationError",
      );
    }

    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
    });
    if (existingUser) {
      return errorResponse(
        res,
        "Email or username already in use",
        409,
        null,
        "DuplicateKeyError",
      );
    }

    const otp = generateOtp();
    const passwordHash = hashPassword(password);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        email: email.toLowerCase(),
        username,
        passwordHash,
        otp: { code: otp, expiresAt },
      },
      { upsert: true, new: true },
    );

    const emailSent = await sendOtpEmail(email, otp);
    if (!emailSent) {
      return errorResponse(
        res,
        "Failed to send OTP email",
        500,
        null,
        "EmailError",
      );
    }

    return successResponse(res, { email }, "OTP sent successfully", 200);
  } catch (error) {
    next(error);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return errorResponse(
        res,
        "Email and OTP are required",
        400,
        null,
        "ValidationError",
      );
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.otp) {
      return errorResponse(
        res,
        "OTP expired or not found",
        410,
        null,
        "ExpiredError",
      );
    }

    if (user.otp.expiresAt < new Date()) {
      await User.findByIdAndUpdate(user._id, { otp: null });
      return errorResponse(res, "OTP expired", 410, null, "ExpiredError");
    }

    if (user.otp.code !== otp) {
      return errorResponse(res, "Invalid OTP", 400, null, "ValidationError");
    }

    const apiKey = generateApiKey();
    const token = generateToken(user._id, user.email);

    await User.findByIdAndUpdate(
      user._id,
      { otp: null, apiKey },
      { new: true },
    );

    setAuthCookie(res, token);

    return successResponse(
      res,
      {
        userId: user._id,
        username: user.username,
        email: user.email,
        apiKey,
      },
      "Account verified successfully",
      200,
    );
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(
        res,
        "Email and password are required",
        400,
        null,
        "ValidationError",
      );
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return errorResponse(
        res,
        "Invalid email or password",
        401,
        null,
        "AuthenticationError",
      );
    }

    if (user.account === "suspended") {
      return errorResponse(
        res,
        "Account is suspended",
        403,
        null,
        "AccountSuspendedError",
      );
    }

    const token = generateToken(user._id, user.email);
    setAuthCookie(res, token);

    return successResponse(
      res,
      {
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      "Logged in successfully",
      200,
    );
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    res.clearCookie("authToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return successResponse(res, null, "Logged out successfully", 200);
  } catch (error) {
    next(error);
  }
}

export async function getCurrentUser(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select(
      "-passwordHash -otp",
    );
    if (!user) {
      return errorResponse(res, "User not found", 404, null, "NotFoundError");
    }

    return successResponse(res, user, "User retrieved successfully", 200);
  } catch (error) {
    next(error);
  }
}
