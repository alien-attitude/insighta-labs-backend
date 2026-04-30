import mongoose from "mongoose";
import { MONGODB_URI } from "../config/env.js";

let isConnected = false;

export default async function connectToDatabase() {
  if (isConnected) {
    console.log("Using existing MongoDB connection");
    return;
  }

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined.");
  }

  await mongoose.connect(MONGODB_URI);
  isConnected = true;
  console.log("MongoDB connected successfully");
}