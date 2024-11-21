export interface Program {
  id: number;
  name: string;
  genre: string;
  place: {
    id: number;
    name: string;
  };
  profileUrl: string;
  actors: string;
}
export interface EventDetail {
  id: number;
  title: string;
  place: { id: number; name: string };
  price: number;
  runningTime: number;
  runningDate: Date;
  reservationOpenDate: Date;
  reservationCloseDate: Date;
  actors: string;
}
export interface ProgramDetail {
  id: number;
  name: string;
  runningTime: number;
  genre: string;
  actors: string;
  place: string;
  profileUrl: string;
  price: number;
  events: Pick<EventDetail, 'id' | 'runningDate'>[];
}
