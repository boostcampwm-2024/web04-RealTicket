import { useParams } from 'react-router-dom';

export default function ProgramDetailPage() {
  const { programId } = useParams();
  return (
    <div>
      detailPage
      {programId}
    </div>
  );
}
