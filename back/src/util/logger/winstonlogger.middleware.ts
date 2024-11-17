import { LoggerService } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export const loggerMiddleware = (logger: LoggerService) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { method, url } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      logger.log(`${method} ${url} ${statusCode} - ${duration}ms`, 'HttpRequest');
    });

    next();
  };
};
