import mongoose from "mongoose";

const profileSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            required: true,
            unique: true,
        },
        name: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        gender: {
            type: String,
            required: true,
        },
        gender_probability: {
            type: Number,
            required: true,
        },
        sample_size: {
            type: Number,
            required: true,
        },
        age: {
            type: Number,
            required: true,
        },
        age_group: {
            type: String,
            required: true,
            enum: ["child", "teenager", "adult", "senior"],
        },
        country_id: {
            type: String,
            required: true,
        },
        country_probability: {
            type: Number,
            required: true,
        },
        created_at: {
            type: Date,
            required: true,
        },
    },
    {
        // Disable the default _id and __v in output — we manage our own id field
        versionKey: false,
    }
);

//Indexes for fast filtering and sorting - avoids full-table scans
profileSchema.index({gender: 1});
profileSchema.index({country_id: 1});
profileSchema.index({age_group: 1});
profileSchema.index({age: 1});
profileSchema.index({gender_probability: 1});
profileSchema.index({country_probability: 1});
profileSchema.index({age_probability: 1});
profileSchema.index({gender: 1, country_id: 1, age_group: 1});

// Transform output to use our custom id field, not MongoDB's _id
profileSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret._id;
        if(ret.country_probability !=null) ret.country_probability = Math.round(ret.country_probability * 1000)/1000;
        return ret;
    },
});

const Profile = mongoose.model("Profile", profileSchema);
export default Profile;