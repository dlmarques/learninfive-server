import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "../auth.service";
import type { RequestWithUser } from "../auth.types";

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = await this.authService.verifyAuthorizationHeader(
      request.headers.authorization
    );

    if (!user) {
      throw new UnauthorizedException({
        message: "Token not found. User must sign in.",
        code: "AUTH_TOKEN_MISSING",
      });
    }

    request.user = user;

    return true;
  }
}
