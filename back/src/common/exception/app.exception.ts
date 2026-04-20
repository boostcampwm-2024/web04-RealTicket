import { HttpException } from '@nestjs/common';

import { DEFAULT_MESSAGE_MAP, ERROR_STATUS_MAP } from './error-status-map';

export type AppErrorCode = string;

export class AppException extends HttpException {
  private readonly errorCode: AppErrorCode;

  constructor(code: AppErrorCode, message?: string) {
    const status = ERROR_STATUS_MAP[code] ?? 500;
    const resolvedMessage = message ?? DEFAULT_MESSAGE_MAP[code] ?? '서버 오류가 발생했습니다.';
    super(resolvedMessage, status);
    this.errorCode = code;
  }

  getCode(): AppErrorCode {
    return this.errorCode;
  }
}
