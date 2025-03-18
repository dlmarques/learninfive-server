import express from "express";
import {
  checkUserProfile,
  createUserProfile,
} from "../controllers/user.controller";

const router = express.Router();

router.get("/check-user-profile", checkUserProfile);
router.post("/complete-profile", createUserProfile);

export default router;
