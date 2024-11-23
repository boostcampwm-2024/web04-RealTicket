import { Link } from 'react-router-dom';

import { CustomError } from '@/api/axios.ts';
import { deleteReservation, getReservation } from '@/api/reservation.ts';
import { postLogout } from '@/api/user.ts';

import { useAuthContext } from '@/hooks/useAuthContext.tsx';

import Button from '@/components/common/Button';
import Icon from '@/components/common/Icon';
import Popover from '@/components/common/Popover';
import Separator from '@/components/common/Separator.tsx';

import { getDate, getTime } from '@/utils/date';

import type { Reservation } from '@/type/reservation.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cx } from 'class-variance-authority';

const POPOVER_WIDTH = 400;

//TODO url 상수화, 자동로그인 추가, 삭제 중인 카드 로딩 초링
export default function Navbar() {
  const { isLogin, userId, logout } = useAuthContext();
  const queryClient = useQueryClient();
  const { data: reservations } = useQuery<Reservation[], CustomError>({
    queryKey: [`reservation`],
    queryFn: getReservation,
    enabled: isLogin,
    staleTime: Infinity,
  });
  const { mutate: requestDeleteReservation } = useMutation({
    mutationFn: deleteReservation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation'] });
    },
  });

  const { mutate: requestLogout } = useMutation({
    mutationFn: postLogout,
    onError: () => {},
    onSuccess: () => {
      if (logout) logout();
    },
  });

  const handleLogOut = () => {
    requestLogout();
  };
  //TODO 예약 내역
  const isReservation = reservations && reservations.length > 0;
  return (
    <header className="flex w-full justify-between px-8 py-4">
      <Link to="/" className="flex items-center gap-5">
        <Icon iconName="Tickets" size={'big'} color={'primary'} />
        <span className="text-heading1 text-primary">RealTicket</span>
      </Link>
      {isLogin ? (
        <Popover.Root>
          <Popover.Trigger
            render={(togglePopover, triggerRef) => (
              <Button size="middle" intent={'ghost'} onClick={togglePopover} ref={triggerRef}>
                <Icon iconName="User" />
                <span className="text-label2 text-typo">{userId}</span>
                <Icon iconName="DownArrow" />
              </Button>
            )}
          />
          <Popover.Overlay>
            <Popover.Content>
              <div
                className={cx(
                  `w-[${POPOVER_WIDTH}px]`,
                  `flex flex-col gap-6 rounded-xl border bg-white p-6 shadow-2xl`,
                )}>
                <h3 className="px-4 text-left text-heading3">예매 현황</h3>
                <Separator direction="row" />
                <div className="flex flex-col gap-6">
                  {isReservation ? (
                    reservations.map((reservation) => (
                      <ReservationCard
                        {...reservation}
                        handleDeleteReservation={() => requestDeleteReservation(reservation.id)}
                      />
                    ))
                  ) : (
                    <div className="w-full text-heading2 text-typo-sub">현재 예매된 내역이 없습니다. </div>
                  )}
                </div>
                <Separator direction="row" />
                <Button intent="ghost" size="middle" onClick={handleLogOut}>
                  <Icon iconName="LogOut" color="error" />
                  <span className="text-label1 text-error">로그아웃</span>
                </Button>
              </div>
            </Popover.Content>
          </Popover.Overlay>
        </Popover.Root>
      ) : (
        <nav className="flex gap-4">
          <Button intent={'outline'} color={'primary'} size={'middle'} asChild>
            <Link to={'/signUp'}>
              <span className="text-label2 text-primary">회원가입</span>
            </Link>
          </Button>
          <Button color={'primary'} size={'middle'} asChild>
            <Link to="/login">
              <span className="text-label2 text-typo-display">로그인</span>
            </Link>
          </Button>
        </nav>
      )}
    </header>
  );
}

interface ReservationCardProps extends Reservation {
  handleDeleteReservation: () => void;
}

function ReservationCard({
  programName,
  runningDate,
  placeName,
  seats,
  handleDeleteReservation,
}: ReservationCardProps) {
  return (
    <div className="relative w-full rounded-xl border border-surface-cardBorder bg-surface-card p-6">
      <div className="flex max-w-[calc(100%-64px)] flex-col gap-6 text-left">
        <h3 className="truncate text-display1">{programName}</h3>
        <div className="">
          <div className="truncate text-display1">
            {getDate(Number(runningDate)) + getTime(Number(runningDate))}
          </div>
          <div className="truncate text-display1 hover:overflow-visible hover:text-clip">{`공연장 : ${placeName}`}</div>
        </div>
        <div>
          <span className="truncate text-display1">좌석</span>
          <ul>
            {seats.map((seat) => (
              <li>{seat}</li>
            ))}
          </ul>
        </div>
      </div>
      <Button
        className="absolute right-0 top-0 mr-6 mt-6"
        intent={'outline'}
        size={'fit'}
        color={'error'}
        onClick={handleDeleteReservation}>
        <Icon iconName="Trash" color={'error'} />
      </Button>
    </div>
  );
}
