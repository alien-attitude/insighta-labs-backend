import express from "express";
import {
    githubLogin,
    githubCliInit,
    githubCallback,
    githubCliExchange,
    refreshTokens,
    logout,
    getMe,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { authLimiter } from "../middlewares/rateLimiter.middleware.js";

const router = express.Router();

// Apply rate limiting to all auth endpoints
router.use(authLimiter);

// Web flow — redirect browser to GitHub
router.get("/github",          githubLogin);

// CLI flow — return GitHub auth URL
router.get("/github/cli",      githubCliInit);

// GitHub OAuth callback (web only — CLI uses /github/exchange)
router.get("/github/callback", githubCallback);

// CLI flow — exchange code + code_verifier for tokens
router.post("/github/exchange", githubCliExchange);

// Token rotation
router.post("/refresh", refreshTokens);

// Logout — invalidate refresh token
router.post("/logout", logout);

// Current user
router.get("/me", authenticate, getMe);

export default router;
