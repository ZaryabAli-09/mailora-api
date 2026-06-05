import mongoose from "mongoose";

// This schema stores the Gmail OAuth connection for one user.
// It keeps encrypted access/refresh tokens plus the Google profile details
// needed to identify and manage the mailbox in the app.
const gmailConnectionSchema = new mongoose.Schema(
  {
    // The authenticated app user who owns this Gmail mailbox connection.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Provider is fixed to Gmail for this schema.
    provider: {
      type: String,
      enum: ["gmail"],
      default: "gmail",
    },
    // The Gmail address returned by Google after OAuth approval.
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
    // Encrypted refresh token used to get new access tokens later.
    refreshTokenEncrypted: {
      type: String,
      required: true,
      select: false,
    },
    // Encrypted short-lived access token for Gmail API calls.
    accessTokenEncrypted: {
      type: String,
      select: false,
    },
    // When the current access token expires.
    accessTokenExpiresAt: {
      type: Date,
    },
    scopes: [String],
    pictureUrl: {
      type: String,
      trim: true,
    },
    // Current connection state: connected, revoked, or error.
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

// One Gmail connection record per user/provider pair.
gmailConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });

const GmailConnection = mongoose.model(
  "GmailConnection",
  gmailConnectionSchema,
);

export { GmailConnection };
