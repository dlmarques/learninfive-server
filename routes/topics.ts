import express from "express";
import { answerQuiz, getTopic } from "../controllers/topics.controller";
import { answerQuizValidation } from "../middlewares/validators";

const router = express.Router();

router.get("/get-topic", getTopic);
router.post("/answer-quiz", answerQuizValidation, answerQuiz);

export default router;
