import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';

import { Place } from './place.entity';

@Entity({ name: 'Section' })
export class Section {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 255, name: 'name' })
  name: string;

  @Column({ type: 'int', name: 'col_len' })
  colLen: number;

  @Column({ type: 'json', name: 'seats' })
  seats: string[];

  @ManyToOne(() => Place, (place) => place.sections, { lazy: true })
  @JoinColumn({ name: 'place_id', referencedColumnName: 'id' })
  place: Promise<Place>;
}
