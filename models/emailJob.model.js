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

const EMAIL_PROVIDER = [
  "gmail", // Using Gmail API
  "domain", // Using custom domain SMTP
];

const emailJobSchema = new mongoose.Schema(
  {
    // The user who requested this email job
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

    // The email template to use for this job
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

    // Email provider to use for sending (gmail or domain)
    provider: {
      type: String,
      enum: {
        values: EMAIL_PROVIDER,
        message: "Provider must be one of: gmail, domain",
      },
      required: [true, "Provider is required"],
    },

    // Recipients for this email job
    // Can be a single email string or an array of email objects
    recipients: {
      type: [String],
      required: [true, "At least one recipient is required"],
      validate: {
        validator: function (v) {
          // Must have at least one recipient
          if (!v || v.length === 0) return false;

          // Each recipient must be a valid email
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return v.every((email) => emailRegex.test(email.trim()));
        },
        message: "Recipients must be an array of valid email addresses",
      },
    },

    // Email variables to replace in the template
    // Should match the variables defined in the template
    variables: {
      type: Object,
      default: {},
      validate: {
        validator: (v) => typeof v === "object" && !Array.isArray(v),
        message: "Variables must be a plain object",
      },
    },

    // Additional metadata for the email job
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      validate: {
        validator: (v) => typeof v === "object" && !Array.isArray(v),
        message: "Metadata must be a plain object",
      },
    },

    // Status of the email job
    status: {
      type: String,
      enum: {
        values: EMAIL_JOB_STATUS,
        message:
          "Status must be one of: pending, processing, sent, failed, cancelled, rejected, rate_limited",
      },
      default: "pending",
      index: true,
    },

    // Error message if job failed
    errorMessage: {
      type: String,
      default: "",
    },

    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // When the job was processed
    processedAt: {
      type: Date,
      default: null,
      index: true,
    },

    // When the job was completed (sent or failed)
    completedAt: {
      type: Date,
      default: null,
      index: true,
    },

    // For Gmail provider: track daily sending limit
    // This field will be set when the user reaches their daily limit
    gmailDailyLimit: {
      type: Number,
      default: 0,
      min: 0,
      max: 100, // Gmail daily limit is 100 emails
      index: true,
    },

    // For domain provider: track daily sending limit (future implementation)
    domainDailyLimit: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    // Track which Gmail connection was used for this job (if provider is gmail)
    gmailConnectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GmailConnection",
      index: true,
      validate: {
        validator: (v) => !v || mongoose.Types.ObjectId.isValid(v),
        message: "Invalid Gmail Connection ID format",
      },
    },

    // Tracking number of retries
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Maximum number of retries before giving up
    maxRetries: {
      type: Number,
      default: 3,
      min: 0,
      max: 10,
    },

    // When the job was last attempted
    lastAttemptedAt: {
      type: Date,
      default: null,
    },

    // Whether job is eligible for retry
    canRetry: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true, strict: true, strictQuery: true },
);

// Indexes for efficient querying
emailJobSchema.index({ userId: 1, status: 1 });
emailJobSchema.index({ userId: 1, createdAt: -1 });
emailJobSchema.index({ status: 1, createdAt: 1 });
emailJobSchema.index({ provider: 1, status: 1 });
emailJobSchema.index({ provider: 1, gmailDailyLimit: 1 });

// Pre-save validation hook
emailJobSchema.pre("save", function (next) {
  // Validate provider-specific fields
  if (this.provider === "gmail") {
    if (!this.gmailConnectionId) {
      return next(
        new Error("Gmail connection ID is required when provider is gmail"),
      );
    }

    // Ensure gmailDailyLimit is within bounds
    if (this.gmailDailyLimit > 100) {
      this.gmailDailyLimit = 100;
    }
  }

  // Ensure domainDailyLimit is within bounds if provider is domain
  if (this.provider === "domain") {
    // Future implementation: validate domainDailyLimit against user's plan
  }

  // Ensure recipients are valid
  if (this.recipients && this.recipients.length > 0) {
    this.recipients = this.recipients.map((email) =>
      email.trim().toLowerCase(),
    );
  }

  // Ensure variables are properly formatted
  if (this.variables) {
    // Convert all variable keys to lowercase for consistency
    const normalizedVariables = {};
    Object.keys(this.variables).forEach((key) => {
      normalizedVariables[key.toLowerCase()] = this.variables[key];
    });
    this.variables = normalizedVariables;
  }

  // Validate that the email template exists and is active
  // This will be done in the service layer, not here, as it requires async call

  next();
});

// Pre-update validation
emailJobSchema.pre(
  ["findByIdAndUpdate", "updateOne", "updateMany"],
  function (next) {
    const update = this.getUpdate();

    // Validate provider-specific fields
    if (update.provider) {
      if (update.provider === "gmail" && !update.gmailConnectionId) {
        return next(
          new Error("Gmail connection ID is required when provider is gmail"),
        );
      }

      // Ensure gmailDailyLimit is within bounds
      if (update.gmailDailyLimit && update.gmailDailyLimit > 100) {
        update.gmailDailyLimit = 100;
      }
    }

    // Ensure recipients are valid
    if (update.recipients) {
      if (!Array.isArray(update.recipients)) {
        return next(new Error("Recipients must be an array"));
      }

      update.recipients = update.recipients.map((email) =>
        typeof email === "string" ? email.trim().toLowerCase() : email,
      );
    }

    // Ensure variables are properly formatted
    if (update.variables) {
      // Convert all variable keys to lowercase for consistency
      const normalizedVariables = {};
      Object.keys(update.variables).forEach((key) => {
        normalizedVariables[key.toLowerCase()] = update.variables[key];
      });
      update.variables = normalizedVariables;
    }

    next();
  },
);

// Index for finding pending jobs for processing
emailJobSchema.index({ status: "pending", createdAt: 1 });

// Index for finding jobs to retry
emailJobSchema.index({
  status: "failed",
  canRetry: true,
  lastAttemptedAt: 1,
});

// Index for finding jobs by provider and status
emailJobSchema.index({ provider: 1, status: 1 });

// Index for finding jobs by user and status
emailJobSchema.index({ userId: 1, status: 1 });

// Index for finding jobs by gmail connection
emailJobSchema.index({ gmailConnectionId: 1 });

// Index for finding jobs by date range
emailJobSchema.index({ createdAt: 1 });

// Index for rate limiting queries
emailJobSchema.index({
  userId: 1,
  provider: 1,
  status: 1,
  createdAt: -1,
});

const EmailJob = mongoose.model("EmailJob", emailJobSchema);

export { EmailJob, EMAIL_JOB_STATUS, EMAIL_PROVIDER };
