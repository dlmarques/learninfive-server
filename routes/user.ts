import express from "express";
import { checkUserProfile } from "../controllers/user.controller";

const router = express.Router();

router.get("/check-user-profile", checkUserProfile);

export default router;
