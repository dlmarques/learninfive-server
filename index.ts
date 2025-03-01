import express, { Application } from "express";
import dotenv from "dotenv";
import topicRoutes from "./routes/topics";
import { runDB } from "./utils/dbConnect";
import cors from "cors";

dotenv.config();

const app: Application = express();
const port = process.env.PORT || 8000;

app.use(
  cors({
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  })
);

app.use((req, res, next) => {
  const apiKey = req.headers[""];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    res.status(403).json({ error: "Forbidden" });
  }
  next();
});

app.use("/topics", topicRoutes);

runDB().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is Fire at https://localhost:${port}`);
});
