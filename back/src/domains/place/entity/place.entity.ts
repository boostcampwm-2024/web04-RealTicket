import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

import { Event } from 'src/domains/event/entity/event.entity';
import { Program } from 'src/domains/program/entities/program.entity';

@Entity({ name: 'Place' })
export class Place {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 255, name: 'name' })
  name: string;

  @Column({ type: 'varchar', length: 255, name: 'address' })
  address: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'overview_svg' })
  overviewSvg: string;

  @Column({ type: 'int', name: 'overview_height' })
  overviewHeight: number;

  @Column({ type: 'int', name: 'overview_width' })
  overviewWidth: number;

  @Column({ type: 'json', name: 'sections' })
  sections: string[];

  @Column({ type: 'text', name: 'overview_points' })
  overviewPoints: string;

  @OneToMany(() => Program, (program) => program.place, { lazy: true })
  programs: Promise<Program[]>;

  @OneToMany(() => Event, (event) => event.place, { lazy: true })
  events: Promise<Event[]>;
}
