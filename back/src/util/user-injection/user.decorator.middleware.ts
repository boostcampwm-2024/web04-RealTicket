import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction } from 'express';

import { UserDecoratorService } from './user.decorator.service';

@Injectable()
export class UserDecoratorMiddleware implements NestMiddleware {
  constructor(private readonly userDecoratorService: UserDecoratorService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const ctx = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) };
    req['userParam'] = await this.userDecoratorService.getUserParam(ctx);
    next();
  }
}
