import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { BASE_URL } from '@/api/axios.ts';
import { getEventDetail } from '@/api/event.ts';

import useSSE from '@/hooks/useSSE.tsx';

import Card from '@/components/common/Card.tsx';
import Icon from '@/components/common/Icon.tsx';
import Progressbar from '@/components/common/Progressbar.tsx';

import LoadingPage from '@/pages/LoadingPage.tsx';

import { getDate, getTime } from '@/utils/date.ts';

import { API, ROUTE_URL } from '@/constants/index.ts';
import type { RePermissionResult } from '@/type/booking.ts';
import type { EventDetail } from '@/type/index.ts';
import { useSuspenseQuery } from '@tanstack/react-query';

/*
이 페이지는 예매 대기 페이지에서 진입된다. 거기에 이벤트 정보가 있다 .
params의 이벤트 재호출 보다는 reactrouter 의 state를 이요하거나, react query의 cache를 이용하자 


편의성을 위해서 캐싱된 데이터 이용 

progressbar를 어떻게 계산?
첫 예상 시간을 받고 
TODO sse 커스텀 훅으로 변경
*/
export default function WaitingQueuePage() {
  const { eventId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { userOrder } = state;
  const myOrder = userOrder;
  const firstWaitingTime = useRef<number | null>(null);
  const { data: event } = useSuspenseQuery<EventDetail>({
    queryKey: ['event', eventId],
    queryFn: getEventDetail(Number(eventId)),
    staleTime: Infinity,
  });
  const { name, place, runningDate, runningTime } = event;

  const { data } = useSSE<RePermissionResult>({
    sseURL: `${BASE_URL}${API.BOOKING.GET_RE_PERMISSION(Number(eventId))}`,
  });

  const totalWaiting = data?.totalWaiting;
  const throughputRate = data?.throughputRate;
  const headOrder = data?.headOrder;
  const restCount = headOrder ? myOrder - headOrder : null;
  const waitingTime = headOrder ? Math.floor(restCount! / (throughputRate! / 1000)) : null;

  useEffect(() => {
    if (!myOrder || !eventId) {
      //TODO toast
      navigate('/', { replace: true });
    }
  }, [myOrder, eventId, navigate]);

  useEffect(() => {
    if (firstWaitingTime.current == null && data) {
      firstWaitingTime.current = waitingTime;
    }
  }, [data, waitingTime]);

  if (!data) return <LoadingPage />;

  const eventInformation = [
    [
      { title: '공연장', content: place.name },
      { title: '관람 시간', content: `${runningTime}분` },
    ],
    [
      { title: '날짜', content: getDate(runningDate) },
      { title: '시간', content: getTime(runningDate) },
    ],
  ];
  const waitingInfo = [
    {
      icon: <Icon iconName="User" color={'primary'} />,
      title: '내 순서',
      content: (
        <span className="text-heading3 text-typo">
          <span className="text-primary">{restCount}</span> 번
        </span>
      ),
    },
    {
      icon: <Icon iconName="Users" color={'warning'} />,
      title: '대기 인원',
      content: (
        <span className="text-heading3 text-typo">
          <span className="text-warning">{totalWaiting}</span> 번
        </span>
      ),
    },
    {
      icon: <Icon iconName="Clock" />,
      title: '예상 대기 시간',
      content: <span className="text-heading3 text-typo">{`${waitingTime} 초`}</span>,
    },
  ];

  const progressValue =
    firstWaitingTime.current == null
      ? 0
      : ((firstWaitingTime.current - waitingTime!) / firstWaitingTime.current!) * 100;

  const canGo = restCount !== null && restCount < 0;

  if (canGo) {
    if (eventId) {
      navigate(ROUTE_URL.EVENT.DETAIL(Number(eventId)), { replace: true });
    }
  }

  return (
    <Card>
      <h2 className="text-heading1 text-typo">{name}</h2>
      <div className="flex justify-between">
        {eventInformation.map((infoList) => (
          <div className="flex max-w-[50%] flex-col gap-4">
            {infoList.map((info) => (
              <span className="w-full truncate text-display1 text-typo hover:text-wrap">{`${info.title} : ${info.content}`}</span>
            ))}
          </div>
        ))}
      </div>
      <Progressbar value={progressValue} />
      <div className="flex justify-between">
        {waitingInfo.map((info) => (
          <div className="flex flex-col items-center gap-4">
            {Object.keys(info).map((key) => {
              if (key === 'title') return <span className="text-heading2 text-typo">{info[key]}</span>;
              return info[key as keyof typeof info];
            })}
          </div>
        ))}
      </div>
      <ul className="flex flex-col gap-2 text-caption1 text-error">
        {ALERT_MESSAGE_LIST.map((message) => (
          <li>{message}</li>
        ))}
      </ul>
    </Card>
  );
}
const ALERT_MESSAGE_LIST = [
  `입장 순서가 되면 자동으로 좌석 선택 페이지로 이동됩니다.`,
  `브라우저를 닫거나 새로고침 하지 마세요. 입장 순서가 늦어질 수 있습니다.`,
];
