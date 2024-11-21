export class ReservationSpecificDto {
  constructor({ id, programName, runningDate, placeName, seats }) {
    this.id = id;
    this.programName = programName;
    this.runningDate = runningDate;
    this.placeName = placeName;
    this.seats = seats;
  }

  id: number;

  programName: string;

  runningDate: Date;

  placeName: string;

  seats: string;
}
