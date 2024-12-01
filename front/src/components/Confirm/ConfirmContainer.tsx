import useConfirm from '@/hooks/useConfirm.tsx';

import Button from '@/components/common/Button.tsx';

export default function ConfirmContainer() {
  const { confirmValue } = useConfirm();
  if (confirmValue == null) {
    return null;
  }

  return (
    <div className="fixed left-0 top-0 flex h-full w-full items-center justify-center bg-surface/30">
      <div className="flex min-w-[240px] max-w-[480px] flex-col gap-4 rounded-xl border bg-surface-card px-6 py-3">
        <div>
          <h1 className="text-heading2">{confirmValue.title}</h1>
          <span className="text-display1">{confirmValue.description}</span>
        </div>
        <div className="ml-auto flex gap-4">
          {confirmValue.cancel && (
            <Button size={'middle'} intent={'outline'} onClick={confirmValue.cancel.handleClick}>
              <span className="text-label1 text-typo">{confirmValue.cancel.text}</span>
            </Button>
          )}
          <Button size={'middle'} color={confirmValue.ok.color} onClick={confirmValue.ok.handleClick}>
            <span className="text-label1 text-typo-display">{confirmValue.ok.text}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
