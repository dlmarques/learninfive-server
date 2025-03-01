import express from "express";
import { getTopic } from "../controllers/topics.controller";

const router = express.Router();

router.get("/get-topic", getTopic);

export default router;
