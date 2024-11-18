import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Reservation } from './reservation.entity';

@Entity({ name: 'Reserved_Seat' })
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
}
