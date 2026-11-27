import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

import { AuthService } from './auth.service';
import { RequestWithUser } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & RequestWithUser>();
    const user = await this.authService.authenticateBearerToken(
      request.headers.authorization,
    );

    request.user = user;

    return true;
  }
}
