import { Event } from '../../event/entity/event.entity';
import { Program } from '../../program/entities/program.entity';
import { User } from '../../user/entity/user.entity';

export class ReservationDataDto {
  createdAt: Date;
  amount: number;
  program: Partial<Program>;
  event: Partial<Event>;
  user: Partial<User>;
}
