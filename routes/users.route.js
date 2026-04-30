import express from "express";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { requireApiVersion } from "../middlewares/apiVersion.middleware.js";
import { apiLimiter } from "../middlewares/rateLimiter.middleware.js";
import User from "../models/user.model.js";

const router = express.Router();

router.use(requireApiVersion, authenticate, apiLimiter);

router.get("/me", async (req, res) => {
    try {
        const user = await User.findOne({ id: req.user.userId });
        if (!user) {
            return res.status(404).json({ status: "error", message: "User not found" });
        }
        return res.status(200).json({ status: "success", data: user.toJSON() });
    } catch (err) {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
});

export default router;