import crypto from "crypto";
import { v7 as uuidv7 } from "uuid";
import User from "../models/user.model.js";
import PkceState from "../models/pkceState.model.js";
import { exchangeCodeForToken, getGitHubUser, buildGitHubAuthUrl } from "../services/github.service.js";
import { issueTokenPair, rotateRefreshToken, invalidateRefreshToken } from "../services/token.service.js";
import { SERVER_URL, FRONTEND_URL } from "../config/env.js";

const PKCE_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomState() {
    return crypto.randomBytes(24).toString("hex");
}

function verifySha256Challenge(verifier, challenge) {
    const computed = crypto
        .createHash("sha256")
        .update(verifier)
        .digest("base64url");
    return computed === challenge;
}

async function upsertUser(githubUser) {
    const existing = await User.findOne({ github_id: String(githubUser.id) });

    if (existing) {
        existing.username      = githubUser.login;
        existing.email         = githubUser.email || existing.email;
        existing.avatar_url    = githubUser.avatar_url;
        existing.last_login_at = new Date();
        await existing.save();
        return existing;
    }

    return User.create({
        id:            uuidv7(),
        github_id:     String(githubUser.id),
        username:      githubUser.login,
        email:         githubUser.email || null,
        avatar_url:    githubUser.avatar_url || null,
        role:          "analyst",          // default role
        is_active:     true,
        last_login_at: new Date(),
        created_at:    new Date(),
    });
}

