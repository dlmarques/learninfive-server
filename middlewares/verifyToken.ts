import { NextFunction, Request, RequestHandler, Response } from "express";

import { verifyToken } from "@clerk/backend";

require("dotenv").config();

export const verifyTokenMiddleware: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers["authorization"]?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "Token not found. User must sign in." });
    return;
  }

  try {
    const verifiedToken = await verifyToken(token, {
      jwtKey: process.env.CLERK_JWT_KEY,
      authorizedParties: [
        "http://localhost:3000",
        "https://www.learninfive.dev",
        "https://learninfive.dev",
      ],
    });

    if (verifiedToken) next();
  } catch (error) {
    res.status(401).json({ error: "Token not verified." });
    return;
  }
};
