import { Expose } from 'class-transformer';

export class ReservationSpecificDto {
  constructor({ id, programName, runningDate, placeName, seats }) {
    this.id = id;
    this.programName = programName;
    this.runningDate = runningDate;
    this.placeName = placeName;
    this.seats = seats;
  }

  id: number;

  @Expose({ name: 'program-name' })
  programName: string;

  @Expose({ name: 'running-date' })
  runningDate: Date;

  @Expose({ name: 'place-name' })
  placeName: string;

  seats: string;
}
