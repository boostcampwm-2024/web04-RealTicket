import { Link } from 'react-router-dom';

// import { useAuthContext } from '@/hooks/useAuthContext.tsx';
import Button from '@/components/common/Button.tsx';
import Icon from '@/components/common/Icon.tsx';

export default function Navbar() {
  // const { isSignIn } = useAuthContext();
  const isSignIn = true;
  const userId = 'test112';
  return (
    <header className="flex w-full justify-between px-8 py-4">
      <Link to="/" className="flex items-center gap-5">
        <Icon iconName="Tickets" size={'big'} color={'primary'} />
        <span className="text-heading1 text-primary">RealTicket</span>
      </Link>
      {isSignIn ? (
        <Button size="middle" intent={'ghost'}>
          <Icon iconName="User" />
          <span className="text-label2 text-typo">{userId}</span>
          <Icon iconName="DownArrow" />
        </Button>
      ) : (
        <nav className="flex gap-4">
          <Button intent={'outline'} color={'primary'} size={'middle'} asChild>
            <Link to={'/signUp'}>
              <span className="text-label2 text-primary">회원가입</span>
            </Link>
          </Button>
          <Button color={'primary'} size={'middle'} asChild>
            <Link to="/signIn">
              <span className="text-label2 text-typo-display">로그인</span>
            </Link>
          </Button>
        </nav>
      )}
    </header>
  );
}
