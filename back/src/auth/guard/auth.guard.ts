import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    return this.validateRequest(request);
  }

  private validateRequest(request: any) {
    //TODO
    // Session에 request의 Cookie가 있다면 True
    // 없다면 False를 반환하도록

    const sid = this.getSid(request);

    if (sid) {
      return true;
    }

    return true;
  }

  private getSid(request: any) {
    const SID: string = request.headers.cookie
      .split(';')
      .map((e: string) => {
        return e.trim().split('=');
      })
      .find((e: Array<string>) => e[0] === 'SID')[1];

    return SID;
  }
}
