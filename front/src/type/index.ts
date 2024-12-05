//TODO domain 별 타입 분리
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
  name: string;
  price: number;
  place: { id: number; name: string };
  runningTime: number;
  runningDate: string;
  reservationOpenDate: string;
  reservationCloseDate: string;
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
export interface SectionCoordinate {
  id: string;
  points: number[][];
}

export interface Section {
  id: number;
  name: string;
  seats: boolean[];
  colLen: number;
}
