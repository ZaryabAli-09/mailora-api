import express from "express";
import {
  signUp,
  verifyOtp,
  login,
  logout,
  getCurrentUser,
  regenerateApiKey,
  revokeApiKey,
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middlewares/auth.middleware.js";

const router = express.Router();

// authentication routes

router.post("/signup", signUp); // register a new user and send OTP to email for verification
router.post("/verify-otp", verifyOtp); // verify OTP and activate user account
router.post("/login", login); // login user
router.post("/logout", protectRoute, logout); // logout user and clear authentication cookies
router.get("/me", protectRoute, getCurrentUser); // get current user details (protected route, requires authentication)
router.post("/regenerate-key", protectRoute, regenerateApiKey); // regenerate API key
router.post("/revoke-key", protectRoute, revokeApiKey); // revoke API key

export default router;
