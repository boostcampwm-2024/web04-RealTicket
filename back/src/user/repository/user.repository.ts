import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { UserEntity } from '../entity/user.entity';

@Injectable()
export class UserRepository {
  private userRepository: Repository<UserEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.userRepository = this.dataSource.getRepository(UserEntity);
  }

  async createUser(user: object) {
    return this.userRepository.save(user);
  }

  async findAll(): Promise<UserEntity[]> {
    return this.userRepository.find();
  }

  async findOne(id: string): Promise<UserEntity> {
    return this.userRepository.findOne({ where: { login_id: id } });
  }

  findOneOrFail({ where }) {
    if (where) {
      return where.id;
    } else {
      return 'no';
    }
  }
}
