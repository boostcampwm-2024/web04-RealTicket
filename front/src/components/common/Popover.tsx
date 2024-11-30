import {
  MouseEvent,
  MutableRefObject,
  ReactElement,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

interface IPopoverContextValue {
  isOpen: boolean;
  closePopover: () => void;
  openPopover: () => void;
  togglePopover: () => void;

  triggerRef: null | MutableRefObject<HTMLButtonElement | null>;
}
interface IRootProps {
  children: ReactNode;
}

const POPOVER_CONTEXT_DEFAULT_VALUE = {
  isOpen: false,
  closePopover: () => {},
  openPopover: () => {},
  togglePopover: () => {},

  triggerRef: null,
};
const PopoverContext = createContext<IPopoverContextValue>(POPOVER_CONTEXT_DEFAULT_VALUE);
const usePopoverContext = () => useContext(PopoverContext);
const Root = ({ children }: IRootProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);

  const openPopover = () => {
    setIsOpen(true);
  };
  const closePopover = () => {
    setIsOpen(false);
  };
  const togglePopover = () => {
    setIsOpen((prev) => !prev);
  };
  return (
    <PopoverContext.Provider value={{ isOpen, openPopover, closePopover, togglePopover, triggerRef }}>
      {children}
    </PopoverContext.Provider>
  );
};
interface ITriggerProps {
  render: (togglePopover: () => void, ref: MutableRefObject<HTMLButtonElement>) => ReactElement;
}
const Trigger = ({ render }: ITriggerProps) => {
  const { togglePopover, triggerRef } = usePopoverContext();
  return <>{render(togglePopover, triggerRef as MutableRefObject<HTMLButtonElement>)}</>;
};
interface IOverlayProps {
  children: ReactNode;
}
const Overlay = ({ children }: IOverlayProps) => {
  const { isOpen, closePopover } = usePopoverContext();
  const overlayRef = useRef(null);
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const isOverlay = overlayRef && overlayRef.current;
    const isEqual = isOverlay && target === overlayRef.current;
    if (isEqual) {
      closePopover();
    }
  };
  return (
    <>
      {isOpen && (
        <div ref={overlayRef} className="fixed h-full w-full" onClick={handleClick}>
          {children}
        </div>
      )}
    </>
  );
};
interface IContent {
  children: ReactNode;
}
const Content = ({ children }: IContent) => {
  const { isOpen, triggerRef } = usePopoverContext();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const hasButtonRef = triggerRef && triggerRef.current;
  const canOpen = isOpen && hasButtonRef;
  //TODO 타입 정리필요, 상수 정리
  const updatePosition = useCallback(() => {
    if (triggerRef && triggerRef.current) {
      const trigger = triggerRef.current!;
      const { top, height } = trigger.getBoundingClientRect();
      setPosition({ x: top, y: height });
    }
  }, [triggerRef]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('scroll', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition);
    };
  }, [isOpen, updatePosition]);

  return (
    <>
      {canOpen &&
        createPortal(
          <div
            className="fixed z-10 cursor-default"
            style={{
              top: position.x + position.y + 24,
              right: 32,
            }}>
            {children}
          </div>,
          document.body,
        )}
    </>
  );
};

const Popover = { Root, Overlay, Trigger, Content };
export default Popover;
