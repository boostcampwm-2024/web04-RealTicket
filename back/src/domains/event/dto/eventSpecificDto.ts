import { Expose } from 'class-transformer';

import { placeSpecificEventDto } from './placeSpecificEventDto';

export class EventSpecificDto {
  constructor({ id, name, place, runningTime, runningDate, reservationOpenDate, reservationCloseDate }) {
    this.id = id;
    this.name = name;
    this.place = new placeSpecificEventDto(place);
    this.runningTime = runningTime;
    this.runningDate = runningDate;
    this.reservationOpenDate = reservationOpenDate;
    this.reservationCloseDate = reservationCloseDate;
  }

  id: number;
  name: string;
  place: placeSpecificEventDto;
  @Expose({ name: 'runningTime' })
  runningTime: number;
  @Expose({ name: 'runningDate' })
  runningDate: Date;
  @Expose({ name: 'reservationOpenDate' })
  reservationOpenDate: Date;
  @Expose({ name: 'reservationCloseDate' })
  reservationCloseDate: Date;
}
