import mongoose from "mongoose";

// ============================================================================
// Constants and Enums
// ============================================================================

const EMAIL_JOB_STATUS = {
  PENDING: "pending", // Job is created but not yet processed
  PROCESSING: "processing", // Job is being processed by worker
  SENT: "sent", // Email successfully sent
  FAILED: "failed", // Email failed to send (will be retried)
  CANCELLED: "cancelled", // Job was manually cancelled
  REJECTED: "rejected", // Job was rejected due to validation errors
  RATE_LIMITED: "rate_limited", // Job was rate limited (e.g., Gmail daily limit)
};

const EMAIL_JOB_STATUS_VALUES = Object.values(EMAIL_JOB_STATUS);

const EMAIL_PROVIDER = {
  GMAIL: "gmail",
  DOMAIN: "domain",
};

const EMAIL_PROVIDER_VALUES = Object.values(EMAIL_PROVIDER);

const LIMITS = {
  GMAIL_DAILY_LIMIT: 100,
  DEFAULT_MAX_RETRIES: 3,
  MAX_RETRY_LIMIT: 10,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================================
// Helper Functions
// ============================================================================

const normalizeRecipients = (recipients) => {
  if (!recipients) return recipients;

  const normalized = Array.isArray(recipients) ? recipients : [recipients];

  return normalized
    .filter((email) => typeof email === "string" && email.trim().length > 0)
    .map((email) => email.trim().toLowerCase());
};

const validateRecipients = (value) => {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  return value.every((email) => EMAIL_REGEX.test(email));
};

const normalizeObjectKeys = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  return Object.keys(value).reduce((normalized, key) => {
    normalized[key.toLowerCase()] = value[key];
    return normalized;
  }, {});
};

const isPlainObject = (value) =>
  typeof value === "object" && !Array.isArray(value);

const validateGmailConnection = (provider, gmailConnectionId) => {
  if (provider === EMAIL_PROVIDER.GMAIL && !gmailConnectionId) {
    throw new Error("Gmail connection ID is required when provider is gmail");
  }
};

const enforceGmailDailyLimit = (gmailDailyLimit) => {
  if (
    typeof gmailDailyLimit === "number" &&
    gmailDailyLimit > LIMITS.GMAIL_DAILY_LIMIT
  ) {
    return LIMITS.GMAIL_DAILY_LIMIT;
  }
  return gmailDailyLimit;
};

const enforceDomainDailyLimit = (domainDailyLimit) => {
  if (typeof domainDailyLimit === "number" && domainDailyLimit < 0) {
    return 0;
  }
  return domainDailyLimit;
};

// ============================================================================
// Schema Definition
// ============================================================================

const emailJobSchema = new mongoose.Schema(
  {
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
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmailTemplate",
      required: [true, "Template ID is required"],
      index: true,
      validate: {
        validator: (v) => mongoose.Types.ObjectId.isValid(v),
        message: "Invalid Template ID format",
      },
    },
    provider: {
      type: String,
      enum: {
        values: EMAIL_PROVIDER_VALUES,
        message: `Provider must be one of: ${EMAIL_PROVIDER_VALUES.join(", ")}`,
      },
      required: [true, "Provider is required"],
      index: true,
    },
    recipients: {
      type: [String],
      required: [true, "At least one recipient is required"],
      set: normalizeRecipients,
      validate: {
        validator: validateRecipients,
        message: "Recipients must be an array of valid email addresses",
      },
    },
    variables: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      set: normalizeObjectKeys,
      validate: {
        validator: isPlainObject,
        message: "Variables must be a plain object",
      },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      validate: {
        validator: isPlainObject,
        message: "Metadata must be a plain object",
      },
    },
    status: {
      type: String,
      enum: {
        values: EMAIL_JOB_STATUS_VALUES,
        message: `Status must be one of: ${EMAIL_JOB_STATUS_VALUES.join(", ")}`,
      },
      default: EMAIL_JOB_STATUS.PENDING,
      index: true,
    },
    errorMessage: {
      type: String,
      default: "",
    },
    processedAt: {
      type: Date,
      default: null,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
      index: true,
    },
    gmailDailyLimit: {
      type: Number,
      default: 0,
      min: 0,
      max: LIMITS.GMAIL_DAILY_LIMIT,
      index: true,
    },
    domainDailyLimit: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    gmailConnectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GmailConnection",
      index: true,
      validate: {
        validator: (v) => !v || mongoose.Types.ObjectId.isValid(v),
        message: "Invalid Gmail Connection ID format",
      },
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxRetries: {
      type: Number,
      default: LIMITS.DEFAULT_MAX_RETRIES,
      min: 0,
      max: LIMITS.MAX_RETRY_LIMIT,
    },
    lastAttemptedAt: {
      type: Date,
      default: null,
    },
    canRetry: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true, strict: true, strictQuery: true },
);

