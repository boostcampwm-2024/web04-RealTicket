import Icon from '@/components/common/Icon.tsx';

export default function LoadingPage() {
  return (
    <div className="flex w-[420px] flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-8">
        <Icon iconName="Loading" color={'primary'} className="h-32 w-32 animate-spin" />
        <h2 className="text-heading1 text-typo">Loading.....</h2>
      </div>
    </div>
  );
}
