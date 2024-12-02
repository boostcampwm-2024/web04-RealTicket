import { useContext } from 'react';

import { ConfirmContext } from '@/providers/ConfirmProvider.tsx';

interface ConfirmProps {
  title: string;
  description: string;
  buttons: {
    ok: {
      title: string;
      color: 'error' | 'success' | 'primary';
    };
    cancel: {
      title: string;
    };
  };
}
export default function useConfirm() {
  const confirmContext = useContext(ConfirmContext);

  if (confirmContext === null) throw Error('ConfirmContext는 ConfirmProvider내에서 사용가능합니다. ');

  const { confirmValue, setConfirm, clearConfirm } = confirmContext;

  const confirm = ({ title, description, buttons }: ConfirmProps) => {
    const promise = new Promise((resolve) => {
      setConfirm({
        title,
        description,
        ok: {
          text: buttons.ok.title,
          color: buttons.ok.color,
          handleClick: () => resolve(true),
        },
        cancel: {
          text: buttons.cancel.title,
          handleClick: () => resolve(false),
        },
      });
    }).finally(() => {
      clearConfirm();
    });

    return promise;
  };

  return { confirmValue, confirm };
}
