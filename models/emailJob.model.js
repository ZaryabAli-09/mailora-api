import mongoose from "mongoose";

// Define enums for email job status and provider
const EMAIL_JOB_STATUS = [
  "pending", // Job is created but not yet processed
  "processing", // Job is being processed by worker
  "sent", // Email successfully sent
  "failed", // Email failed to send (will be retried)
  "cancelled", // Job was manually cancelled
  "rejected", // Job was rejected due to validation errors
  "rate_limited", // Job was rate limited (e.g., Gmail daily limit)
];

const EMAIL_PROVIDER = ["gmail", "domain"];
const GMAIL_DAILY_LIMIT = 100;
const DEFAULT_MAX_RETRIES = 3;
const MAX_RETRY_LIMIT = 10;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeRecipients = (recipients) => {
  if (!recipients) return recipients;

  const normalized = Array.isArray(recipients)
    ? recipients
    : [recipients];

  return normalized
    .filter((email) => typeof email === "string" && email.trim().length > 0)
    .map((email) => email.trim().toLowerCase());
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
        values: EMAIL_PROVIDER,
        message: `Provider must be one of: ${EMAIL_PROVIDER.join(", ")}`,
      },
      required: [true, "Provider is required"],
      index: true,
    },
    recipients: {
      type: [String],
      required: [true, "At least one recipient is required"],
      set: normalizeRecipients,
      validate: {
        validator: (value) => {
          if (!Array.isArray(value) || value.length === 0) {
            return false;
          }

          return value.every((email) => emailRegex.test(email));
        },
        message: "Recipients must be an array of valid email addresses",
      },
    },
    variables: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      set: normalizeObjectKeys,
      validate: {
        validator: (value) => typeof value === "object" && !Array.isArray(value),
        message: "Variables must be a plain object",
      },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      validate: {
        validator: (value) => typeof value === "object" && !Array.isArray(value),
        message: "Metadata must be a plain object",
      },
    },
    status: {
      type: String,
      enum: {
        values: EMAIL_JOB_STATUS,
        message: `Status must be one of: ${EMAIL_JOB_STATUS.join(", ")}`,
      },
      default: "pending",
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
      max: GMAIL_DAILY_LIMIT,
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
      default: DEFAULT_MAX_RETRIES,
      min: 0,
      max: MAX_RETRY_LIMIT,
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

emailJobSchema.index({ userId: 1, status: 1 });
emailJobSchema.index({ userId: 1, createdAt: -1 });
emailJobSchema.index({ status: 1, createdAt: 1 });
emailJobSchema.index({ provider: 1, status: 1 });
emailJobSchema.index({ provider: 1, gmailDailyLimit: 1 });
emailJobSchema.index({ status: "pending", createdAt: 1 });
emailJobSchema.index({ status: "failed", canRetry: 1, lastAttemptedAt: 1 });
emailJobSchema.index({ gmailConnectionId: 1 });
emailJobSchema.index({ createdAt: 1 });
emailJobSchema.index({ userId: 1, provider: 1, status: 1, createdAt: -1 });

emailJobSchema.pre("save", function (next) {
  if (this.provider === "gmail") {
    if (!this.gmailConnectionId) {
      return next(new Error("Gmail connection ID is required when provider is gmail"));
    }

    if (typeof this.gmailDailyLimit === "number" && this.gmailDailyLimit > GMAIL_DAILY_LIMIT) {
      this.gmailDailyLimit = GMAIL_DAILY_LIMIT;
    }
  }

  if (this.provider === "domain" && typeof this.domainDailyLimit === "number" && this.domainDailyLimit < 0) {
    this.domainDailyLimit = 0;
  }

  if (this.recipients) {
    this.recipients = normalizeRecipients(this.recipients);
  }

  if (this.variables) {
    this.variables = normalizeObjectKeys(this.variables);
  }

  next();
});

const normalizeUpdatePayload = (update) => {
  const payload = update.$set ? update.$set : update;

  if (payload.recipients) {
    if (!Array.isArray(payload.recipients)) {
      throw new Error("Recipients must be an array");
    }
    payload.recipients = normalizeRecipients(payload.recipients);
  }

  if (payload.variables) {
    payload.variables = normalizeObjectKeys(payload.variables);
  }

  if (payload.provider === "gmail" && !payload.gmailConnectionId) {
    throw new Error("Gmail connection ID is required when provider is gmail");
  }

  if (payload.gmailDailyLimit && payload.gmailDailyLimit > GMAIL_DAILY_LIMIT) {
    payload.gmailDailyLimit = GMAIL_DAILY_LIMIT;
  }

  if (payload.domainDailyLimit && payload.domainDailyLimit < 0) {
    payload.domainDailyLimit = 0;
  }

  return update;
};

emailJobSchema.pre(["findByIdAndUpdate", "updateOne", "updateMany"], function (next) {
  try {
    normalizeUpdatePayload(this.getUpdate());
    next();
  } catch (error) {
    next(error);
  }
});

emailJobSchema.methods.markProcessing = function () {
  this.status = "processing";
  this.processedAt = new Date();
  return this;
};

emailJobSchema.methods.markSent = function () {
  this.status = "sent";
  this.completedAt = new Date();
  this.errorMessage = "";
  return this;
};

emailJobSchema.methods.markFailed = function (errorMessage) {
  this.status = "failed";
  this.retryCount += 1;
  this.lastAttemptedAt = new Date();
  this.errorMessage = errorMessage || "";
  return this;
};

emailJobSchema.methods.markRateLimited = function () {
  this.status = "rate_limited";
  this.lastAttemptedAt = new Date();
  return this;
};

emailJobSchema.methods.canRetryJob = function () {
  return this.canRetry && this.retryCount < this.maxRetries;
};

const EmailJob = mongoose.model("EmailJob", emailJobSchema);

export { EmailJob, EMAIL_JOB_STATUS, EMAIL_PROVIDER, GMAIL_DAILY_LIMIT, DEFAULT_MAX_RETRIES, MAX_RETRY_LIMIT };
