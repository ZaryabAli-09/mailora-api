import mongoose from "mongoose";

const VARIABLE_PATTERN = /^[a-zA-Z0-9_]+$/;
const TEMPLATE_VARIABLE_REGEX = /^{{[a-zA-Z0-9_]+}}$/;

const normalizeTemplateVariable = (rawVariable) => {
  if (typeof rawVariable !== "string") return undefined;

  const trimmed = rawVariable.trim();
  const rawValue = trimmed.replace(/^{{\s*|\s*}}$/g, "");

  if (!VARIABLE_PATTERN.test(rawValue)) return undefined;
  return `{{${rawValue}}}`;
};

const normalizeTemplateVariables = (variables) => {
  if (!Array.isArray(variables)) return variables;

  return Array.from(
    new Set(
      variables
        .map(normalizeTemplateVariable)
        .filter((variable) => typeof variable === "string"),
    ),
  );
};

const normalizeUpdatePayload = (update) => {
  const payload = update.$set ? update.$set : update;

  if (payload.name) {
    payload.name =
      typeof payload.name === "string" ? payload.name.trim() : payload.name;
  }

  if (payload.subject) {
    payload.subject =
      typeof payload.subject === "string"
        ? payload.subject.trim()
        : payload.subject;
  }

  if (payload.htmlBody && typeof payload.htmlBody === "string") {
    payload.htmlBody = payload.htmlBody.trim();
  }

  if (payload.variables) {
    payload.variables = normalizeTemplateVariables(payload.variables);
  }

  return update;
};

const emailTemplateSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: [true, "Template name is required"],
      trim: true,
      index: true,
      unique: [true, "Template name must be unique per user"],
      minlength: [1, "Template name cannot be empty"],
      maxlength: [100, "Template name cannot exceed 100 characters"],
      set: (value) => (typeof value === "string" ? value.trim() : value),
    },
    subject: {
      type: String,
      required: [true, "Email subject is required"],
      trim: true,
      minlength: [1, "Subject cannot be empty"],
      maxlength: [200, "Subject cannot exceed 200 characters"],
      set: (value) => (typeof value === "string" ? value.trim() : value),
    },
    htmlBody: {
      type: String,
      required: [true, "HTML body is required"],
      minlength: [1, "HTML body cannot be empty"],
      validate: {
        validator: (value) =>
          typeof value === "string" && value.trim().length > 0,
        message: "HTML body cannot be empty or whitespace only",
      },
      set: (value) => (typeof value === "string" ? value.trim() : value),
    },
    variables: {
      type: [String],
      default: [],
      set: normalizeTemplateVariables,
      validate: {
        validator: (variables) =>
          Array.isArray(variables) &&
          variables.every(
            (varName) =>
              typeof varName === "string" &&
              TEMPLATE_VARIABLE_REGEX.test(varName),
          ),
        message:
          "Variables must be an array of valid template variable names in {{name}} format",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      validate: {
        validator: (value) =>
          typeof value === "object" && !Array.isArray(value),
        message: "Metadata must be a plain object",
      },
    },
  },
  { timestamps: true, strict: true, strictQuery: true },
);

emailTemplateSchema.index({ userId: 1, name: 1 }, { unique: true });
emailTemplateSchema.index({ userId: 1, isActive: 1 });

emailTemplateSchema.pre("save", function (next) {
  if (this.variables && this.variables.length > 0) {
    this.variables = normalizeTemplateVariables(this.variables);
  }
  next();
});

emailTemplateSchema.pre(
  ["findByIdAndUpdate", "updateOne", "updateMany", "findOneAndUpdate"],
  function (next) {
    try {
      normalizeUpdatePayload(this.getUpdate());
      next();
    } catch (error) {
      next(error);
    }
  },
);

emailTemplateSchema.methods.hasVariable = function (variableName) {
  if (!variableName || typeof variableName !== "string") return false;
  const normalized = normalizeTemplateVariable(variableName);
  return this.variables.includes(normalized);
};

const EmailTemplate = mongoose.model("EmailTemplate", emailTemplateSchema);

export { EmailTemplate };
