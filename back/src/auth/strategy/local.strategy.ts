import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';

import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  // TODO
  // UserService를 AuthService로 분리해야할까?
  constructor(private readonly authService: AuthService) {
    super({
      usernameField: 'loginId',
      passwordField: 'loginPassword',
    });
  }

  async validate(id: string, password: string, done: CallableFunction): Promise<any> {
    const user = await this.authService.validateUser({
      id: id,
      password: password,
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return done(null, user);
  }
}
