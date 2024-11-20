interface IReservationResultProps {
  reservationResult: string[];
}
export default function ReservationResult({ reservationResult }: IReservationResultProps) {
  return (
    <div>
      result
      <div>{reservationResult.map((reservation) => `${reservation} 예약됨`)}</div>
    </div>
  );
}
