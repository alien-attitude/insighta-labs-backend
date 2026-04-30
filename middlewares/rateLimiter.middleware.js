import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const authLimiter = rateLimit({
    windowMs:        60 * 1000,  // 1 minute
    max:             10,
    standardHeaders: true,
    legacyHeaders:   false,
    // Use the built-in IPv6-safe IP key generator
    keyGenerator:    (req) => ipKeyGenerator(req),
    handler: (req, res) => {
        res.status(429).json({ status: "error", message: "Too many requests. Please try again later." });
    },
});

const apiLimiter = rateLimit({
    windowMs:        60 * 1000,  // 1 minute
    max:             60,
    standardHeaders: true,
    legacyHeaders:   false,
    // Key by user ID when authenticated, fall back to IPv6-safe IP
    keyGenerator:    (req) => req.user?.userId || ipKeyGenerator(req),
    handler: (req, res) => {
        res.status(429).json({ status: "error", message: "Too many requests. Please try again later." });
    },
});

export { authLimiter, apiLimiter };