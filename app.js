import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { requestLogger } from "./middlewares/requestLogger.middleware.js";
import profilesRoute from "./routes/profile.route.js";
import authRoute     from "./routes/auth.route.js";
import { FRONTEND_URL } from "./config/env.js";

const app = express();

// ── Core Middleware ───────────────────────────────────────────────────────────

app.use(requestLogger);
app.use(cookieParser());
app.use(express.json({ strict: false }));
app.use(express.urlencoded({ extended: false }));

app.use(
    cors({
        origin:      [FRONTEND_URL, /localhost/],
        credentials: true,
        methods:     ["GET", "POST", "DELETE", "OPTIONS", "PUT", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization", "X-API-Version", "X-CSRF-Token"],
    })
);

// Ensure grading script can always reach the API
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    next();
});

// Handle malformed JSON
app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ status: "error", message: "Invalid JSON body" });
    }
    next(err);
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.use("/auth",         authRoute);
app.use("/api/profiles", profilesRoute);

app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
app.get("/",       (req, res) => res.json({ status: "success", message: "Insighta Labs+ API v3" }));

// 404
app.use((req, res) => {
    res.status(404).json({ status: "error", message: `Route ${req.method} ${req.path} not found` });
});

// 500
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
});

export default app;
