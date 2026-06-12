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

    // Gmail daily send limit tracking
    // This will be reset daily at midnight UTC
    gmailDailyLimit: {
      count: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
        index: true,
      },
      lastResetAt: {
        type: Date,
        default: Date.now,
        index: true,
      },
    },

    // Future: Domain sending limits (for multi-provider support)
    domainDailyLimit: {
      count: {
        type: Number,
        default: 0,
        min: 0,
        index: true,
      },
      lastResetAt: {
        type: Date,
        default: Date.now,
        index: true,
      },
    },

    // User's email sending plan
    // This will determine sending limits and features
    plan: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
      index: true,
    },

    // Maximum sending limits based on plan
    // These values will be validated against the user's plan
    maxDailyEmails: {
      type: Number,
      default: 100, // Default for free plan
      min: 0,
      index: true,
    },

    // Last time user's daily limits were checked
    lastLimitCheckAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true },
);

// Index for fast lookup by API key
userSchema.index({ apiKey: 1 });

// Index for fast lookup by email
userSchema.index({ email: 1 });

// Index for rate limiting
userSchema.index({
  plan: 1,
  lastLimitCheckAt: 1,
});

// Pre-save validation hook
userSchema.pre("save", function (next) {
  // Validate that maxDailyEmails matches plan limits
  const planLimits = {
    free: 100,
    pro: 1000,
    enterprise: 10000,
  };

  if (this.plan && planLimits[this.plan]) {
    this.maxDailyEmails = planLimits[this.plan];
  }

  // Ensure gmailDailyLimit count is within bounds
  if (this.gmailDailyLimit?.count > 100) {
    this.gmailDailyLimit.count = 100;
  }

  // Ensure domainDailyLimit count is within bounds
  if (this.domainDailyLimit?.count > this.maxDailyEmails) {
    this.domainDailyLimit.count = this.maxDailyEmails;
  }

  // Reset daily limits if it's been more than 24 hours since last reset
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Reset Gmail limit if needed
  if (
    this.gmailDailyLimit?.lastResetAt &&
    this.gmailDailyLimit.lastResetAt < twentyFourHoursAgo
  ) {
    this.gmailDailyLimit.count = 0;
    this.gmailDailyLimit.lastResetAt = now;
  }

  // Reset Domain limit if needed
  if (
    this.domainDailyLimit?.lastResetAt &&
    this.domainDailyLimit.lastResetAt < twentyFourHoursAgo
  ) {
    this.domainDailyLimit.count = 0;
    this.domainDailyLimit.lastResetAt = now;
  }

  // Update last limit check time
  this.lastLimitCheckAt = now;

  next();
});

const User = mongoose.model("User", userSchema);
export { User };
