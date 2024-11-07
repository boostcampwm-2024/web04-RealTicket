import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { CreateUserDto } from '../dto/userCreate.dto';
import { UserEntity } from '../entity/user.entity';

@Injectable()
export class UserRepository {
  private userRepository: Repository<UserEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.userRepository = this.dataSource.getRepository(UserEntity);
  }

  createUser(createUserDTO: CreateUserDto) {
    const user = {
      login_id: createUserDTO.loginId,
      login_password: createUserDTO.loginPassword,
    };

    return this.userRepository.save(user);
  }
}
