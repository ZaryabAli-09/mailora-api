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

const router = express.Router();

router.get("/gmail/connect-url", protectRoute, getGmailConnectUrl);
router.get("/gmail/replace-url", protectRoute, replaceGmailConnection);
router.get("/gmail/callback", protectRoute, handleGmailCallback);

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

export default router;
