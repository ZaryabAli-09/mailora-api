import mongoose from "mongoose";

// Email validation regex pattern
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// URL validation regex pattern
const urlRegex =
  /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;

// This schema stores the Gmail OAuth connection for one user.
// It keeps encrypted access/refresh tokens plus the Google profile details
// needed to identify and manage the mailbox in the app.
const gmailConnectionSchema = new mongoose.Schema(
  {
    // The authenticated app user who owns this Gmail mailbox connection.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
      validate: {
        validator: (v) => mongoose.Types.ObjectId.isValid(v),
        message: "Invalid User ID format",
      },
    },
    // Provider is fixed to Gmail for this schema.
    provider: {
      type: String,
      enum: {
        values: ["gmail"],
        message: "Provider must be 'gmail'",
      },
      default: "gmail",
      immutable: true,
    },
    // The Gmail address returned by Google after OAuth approval.
    emailAddress: {
      type: String,
      required: [true, "Email address is required"],
      lowercase: true,
      trim: true,
      index: true,
      validate: {
        validator: (v) => emailRegex.test(v),
        message: "Invalid email address format",
      },
      minlength: [5, "Email address must be at least 5 characters"],
      maxlength: [255, "Email address cannot exceed 255 characters"],
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: [255, "Display name cannot exceed 255 characters"],
      validate: {
        validator: function (v) {
          return !v || v.length > 0; // Allow empty or valid length
        },
        message: "Display name must be a non-empty string if provided",
      },
    },
    googleAccountId: {
      type: String,
      required: [true, "Google Account ID is required"],
      trim: true,
      index: true,
      minlength: [1, "Google Account ID cannot be empty"],
      maxlength: [255, "Google Account ID cannot exceed 255 characters"],
    },
    // Encrypted refresh token used to get new access tokens later.
    refreshTokenEncrypted: {
      type: String,
      required: [true, "Refresh token is required"],
      select: false,
      minlength: [10, "Refresh token must be at least 10 characters"],
      validate: {
        validator: (v) => v && v.trim().length > 0,
        message: "Refresh token cannot be empty",
      },
    },
    // Encrypted short-lived access token for Gmail API calls.
    accessTokenEncrypted: {
      type: String,
      select: false,
      minlength: [
        10,
        "Access token must be at least 10 characters if provided",
      ],
      validate: {
        validator: function (v) {
          return !v || v.trim().length > 0; // Allow null or valid token
        },
        message: "Access token cannot be empty if provided",
      },
    },
    // When the current access token expires.
    accessTokenExpiresAt: {
      type: Date,
      validate: {
        validator: function (v) {
          if (!v) return true; // Allow null
          return v > new Date(); // Must be in the future if set
        },
        message: "Access token expiration must be in the future",
      },
    },
    scopes: {
      type: [String],
      default: [],
      validate: {
        validator: (v) =>
          Array.isArray(v) &&
          v.every((s) => typeof s === "string" && s.trim().length > 0),
        message: "Scopes must be an array of non-empty strings",
      },
    },
    pictureUrl: {
      type: String,
      trim: true,
      maxlength: [2048, "Picture URL cannot exceed 2048 characters"],
      validate: {
        validator: function (v) {
          return !v || urlRegex.test(v); // Allow empty or valid URL
        },
        message: "Invalid picture URL format",
      },
    },
    // Current connection state: connected, revoked, or error.
    status: {
      type: String,
      enum: {
        values: ["connected", "revoked", "error"],
        message: "Status must be one of: connected, revoked, error",
      },
      default: "connected",
      index: true,
    },
    lastConnectedAt: {
      type: Date,
      default: Date.now,
      validate: {
        validator: function (v) {
          return v <= new Date(); // Must not be in the future
        },
        message: "Last connected date cannot be in the future",
      },
    },
    lastRefreshedAt: {
      type: Date,
      validate: {
        validator: function (v) {
          return !v || v <= new Date(); // Must not be in the future if set
        },
        message: "Last refreshed date cannot be in the future",
      },
    },
    revokedAt: {
      type: Date,
      validate: {
        validator: function (v) {
          return !v || v <= new Date(); // Must not be in the future if set
        },
        message: "Revoked date cannot be in the future",
      },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      validate: {
        validator: (v) => typeof v === "object" && !Array.isArray(v),
        message: "Metadata must be a plain object",
      },
    },
  },
  { timestamps: true, strict: true, strictQuery: true },
);

// One Gmail connection record per user/provider pair.
gmailConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });

// Additional indexes for query optimization
gmailConnectionSchema.index({ emailAddress: 1 });
gmailConnectionSchema.index({ googleAccountId: 1 });
gmailConnectionSchema.index({ status: 1, userId: 1 });
gmailConnectionSchema.index({ createdAt: -1 });

// Pre-save validation hook
gmailConnectionSchema.pre("save", function (next) {
  // Validate that revoked status has revokedAt timestamp
  if (this.status === "revoked" && !this.revokedAt) {
    return next(
      new Error("revokedAt timestamp is required when status is 'revoked'"),
    );
  }

  // Validate that non-revoked status doesn't have revokedAt
  if (this.status !== "revoked" && this.revokedAt) {
    this.revokedAt = undefined;
  }

  // Ensure refreshTokenEncrypted is always selected in the document
  if (
    !this.refreshTokenEncrypted ||
    this.refreshTokenEncrypted.trim().length === 0
  ) {
    return next(new Error("Refresh token cannot be empty"));
  }

  next();
});

// Pre-update validation
gmailConnectionSchema.pre(
  ["findByIdAndUpdate", "updateOne", "updateMany"],
  function (next) {
    const update = this.getUpdate();

    // Prevent modification of immutable fields
    if (update.provider) {
      return next(new Error("Provider cannot be modified after creation"));
    }

    // Validate status transitions
    if (update.status === "revoked" && !update.revokedAt) {
      return next(
        new Error(
          "revokedAt timestamp is required when updating status to 'revoked'",
        ),
      );
    }

    next();
  },
);

const GmailConnection = mongoose.model(
  "GmailConnection",
  gmailConnectionSchema,
);

export { GmailConnection };
