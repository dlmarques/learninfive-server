// Copyright (c) 2025 Daniel Marques
// Licensed under the GNU AGPL v3. See LICENSE.

import express, { Application } from "express";
import dotenv from "dotenv";
import topicRoutes from "./routes/topics";
import usersRoutes from "./routes/user";
import { runDB } from "./utils/dbConnect";
import cors from "cors";
import { limiter } from "./utils/limiter";
import helmet from "helmet";

dotenv.config();

const app: Application = express();
const port = process.env.PORT || 8000;

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://learninfive.dev",
      "https://www.learninfive.dev",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(limiter);

if (process.env.NODE_ENV === "production") {
  app.use(
    helmet({
      dnsPrefetchControl: { allow: false },
      xContentTypeOptions: true,
      frameguard: { action: "sameorigin" },
      hsts: {
        maxAge: 60 * 60 * 24 * 365,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: "no-referrer" },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "same-origin" },
    })
  );

  app.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: [
          "'self'",
          "https://learninfive.dev",
          "https://www.learninfive.dev",
          "http://localhost:3000",
        ],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: [
          "'self'",
          "https://fonts.googleapis.com",
          "https://fonts.gstatic.com",
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    })
  );
}

app.use("/topics", topicRoutes);
app.use("/users", usersRoutes);

runDB().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is Fire at https://localhost:${port}`);
});
