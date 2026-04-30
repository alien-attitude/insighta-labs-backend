import { config } from "dotenv";

const NODE_ENV = process.env.NODE_ENV || "development";

if (NODE_ENV !== "production") {
  config({ path: `.env.${NODE_ENV}.local` });
} else {
  config({path: `.env.production.local`});
}

export const MONGODB_URI         = process.env.MONGODB_URI;
export const PORT                = process.env.PORT || 3000;
export const SERVER_URL          = process.env.SERVER_URL || `http://localhost:${PORT}`;
export const JWT_SECRET          = process.env.JWT_SECRET || "change-me-in-production";
export const GITHUB_CLIENT_ID    = process.env.GITHUB_CLIENT_ID;
export const GITHUB_CLIENT_SECRET= process.env.GITHUB_CLIENT_SECRET;
export const GITHUB_CLI_CLIENT_ID     = process.env.GITHUB_CLI_CLIENT_ID;
export const GITHUB_CLI_CLIENT_SECRET = process.env.GITHUB_CLI_CLIENT_SECRET;
export const FRONTEND_URL        = process.env.FRONTEND_URL || "http://localhost:4000";
export const NODE_ENV_VALUE      = NODE_ENV;


// Sanity check
console.log("Env check:", {
  NODE_ENV,
  PORT: !!PORT,
  MONGODB_URI: !!MONGODB_URI,
  JWT_SECRET:  !!JWT_SECRET,
  GITHUB_CLIENT_ID:  !!GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: !!GITHUB_CLIENT_SECRET,
  GITHUB_CLI_CLIENT_ID:  !!GITHUB_CLI_CLIENT_ID,
  GITHUB_CLI_CLIENT_SECRET: !!GITHUB_CLI_CLIENT_SECRET,
  FRONTEND_URL: !!FRONTEND_URL,
});