function setAuthCookies(res, { access_token, refresh_token }) {
    const isProd = process.env.NODE_ENV === "production";
    const opts = {
        httpOnly: true,
        sameSite: isProd ? "none" : "lax",
        secure:   isProd,
    };
    res.cookie("access_token",  access_token,  { ...opts, maxAge: 3 * 60 * 1000 });
    res.cookie("refresh_token", refresh_token, { ...opts, maxAge: 5 * 60 * 1000 });
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /auth/github
 * Web flow: redirect browser to GitHub OAuth page
 */
export async function githubLogin(req, res) {
    const state       = randomState();
    const redirectUri = `${SERVER_URL}/auth/github/callback`;

    await PkceState.create({
        state,
        code_challenge: "web",   // web flow doesn't use PKCE
        redirect_uri:   redirectUri,
        source:         "web",
        expires_at:     new Date(Date.now() + PKCE_STATE_TTL_MS),
    });

    const url = buildGitHubAuthUrl({ state, redirectUri });
    return res.redirect(url);
}

/**
 * GET /auth/github/cli
 * CLI flow: validate PKCE params, return GitHub auth URL for CLI to open
 */
export async function githubCliInit(req, res) {
    const { state, code_challenge, redirect_uri } = req.query;

    if (!state || !code_challenge || !redirect_uri) {
        return res.status(400).json({ status: "error", message: "state, code_challenge, and redirect_uri are required" });
    }

    await PkceState.create({
        state,
        code_challenge,
        redirect_uri,
        source:     "cli",
        expires_at: new Date(Date.now() + PKCE_STATE_TTL_MS),
    });

    const url = buildGitHubAuthUrl({
        state,
        redirectUri: redirect_uri,
        codeChallenge: code_challenge,
        source: "cli"
    });
    return res.json({ status: "success", url });
}

/**
 * GET /auth/github/callback
 * Web flow: GitHub redirects here, set HTTP-only cookies, redirect to web portal
 */
export async function githubCallback(req, res) {
    const { code, state } = req.query;

    if (!code || !state) {
        return res.status(400).json({ status: "error", message: "Missing code or state" });
    }

    const pkce = await PkceState.findOne({ state });
    if (!pkce) {
        return res.status(400).json({ status: "error", message: "Invalid or expired state" });
    }

    await PkceState.deleteOne({ state });

    try {
        const githubToken = await exchangeCodeForToken({
            code,
            redirect_uri: pkce.redirect_uri,
            source: "web"
        });
        const githubUser  = await getGitHubUser(githubToken);
        const user        = await upsertUser(githubUser);

        if (!user.is_active) {
            return res.status(403).json({ status: "error", message: "Account is inactive" });
        }

        const tokens = await issueTokenPair(user);

        // Web flow → set HTTP-only cookies and redirect to portal
        if (pkce.source === "web") {
            setAuthCookies(res, tokens);
            return res.redirect(`${FRONTEND_URL}/dashboard`);
        }

        // Should not reach here for web — safety fallback
        return res.json({ status: "success", ...tokens, user: user.toJSON() });
    } catch (err) {
        console.error("githubCallback error:", err);
        return res.status(502).json({ status: "error", message: "GitHub authentication failed" });
    }
}

/**
 * POST /auth/github/exchange
 * CLI flow: CLI sends code + code_verifier, backend validates PKCE and returns tokens as JSON
 */
export async function githubCliExchange(req, res) {
    const { code, code_verifier, state } = req.body;

    if (!code || !code_verifier || !state) {
        return res.status(400).json({ status: "error", message: "code, code_verifier, and state are required" });
    }

    const pkce = await PkceState.findOne({ state, source: "cli" });
    if (!pkce) {
        return res.status(400).json({ status: "error", message: "Invalid or expired state" });
    }

    // Validate PKCE: SHA256(code_verifier) must equal stored code_challenge
    if (!verifySha256Challenge(code_verifier, pkce.code_challenge)) {
        await PkceState.deleteOne({ state });
        return res.status(400).json({ status: "error", message: "PKCE verification failed" });
    }

    await PkceState.deleteOne({ state });

    try {
        const githubToken = await exchangeCodeForToken({
            code,
            redirect_uri:  pkce.redirect_uri,
            code_verifier,
            source: "cli"
        });
        const githubUser  = await getGitHubUser(githubToken);
        const user        = await upsertUser(githubUser);

        if (!user.is_active) {
            return res.status(403).json({ status: "error", message: "Account is inactive" });
        }

        const tokens = await issueTokenPair(user);

        return res.status(200).json({
            status: "success",
            access_token:  tokens.access_token,
            refresh_token: tokens.refresh_token,
            user: {
                id:         user.id,
                username:   user.username,
                email:      user.email,
                avatar_url: user.avatar_url,
                role:       user.role,
            },
        });
    } catch (err) {
        console.error("githubCliExchange error:", err);
        return res.status(502).json({ status: "error", message: "GitHub authentication failed" });
    }
}

/**
 * POST /auth/refresh
 * Rotate refresh token — returns new access + refresh tokens
 */
export async function refreshTokens(req, res) {
    try {
        // Support both JSON body (CLI) and cookie (web)
        const token = req.body?.refresh_token || req.cookies?.refresh_token;

        if (!token) {
            return res.status(400).json({ status: "error", message: "refresh_token is required" });
        }

        const tokens = await rotateRefreshToken(token, User);

        // If web request (cookie present), update cookies
        if (req.cookies?.refresh_token) {
            setAuthCookies(res, tokens);
        }

        return res.status(200).json({
            status:        "success",
            access_token:  tokens.access_token,
            refresh_token: tokens.refresh_token,
        });
    } catch (err) {
        return res.status(err.statusCode || 401).json({ status: "error", message: err.message });
    }
}

/**
 * POST /auth/logout
 * Invalidate refresh token
 */
export async function logout(req, res) {
    const token = req.body?.refresh_token || req.cookies?.refresh_token;

    if (token) {
        await invalidateRefreshToken(token);
    }

    // Clear cookies if web session
    const isProd = process.env.NODE_ENV === "production";
    res.clearCookie("access_token",  { sameSite: isProd ? "none" : "lax", secure: isProd });
    res.clearCookie("refresh_token", { sameSite: isProd ? "none" : "lax", secure: isProd });

    return res.status(200).json({ status: "success", message: "Logged out successfully" });
}

/**
 * GET /auth/me
 * Return current authenticated user
 */
export async function getMe(req, res) {
    const user = await User.findOne({ id: req.user.userId });
    if (!user) {
        return res.status(404).json({ status: "error", message: "User not found" });
    }
    return res.json({ status: "success", data: user.toJSON() });
}
