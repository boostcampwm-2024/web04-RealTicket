import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { apiClient } from '@/api/axios.ts';

import SeatsContainer from '@/components/Seats/SeatsContainer';

import { SEATS_GAP, SEAT_BOX_SIZE } from '@/constants/index.ts';
import { cx } from 'class-variance-authority';

/*
좌석 개수에 따라서 좌표크기가 갈라진다. 
viewBox x= 열 길이 *12( 좌석길이(10)+ 여백(2))
viewBox y= 행 높이 *12(좌석길이(10)+ 여백(2))

=> 이러면 좌석크기가 달라진다 
좌표를 좌석 크기로 나눈다 

col

*/
interface ISection {
  id: number;
  name: string;
  view: null;
  seats: Seats;
  colLength: number;
}
interface ILayout {
  overview: null | string;
  sections: ISection[];
}
interface IPlace {
  id: number;
  layout: ILayout;
}
type Seats = boolean[];

export default function ProgramDetailPage() {
  const { eventId } = useParams();
  const eventSourceRef = useRef<null | EventSource>(null);
  const [placeData, setPlaceData] = useState<null | IPlace>(null);
  const selectedSectionId = 0;
  const section = placeData === null ? null : placeData.layout.sections[selectedSectionId];
  // const section=mockSection
  const rowLength = section === null ? null : Math.ceil(section.seats.length / section.colLength);
  // const [reservedSeatList, setReservedSeatList] = useState<number[]>([]);

  useEffect(() => {
    if (placeData === null) {
      const fetchPlace = async () => {
        await apiClient
          .get<{ status: number; data: IPlace }>(`/mock/place/seats/${eventId}`)
          .then((res) => res.data)
          .then((result) => {
            const { data } = result;
            setPlaceData(data);
          })
          .catch(() => {}); // API 요청으로  화면 구현
      };
      fetchPlace();
    } else {
      if (eventSourceRef.current === null) {
        eventSourceRef.current = new EventSource(`/mock/reservation/${eventId}`);
        eventSourceRef.current.onmessage = () => {
          // const data:ISeatStatus=JSON.parse(event.data);
        };
      }
    }
  }, [eventId, placeData]);

  return (
    <div className="h-[500px] w-[800px] bg-slate-300">
      <h1>eventdetailPage {eventId}</h1>
      {section === null ? (
        <div> ....loading</div>
      ) : (
        <SeatsContainer colLength={section.colLength} rowLength={rowLength!}>
          {section.seats.map((isNotEmpty, index) => {
            const rowCo = (index % section.colLength) * SEAT_BOX_SIZE + SEATS_GAP / 2;
            const colCo = Math.floor(index / section.colLength) * SEAT_BOX_SIZE + SEATS_GAP / 2;
            return (
              <rect
                className={cx({ 'cursor-pointer': isNotEmpty })}
                key={index}
                x={rowCo}
                y={colCo}
                width={SEAT_BOX_SIZE - SEATS_GAP}
                height={SEAT_BOX_SIZE - SEATS_GAP}
                fill={isNotEmpty ? 'green' : 'transparent'}
                onClick={isNotEmpty ? () => {} : undefined}
              />
            );
          })}
        </SeatsContainer>
      )}
    </div>
  );
}
