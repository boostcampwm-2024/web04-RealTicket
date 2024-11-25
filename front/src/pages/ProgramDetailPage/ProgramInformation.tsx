interface IProgramInformationProps
  extends Pick<Program, 'actors' | 'genre' | 'place' | 'profileUrl' | 'runningTime' | 'name'> {
  isOneDay: boolean;
  startDate: string;
  lastDate: string;
}
export default function ProgramInformation({
  name,
  runningTime,
  genre,
  actors,
  place,
  profileUrl,
  isOneDay,
  startDate,
  lastDate,
}: IProgramInformationProps) {
  return (
    <div className="flex gap-8">
      <img src={profileUrl || 'https://picsum.photos/200/300'} width={200} height={300} alt={`${name}`} />
      <div className="flex flex-grow flex-col gap-8">
        <h3 className="text-heading1 text-typo">{name}</h3>
        <div className="flex gap-8 text-display1 text-typo">
          <div className="flex flex-col gap-4">
            <div>공연 기간 : {isOneDay ? startDate : `${startDate} ~ ${lastDate}`}</div>
            <div>공연 장소 : {place.name}</div>
            <div>관람 시간 : {runningTime}</div>
          </div>
          <div className="flex flex-col gap-4">
            <div>장르 : {genre}</div>
            <div>출연진 : {actors}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Program {
  id: number;
  name: string;
  runningTime: number;
  genre: string;
  actors: string;
  place: { id: number; name: string };
  profileUrl: string;
  price: number;
  events: Pick<Event, 'id' | 'runningDate'>[];
}
interface Event {
  id: number;
  name: string;
  place: string;
  runningTime: number;
  runningDate: string;
  reservationOpenDate: Date;
  reservationCloseDate: Date;
  actors: string;
}
