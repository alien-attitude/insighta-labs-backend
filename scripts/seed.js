/**
 * Seed script — loads 2026 profiles from seed_profiles.json into MongoDB.
 * Safe to re-run: existing records (matched by name) are skipped, not duplicated.
 *
 * Usage:
 *   node scripts/seed.js
 */

import { config } from "dotenv";
import { v7 as uuidv7 } from "uuid";
import mongoose from "mongoose";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const NODE_ENV = process.env.NODE_ENV || "development";
if (NODE_ENV !== "production") {
    config({ path: `.env.${NODE_ENV}.local` });
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error("MONGODB_URI is not defined.");
    process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const seedFile   = path.join(__dirname, "..", "seed_profiles.json");

const profileSchema = new mongoose.Schema(
    {
        id:                  { type: String, required: true, unique: true },
        name:                { type: String, required: true, unique: true, lowercase: true, trim: true },
        gender:              { type: String, required: true },
        gender_probability:  { type: Number, required: true },
        sample_size:         { type: Number, required: false },
        age:                 { type: Number, required: true },
        age_group:           { type: String, required: true },
        country_id:          { type: String, required: true },
        country_name:        { type: String, required: true },
        country_probability: { type: Number, required: true },
        created_at:          { type: Date,   required: true },
    },
    { versionKey: false }
);

const Profile = mongoose.models.Profile || mongoose.model("Profile", profileSchema);

async function seed() {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    const raw = readFileSync(seedFile, "utf-8");
    const { profiles } = JSON.parse(raw);

    console.log(`Seeding ${profiles.length} profiles...`);

    let inserted = 0;
    let skipped  = 0;

    for (const p of profiles) {
        const name = p.name.trim().toLowerCase();

        const exists = await Profile.findOne({ name });
        if (exists) {
            skipped++;
            continue;
        }

        await Profile.create({
            id:                  uuidv7(),
            name,
            gender:              p.gender,
            gender_probability:  p.gender_probability,
            age:                 p.age,
            age_group:           p.age_group,
            country_id:          p.country_id,
            country_name:        p.country_name,
            country_probability: p.country_probability,
            created_at:          new Date(),
        });

        inserted++;
    }

    console.log(`Done. Inserted: ${inserted} | Skipped (already existed): ${skipped}`);
    await mongoose.disconnect();
    process.exit(0);
}

seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});
