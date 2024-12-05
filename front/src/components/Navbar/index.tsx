import { Link, useNavigate } from 'react-router-dom';

import { CustomError } from '@/api/axios.ts';
import { deleteReservation, getReservation } from '@/api/reservation.ts';
import { getGuestLogin, postLogout } from '@/api/user.ts';

import { useAuthContext } from '@/hooks/useAuthContext.tsx';
import useConfirm from '@/hooks/useConfirm.tsx';

import ReservationCard from '@/components/Navbar/ReservationCard.tsx';
import { toast } from '@/components/Toast/index.ts';
import Button from '@/components/common/Button';
import Icon from '@/components/common/Icon';
import Popover from '@/components/common/Popover';
import Separator from '@/components/common/Separator.tsx';

import type { Reservation } from '@/type/reservation.ts';
import type { Guest } from '@/type/user.ts';
import {
  useIsFetching,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { AxiosResponse } from 'axios';
import { cx } from 'class-variance-authority';

const POPOVER_WIDTH = 460;

const RESERVATION_DELETE_MUTATION_KEY = ['reservation'];
const GUEST_LOGIN_QUERY_KEY = ['guest'];

export default function Navbar() {
  const { isLogin, userId, logout, login } = useAuthContext();
  const isGuestLoginPending = !!useIsFetching({ queryKey: GUEST_LOGIN_QUERY_KEY });
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: reservations } = useQuery<Reservation[], CustomError>({
    queryKey: [`reservation`],
    queryFn: getReservation,
    enabled: isLogin,
    staleTime: Infinity,
  });
  const sliced = userId?.slice(0, 12);

  const { mutate: requestDeleteReservation } = useMutation<AxiosResponse, CustomError, number>({
    mutationKey: RESERVATION_DELETE_MUTATION_KEY,
    mutationFn: deleteReservation,
    onSuccess: () => {
      toast.warning('예매내역이 삭제되었습니다.');
      return queryClient.refetchQueries({ queryKey: ['reservation'] });
    },
    onError: (error) => {
      //TODO 예외 관리 필요
      if (error.status === 500 || error.status === 401 || error.status === 403) return;
      toast.error('예매내역 삭제에 실패했습니다.\n 잠시 후 다시 시도해주세요');
    },
  });

  const loginAsGuest = async () => {
    const isConfirm = await confirm({
      title: '게스트로 입장하기',
      description: '게스트 계정은 로그아웃하시면 다시 사용 할 수 없습니다.\n 그래도 입장하시겠습니까?',
      buttons: {
        ok: {
          title: '확인',
          color: 'success',
        },
        cancel: {
          title: '취소',
        },
      },
    });
    if (isConfirm) {
      await queryClient
        .fetchQuery<Guest>({
          queryKey: GUEST_LOGIN_QUERY_KEY,
          queryFn: getGuestLogin,
        })
        .then((data) => {
          const sliced = data.loginId.slice(0, 12);
          if (login) {
            login(sliced);
            toast.success('guest로 로그인 되었습니다');
          }
        })
        .catch(() => {
          toast.error('로그인에 실패했습니다\n잠시 후 다시 시도해주세요.');
        });
      return;
    }
  };

  const deletingReservationIdList = useMutationState({
    filters: { mutationKey: RESERVATION_DELETE_MUTATION_KEY, status: 'pending' },
    select: (mutation) => mutation.state.variables,
  });

  const { mutate: requestLogout } = useMutation({
    mutationFn: postLogout,
    onSuccess: () => {
      if (logout) {
        logout();
        toast.warning('로그아웃 되었습니다');
        navigate('/', { replace: true });
      }
    },
  });

  const handleLogOut = () => {
    requestLogout();
  };

  const isReservation = reservations && reservations.length > 0;
  const widthClass = `w-[${POPOVER_WIDTH}px]`;
  return (
    <header className="flex w-full justify-between bg-white px-8 py-4">
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
                <span className="text-label2 text-typo">{`${sliced} 님`}</span>
                <Icon iconName="DownArrow" />
              </Button>
            )}
          />
          <Popover.Overlay>
            <Popover.Content>
              <div
                className={cx(
                  widthClass,
                  `flex max-h-[80vh] min-h-[300px] flex-col gap-6 rounded-xl border bg-white p-6 shadow-2xl`,
                )}>
                <h3 className="px-4 text-left text-heading3">예매 현황</h3>
                <Separator direction="row" />
                <div className="flex max-h-[800px] flex-grow flex-col gap-6 overflow-y-scroll pr-4">
                  {isReservation ? (
                    reservations.map((reservation) => (
                      <ReservationCard
                        key={reservation.id}
                        {...reservation}
                        isDeleting={deletingReservationIdList.includes(reservation.id)}
                        handleDeleteReservation={() => requestDeleteReservation(reservation.id)}
                      />
                    ))
                  ) : (
                    <div className="m-auto w-full text-heading2 text-typo-sub">
                      현재 예매된 내역이 없습니다.{' '}
                    </div>
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
          <Button
            size={'middle'}
            color={'primary'}
            intent={'outline'}
            onClick={loginAsGuest}
            disabled={isGuestLoginPending}>
            {isGuestLoginPending ? (
              <>
                <Icon iconName="Loading" className="animate-spin" />
                <span className="f text-label2 text-typo-disable">로그인중..</span>
              </>
            ) : (
              <span className="text-label2 text-primary">게스트로 입장하기</span>
            )}
          </Button>
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
