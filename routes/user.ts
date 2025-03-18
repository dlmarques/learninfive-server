import express from "express";
import {
  checkUserProfile,
  createUserProfile,
  editProfile,
  getUserData,
} from "../controllers/user.controller";

const router = express.Router();

router.get("/check-user-profile", checkUserProfile);
router.get("/get-user", getUserData);
router.patch("/edit-profile", editProfile);
router.post("/complete-profile", createUserProfile);

export default router;
