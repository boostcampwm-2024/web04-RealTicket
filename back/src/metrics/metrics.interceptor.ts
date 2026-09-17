import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Counter } from 'prom-client';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { HTTP_REQUESTS_TOTAL_COUNTER } from './metrics.registry';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @Inject(HTTP_REQUESTS_TOTAL_COUNTER)
    private readonly httpRequestsTotal: Counter<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const method = request.method;
    const path = this.resolveRoutePath(request);

    // 수집 요청 자체가 지표를 부풀리지 않도록 제외한다.
    if (path === '/metrics') {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        this.httpRequestsTotal.inc({
          method,
          path,
          status: String(response.statusCode),
        });
      }),
      catchError((error) => {
        const status = error?.getStatus && typeof error.getStatus === 'function' ? error.getStatus() : 500;
        // 필터 적용 전 상태이므로 최종 응답 코드와 다를 수 있다.
        this.httpRequestsTotal.inc({
          method,
          path,
          status: String(status),
        });
        throw error;
      }),
    );
  }

  // 라우트 패턴과 unknown으로 라벨 값의 무한 증가를 막는다.
  private resolveRoutePath(request: Request): string {
    const routePath = (request as Request & { route?: { path?: string } }).route?.path;
    if (typeof routePath === 'string' && routePath.length > 0) {
      return routePath;
    }
    return 'unknown';
  }
}
