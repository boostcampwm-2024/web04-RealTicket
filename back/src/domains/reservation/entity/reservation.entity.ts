import {
  Column,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Event } from 'src/domains/event/entity/event.entity';
import { Program } from 'src/domains/program/entities/program.entity';
import { User } from 'src/domains/user/entity/user.entity';

import { ReservedSeat } from './reservedSeat.entity';

@Entity({ name: 'Reservation' })
export class Reservation {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt: Date;

  @Column({ type: 'int', name: 'amount' })
  amount: number;

  @OneToMany(() => ReservedSeat, (reservedSeat) => reservedSeat.reservation, { lazy: true })
  reservedSeats: Promise<ReservedSeat[]>;

  @ManyToOne(() => Program, (program) => program.reservations, { lazy: true })
  @JoinColumn({ name: 'program_id', referencedColumnName: 'id' })
  program: Promise<Program>;

  @ManyToOne(() => Event, (event) => event.reservations, { lazy: true })
  @JoinColumn({ name: 'event_id', referencedColumnName: 'id' })
  event: Promise<Event>;

  @ManyToOne(() => User, (user) => user.reservations, { lazy: true })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user: Promise<User>;
}
