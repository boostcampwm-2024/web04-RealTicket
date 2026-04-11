import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Counter } from 'prom-client';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { HTTP_REQUESTS_TOTAL_COUNTER } from './metrics.registry';

/**
 * 전역 인터셉터: 모든 HTTP 요청을 http_requests_total 카운터로 계측 (METRICS-02).
 *
 * 라벨 정책 (D-08):
 * - method: 요청 HTTP 메서드 (GET/POST/PUT/PATCH/DELETE/...)
 * - path:   NestJS 라우트 패턴 (ex. '/booking/seats/:id'). 라우트 매칭 실패 시 'unknown'.
 * - status: HTTP 상태 코드 (정수 문자열, ex. '200', '404', '500')
 *
 * 제외 대상 (D-09):
 * - `/metrics` 자체는 카운트하지 않음 (scrape 트래픽이 메트릭을 오염시키지 않도록).
 */
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

    // /metrics 경로는 계측 제외
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
        // NOTE: ExceptionFilter가 이 에러를 다른 상태 코드로 변환하는 경우
        // (예: 커스텀 필터가 도메인 에러를 422로 매핑), 인터셉터의 catchError는
        // 필터 실행 전에 실행되므로 여기서 기록하는 status와 실제 응답 status가
        // 다를 수 있다. HttpException을 상속하지 않는 에러(TypeORM EntityNotFoundError 등)는
        // 500으로 폴백되지만 글로벌 필터가 이를 다른 코드로 변환할 수 있음을 인지할 것.
        this.httpRequestsTotal.inc({
          method,
          path,
          status: String(status),
        });
        throw error;
      }),
    );
  }

  /**
   * NestJS가 매칭한 Express 라우트 패턴을 추출한다.
   * - request.route?.path: ex. '/booking/seats/:id' (파라미터 키 유지 → 카디널리티 안정)
   * - 매칭 실패 시 (404 등) 'unknown'으로 폴백해 URL 단편 무한 카디널리티를 방지한다.
   */
  private resolveRoutePath(request: Request): string {
    const routePath = (request as Request & { route?: { path?: string } }).route?.path;
    if (typeof routePath === 'string' && routePath.length > 0) {
      return routePath;
    }
    return 'unknown';
  }
}
