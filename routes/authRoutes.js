import express from "express";
import {
  requestOtp,
  verifyOtp,
  login,
  logout,
  getCurrentUser,
} from "../controllers/authController.js";
import { protectRoute } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/auth/request-otp", requestOtp);
router.post("/auth/verify-otp", verifyOtp);
router.post("/auth/login", login);
router.post("/auth/logout", protectRoute, logout);
router.get("/auth/me", protectRoute, getCurrentUser);

export default router;
