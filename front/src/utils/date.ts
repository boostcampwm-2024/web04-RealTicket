export const getDate = (ms: number | Date | string) => {
  //TODO 에러 처리 필요
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}년 ${month}월 ${day}일 `;
};

export const getTime = (ms: number | Date | string) => {
  const date = new Date(ms);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
export const getDay = (ms: number | Date | string) => {
  const date = new Date(ms);
  const dayIndex = date.getDay();
  return `${DAYS[dayIndex]}`;
};
