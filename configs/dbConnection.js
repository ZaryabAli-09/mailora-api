import mongoose from "mongoose";

// dbConnection.js - used to connect to the MongoDB database using Mongoose

export async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {});
    console.log(`🟢 MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("🔴 MongoDB connection failed", error);
    process.exit(1); // exit with failure
  }
}
