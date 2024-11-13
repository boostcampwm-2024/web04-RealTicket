import { useParams } from 'react-router-dom';

export default function ProgramDetailPage() {
  const { eventId } = useParams();
  return (
    <div>
      eventdetailPage
      {eventId}
    </div>
  );
}
