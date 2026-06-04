import mongoose from "mongoose";

const gmailConnectionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["gmail"],
      default: "gmail",
    },
    emailAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    googleAccountId: {
      type: String,
      trim: true,
      index: true,
    },
    refreshTokenEncrypted: {
      type: String,
      required: true,
      select: false,
    },
    accessTokenEncrypted: {
      type: String,
      select: false,
    },
    accessTokenExpiresAt: {
      type: Date,
    },
    scopes: [String],
    pictureUrl: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["connected", "revoked", "error"],
      default: "connected",
      index: true,
    },
    lastConnectedAt: {
      type: Date,
      default: Date.now,
    },
    lastRefreshedAt: {
      type: Date,
    },
    revokedAt: {
      type: Date,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

// one gmail connection per user/provider
gmailConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });

const GmailConnection = mongoose.model(
  "GmailConnection",
  gmailConnectionSchema,
);

export { GmailConnection };
