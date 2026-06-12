import express from "express";
import {
  getGmailConnectUrl,
  replaceGmailConnection,
  handleGmailCallback,
  listGmailMailboxes,
  getGmailMailbox,
  setDefaultGmailMailbox,
  disconnectGmailMailbox,
} from "../controllers/gmail.controller.js";
import { protectRoute } from "../middlewares/auth.middleware.js";
import emailRoutes from "./email.routes.js";

const router = express.Router();

// Gmail OAuth entry points:
// - /gmail/connect-url: starts the first-time Google authorization flow.
// - /gmail/replace-url: starts the reconnect flow for an existing Gmail mailbox.
// - /gmail/callback: Google redirects here after the user approves access.
router.get("/gmail/connect-url", protectRoute, getGmailConnectUrl);
router.get("/gmail/replace-url", protectRoute, replaceGmailConnection);
router.get("/gmail/callback", protectRoute, handleGmailCallback);

// Gmail mailbox management endpoints:
// - list all saved Gmail mailboxes for the logged-in user.
// - fetch one mailbox record.
// - mark a mailbox as default (disabled in single-mailbox mode).
// - disconnect a mailbox by revoking its stored access token.

router.get("/gmail/mailboxes", protectRoute, listGmailMailboxes);
router.get("/gmail/mailboxes/:mailboxId", protectRoute, getGmailMailbox);
router.patch(
  "/gmail/mailboxes/:mailboxId/default",
  protectRoute,
  setDefaultGmailMailbox,
);
router.delete(
  "/gmail/mailboxes/:mailboxId",
  protectRoute,
  disconnectGmailMailbox,
);

// Email sending routes
router.use("/", emailRoutes);

export default router;
