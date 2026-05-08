export enum LoggingDetailType {
  USER_INFO = 'userInfo',
  REQUEST_BODY = 'requestBody',
  RESPONSE_BODY = 'responseBody',
  USER_IP = 'userIP',
  USER_AGENT = 'userAgent',
  REFERER = 'referer',
  RESPONSE_TIME = 'responseTime',
  STATUS_CODE = 'statusCode',
  ERROR_STACK = 'errorStack',
  SESSION_ID = 'sessionId',
  REQUEST_HEADERS = 'requestHeaders',
}

export interface LoggingOptions {
  includeDetails?: LoggingDetailType[];
  excludeDetails?: LoggingDetailType[];
  loggerName?: string;
}

export interface DetailedLogData {
  method: string;
  url: string;
  loggerName: string;
  userInfo?: {
    userDBId: string;
    userLoginId: string;
  };
  requestBody?: any;
  responseBody?: any;
  userIP?: string;
  userAgent?: string;
  referer?: string;
  responseTime?: number;
  statusCode?: number;
  errorStack?: string;
  errorCode?: string;
  errorMessage?: string;
  sessionId?: string;
  requestHeaders?: Record<string, any>;
}

export interface UserSession {
  id: number;
  loginId: string;
  userStatus: string;
  targetEvent: any;
}

export interface CachedUserInfo {
  userDBId: string;
  userLoginId: string;
  timestamp: number;
}

export interface UserInfo {
  userDBId: string;
  userLoginId: string;
}