// ============================================================================
// Indexes
// ============================================================================

emailJobSchema.index({ userId: 1, status: 1 });
emailJobSchema.index({ userId: 1, createdAt: -1 });
emailJobSchema.index({ status: 1, createdAt: 1 });
emailJobSchema.index({ provider: 1, status: 1 });
emailJobSchema.index({ provider: 1, gmailDailyLimit: 1 });
emailJobSchema.index({ status: EMAIL_JOB_STATUS.PENDING, createdAt: 1 });
emailJobSchema.index({
  status: EMAIL_JOB_STATUS.FAILED,
  canRetry: 1,
  lastAttemptedAt: 1,
});
emailJobSchema.index({ gmailConnectionId: 1 });
emailJobSchema.index({ createdAt: 1 });
emailJobSchema.index({ userId: 1, provider: 1, status: 1, createdAt: -1 });

// ============================================================================
// Middleware Hooks
// ============================================================================

// Combined pre-save hook with centralized validation and normalization
emailJobSchema.pre("save", function (next) {
  try {
    // Validate Gmail connection requirement
    validateGmailConnection(this.provider, this.gmailConnectionId);

    // Enforce limits
    this.gmailDailyLimit = enforceGmailDailyLimit(this.gmailDailyLimit);
    this.domainDailyLimit = enforceDomainDailyLimit(this.domainDailyLimit);

    // Normalize data
    if (this.recipients) {
      this.recipients = normalizeRecipients(this.recipients);
    }
    if (this.variables) {
      this.variables = normalizeObjectKeys(this.variables);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Centralized pre-update hook for all update operations
emailJobSchema.pre(
  ["findByIdAndUpdate", "updateOne", "updateMany"],
  function (next) {
    try {
      const update = this.getUpdate();
      const payload = update.$set ? update.$set : update;

      // Validate Gmail connection requirement
      if (payload.provider) {
        validateGmailConnection(payload.provider, payload.gmailConnectionId);
      }

      // Normalize recipients
      if (payload.recipients) {
        if (!Array.isArray(payload.recipients)) {
          throw new Error("Recipients must be an array");
        }
        payload.recipients = normalizeRecipients(payload.recipients);
      }

      // Normalize variables
      if (payload.variables) {
        payload.variables = normalizeObjectKeys(payload.variables);
      }

      // Enforce limits
      if (payload.gmailDailyLimit !== undefined) {
        payload.gmailDailyLimit = enforceGmailDailyLimit(
          payload.gmailDailyLimit,
        );
      }
      if (payload.domainDailyLimit !== undefined) {
        payload.domainDailyLimit = enforceDomainDailyLimit(
          payload.domainDailyLimit,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// Instance Methods
// ============================================================================

emailJobSchema.methods.markProcessing = function () {
  this.status = EMAIL_JOB_STATUS.PROCESSING;
  this.processedAt = new Date();
  return this;
};

emailJobSchema.methods.markSent = function () {
  this.status = EMAIL_JOB_STATUS.SENT;
  this.completedAt = new Date();
  this.errorMessage = "";
  return this;
};

emailJobSchema.methods.markFailed = function (errorMessage = "") {
  this.status = EMAIL_JOB_STATUS.FAILED;
  this.retryCount += 1;
  this.lastAttemptedAt = new Date();
  this.errorMessage = errorMessage;
  return this;
};

emailJobSchema.methods.markRateLimited = function () {
  this.status = EMAIL_JOB_STATUS.RATE_LIMITED;
  this.lastAttemptedAt = new Date();
  return this;
};

emailJobSchema.methods.markCancelled = function () {
  this.status = EMAIL_JOB_STATUS.CANCELLED;
  this.completedAt = new Date();
  return this;
};

emailJobSchema.methods.markRejected = function (errorMessage = "") {
  this.status = EMAIL_JOB_STATUS.REJECTED;
  this.completedAt = new Date();
  this.errorMessage = errorMessage;
  return this;
};

emailJobSchema.methods.canRetryJob = function () {
  return this.canRetry && this.retryCount < this.maxRetries;
};

emailJobSchema.methods.isCompleted = function () {
  return [
    EMAIL_JOB_STATUS.SENT,
    EMAIL_JOB_STATUS.CANCELLED,
    EMAIL_JOB_STATUS.REJECTED,
  ].includes(this.status);
};

emailJobSchema.methods.isFailed = function () {
  return this.status === EMAIL_JOB_STATUS.FAILED;
};

emailJobSchema.methods.isProcessing = function () {
  return this.status === EMAIL_JOB_STATUS.PROCESSING;
};

emailJobSchema.methods.isPending = function () {
  return this.status === EMAIL_JOB_STATUS.PENDING;
};

// ============================================================================
// Static Methods
// ============================================================================

emailJobSchema.statics.findPendingJobs = function (userId = null) {
  const query = { status: EMAIL_JOB_STATUS.PENDING };
  if (userId) {
    query.userId = userId;
  }
  return this.find(query).sort({ createdAt: 1 });
};

emailJobSchema.statics.findRetryableJobs = function (userId = null) {
  const query = {
    status: EMAIL_JOB_STATUS.FAILED,
    canRetry: true,
  };
  if (userId) {
    query.userId = userId;
  }
  return this.find(query)
    .where("retryCount")
    .lt(function () {
      return this.maxRetries;
    });
};

emailJobSchema.statics.findProcessingJobs = function (userId = null) {
  const query = { status: EMAIL_JOB_STATUS.PROCESSING };
  if (userId) {
    query.userId = userId;
  }
  return this.find(query);
};

emailJobSchema.statics.findByProviderAndStatus = function (
  provider,
  status,
  limit = 50,
) {
  return this.find({ provider, status }).sort({ createdAt: 1 }).limit(limit);
};

emailJobSchema.statics.findCompletedJobs = function (userId, daysAgo = 30) {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysAgo);

  return this.find({
    userId,
    status: {
      $in: [
        EMAIL_JOB_STATUS.SENT,
        EMAIL_JOB_STATUS.CANCELLED,
        EMAIL_JOB_STATUS.REJECTED,
      ],
    },
    completedAt: { $gte: sinceDate },
  }).sort({ completedAt: -1 });
};

emailJobSchema.statics.getStatsByUser = function (userId) {
  return this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);
};

emailJobSchema.statics.getStatsByProvider = function (userId) {
  return this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: { provider: "$provider", status: "$status" },
        count: { $sum: 1 },
      },
    },
  ]);
};

// ============================================================================
// Model Export
// ============================================================================

const EmailJob = mongoose.model("EmailJob", emailJobSchema);

export {
  EmailJob,
  EMAIL_JOB_STATUS,
  EMAIL_PROVIDER,
  LIMITS,
  EMAIL_PROVIDER_VALUES,
  EMAIL_JOB_STATUS_VALUES,
};
