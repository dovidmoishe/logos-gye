import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

import { AuthUser, RequestWithUser } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<Request & RequestWithUser>();

    if (!request.user) {
      throw new Error('CurrentUser decorator used without AuthGuard');
    }

    return request.user;
  },
);
