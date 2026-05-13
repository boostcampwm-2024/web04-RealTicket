import { HttpStatus } from '@nestjs/common';

import { AuthErrorCode } from '../../auth/exception/auth-error-code';
import { BookingErrorCode } from '../../domains/booking/exception/booking-error-code';
import { EventErrorCode } from '../../domains/event/exception/event-error-code';
import { PlaceErrorCode } from '../../domains/place/exception/place-error-code';
import { ProgramErrorCode } from '../../domains/program/exception/program-error-code';
import { ReservationErrorCode } from '../../domains/reservation/exception/reservation-error-code';
import { CommonErrorCode, UserErrorCode } from '../../domains/user/exception/user-error-code';

export const ERROR_STATUS_MAP: Record<string, number> = {
  // AUTH
  [AuthErrorCode.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED,
  [AuthErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [AuthErrorCode.INVALID_CREDENTIALS]: HttpStatus.UNAUTHORIZED,
  [AuthErrorCode.SESSION_EXPIRED]: HttpStatus.UNAUTHORIZED,
  [AuthErrorCode.USER_INFO_FETCH_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [AuthErrorCode.LOGOUT_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [AuthErrorCode.GUEST_CREATE_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [AuthErrorCode.LOGIN_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,

  // BOOKING
  [BookingErrorCode.NOT_OPEN]: HttpStatus.BAD_REQUEST,
  [BookingErrorCode.INVALID_STATE]: HttpStatus.BAD_REQUEST,
  [BookingErrorCode.SESSION_EVENT_NOT_FOUND]: HttpStatus.BAD_REQUEST,
  [BookingErrorCode.SEAT_NOT_FOUND]: HttpStatus.BAD_REQUEST,
  [BookingErrorCode.SEAT_ALREADY_RESERVED]: HttpStatus.CONFLICT,
  [BookingErrorCode.SEAT_ALREADY_CANCELLED]: HttpStatus.CONFLICT,
  [BookingErrorCode.SEAT_SESSION_NOT_FOUND]: HttpStatus.BAD_REQUEST,
  [BookingErrorCode.SEAT_QUOTA_EXCEEDED]: HttpStatus.BAD_REQUEST,
  [BookingErrorCode.SEAT_CANCEL_EMPTY]: HttpStatus.BAD_REQUEST,
  [BookingErrorCode.SEAT_NOT_BOOKED]: HttpStatus.BAD_REQUEST,
  [BookingErrorCode.SEAT_SUBSCRIPTION_NOT_FOUND]: HttpStatus.INTERNAL_SERVER_ERROR,
  [BookingErrorCode.SEAT_UNAUTHORIZED_SECTION]: HttpStatus.FORBIDDEN,

  // EVENT
  [EventErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [EventErrorCode.INVALID_DATE]: HttpStatus.BAD_REQUEST,
  [EventErrorCode.PROGRAM_HAS_EVENTS]: HttpStatus.CONFLICT,

  // PLACE
  [PlaceErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [PlaceErrorCode.SECTION_PLACE_MISMATCH]: HttpStatus.BAD_REQUEST,

  // PROGRAM
  [ProgramErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ProgramErrorCode.HAS_EVENTS]: HttpStatus.CONFLICT,

  // RESERVATION
  [ReservationErrorCode.FORBIDDEN]: HttpStatus.BAD_REQUEST,
  [ReservationErrorCode.NOT_FOUND]: HttpStatus.BAD_REQUEST,
  [ReservationErrorCode.INVALID_SEAT_COUNT]: HttpStatus.BAD_REQUEST,
  [ReservationErrorCode.SESSION_EVENT_NOT_FOUND]: HttpStatus.BAD_REQUEST,
  [ReservationErrorCode.UNBOOKED_SEAT_INCLUDED]: HttpStatus.BAD_REQUEST,
  [ReservationErrorCode.INVALID_INFO]: HttpStatus.BAD_REQUEST,
  [ReservationErrorCode.CREATE_FAILED]: HttpStatus.BAD_REQUEST,
  [ReservationErrorCode.SECTION_NOT_FOUND]: HttpStatus.BAD_REQUEST,
  [ReservationErrorCode.SEAT_OUT_OF_RANGE]: HttpStatus.BAD_REQUEST,

  // USER
  [UserErrorCode.LOGIN_ID_DUPLICATED]: HttpStatus.CONFLICT,
  [UserErrorCode.REGISTER_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [UserErrorCode.GUEST_DELETE_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,

  // COMMON
  [CommonErrorCode.VALIDATION_ERROR]: HttpStatus.BAD_REQUEST,
  [CommonErrorCode.INTERNAL_SERVER_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

export const DEFAULT_MESSAGE_MAP: Record<string, string> = {
  // AUTH
  [AuthErrorCode.UNAUTHORIZED]: '해당 페이지에 접근할 수 없습니다.',
  [AuthErrorCode.FORBIDDEN]: '접근 권한이 없습니다.',
  [AuthErrorCode.INVALID_CREDENTIALS]: '아이디와 비밀번호를 다시 확인해주세요.',
  [AuthErrorCode.SESSION_EXPIRED]: '세션이 만료되었습니다.',
  [AuthErrorCode.USER_INFO_FETCH_FAILED]: '사용자 정보를 불러오는데 실패했습니다.',
  [AuthErrorCode.LOGOUT_FAILED]: '로그아웃에 실패했습니다.',
  [AuthErrorCode.GUEST_CREATE_FAILED]: '게스트 사용자 생성에 실패했습니다.',
  [AuthErrorCode.LOGIN_FAILED]: '로그인 처리 중 서버 오류가 발생했습니다.',

  // BOOKING
  [BookingErrorCode.NOT_OPEN]: '예약이 오픈되지 않았습니다.',
  [BookingErrorCode.INVALID_STATE]: '예매 수량을 설정할 수 없는 상태입니다.',
  [BookingErrorCode.SESSION_EVENT_NOT_FOUND]: '세션의 대상 이벤트를 불러올 수 없습니다.',
  [BookingErrorCode.SEAT_NOT_FOUND]: '좌석이 존재하지 않습니다.',
  [BookingErrorCode.SEAT_ALREADY_RESERVED]: '이미 예약된 좌석입니다.',
  [BookingErrorCode.SEAT_ALREADY_CANCELLED]: '이미 취소된 좌석입니다.',
  [BookingErrorCode.SEAT_SESSION_NOT_FOUND]: '좌석 선택 세션이 존재하지 않습니다.',
  [BookingErrorCode.SEAT_QUOTA_EXCEEDED]: '예약 가능한 좌석 수를 초과했습니다.',
  [BookingErrorCode.SEAT_CANCEL_EMPTY]: '취소할 수 있는 좌석이 없습니다.',
  [BookingErrorCode.SEAT_NOT_BOOKED]: '예약하지 않은 좌석입니다.',
  [BookingErrorCode.SEAT_SUBSCRIPTION_NOT_FOUND]: '해당 이벤트의 좌석 구독이 존재하지 않습니다.',
  [BookingErrorCode.SEAT_UNAUTHORIZED_SECTION]: '구독 중인 섹션과 다른 섹션의 좌석 요청입니다.',

  // EVENT
  [EventErrorCode.NOT_FOUND]: '해당 이벤트가 존재하지 않습니다.',
  [EventErrorCode.INVALID_DATE]: '예약오픈일자 < 예약마감일자 <= 시작날짜 형식이어야 합니다.',
  [EventErrorCode.PROGRAM_HAS_EVENTS]: '해당 프로그램에 대한 이벤트가 존재합니다.',

  // PLACE
  [PlaceErrorCode.NOT_FOUND]: '해당 장소가 존재하지 않습니다.',
  [PlaceErrorCode.SECTION_PLACE_MISMATCH]: '섹션은 모두 동일한 place에 삽입해야 합니다.',

  // PROGRAM
  [ProgramErrorCode.NOT_FOUND]: '해당 프로그램이 존재하지 않습니다.',
  [ProgramErrorCode.HAS_EVENTS]: '해당 프로그램에 대한 이벤트가 존재합니다.',

  // RESERVATION
  [ReservationErrorCode.FORBIDDEN]: '해당 예매에 대한 권한이 없습니다.',
  [ReservationErrorCode.NOT_FOUND]: '해당 예매 내역이 존재하지 않습니다.',
  [ReservationErrorCode.INVALID_SEAT_COUNT]: '예매 가능한 좌석 수는 1~4개 입니다.',
  [ReservationErrorCode.SESSION_EVENT_NOT_FOUND]: '예약 확정하려는 세션의 대상 이벤트를 불러올 수 없습니다.',
  [ReservationErrorCode.UNBOOKED_SEAT_INCLUDED]: '선점하지 않은 좌석이 포함되어 있습니다.',
  [ReservationErrorCode.INVALID_INFO]: '예매 정보 또는 설정한 좌석수가 올바르지 않습니다.',
  [ReservationErrorCode.CREATE_FAILED]: '예매에 실패했습니다.',
  [ReservationErrorCode.SECTION_NOT_FOUND]: '해당 section이 존재하지 않습니다.',
  [ReservationErrorCode.SEAT_OUT_OF_RANGE]: '해당 section의 seat이 존재하지 않습니다.',

  // USER
  [UserErrorCode.LOGIN_ID_DUPLICATED]: '이미 존재하는 아이디입니다.',
  [UserErrorCode.REGISTER_FAILED]: '회원가입에 실패했습니다.',
  [UserErrorCode.GUEST_DELETE_FAILED]: '게스트 삭제에 실패했습니다.',

  // COMMON
  [CommonErrorCode.VALIDATION_ERROR]: '요청 값이 올바르지 않습니다.',
  [CommonErrorCode.INTERNAL_SERVER_ERROR]: '서버 오류가 발생했습니다.',
};
