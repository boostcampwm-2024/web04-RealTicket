import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { Event } from '../../event/entity/event.entity';

import { Reservation } from './reservation.entity';

@Entity({ name: 'Reserved_Seat' })
@Unique(['row', 'col', 'section', 'reservation'])
export class ReservedSeat {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 255, name: 'section' })
  section: string;

  @Column({ type: 'int', name: 'row' })
  row: number;

  @Column({ type: 'int', name: 'col' })
  col: number;

  @ManyToOne(() => Reservation, (reservation) => reservation.reservedSeats, { lazy: true })
  @JoinColumn({ name: 'reservation_id', referencedColumnName: 'id' })
  reservation: Promise<Reservation>;

  @ManyToOne(() => Event, (event) => event.reservedSeats, { lazy: true })
  @JoinColumn({ name: 'event_id', referencedColumnName: 'id' })
  event: Promise<Event>;
}
