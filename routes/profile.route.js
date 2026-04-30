import express from "express";
import {
    createProfile,
    getAllProfiles,
    searchProfiles,
    exportProfiles,
    getProfileById,
    deleteProfile,
} from "../controllers/profile.controller.js";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { authorize }    from "../middlewares/authenticate.middleware.js";
import { requireApiVersion } from "../middlewares/apiVersion.middleware.js";
import { apiLimiter }   from "../middlewares/rateLimiter.middleware.js";

const profileRoute = express.Router();

// All profile routes require: valid API version header + authentication + rate limiting
profileRoute.use(requireApiVersion, authenticate, apiLimiter);

// GET  /api/profiles/search  — NLP query (must be before /:id)
profileRoute.get("/search", searchProfiles);

// GET  /api/profiles/export  — CSV export (admin only)
profileRoute.get("/export", authorize("admin"), exportProfiles);

// GET  /api/profiles          — list with filters/sorting/pagination (all roles)
profileRoute.get("/", getAllProfiles);

// POST /api/profiles          — create profile (admin only)
profileRoute.post("/", authorize("admin"), createProfile);

// GET  /api/profiles/:id      — single profile (all roles)
profileRoute.get("/:id", getProfileById);

// DELETE /api/profiles/:id   — delete profile (admin only)
profileRoute.delete("/:id", authorize("admin"), deleteProfile);

export default profileRoute;
