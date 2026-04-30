import axios from 'axios';

const GENDERIZE_URL = "https://api.genderize.io";
const AGIFY_URL = "https://api.agify.io";
const NATIONALIZE_URL = "https://api.nationalize.io";

/**
 * Fetch gender data from Genderize API
 * @param {string} name
 * @returns {{ gender: string, probability: number, count: number }}
 */
const fetchGender = async (name) => {
    try {
        const { data } = await axios.get(GENDERIZE_URL, { params: { name } });

        if (!data.gender || data.count === 0) {
            const err = new Error("Genderize returned an invalid response");
            err.statusCode = 502;
            err.apiName = "Genderize";
            throw err;
        }

        return {
            gender: data.gender,
            gender_probability: data.probability,
            sample_size: data.count,
        };
    } catch (error) {
        if (error.statusCode === 502) throw error;
        const err = new Error("Genderize returned an invalid response");
        err.statusCode = 502;
        err.apiName = "Genderize";
        throw err;
    }
};

/**
 * Fetch age data from Agify API
 * @param {string} name
 * @returns {{ age: number }}
 */
const fetchAge = async (name) => {
    try {
        const { data } = await axios.get(AGIFY_URL, { params: { name } });

        if (data.age === null || data.age === undefined) {
            const err = new Error("Agify returned an invalid response");
            err.statusCode = 502;
            err.apiName = "Agify";
            throw err;
        }

        return { age: data.age };
    } catch (error) {
        if (error.statusCode === 502) throw error;
        const err = new Error("Agify returned an invalid response");
        err.statusCode = 502;
        err.apiName = "Agify";
        throw err;
    }
};

/**
 * Fetch nationality data from Nationalize API
 * @param {string} name
 * @returns {{ country_id: string, country_probability: number }}
 */
const fetchNationality = async (name) => {
    try {
        const { data } = await axios.get(NATIONALIZE_URL, { params: { name } });

        if (!data.country || data.country.length === 0) {
            const err = new Error("Nationalize returned an invalid response");
            err.statusCode = 502;
            err.apiName = "Nationalize";
            throw err;
        }

        // Pick the country with the highest probability
        const topCountry = data.country.reduce((prev, curr) =>
            curr.probability > prev.probability ? curr : prev
        );

        return {
            country_id: topCountry.country_id,
            country_name: topCountry.country_name ?? topCountry.country_id,
            country_probability: topCountry.probability,
        };
    } catch (error) {
        if (error.statusCode === 502) throw error;
        const err = new Error("Nationalize returned an invalid response");
        err.statusCode = 502;
        err.apiName = "Nationalize";
        throw err;
    }
};

/**
 * Classify age into age group
 * @param {number} age
 * @returns {string}
 */
const classifyAgeGroup = (age) => {
    if (age >= 0 && age <= 12) return "child";
    if (age >= 13 && age <= 19) return "teenager";
    if (age >= 20 && age <= 59) return "adult";
    return "senior"; // 60+
};

/**
 * Fetch all three APIs and return enriched profile data
 * @param {string} name
 */
const fetchProfileData = async (name) => {
    const [genderData, ageData, nationalityData] = await Promise.all([
        fetchGender(name),
        fetchAge(name),
        fetchNationality(name),
    ]);

    return {
        ...genderData,
        ...ageData,
        age_group: classifyAgeGroup(ageData.age),
        ...nationalityData,
    };
};

export default fetchProfileData;