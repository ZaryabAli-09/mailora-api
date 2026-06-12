// mailoraSend.js - Utility to send emails through Mailora API
// This file is designed to be installed as an npm package
// Usage: mailoraSend({ apiKey, templateId, recipients, variables, provider })

import axios from "axios";

/**
 * Sends an email through the Mailora email engine
 *
 * @param {Object} options - Configuration options
 * @param {string} options.apiKey - Your Mailora API key (sk_live_*)
 * @param {string} options.templateId - ID of the email template to use
 * @param {string|string[]} options.recipients - Single email or array of email addresses
 * @param {Object} [options.variables] - Object with key-value pairs for template variables
 * @param {"gmail"|"domain"} [options.provider="gmail"] - Email provider to use
 * @param {Object} [options.metadata] - Additional metadata to store with the job
 * @returns {Promise<Object>} - Promise that resolves with job details
 *
 * @example
 * // Send a single email
 * await mailoraSend({
 *   apiKey: "sk_live_your_api_key",
 *   templateId: "64a1b2c3d4e5f6g7h8i9j0k1",
 *   recipients: "user@example.com",
 *   variables: { name: "John", date: "2026-06-12" }
 * });
 *
 * // Send to multiple recipients
 * await mailoraSend({
 *   apiKey: "sk_live_your_api_key",
 *   templateId: "64a1b2c3d4e5f6g7h8i9j0k1",
 *   recipients: ["user1@example.com", "user2@example.com"],
 *   variables: { name: "John", date: "2026-06-12" }
 * });
 */
export async function mailoraSend(options) {
  // Validate required options
  if (!options?.apiKey) {
    throw new Error("apiKey is required");
  }

  if (!options?.templateId) {
    throw new Error("templateId is required");
  }

  if (!options?.recipients) {
    throw new Error("recipients is required");
  }

  // Validate API key format
  if (!options.apiKey.startsWith("sk_live_")) {
    throw new Error("Invalid API key format. Must start with 'sk_live_' ");
  }

  // Normalize recipients to array
  const recipients = Array.isArray(options.recipients)
    ? options.recipients
    : [options.recipients];

  // Validate recipients
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const email of recipients) {
    if (!emailRegex.test(email.trim())) {
      throw new Error(`Invalid email address: ${email}`);
    }
  }

  // Default provider to gmail
  const provider = options.provider || "gmail";

  // Validate provider
  if (provider !== "gmail" && provider !== "domain") {
    throw new Error("provider must be either 'gmail' or 'domain'");
  }

  // Validate variables
  if (options.variables && typeof options.variables !== "object") {
    throw new Error("variables must be an object");
  }

  // Validate metadata
  if (options.metadata && typeof options.metadata !== "object") {
    throw new Error("metadata must be an object");
  }

  // Build payload
  const payload = {
    apiKey: options.apiKey,
    templateId: options.templateId,
    recipients: recipients,
    variables: options.variables || {},
    provider: provider,
    metadata: options.metadata || {},
  };

  // Get Mailora API endpoint from environment or use default
  const apiUrl =
    options.apiUrl ||
    process.env.MAILORA_API_URL ||
    "http://localhost:8000/api/v1/integrations/send-email";

  try {
    const response = await axios.post(apiUrl, payload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 10000, // 10 second timeout
    });

    return response.data;
  } catch (error) {
    // Handle axios errors
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Mailora API error: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`,
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error(
        "Network error: Could not reach Mailora API. Please check your internet connection and API endpoint.",
      );
    } else {
      // Something else happened
      throw new Error(`Error: ${error.message}`);
    }
  }
}

// Export default for common usage
export default mailoraSend;

// For CommonJS environments (Node.js without ES modules)
if (typeof module !== "undefined" && module.exports) {
  module.exports = mailoraSend;
  module.exports.default = mailoraSend;
}
