import { Link } from 'react-router-dom';

import { CustomError } from '@/api/axios.ts';
import { getPrograms } from '@/api/program';

import ProgramCard from '@/pages/ProgramsPage/ProgramCard.tsx';
import type { IProgram } from '@/pages/ProgramsPage/ProgramCard.tsx';

import { ROUTE_URL } from '@/constants/index.ts';
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
    <ul className="grid grid-cols-[repeat(4,minmax(auto,_1fr))] gap-6 overflow-auto">
      {programs.map((program) => (
        <li key={program.id}>
          <Link to={ROUTE_URL.PROGRAM.PROGRAM_DETAIL(program.id)}>
            <ProgramCard {...program} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
