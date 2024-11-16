import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { User } from '../entity/user.entity';

@Injectable()
export class UserRepository {
  private userRepository: Repository<User>;

  constructor(private readonly dataSource: DataSource) {
    this.userRepository = this.dataSource.getRepository(User);
  }

  async createUser(user: Partial<User>) {
    return this.userRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findOne(id: string): Promise<User> {
    return this.userRepository.findOne({ where: { loginId: id } });
  }

  async findById(id: number): Promise<User> {
    return this.userRepository.findOne({ where: { id: id } });
  }

  findOneOrFail({ where }) {
    if (where) {
      return where.id;
    } else {
      return 'no';
    }
  }
}
