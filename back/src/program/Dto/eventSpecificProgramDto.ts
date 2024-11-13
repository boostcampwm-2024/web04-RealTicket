export class EventSpecificProgramDto {
  constructor({id, runningDate}) {
    this.id = id;
    this.runningDate = runningDate;
  }

  id: number;
  runningDate: Date;
}