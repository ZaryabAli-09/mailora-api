// email.routes.js - Routes for email sending functionality
import { Router } from "express";
import { apiKeyAuth } from "../middlewares/apiKey.middleware.js";
import { sendEmail } from "../controllers/email.controller.js";

const router = Router();

/**
 * @route POST /api/v1/integrations/send-email
 * @description Send an email through the Mailora engine
 * @access Private (requires API key)
 * @body {"apiKey": "sk_live_...", "templateId": "string", "recipients": "string|string[]", "variables": "object", "provider": "gmail|domain", "metadata": "object"}
 * @response 201 {"status": "success", "data": {"jobId": "string", "status": "pending"}, "message": "Email job created successfully"}
 * @response 400 {"status": "error", "data": null, "message": "..."}
 * @response 401 {"status": "error", "data": null, "message": "API key is required"}
 * @response 403 {"status": "error", "data": null, "message": "Account is suspended"}
 * @response 500 {"status": "error", "data": null, "message": "Internal server error"}
 */
router.post("/send-email", apiKeyAuth, sendEmail);

export default router;
