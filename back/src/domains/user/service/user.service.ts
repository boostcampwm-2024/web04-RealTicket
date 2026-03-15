import { ConflictException, Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as bcrypt from 'bcryptjs';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DataSource, In } from 'typeorm';
import { Logger as WinstonLogger } from 'winston';

import { Reservation } from '../../reservation/entity/reservation.entity';
import { ReservedSeat } from '../../reservation/entity/reservedSeat.entity';
import { USER_ROLE } from '../const/userRole';
import { UserCreateDto } from '../dto/userCreate.dto';
import { UserLoginIdCheckDto } from '../dto/userLoginIdCheck.dto';
import { User } from '../entity/user.entity';
import { UserRepository } from '../repository/user.repository';

@Injectable()
export class UserService {
  constructor(
    @Inject() private readonly userRepository: UserRepository,
    @Inject() private readonly dataSource: DataSource,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {}

  async registerUser(userCreateDto: UserCreateDto, role: string = USER_ROLE.USER) {
    if (await this.userRepository.findByLoginId(userCreateDto.loginId)) {
      throw new ConflictException('�̹� �����ϴ� ������Դϴ�.');
    }

    try {
      const { loginId, loginPassword } = userCreateDto;
      const hashedPassword = await this.hashingPassword(loginPassword);
      const newUser: Partial<User> = {
        loginId,
        loginPassword: hashedPassword,
        role,
      };

      await this.userRepository.createUser(newUser);
      return { message: 'ȸ�������� ���������� �Ϸ�Ǿ����ϴ�.' };
    } catch (err) {
      this.logger.error(err);
      throw new InternalServerErrorException('ȸ�����Կ� �����߽��ϴ�.');
    }
  }

  private async hashingPassword(password: string) {
    const saltRound = 10;
    return bcrypt.hash(password, saltRound);
  }

  async isAvailableLoginId(userLoginIdCheckDto: UserLoginIdCheckDto) {
    const user = await this.userRepository.findByLoginId(userLoginIdCheckDto.loginId);

    if (user) {
      return { available: false };
    }

    return { available: true };
  }

  @Cron('0 0 0 * * *', { name: 'removeGuestReservation' })
  async removeAllGuest() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.find(User, { where: { checkGuest: true } });
      const userIds = user.map((u) => u.id);

      const reservationIds = await queryRunner.manager.find(Reservation, { where: { user: In(userIds) } });
      await queryRunner.manager.delete(ReservedSeat, { reservation: In(reservationIds.map((r) => r.id)) });
      await queryRunner.manager.delete(Reservation, { user: In(userIds) });
      await queryRunner.manager.delete(User, { id: In(userIds) });

      await queryRunner.commitTransaction();

      return this.userRepository.deleteAllGuest();
    } catch (err) {
      this.logger.error(err?.name, err?.stack);
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException('�Խ�Ʈ ����� ���ſ� �����߽��ϴ�.');
    } finally {
      await queryRunner.release();
    }
  }
}
