import { Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

import { RequestLoggingService } from '../service/request-logging.service';
import { LoggingOptions } from '../types/logging.types';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(
    private readonly requestLoggingService: RequestLoggingService,
    @Optional() private readonly loggingOptions: LoggingOptions = {},
  ) {}

  static instantiate(
    loggingOptions: LoggingOptions,
  ): new (requestLoggingService: RequestLoggingService) => RequestLoggingMiddleware {
    @Injectable()
    class CustomRequestLoggingMiddleware extends RequestLoggingMiddleware {
      constructor(requestLoggingService: RequestLoggingService) {
        super(requestLoggingService, loggingOptions);
      }
    }
    return CustomRequestLoggingMiddleware;
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const { excludeUrls } = this.loggingOptions;
    if (excludeUrls?.some((url) => req.path === url)) {
      return next();
    }

    const startTime = Date.now();

    try {
      await this.requestLoggingService.logRequest(req, this.loggingOptions);

      let isResponseLogged = false;

      const logResponse = async () => {
        if (isResponseLogged) return;
        isResponseLogged = true;

        const responseTime = Date.now() - startTime;

        if (res.statusCode < 400) {
          await this.requestLoggingService.logResponse(
            req,
            res,
            { statusCode: res.statusCode, source: 'middleware' },
            responseTime,
            this.loggingOptions,
          );
        } else {
          const error = {
            message: `HTTP ${res.statusCode} Error`,
            statusCode: res.statusCode,
            source: 'middleware',
          };

          await this.requestLoggingService.logError(req, res, error, responseTime, this.loggingOptions);
        }
      };

      res.on('finish', logResponse);
      res.on('close', logResponse);

      next();
    } catch (error) {
      const responseTime = Date.now() - startTime;

      await this.requestLoggingService.logError(req, res, error, responseTime, this.loggingOptions);

      next(error);
    }
  }
}
