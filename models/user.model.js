import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        id:            { type: String, required: true, unique: true },
        github_id:     { type: String, required: true, unique: true },
        username:      { type: String, required: true },
        email:         { type: String, default: null },
        avatar_url:    { type: String, default: null },
        role:          { type: String, enum: ["admin", "analyst"], default: "analyst" },
        is_active:     { type: Boolean, default: true },
        last_login_at: { type: Date, default: null },
        created_at:    { type: Date, default: () => new Date() },
    },
    { versionKey: false }
);

userSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret._id;
        return ret;
    },
});

export default mongoose.model("User", userSchema);
