import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Event } from 'src/domains/event/entity/event.entity';
import { Program } from 'src/domains/program/entities/program.entity';
import { User } from 'src/domains/user/entity/user.entity';

@Entity({ name: 'Reservation' })
export class Reservation {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt: Date;

  @Column({ type: 'int', name: 'amount' })
  amount: number;

  @Column({ type: 'json', name: 'seats' })
  seats: string[];

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
