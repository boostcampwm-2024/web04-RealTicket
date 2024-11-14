import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { Reservation } from 'src/domains/reservation/entity/reservation.entity';

@Entity({ name: 'User' })
export class User {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 255, name: 'login_id' })
  loginId: string;

  @Column({ type: 'varchar', length: 255, name: 'login_password' })
  loginPassword: string;

  @OneToMany(() => Reservation, (reservation) => reservation.user, { lazy: true })
  reservations: Promise<Reservation[]>;
}
