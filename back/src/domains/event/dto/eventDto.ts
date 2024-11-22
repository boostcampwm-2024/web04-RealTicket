export class EventDto {
  constructor({ id, reservationOpenDate, reservationCloseDate }) {
    this.id = id;
    this.reservationOpenDate = reservationOpenDate;
    this.reservationCloseDate = reservationCloseDate;
  }

  id: number;
  reservationOpenDate: Date;
  reservationCloseDate: Date;
}
