import { verifyAccessToken } from "../services/token.service.js";

/**
 * authenticate — extract and verify JWT from Authorization header or access_token cookie
 * Attaches req.user = { userId, role, username } on success
 */
export function authenticate(req, res, next) {
    // Support Bearer token (CLI) and HTTP-only cookie (web)
    const authHeader = req.headers["authorization"];
    const token =
        (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null) ||
        req.cookies?.access_token;

    if (!token) {
        return res.status(401).json({ status: "error", message: "Authentication required" });
    }

    try {
        const payload = verifyAccessToken(token);
        req.user = payload;
        next();
    } catch (err) {
        const msg = err.name === "TokenExpiredError" ? "Access token expired" : "Invalid token";
        return res.status(401).json({ status: "error", message: msg });
    }
}

/**
 * authorize — restrict access to specified roles
 * Usage: authorize("admin") or authorize("admin", "analyst")
 */
export function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ status: "error", message: "Authentication required" });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ status: "error", message: "Insufficient permissions" });
        }
        next();
    };
}
