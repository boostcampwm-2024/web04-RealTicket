export interface IProgram {
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
