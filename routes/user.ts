import express from "express";
import {
  completeProfileValidation,
  editProfileValidation,
} from "../middlewares/validators";
import {
  checkUserProfile,
  createUserProfile,
  editProfile,
  getUserData,
} from "../controllers/user.controller";
import { verifyTokenMiddleware } from "../middlewares/verifyToken";

const router = express.Router();

router.get("/check-user-profile", verifyTokenMiddleware, checkUserProfile);
router.get("/get-user", verifyTokenMiddleware, getUserData);
router.patch(
  "/edit-profile",
  verifyTokenMiddleware,
  editProfileValidation,
  editProfile
);
router.post(
  "/complete-profile",
  verifyTokenMiddleware,
  completeProfileValidation,
  createUserProfile
);

export default router;
