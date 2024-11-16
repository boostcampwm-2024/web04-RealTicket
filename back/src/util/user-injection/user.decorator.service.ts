import { Injectable } from '@nestjs/common';

import { AuthService } from 'src/auth/service/auth.service';
import { UserService } from 'src/domains/user/service/user.service';

@Injectable()
export class UserDecoratorService {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  async getUserParam(ctx: any) {
    const req = ctx.switchToHttp().getRequest();
    const sid = req.cookies['SID'];
    const userId = await this.authService.getUserIdFromSession(sid);

    if (!userId) return null;

    const user = await this.userService.getUser(userId);
    return user;
  }
}
