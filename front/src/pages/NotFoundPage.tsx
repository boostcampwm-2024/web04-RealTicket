import { Link } from 'react-router-dom';

import Button from '@/components/common/Button.tsx';
import Icon from '@/components/common/Icon.tsx';

export default function NotFondPage() {
  return (
    <div className="flex h-[100vh] w-full items-center justify-center">
      <div className="flex w-[420px] flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-8">
          <Icon iconName="FileX" color={'warning'} className="h-32 w-32" />
          <h2 className="text-heading1 text-typo">Not Found</h2>
          <span className="text-display1 text-typo">페이지를 찾을 수 없습니다.</span>
        </div>
        <Button asChild>
          <Link to="/">
            <Icon iconName="Home" color={'display'} />
            <span className="text-label1 text-typo-display">홈으로 돌아가기</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
