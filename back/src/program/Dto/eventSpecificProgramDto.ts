import { Expose } from "class-transformer";

export class EventSpecificProgramDto {
  constructor({id, runningDate}) {
    this.id = id;
    this.runningDate = runningDate;
  }

  id: number;
  @Expose({ name: 'running-date' })
  runningDate: Date;
}