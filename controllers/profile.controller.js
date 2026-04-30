import { v7 as uuidv7 } from "uuid";
import Profile from "../models/profile.model.js";
import fetchProfileData from "../services/externalApis.service.js";
import { parseNaturalLanguageQuery } from "../services/nlpParser.service.js";

// Valid values for enum query params
const VALID_GENDERS    = new Set(["male", "female"]);
const VALID_AGE_GROUPS = new Set(["child", "teenager", "adult", "senior"]);
const VALID_SORT_BY    = new Set(["age", "created_at", "gender_probability"]);
const VALID_ORDERS     = new Set(["asc", "desc"]);

/**
 * Build a MongoDB filter + sort + pagination object from query params.
 * Returns { error } if any param is invalid.
 */
function buildQueryOptions(query) {
    const {
        gender,
        age_group,
        country_id,
        min_age,
        max_age,
        min_gender_probability,
        min_country_probability,
        sort_by = "created_at",
        order = "asc",
        page = "1",
        limit = "10",
    } = query;

    // Validate enum params
    if (gender && !VALID_GENDERS.has(gender.toLowerCase())) {
        return { error: { status: 400, message: "Invalid query parameters" } };
    }
    if (age_group && !VALID_AGE_GROUPS.has(age_group.toLowerCase())) {
        return { error: { status: 400, message: "Invalid query parameters" } };
    }
    if (!VALID_SORT_BY.has(sort_by)) {
        return { error: { status: 400, message: "Invalid query parameters" } };
    }
    if (!VALID_ORDERS.has(order.toLowerCase())) {
        return { error: { status: 400, message: "Invalid query parameters" } };
    }

    // Validate pagination
    const parsedPage  = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedPage)  || parsedPage < 1) {
        return { error: { status: 400, message: "Invalid query parameters" } };
    }
    if (isNaN(parsedLimit) || parsedLimit < 1) {
        return { error: { status: 400, message: "Invalid query parameters" } };
    }
    // Cap limit at 50 — do not reject, silently enforce the maximum
    const cappedLimit = Math.min(parsedLimit, 50);

    // Validate numeric filters
    const numericFields = { min_age, max_age, min_gender_probability, min_country_probability };
    for (const [, val] of Object.entries(numericFields)) {
        if (val !== undefined && isNaN(Number(val))) {
            return { error: { status: 422, message: "Invalid query parameters" } };
        }
    }

    // Build filter
    const filter = {};
    if (gender)     filter.gender     = gender.toLowerCase();
    if (age_group)  filter.age_group  = age_group.toLowerCase();
    if (country_id) filter.country_id = { $regex: new RegExp(`^${country_id}$`, "i") };

    if (min_age !== undefined || max_age !== undefined) {
        filter.age = {};
        if (min_age !== undefined) filter.age.$gte = Number(min_age);
        if (max_age !== undefined) filter.age.$lte = Number(max_age);
    }
    if (min_gender_probability !== undefined) {
        filter.gender_probability = { $gte: Number(min_gender_probability) };
    }
    if (min_country_probability !== undefined) {
        filter.country_probability = { $gte: Number(min_country_probability) };
    }

    const sort = { [sort_by]: order.toLowerCase() === "desc" ? -1 : 1 };

    return {
        filter,
        sort,
        page: parsedPage,
        limit: cappedLimit,
        skip: (parsedPage - 1) * cappedLimit,
    };
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/profiles
 */
