/**
 * Rule-based Natural Language Query Parser
 * Converts plain English queries into structured filter objects.
 * No AI or LLMs — pure pattern matching and keyword lookup.
 */

// ── Country lookup ────────────────────────────────────────────────────────────
// Maps lowercase country names (and common aliases) to ISO 2-letter codes
const COUNTRY_NAME_TO_ID = {
    // Africa — all 65 countries in the dataset
    algeria: "DZ",
    angola: "AO",
    benin: "BJ",
    botswana: "BW",
    "burkina faso": "BF",
    burundi: "BI",
    cameroon: "CM",
    "cape verde": "CV",
    "cabo verde": "CV",
    "central african republic": "CF",
    "central africa": "CF",
    chad: "TD",
    comoros: "KM",
    "côte d'ivoire": "CI",
    "cote d'ivoire": "CI",
    "ivory coast": "CI",
    djibouti: "DJ",
    "dr congo": "CD",
    "democratic republic of congo": "CD",
    "democratic republic of the congo": "CD",
    drc: "CD",
    congo: "CG",
    "republic of the congo": "CG",
    egypt: "EG",
    "equatorial guinea": "GQ",
    eritrea: "ER",
    eswatini: "SZ",
    swaziland: "SZ",
    ethiopia: "ET",
    gabon: "GA",
    gambia: "GM",
    ghana: "GH",
    guinea: "GN",
    "guinea-bissau": "GW",
    kenya: "KE",
    lesotho: "LS",
    liberia: "LR",
    libya: "LY",
    madagascar: "MG",
    malawi: "MW",
    mali: "ML",
    mauritania: "MR",
    mauritius: "MU",
    morocco: "MA",
    mozambique: "MZ",
    namibia: "NA",
    niger: "NE",
    nigeria: "NG",
    rwanda: "RW",
    senegal: "SN",
    seychelles: "SC",
    "sierra leone": "SL",
    somalia: "SO",
    "south africa": "ZA",
    "south sudan": "SS",
    sudan: "SD",
    "são tomé and príncipe": "ST",
    "sao tome and principe": "ST",
    tanzania: "TZ",
    togo: "TG",
    tunisia: "TN",
    uganda: "UG",
    "western sahara": "EH",
    zambia: "ZM",
    zimbabwe: "ZW",
    // Non-African countries in dataset
    australia: "AU",
    brazil: "BR",
    canada: "CA",
    china: "CN",
    france: "FR",
    germany: "DE",
    india: "IN",
    japan: "JP",
    "united kingdom": "GB",
    uk: "GB",
    britain: "GB",
    "great britain": "GB",
    england: "GB",
    "united states": "US",
    usa: "US",
    america: "US",
    "us": "US",
};

// ── Keyword maps ──────────────────────────────────────────────────────────────

const MALE_WORDS = new Set([
    "male", "males", "man", "men", "boy", "boys", "guy", "guys",
]);

const FEMALE_WORDS = new Set([
    "female", "females", "woman", "women", "girl", "girls", "lady", "ladies",
]);

const AGE_GROUP_WORDS = {
    child:    new Set(["child", "children", "kid", "kids", "infant", "infants"]),
    teenager: new Set(["teenager", "teenagers", "teen", "teens", "adolescent", "adolescents", "youth"]),
    adult:    new Set(["adult", "adults"]),
    senior:   new Set(["senior", "seniors", "elderly", "elder", "elders", "old"]),
};

/**
 * Parse a plain English query string into a filter object.
 *
 * @param {string} query
 * @returns {{ filters: object, interpreted: boolean }}
 */
export function parseNaturalLanguageQuery(query) {
    if (!query || typeof query !== "string") {
        return { filters: null, interpreted: false };
    }

    const q = query.toLowerCase().trim();
    const tokens = q.split(/\s+/);
    const filters = {};
    let matched = false;

    // ── Gender detection ──────────────────────────────────────────────────────
    const hasMale   = tokens.some((t) => MALE_WORDS.has(t));
    const hasFemale = tokens.some((t) => FEMALE_WORDS.has(t));

    // "male and female" or both → no gender filter (all genders)
    if (hasMale && !hasFemale) {
        filters.gender = "male";
        matched = true;
    } else if (hasFemale && !hasMale) {
        filters.gender = "female";
        matched = true;
    } else if (hasMale && hasFemale) {
        // Both genders requested — no gender filter needed, but still interpreted
        matched = true;
    }

    // ── Age group detection ───────────────────────────────────────────────────
    for (const [group, words] of Object.entries(AGE_GROUP_WORDS)) {
        if (tokens.some((t) => words.has(t))) {
            filters.age_group = group;
            matched = true;
            break;
        }
    }

    // ── "young" keyword → ages 16–24 (parsing only, not a stored age_group) ──
    if (tokens.includes("young") && !filters.age_group) {
        filters.min_age = 16;
        filters.max_age = 24;
        matched = true;
    }

    // ── Age range patterns ────────────────────────────────────────────────────

    // "between X and Y" / "between X to Y"
    const betweenMatch = q.match(/between\s+(\d+)\s+(?:and|to)\s+(\d+)/);
    if (betweenMatch) {
        filters.min_age = parseInt(betweenMatch[1], 10);
        filters.max_age = parseInt(betweenMatch[2], 10);
        matched = true;
    }

    // "above X" / "over X" / "older than X" / "at least X"
    const aboveMatch = q.match(/(?:above|over|older than|at least)\s+(\d+)/);
    if (aboveMatch) {
        filters.min_age = parseInt(aboveMatch[1], 10);
        matched = true;
    }

    // "below X" / "under X" / "younger than X" / "at most X"
    const belowMatch = q.match(/(?:below|under|younger than|at most)\s+(\d+)/);
    if (belowMatch) {
        filters.max_age = parseInt(belowMatch[1], 10);
        matched = true;
    }

    // "aged X" / "age X" / "exactly X" → exact age
    const exactAgeMatch = q.match(/(?:aged?|exactly)\s+(\d+)/);
    if (exactAgeMatch && !betweenMatch && !aboveMatch && !belowMatch) {
        const age = parseInt(exactAgeMatch[1], 10);
        filters.min_age = age;
        filters.max_age = age;
        matched = true;
    }

    // ── Country detection ─────────────────────────────────────────────────────
    // Try longest match first (e.g. "south africa" before "africa")
    const countryNames = Object.keys(COUNTRY_NAME_TO_ID).sort(
        (a, b) => b.length - a.length
    );

    for (const countryName of countryNames) {
        if (q.includes(countryName)) {
            filters.country_id = COUNTRY_NAME_TO_ID[countryName];
            matched = true;
            break;
        }
    }

    // If nothing at all was recognised, query is uninterpretable
    if (!matched) {
        return { filters: null, interpreted: false };
    }

    return { filters, interpreted: true };
}
