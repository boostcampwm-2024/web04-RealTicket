import { RedisService } from '@liaoliaots/nestjs-redis';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import Redis from 'ioredis';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';

import { AppException } from '../../../common/exception/app.exception';
import {
  LoggingDetailType,
  LoggingOptions,
  DetailedLogData,
  UserSession,
  CachedUserInfo,
  UserInfo,
} from '../types/logging.types';

@Injectable()
export class RequestLoggingService {
  private readonly redis: Redis | null;
  private readonly userCache = new Map<string, CachedUserInfo>();
  private readonly CACHE_TTL = 5 * 60 * 1000;
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly DEFAULT_DETAILS = Object.values(LoggingDetailType);

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
    private readonly redisService: RedisService,
  ) {
    this.redis = this.redisService.getOrThrow();
    setInterval(() => this.cleanupExpiredCache(), 5 * 60 * 1000);
  }

  async logRequest(req: Request, options: LoggingOptions = {}): Promise<DetailedLogData> {
    const logData = await this.collectLogData(req, null, null, options);
    this.logFormattedMessage('REQ', logData);
    return logData;
  }

  async logResponse(
    req: Request,
    res: Response,
    responseBody: any,
    responseTime: number,
    options: LoggingOptions = {},
  ): Promise<void> {
    const logData = await this.collectLogData(req, res, responseBody, options);
    logData.responseTime = responseTime;
    this.logFormattedMessage('RES', logData);
  }

  async logError(
    req: Request,
    res: Response,
    error: any,
    responseTime: number,
    options: LoggingOptions = {},
  ): Promise<void> {
    const logData = await this.collectLogData(req, res, null, options);
    logData.responseTime = responseTime;
    logData.errorStack = error instanceof Error ? error.stack : String(error);

    if (error instanceof AppException) {
      logData.errorCode = error.getCode();
      logData.errorMessage = error.message;
    } else if (error instanceof Error) {
      logData.errorMessage = error.message;
    }

    if (!logData.errorCode && res?.locals?.errorCode) {
      logData.errorCode = res.locals.errorCode;
      if (!logData.errorMessage) logData.errorMessage = res.locals.errorMessage;
    }

    if (!logData.statusCode) {
      if (error instanceof AppException || error instanceof HttpException) {
        logData.statusCode = (error as HttpException).getStatus();
      } else {
        logData.statusCode = 500;
      }
    }

    this.logFormattedMessage('ERR', logData, error);
  }

  private async collectLogData(
    req: Request,
    res: Response | null,
    responseBody: any,
    options: LoggingOptions,
  ): Promise<DetailedLogData> {
    const requiredDetails = this.getRequiredDetails(options);
    const logData: DetailedLogData = {
      method: req.method,
      url: req.originalUrl,
      loggerName: options.loggerName || 'API',
    };

    for (const detail of requiredDetails) {
      switch (detail) {
        case LoggingDetailType.USER_INFO:
          const sid = req.cookies['SID'];
          if (sid) {
            logData.userInfo = await this.getUserInfo(sid);
          } else {
            logData.userInfo = { userDBId: 'unknown', userLoginId: 'unknown' };
          }
          break;

        case LoggingDetailType.REQUEST_BODY:
          logData.requestBody = req.body;
          break;

        case LoggingDetailType.RESPONSE_BODY:
          if (responseBody !== null) {
            logData.responseBody = responseBody;
          }
          break;

        case LoggingDetailType.USER_IP:
          logData.userIP = this.extractUserIP(req);
          break;

        case LoggingDetailType.USER_AGENT:
          logData.userAgent = req.headers['user-agent'];
          break;

        case LoggingDetailType.REFERER:
          logData.referer = req.headers['referer'];
          break;

        case LoggingDetailType.STATUS_CODE:
          if (res) {
            logData.statusCode = res.statusCode;
          }
          break;

        case LoggingDetailType.SESSION_ID:
          logData.sessionId = req.cookies['SID'];
          break;

        case LoggingDetailType.REQUEST_HEADERS:
          logData.requestHeaders = req.headers;
          break;
      }
    }

    return logData;
  }

  private async getUserInfo(sid: string): Promise<UserInfo> {
    const cached = this.userCache.get(sid);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return {
        userDBId: cached.userDBId,
        userLoginId: cached.userLoginId,
      };
    }

    if (!this.redis) {
      return { userDBId: 'unknown', userLoginId: 'unknown' };
    }

    try {
      const userDataStr = await this.redis.get(`user:${sid}`);
      if (userDataStr) {
        const userSession: UserSession = JSON.parse(userDataStr);
        const userInfo: UserInfo = {
          userDBId: userSession.id.toString(),
          userLoginId: userSession.loginId,
        };

        this.cacheUserInfo(sid, userInfo);
        return userInfo;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to get user info for SID: ${sid} - ${error instanceof Error ? error.message : String(error)}`,
        'DetailedRequestLogging',
      );
    }

    return { userDBId: 'unknown', userLoginId: 'unknown' };
  }

  private extractUserIP(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (req.headers['x-real-ip'] as string) ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }

  private getRequiredDetails(options: LoggingOptions): LoggingDetailType[] {
    if (options.includeDetails && options.includeDetails.length > 0) {
      return options.includeDetails.filter((detail) => !options.excludeDetails?.includes(detail));
    } else {
      return this.DEFAULT_DETAILS.filter((detail) => !options.excludeDetails?.includes(detail));
    }
  }

  private logFormattedMessage(type: 'REQ' | 'RES' | 'ERR', logData: DetailedLogData, error?: any): void {
    const parts: string[] = [`[${type}] ${logData.method} ${logData.url}`];

    if (logData.userInfo) {
      parts.push(`User: ${logData.userInfo.userDBId}(${logData.userInfo.userLoginId})`);
    }

    if (logData.userIP) {
      parts.push(`IP: ${logData.userIP}`);
    }

    if (logData.statusCode) {
      parts.push(`Status: ${logData.statusCode}`);
    }

    if (logData.responseTime !== undefined) {
      parts.push(`${logData.responseTime}ms`);
    }

    if (logData.requestBody) {
      parts.push(`Body: ${JSON.stringify(logData.requestBody)}`);
    }

    if (logData.responseBody) {
      parts.push(`Response: ${JSON.stringify(logData.responseBody)}`);
    }

    if (logData.userAgent) {
      parts.push(`UA: ${logData.userAgent}`);
    }

    if (logData.referer) {
      parts.push(`Referer: ${logData.referer}`);
    }

    if (logData.sessionId) {
      parts.push(`SID: ${logData.sessionId}`);
    }

    if (logData.requestHeaders) {
      parts.push(`Headers: ${JSON.stringify(logData.requestHeaders)}`);
    }

    const message = parts.join(' | ');

    if (type === 'ERR') {
      const statusCode = logData.statusCode ?? 500;
      const meta: Record<string, any> = {
        errorCode: logData.errorCode,
        errorMessage: logData.errorMessage,
      };
      if (statusCode >= 500) {
        meta.stack = error?.stack || logData.errorStack;
        this.logger.error(message, meta);
      } else {
        this.logger.warn(message, meta);
      }
    } else {
      this.logger.http(message, logData.loggerName);
    }
  }

  private cacheUserInfo(sid: string, userInfo: UserInfo): void {
    if (this.userCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.userCache.keys().next().value;
      this.userCache.delete(oldestKey);
    }

    this.userCache.set(sid, {
      userDBId: userInfo.userDBId,
      userLoginId: userInfo.userLoginId,
      timestamp: Date.now(),
    });
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [sid, cached] of this.userCache.entries()) {
      if (now - cached.timestamp >= this.CACHE_TTL) {
        this.userCache.delete(sid);
      }
    }
  }
}