export async function createProfile(req, res) {
    try {
        const { name } = req.body;

        if (name === undefined || name === null) {
            return res.status(400).json({ status: "error", message: "name is required" });
        }
        if (typeof name !== "string") {
            return res.status(422).json({ status: "error", message: "name must be a string" });
        }

        const trimmedName = name.trim().toLowerCase();
        if (trimmedName === "") {
            return res.status(400).json({ status: "error", message: "name cannot be empty" });
        }

        const existing = await Profile.findOne({ name: trimmedName });
        if (existing) {
            return res.status(200).json({
                status: "success",
                message: "Profile already exists",
                data: existing.toJSON(),
            });
        }

        const profileData = await fetchProfileData(trimmedName);

        const profile = new Profile({
            id: uuidv7(),
            name: trimmedName,
            ...profileData,
            created_at: new Date(),
        });

        await profile.save();

        return res.status(201).json({ status: "success", data: profile.toJSON() });
    } catch (error) {
        if (error.statusCode === 502) {
            return res.status(502).json({ status: "error", message: error.message });
        }
        console.error("createProfile error:", error);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

/**
 * GET /api/profiles
 * Filtering, sorting, pagination
 */
export async function getAllProfiles(req, res) {
    try {
        const result = buildQueryOptions(req.query);
        if (result.error) {
            return res.status(result.error.status).json({ status: "error", message: result.error.message });
        }

        const { filter, sort, page, limit, skip } = result;

        const [total, profiles] = await Promise.all([
            Profile.countDocuments(filter),
            Profile.find(filter).sort(sort).skip(skip).limit(limit),
        ]);

        return res.status(200).json({
            status: "success",
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit),
            data: profiles.map((p) => p.toJSON()),
        });
    } catch (error) {
        console.error("getAllProfiles error:", error);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

/**
 * GET /api/profiles/search?q=...
 * Natural language query — rule-based parsing, no AI
 */
export async function searchProfiles(req, res) {
    try {
        const { q, page = "1", limit = "10" } = req.query;

        if (!q || q.trim() === "") {
            return res.status(400).json({ status: "error", message: "q parameter is required" });
        }

        const { filters, interpreted } = parseNaturalLanguageQuery(q);

        if (!interpreted) {
            return res.status(400).json({ status: "error", message: "Unable to interpret query" });
        }

        const result = buildQueryOptions({ ...filters, page, limit });
        if (result.error) {
            return res.status(result.error.status).json({ status: "error", message: result.error.message });
        }

        const { filter, sort, skip, page: parsedPage, limit: parsedLimit } = result;

        const [total, profiles] = await Promise.all([
            Profile.countDocuments(filter),
            Profile.find(filter).sort(sort).skip(skip).limit(parsedLimit),
        ]);

        return res.status(200).json({
            status: "success",
            page: parsedPage,
            limit: parsedLimit,
            total,
            data: profiles.map((p) => p.toJSON()),
        });
    } catch (error) {
        console.error("searchProfiles error:", error);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

export async function exportProfiles(req, res) {
    try {
        const result = buildQueryOptions({ ...req.query, page: "1", limit: "999999" });
        if (result.error)
            return res.status(result.error.status).json({ status: "error", message: result.error.message });

        const { filter, sort } = result;
        const profiles = await Profile.find(filter).sort(sort);

        const CSV_COLUMNS = [
            "id", "name", "gender", "gender_probability",
            "age", "age_group", "country_id", "country_name",
            "country_probability", "created_at",
        ];

        const header = CSV_COLUMNS.join(",");
        const rows   = profiles.map((p) => {
            const obj = p.toJSON();
            return CSV_COLUMNS.map((col) => {
                const val = obj[col];
                if (val === null || val === undefined) return "";
                const str = String(val instanceof Date ? val.toISOString() : val);
                return str.includes(",") ? `"${str.replace(/"/g, '""')}"` : str;
            }).join(",");
        });

        const csv       = [header, ...rows].join("\n");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const filename  = `profiles_${timestamp}.csv`;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.status(200).send(csv);
    } catch (error) {
        console.error("exportProfiles error:", error);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

/**
 * GET /api/profiles/:id
 */
export async function getProfileById(req, res) {
    try {
        const { id } = req.params;
        const profile = await Profile.findOne({ id });
        if (!profile) {
            return res.status(404).json({ status: "error", message: "Profile not found" });
        }
        return res.status(200).json({ status: "success", data: profile.toJSON() });
    } catch (error) {
        console.error("getProfileById error:", error);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

/**
 * DELETE /api/profiles/:id
 */
export async function deleteProfile(req, res) {
    try {
        const { id } = req.params;
        const result = await Profile.findOneAndDelete({ id });
        if (!result) {
            return res.status(404).json({ status: "error", message: "Profile not found" });
        }
        return res.status(204).send();
    } catch (error) {
        console.error("deleteProfile error:", error);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}
