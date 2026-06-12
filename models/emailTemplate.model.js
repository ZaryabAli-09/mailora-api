import mongoose from "mongoose";

const emailTemplateSchema = new mongoose.Schema(
  {
    // The user who created this template
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

    // Template name for easy identification
    name: {
      type: String,
      required: [true, "Template name is required"],
      trim: true,
      index: true,
      unique: [true, "Template name must be unique per user"],
      minlength: [1, "Template name cannot be empty"],
      maxlength: [100, "Template name cannot exceed 100 characters"],
    },

    // Email subject line
    subject: {
      type: String,
      required: [true, "Email subject is required"],
      trim: true,
      minlength: [1, "Subject cannot be empty"],
      maxlength: [200, "Subject cannot exceed 200 characters"],
    },

    // HTML body of the email
    htmlBody: {
      type: String,
      required: [true, "HTML body is required"],
      minlength: [1, "HTML body cannot be empty"],
      validate: {
        validator: (v) => v.trim().length > 0,
        message: "HTML body cannot be empty or whitespace only",
      },
    },

    // Variables that can be used in the template (e.g., {{name}}, {{date}})
    // This is an array of variable names that will be replaced in the template
    variables: {
      type: [String],
      default: [],
      validate: {
        validator: (v) =>
          Array.isArray(v) &&
          v.every(
            (varName) =>
              typeof varName === "string" &&
              varName.trim().length > 0 &&
              /^{{[a-zA-Z0-9_]+}}$/.test(varName.trim()),
          ),
        message:
          "Variables must be an array of valid template variable names in {{name}} format",
      },
    },

    // Whether this template is active and can be used
    isActive: {
      type: Boolean,
      default: true,
    },

    // Metadata for additional information (e.g., category, tags, etc.)
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

// Index for fast lookup by user and name
emailTemplateSchema.index({ userId: 1, name: 1 }, { unique: true });

// Index for fast lookup of active templates
emailTemplateSchema.index({ userId: 1, isActive: 1 });

// Pre-save validation hook
emailTemplateSchema.pre("save", function (next) {
  // Ensure variables are properly formatted
  if (this.variables && this.variables.length > 0) {
    this.variables = this.variables.map((varName) => varName.trim());
  }
  next();
});

// Pre-update validation
emailTemplateSchema.pre(
  ["findByIdAndUpdate", "updateOne", "updateMany"],
  function (next) {
    const update = this.getUpdate();

    if (update.variables) {
      // Normalize variable names
      update.variables = update.variables.map((varName) =>
        typeof varName === "string" ? varName.trim() : varName,
      );
    }

    next();
  },
);

const EmailTemplate = mongoose.model("EmailTemplate", emailTemplateSchema);

export { EmailTemplate };
