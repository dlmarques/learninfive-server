// Copyright (c) 2025 Daniel Marques
// Licensed under the GNU AGPL v3. See LICENSE.

import express, { Application } from "express";
import dotenv from "dotenv";
import topicRoutes from "./routes/topics";
import usersRoutes from "./routes/user";
import { runDB } from "./utils/dbConnect";
import cors from "cors";
import { limiter } from "./utils/limiter";

dotenv.config();

const app: Application = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(limiter);

app.use("/topics", topicRoutes);
app.use("/users", usersRoutes);

runDB().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is Fire at https://localhost:${port}`);
});
