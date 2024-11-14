import { Expose } from 'class-transformer';

import { Event } from 'src/domains/event/entity/event.entity';

import { EventSpecificProgramDto } from './eventSpecificProgramDto';
import { PlaceSpecificProgramDto } from './placeSpecificProgramDto';

export class ProgramSpecificDto {
  constructor({ id, name, runningTime, genre, actors, place, profileUrl, price, events }) {
    this.id = id;
    this.name = name;
    this.runningTime = runningTime;
    this.genre = genre;
    this.actors = actors;
    this.place = new PlaceSpecificProgramDto(place);
    this.profileUrl = profileUrl;
    this.price = price;
    this.events = events.reduce((acc: EventSpecificProgramDto[], event: Event) => {
      acc.push(new EventSpecificProgramDto(event));
      return acc;
    }, []);
  }

  id: number;
  name: string;
  @Expose({ name: 'running-time' })
  runningTime: number;
  genre: string;
  actors: string;
  place: PlaceSpecificProgramDto;
  @Expose({ name: 'profile-url' })
  profileUrl: string;
  price: number;
  events: EventSpecificProgramDto[];
}
