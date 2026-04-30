/**
 * Require X-API-Version: 1 header on all /api/* requests
 */
export function requireApiVersion(req, res, next) {
    const version = req.headers["x-api-version"];
    if (!version || version.trim() !== "1") {
        return res.status(400).json({
            status:  "error",
            message: "API version header required",
        });
    }
    next();
}
