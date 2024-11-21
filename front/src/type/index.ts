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

export interface ProgramDetail {
  id: number;
  name: string;
  runningTime: number;
  genre: string;
  actors: string;
  place: { id: number; name: string };
  profileUrl: string;
  price: number;
  events: Pick<EventDetail, 'id' | 'runningDate'>[];
}
export interface EventDetail {
  id: number;
  title: string;
  place: { id: number; name: string };
  price: number;
  runningTime: number;
  runningDate: string;
  reservationOpenDate: string;
  reservationCloseDate: string;
  actors: string;
}

export interface PlaceInformation {
  id: number;
  layout: Layout;
}

interface Layout {
  overview: string;
  overviewWidth: number;
  overviewHeight: number;
  overviewPoints: string;
  sections: Section[];
}
interface Section {
  id: number;
  name: string;
  seats: boolean[];
  colLength: number;
}
