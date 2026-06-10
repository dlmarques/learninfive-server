import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { verifyToken } from "@clerk/backend";
import type { AuthenticatedUser } from "./auth.types";

const AUTHORIZED_PARTIES = [
  "http://localhost:3000",
  "https://www.learninfive.com",
  "https://learninfive.com",
];

@Injectable()
export class AuthService {
  constructor(private readonly configService: ConfigService) {}

  async verifyAuthorizationHeader(
    authorization: string | string[] | undefined
  ): Promise<AuthenticatedUser | null> {
    const token = extractBearerToken(authorization);

    if (!token) {
      return null;
    }

    try {
      const verifiedToken = await verifyToken(token, {
        jwtKey: this.configService.get<string>("CLERK_JWT_KEY"),
        authorizedParties: AUTHORIZED_PARTIES,
      });

      if (!verifiedToken.sub) {
        throw new Error("Verified token has no subject");
      }

      return {
        userId: verifiedToken.sub,
        token,
      };
    } catch {
      throw new UnauthorizedException({
        message: "Token not verified.",
        code: "AUTH_TOKEN_INVALID",
      });
    }
  }
}

const extractBearerToken = (
  authorization: string | string[] | undefined
): string | null => {
  if (!authorization || Array.isArray(authorization)) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
};
