import {
  MouseEvent,
  MutableRefObject,
  ReactElement,
  ReactNode,
  createContext,
  useContext,
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
  const hasButtonRef = triggerRef && triggerRef.current;
  const canOpen = isOpen && hasButtonRef;
  return (
    <>
      {canOpen &&
        createPortal(
          <div className="absolute right-0 top-full z-[999] mt-4 cursor-default">{children}</div>,
          triggerRef.current!,
        )}
    </>
  );
};

const Popover = { Root, Overlay, Trigger, Content };
export default Popover;
