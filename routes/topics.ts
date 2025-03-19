import express from "express";
import { answerQuiz, getTopic } from "../controllers/topics.controller";

const router = express.Router();

router.get("/get-topic", getTopic);
router.post("/answer-quiz", answerQuiz);

export default router;
