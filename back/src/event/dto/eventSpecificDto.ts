import { Expose } from "class-transformer";
import { placeSpecificEventDto } from "./placeSpecificEventDto";

export class EventSpecificDto {
  constructor({ id, name, place, runningTime, runningDate, reservationOpenDate }) {
    this.id = id;
    this.name = name;
    this.place = new placeSpecificEventDto(place);
    this.runningTime = runningTime;
    this.runningDate = runningDate;
    this.reservationOpenDate = reservationOpenDate;
  }
  
  id: number;
  name: string;
  place: placeSpecificEventDto;
  @Expose({ name : 'running-time' })
  runningTime: number;
  @Expose({ name : 'running-date' })
  runningDate: Date;
  @Expose({ name : 'reservation-open-date' })
  reservationOpenDate: Date;
}