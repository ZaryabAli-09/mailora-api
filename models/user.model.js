import mongoose from "mongoose";
import crypto from "crypto";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    accountStatus: {
      type: String,
      enum: ["pending", "activated", "suspended"],
      default: "pending",
    },
    apiKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    otp: {
      code: String,
      expiresAt: Date,
    },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);
export { User };
