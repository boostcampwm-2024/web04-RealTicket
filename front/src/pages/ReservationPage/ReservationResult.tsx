import { Link } from 'react-router-dom';

import Button from '@/components/common/Button.tsx';
import Icon from '@/components/common/Icon.tsx';
import Separator from '@/components/common/Separator.tsx';

import { SelectedSeat } from '@/pages/ReservationPage/SectionAndSeat.tsx';

import { getDate, getTime } from '@/utils/date.ts';
import { getPriceWon } from '@/utils/getPriceWon.ts';

import { EventDetail } from '@/type/index.ts';

interface IReservationResultProps {
  event: EventDetail;
  reservationResult: SelectedSeat[];
}
export default function ReservationResult({ event, reservationResult }: IReservationResultProps) {
  const { name, runningDate, place, price } = event;
  //TODO 가격 호출 필요

  const placeName = place.name;
  return (
    <div className="flex flex-col gap-8 rounded-xl border-2 border-e-surface-sub p-6 shadow-xl">
      <div className="flex flex-col items-center gap-4 text-center">
        <Icon iconName="CheckCircle" className="h-16 w-16" color={'success'} />
        <h2 className="text-heading1 text-typo">예매 성공!!</h2>
        <span className="text-caption1 text-typo-sub">예매가 성공적으로 완료되었습니다!</span>
      </div>
      <Separator direction="row" />
      <div className="flex flex-col gap-12">
        <h2 className="text-heading1 text-typo">{name}</h2>
        <div className="flex items-center gap-4">
          <Icon iconName="Calendar" />
          <span className="text-heading2 text-typo">{`${getDate(new Date(runningDate))} ${getTime(new Date(runningDate))}`}</span>
        </div>
        <div className="flex items-center gap-4">
          <Icon iconName="MapPin" />
          <span className="text-heading2 text-typo">{placeName}</span>
        </div>
        <div className="flex flex-col gap-8">
          <div className="flex items-center gap-4">
            <Icon iconName="Ticket" />
            <span className="text-heading2 text-typo">선택한 좌석</span>
          </div>
          <div>
            {reservationResult.map((ticket) => (
              <div key={ticket.name} className="flex items-center justify-between text-display1 text-typo">
                <span>{ticket.name}</span>
                <span>{getPriceWon(price)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-heading3 text-typo">총 결제 금액</span>
            <span className="text-display1 text-primary">
              {getPriceWon(price * reservationResult.length)}
            </span>
          </div>
        </div>
      </div>
      <Separator direction="row" />

      <ul className="list-disc px-6">
        {ALERT_MESSAGE_LIST.map((text) => (
          <li key={text} className="text-caption2 text-typo-sub">
            {text}
          </li>
        ))}
      </ul>
      <Button className="bg-surface" color="default" asChild>
        <Link to="/" className="flex gap-4">
          <Icon iconName="Home" color={'display'} />
          <span className="text-label1 text-typo-display">홈으로 돌아가기</span>
        </Link>
      </Button>
    </div>
  );
}

const ALERT_MESSAGE_LIST = [
  '에매하신 내용은 상단 유저 정보를 통해서 확인 할 수 있습니다.',
  '공연 당일 예매 내역 및 신분증을 지참해주세요.',
  '공연 시작 후에는 입장이 제한 될 수 있습니다.',
];
