import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema(
    {
        token:      { type: String, required: true, unique: true },
        user_id:    { type: String, required: true },  // references User.id
        expires_at: { type: Date, required: true },
        used:       { type: Boolean, default: false },
    },
    { versionKey: false }
);

// Auto-delete expired tokens via MongoDB TTL index
refreshTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("RefreshToken", refreshTokenSchema);
