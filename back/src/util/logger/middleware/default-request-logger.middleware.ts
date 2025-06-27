import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

import { winstonLogger } from '../winston.logger';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const { method, url } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      const hasDetailedLogging = (req as any).hasDetailedLogging;

      if (!hasDetailedLogging) {
        const { statusCode } = res;
        const duration = Date.now() - startTime;
        winstonLogger.log(`${method} ${url} ${statusCode} - ${duration}ms`, 'HttpRequest');
      }
    });

    next();
  }
}
