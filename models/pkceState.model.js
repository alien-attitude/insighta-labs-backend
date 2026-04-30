import mongoose from "mongoose";

const pkceStateSchema = new mongoose.Schema(
    {
        state:           { type: String, required: true, unique: true },
        code_challenge:  { type: String, required: true },
        redirect_uri:    { type: String, required: true },
        source:          { type: String, enum: ["cli", "web"], default: "web" },
        expires_at:      { type: Date, required: true },
    },
    { versionKey: false }
);

// Auto-delete after expiry
pkceStateSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("PkceState", pkceStateSchema);
