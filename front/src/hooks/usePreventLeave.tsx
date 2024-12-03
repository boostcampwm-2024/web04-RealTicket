import { useBeforeUnload, useBlocker } from 'react-router-dom';

export default function usePreventLeave() {
  useBlocker(() => {
    const isConfirm = window.confirm('페이지를 이동하시겠습니까? 이동시 선택한 좌석은 취소됩니다.');
    return !isConfirm;
  });
  useBeforeUnload((event) => {
    event.preventDefault();
    event.returnValue = '';
  });
}
