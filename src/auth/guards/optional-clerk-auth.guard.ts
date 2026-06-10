import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService } from "../auth.service";
import type { RequestWithUser } from "../auth.types";

@Injectable()
export class OptionalClerkAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = await this.authService.verifyAuthorizationHeader(
      request.headers.authorization
    );

    if (user) {
      request.user = user;
    }

    return true;
  }
}
