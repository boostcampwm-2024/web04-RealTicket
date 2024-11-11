import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { CreateUserDto } from '../dto/userLogin.dto';
import { UserRepository } from '../repository/user.repository';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async registerUser(createUserDto: CreateUserDto) {
    const { login_id, login_password } = createUserDto;
    const hashedPassword = await this.hashingPassword(login_password);
    const newUser: object = {
      login_id: login_id,
      login_password: hashedPassword,
    };
    return await this.userRepository.createUser(newUser);
  }

  async hashingPassword(password: string) {
    const saltRound = 10;
    return await bcrypt.hash(password, saltRound);
  }
}
