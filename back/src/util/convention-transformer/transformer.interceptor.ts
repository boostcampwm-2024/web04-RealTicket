import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import camelcaseKeys from 'camelcase-keys';
import { Observable } from 'rxjs';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<any>): Observable<any> | Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    if (req.body) {
      req.body = camelcaseKeys(req.body, { deep: true });
    }
    return next.handle();
  }
}
