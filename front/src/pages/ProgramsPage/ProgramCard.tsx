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
    <div className="flex w-[200px] flex-col rounded border-2 p-4 hover:border-surface">
      <img className="object-con flex-grow object-cover" width={200} height={300} src={profileUrl} />
      <div className="flex flex-col gap-1 text-center">
        <div className="truncate text-display1 text-typo">{name}</div>
        <div className="text-caption1">{actors}</div>
      </div>
    </div>
  );
}
