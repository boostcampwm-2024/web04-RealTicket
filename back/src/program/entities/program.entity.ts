import { Event } from 'src/event/entity/event.entity';
import { Place } from 'src/place/entity/place.entity';
import { Reservation } from 'src/reservation/entity/reservation.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';

@Entity({ name: 'Program' })
export class Program {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 255, name: 'name' })
  name: string;

  @Column({ type: 'varchar', length: 255, name: 'profile_url' })
  profileUrl: string;

  @Column({ type: 'int', name: 'running_time' })
  runningTime: number;

  @Column({ type: 'varchar', length: 255, name: 'genre' })
  genre: string;

  @Column({ type: 'varchar', length: 255, name: 'actors' })
  actors: string;

  @Column({ type: 'int', name: 'price' })
  price: number;

  @ManyToOne(() => Place, (place) => place.programs, { lazy: true })
  @JoinColumn({ name: 'place_id', referencedColumnName: 'id' })
  place: Promise<Place>;

  @OneToMany(() => Event, (event) => event.program, { lazy: true })
  events: Promise<Event[]>;
  
  @OneToMany(() => Reservation, (reservation) => reservation.program, { lazy: true })
  reservations: Promise<Reservation[]>;
}
