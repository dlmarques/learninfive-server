// Copyright (c) 2025 Daniel Marques
// Licensed under the GNU AGPL v3. See LICENSE.

import express, { Application } from "express";
import dotenv from "dotenv";
import topicRoutes from "./routes/topics";
import { runDB } from "./utils/dbConnect";
import cors from "cors";
import { limiter } from "./utils/limiter";

dotenv.config();

const app: Application = express();
const port = process.env.PORT || 8000;

app.use(
  cors({
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  })
);

app.use(limiter);

app.use("/topics", topicRoutes);

runDB().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is Fire at https://localhost:${port}`);
});
