import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Optional } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

import { RequestLoggingService } from '../service/request-logging.service';
import { LoggingOptions } from '../types/logging.types';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly requestLoggingService: RequestLoggingService,
    @Optional() protected loggingOptions: LoggingOptions = {},
  ) {}

  static instantiate(
    loggingOptions: LoggingOptions,
  ): new (requestLoggingService: RequestLoggingService) => RequestLoggingInterceptor {
    @Injectable()
    class CustomRequestLoggingInterceptor extends RequestLoggingInterceptor {
      constructor(requestLoggingService: RequestLoggingService) {
        super(requestLoggingService, loggingOptions);
      }
    }
    return CustomRequestLoggingInterceptor;
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    await this.requestLoggingService.logRequest(request, this.loggingOptions);

    return next.handle().pipe(
      tap(async (responseBody) => {
        const responseTime = Date.now() - startTime;
        await this.requestLoggingService.logResponse(
          request,
          response,
          responseBody,
          responseTime,
          this.loggingOptions,
        );
      }),
      catchError(async (error) => {
        const responseTime = Date.now() - startTime;

        if (error.getStatus && typeof error.getStatus === 'function') {
          response.statusCode = error.getStatus();
        }

        await this.requestLoggingService.logError(
          request,
          response,
          error,
          responseTime,
          this.loggingOptions,
        );

        throw error;
      }),
    );
  }
}
