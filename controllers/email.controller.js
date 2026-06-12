import { EmailJob } from "../models/emailJob.model.js";
import { EmailTemplate } from "../models/emailTemplate.model.js";
import { GmailConnection } from "../models/gmailConnection.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { addMailJob } from "../queues/mailQueue.js";

/**
 * Sends an email by creating an EmailJob and queuing it for processing
 * This endpoint is called by the mailoraSend utility or directly by clients
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {Promise<void>}
 */
export async function sendEmail(req, res, next) {
  try {
    // Extract data from request body
    const { apiKey, templateId, recipients, variables, provider, metadata } =
      req.body;

    // Validate required fields
    if (!templateId) {
      return next(new ApiError(400, "templateId is required"));
    }

    if (!recipients) {
      return next(new ApiError(400, "recipients is required"));
    }

    if (!Array.isArray(recipients)) {
      return next(new ApiError(400, "recipients must be an array"));
    }

    if (recipients.length === 0) {
      return next(new ApiError(400, "recipients array cannot be empty"));
    }

    // Validate provider
    if (!provider) {
      return next(new ApiError(400, "provider is required"));
    }

    if (provider !== "gmail" && provider !== "domain") {
      return next(
        new ApiError(400, "provider must be either 'gmail' or 'domain'"),
      );
    }

    // Validate variables if provided
    if (variables && typeof variables !== "object") {
      return next(new ApiError(400, "variables must be an object"));
    }

    // Validate metadata if provided
    if (metadata && typeof metadata !== "object") {
      return next(new ApiError(400, "metadata must be an object"));
    }

    // Validate that the user's API key matches the one in the request body
    if (req.user.apiKey !== apiKey) {
      return next(
        new ApiError(
          401,
          "API key in request body does not match authenticated user",
        ),
      );
    }

    // Find the email template
    const template = await EmailTemplate.findById(templateId);
    if (!template) {
      return next(new ApiError(404, "Email template not found"));
    }

    // Verify template belongs to the user
    if (template.userId.toString() !== req.user._id.toString()) {
      return next(
        new ApiError(403, "You do not have permission to use this template"),
      );
    }

    // Verify template is active
    if (!template.isActive) {
      return next(new ApiError(403, "This template is not active"));
    }

    // Validate that all variables in the template are provided
    if (template.variables && template.variables.length > 0) {
      const missingVariables = template.variables.filter(
        (varName) => !variables || !(varName.slice(2, -2) in variables),
      );

      if (missingVariables.length > 0) {
        return next(
          new ApiError(
            400,
            `Missing required variables: ${missingVariables.join(", ")}`,
          ),
        );
      }
    }

    // For Gmail provider, validate that the user has a Gmail connection
    if (provider === "gmail") {
      const gmailConnection = await GmailConnection.findOne({
        userId: req.user._id,
        status: "connected",
      });

      if (!gmailConnection) {
        return next(
          new ApiError(
            400,
            "No active Gmail connection found. Please connect your Gmail account first.",
          ),
        );
      }

      // Check if user has reached Gmail daily limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const recentJobs = await EmailJob.countDocuments({
        userId: req.user._id,
        provider: "gmail",
        status: { $in: ["sent", "failed", "rate_limited"] },
        createdAt: { $gte: today },
      });

      // Gmail has a daily limit of 100 emails
      if (recentJobs >= 100) {
        return next(
          new ApiError(
            429,
            "Daily Gmail sending limit of 100 emails reached. Please try again tomorrow.",
          ),
        );
      }
    }

    // Create email job
    const emailJob = new EmailJob({
      userId: req.user._id,
      templateId: templateId,
      recipients: recipients,
      variables: variables || {},
      provider: provider,
      metadata: metadata || {},
      gmailConnectionId: provider === "gmail" ? gmailConnection._id : undefined,
    });

    // Save the job
    await emailJob.save();

    // Add job to queue
    await addMailJob({
      jobId: emailJob._id,
      templateId: templateId,
      recipients: recipients,
      variables: variables || {},
      provider: provider,
      metadata: metadata || {},
      userId: req.user._id,
      gmailConnectionId: provider === "gmail" ? gmailConnection._id : undefined,
    });

    // Return success response
    return res.status(201).json(
      new ApiResponse(
        {
          jobId: emailJob._id,
          status: emailJob.status,
          recipients: recipients.length,
          provider: provider,
        },
        "Email job created successfully",
      ),
    );
  } catch (error) {
    next(error);
  }
}
