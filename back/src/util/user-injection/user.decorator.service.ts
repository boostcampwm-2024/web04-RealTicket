import { Injectable } from '@nestjs/common';

import { AuthService } from 'src/auth/service/auth.service';

import { UserParamDto } from './userParamDto';

@Injectable()
export class UserDecoratorService {
  constructor(private readonly authService: AuthService) {}

  async getUserParam(ctx: any) {
    const req = ctx.switchToHttp().getRequest();
    const sid = req.cookies['SID'];
    if (!sid) return;
    const [userId, userLoginId] = await this.authService.getUserIdFromSession(sid);
    if (!userId || !userLoginId) return null;
    return new UserParamDto({ id: userId, loginId: userLoginId });
  }
}
