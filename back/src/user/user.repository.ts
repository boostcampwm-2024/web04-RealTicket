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

  async createUser(createUserDTO: CreateUserDto) {
    const user = {
      login_id: createUserDTO.loginId,
      login_password: createUserDTO.loginPassword,
    };
    return this.userRepository.save(user);
  }

  async findAll(): Promise<UserEntity[]> {
    return this.userRepository.find();
  }

  async findOne(id: string): Promise<UserEntity> {
    return this.userRepository.findOne({ where: { login_id: id } });
  }

  async create(userData: Partial<UserEntity>): Promise<UserEntity> {
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  findOneOrFail({ where }) {
    if (where) {
      return where.id;
    } else {
      return 'no';
    }
  }
}
