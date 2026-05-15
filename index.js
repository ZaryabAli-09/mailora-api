// libraries imports
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";

// db config, error middlewares and response handlers imports
import { errorMiddleware } from "./middlewares/errorMiddleware.js";
import { ApiResponse } from "./utils/apiResponse.js";
import { connectDB } from "./configs/dbConnection.js";

// routes imports

// load environment variables
if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

// initializing express app
const app = express();

// port definition
const PORT = process.env.PORT || 8000;
const PROD_FRONTEND_URL = process.env.PROD_FRONTEND_URL;
const DEV_FRONTEND_URL = process.env.DEV_FRONTEND_URL;
const allowedOrigins = [PROD_FRONTEND_URL, DEV_FRONTEND_URL];

// built-in middlewares
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.use(morgan("combined")); // for logging requests in development
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(cookieParser());

// health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    api: "mailora-api",
    timestamp: new Date().toISOString(),
  });
});

// root endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    message: `Welcome to ${process.env.API_NAME}|| mailora-api`,
    version: "1.0.0",
    enpoints: [
      {
        method: "GET",
        endpoint: "/health",
        description: "Health check endpoint",
      },
    ],
  });
});

// 404 handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({
    status: "error",
    data: null,
    message: "Route not found",
  });
});

// error handling middleware
app.use(errorMiddleware);

async function startServer() {
  try {
    app.listen(PORT, () => {
      console.log(`
    🚀 ${process.env.API_NAME} is running on port ${PORT}`);
    });

    await connectDB();
  } catch (error) {
    console.error("Failed to start server", error);
  }
}

startServer();
