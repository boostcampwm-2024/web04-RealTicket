import { useParams } from 'react-router-dom';

export default function DetailPage() {
  const { programId } = useParams();
  return (
    <div>
      detailPage
      {programId}
    </div>
  );
}
