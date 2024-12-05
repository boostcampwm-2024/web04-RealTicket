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
export default function ProgramCard({
  name,
  profileUrl,
  actors,
}: Pick<IProgram, 'actors' | 'id' | 'name' | 'profileUrl'>) {
  return (
    <div className="flex min-h-[300px] w-[200px] min-w-[200px] flex-col gap-4 rounded border-2 p-4 hover:border-surface">
      <img className="object-con h-[240px] w-[160px] object-cover" src={profileUrl} />
      <div className="flex flex-col gap-1 text-center">
        <div className="truncate text-display1 text-typo">{name}</div>
        <div className="truncate text-caption1">{actors}</div>
      </div>
    </div>
  );
}
