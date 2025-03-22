import { body, validationResult } from "express-validator";
import { Request, Response, NextFunction, RequestHandler } from "express";

export const validateRequest: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  next();
};

export const completeProfileValidation = [
  body("userId")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Name must be between 1 and 50 characters"),
  body("csLevel").isString().withMessage("CS Level must be a string"),
  body("goals").isString().withMessage("Goals must be a string"),
  body("preferences").isString().withMessage("Preferences must be a string"),
  body("topicsToAvoid")
    .isString()
    .withMessage("Topics to avoid must be a string"),
  validateRequest,
];

export const editProfileValidation = [
  body("userId")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Name must be between 1 and 50 characters"),
  body("csLevel").isString().withMessage("CS Level must be a string"),
  body("goals").isString().withMessage("Goals must be a string"),
  body("preferences").isString().withMessage("Preferences must be a string"),
  body("topicsToAvoid")
    .isString()
    .withMessage("Topics to avoid must be a string"),
  validateRequest,
];

export const answerQuizValidation = [
  body("topicId").isUUID().withMessage("Invalid topic ID format"),
  body("answer").isString().withMessage("Answers must be a string"),
  validateRequest,
];
