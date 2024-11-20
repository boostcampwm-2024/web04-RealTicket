import { Expose } from 'class-transformer';

import { PlaceMainPageDto } from './placeMainPageDto';

export class ProgramMainPageDto {
  constructor({ id, name, genre, place, profileUrl, actors }) {
    this.id = id;
    this.name = name;
    this.genre = genre;
    this.place = new PlaceMainPageDto(place);
    this.profileUrl = profileUrl;
    this.actors = actors;
  }

  id: number;
  name: string;
  genre: string;
  place: PlaceMainPageDto;
  @Expose({ name: 'profile-url' })
  profileUrl: string;
  actors: string;
}
