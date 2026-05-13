import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Inject } from '@nestjs/common';
import { Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';

import { AppException } from './app.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number;
    let code: string;
    let message: string;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.getCode();
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = 'COMMON_UNKNOWN_ERROR';
      message = exception.message;
    } else {
      status = 500;
      code = 'COMMON_UNKNOWN_ERROR';
      message = '서버 오류가 발생했습니다.';
      this.logger.error('[ERR] UNKNOWN_EXCEPTION', {
        stack: (exception as any)?.stack,
      });
    }

    response.locals.errorCode = code;
    response.locals.errorMessage = message;
    response.status(status).json({
      success: false,
      error: { code, message },
    });
  }
}
