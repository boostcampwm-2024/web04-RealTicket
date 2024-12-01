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

  async findByLoginId(loginId: string): Promise<User> {
    return this.userRepository.findOne({ where: { loginId } });
  }

  async deleteAllGuest() {
    return this.userRepository.delete({
      checkGuest: true,
    });
  }
}
