import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';

import { Place } from 'src/place/entity/place.entity';
import { Program } from 'src/program/entities/program.entity';
import { Reservation } from 'src/reservation/entity/reservation.entity';

@Entity({ name: 'Event' })
export class Event {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'timestamp', name: 'running_date' })
  runningDate: Date;

  @Column({ type: 'timestamp', name: 'reservation_open_date' })
  reservationOpenDate: Date;

  @Column({ type: 'timestamp', name: 'reservation_close_date' })
  reservationCloseDate: Date;

  @Column({ type: 'json', name: 'seat_status' })
  seatStatus: number[][];

  @ManyToOne(() => Program, (program) => program.events, { lazy: true })
  @JoinColumn({ name: 'program_id', referencedColumnName: 'id' })
  program: Promise<Program>;

  @ManyToOne(() => Place, (place) => place.events, { lazy: true })
  @JoinColumn({ name: 'place_id', referencedColumnName: 'id' })
  place: Promise<Place>;

  @OneToMany(() => Reservation, (reservation) => reservation.event, { lazy: true })
  reservations: Promise<Reservation[]>;
}
