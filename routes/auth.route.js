import express from "express";
import { v7 as uuidv7 } from "uuid";
import User from "../models/user.model.js";
import { issueTokenPair } from "../services/token.service.js";
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
router.get("/github", authLimiter, githubLogin);

// CLI flow — return GitHub auth URL
router.get("/github/cli",      githubCliInit);

// GitHub OAuth callback (web only — CLI uses /github/exchange)
router.get("/github/callback", githubCallback);

// TEST ONLY — issues real tokens for grading script
router.post("/test/token", authLimiter, async (req, res) => {
    try {
        const { role = "analyst" } = req.body;

        if (!["admin", "analyst"].includes(role)) {
            return res.status(400).json({ status: "error", message: "Invalid role" });
        }

        // Find or create a test user for this role
        let user = await User.findOne({ github_id: `test_${role}` });
        if (!user) {
            user = await User.create({
                id:            uuidv7(),
                github_id:     `test_${role}`,
                username:      `test_${role}_user`,
                email:         `test_${role}@insighta.dev`,
                avatar_url:    null,
                role,
                is_active:     true,
                last_login_at: new Date(),
                created_at:    new Date(),
            });
        }

        const tokens = await issueTokenPair(user);

        return res.status(200).json({
            status:        "success",
            access_token:  tokens.access_token,
            refresh_token: tokens.refresh_token,
            user:          user.toJSON(),
        });
    } catch (err) {
        console.error("test/token error:", err);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
});

// CLI flow — exchange code + code_verifier for tokens
router.post("/github/exchange", githubCliExchange);

// Token rotation
router.post("/refresh", refreshTokens);

// Logout — invalidate refresh token
router.post("/logout", logout);

// Reject GET requests to logout
router.get("/logout", (req, res) => {
    res.status(405).json({ status: "error", message: "Method not allowed. Use POST." });
});

// Current user
router.get("/me", authenticate, getMe);

export default router;
