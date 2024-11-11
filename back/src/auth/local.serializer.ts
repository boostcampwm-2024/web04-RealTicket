import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';

import { UserRepository } from '../user/repository/user.repository';

@Injectable()
export class LocalSerializer extends PassportSerializer {
  constructor(private readonly userRepository: UserRepository) {
    super();
  }

  serializeUser(user: any, done: CallableFunction): any {
    //console.log(user);
    done(null, user.id);
  }

  async deserializeUser(payload: any, done: CallableFunction) {
    return await this.userRepository
      .findOneOrFail({
        where: { id: payload.userId },
      })
      .then((user) => {
        console.log('user', user);
        done(null, user);
      })
      .catch((err) => done(err));
  }
}
