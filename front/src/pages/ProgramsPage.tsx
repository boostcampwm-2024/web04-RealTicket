import { Link } from 'react-router-dom';

import { CustomError } from '@/api/axios.ts';
import { getPrograms } from '@/api/program';

import { useSuspenseQuery } from '@tanstack/react-query';

//TODO 지연로딩,  로딩 skeleton 적용, scrollbar 관리(나타나면서 화면을 밀어버린다 ), queryKey 관리 필요
export default function ProgramsPage() {
  const { data } = useSuspenseQuery<IProgram[], CustomError>({
    queryKey: ['programs'],
    queryFn: getPrograms,
  });
  const programs = data;
  //현재 데이터가 없어서 mock 대체
  return (
    <ul className="mx-auto grid grid-cols-5 gap-6">
      {programs.map((program) => (
        <li key={program.id}>
          <Link to={`/programs/${program.id}`}>
            <ProgramCard {...program} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

interface IProgram {
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
const ProgramCard = ({
  name,
  profileUrl,
  actors,
}: Pick<IProgram, 'actors' | 'id' | 'name' | 'profileUrl'>) => {
  return (
    <div className="flex w-[200px] flex-col rounded border-2 p-4 hover:border-surface">
      <img className="object-con flex-grow object-cover" width={200} height={300} src={profileUrl} />
      <div className="flex flex-col gap-1 text-center">
        <div className="truncate text-display1 text-typo">{name}</div>
        <div className="text-caption1">{actors}</div>
      </div>
    </div>
  );
};
