import { MouseEvent, ReactElement, ReactNode, createContext, useContext, useId, useState } from 'react';
import { createPortal } from 'react-dom';

interface IPopoverContextValue {
  isOpen: boolean;
  closePopover: () => void;
  openPopover: () => void;
  togglePopover: () => void;
  popoverId: string | null;
}
interface IRootProps {
  children: ReactNode;
}

const POPOVER_CONTEXT_DEFAULT_VALUE = {
  isOpen: false,
  closePopover: () => {},
  openPopover: () => {},
  togglePopover: () => {},
  popoverId: null,
};
const PopoverContext = createContext<IPopoverContextValue>(POPOVER_CONTEXT_DEFAULT_VALUE);
const usePopoverContext = () => useContext(PopoverContext);
const Root = ({ children }: IRootProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverId = useId();
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
    <PopoverContext.Provider value={{ isOpen, openPopover, closePopover, togglePopover, popoverId }}>
      {children}
    </PopoverContext.Provider>
  );
};
interface ITriggerProps {
  render: (togglePopover: () => void) => ReactElement;
}
const Trigger = ({ render }: ITriggerProps) => {
  const { togglePopover, popoverId } = usePopoverContext();
  return (
    <>
      {render(togglePopover)}
      <div className="relative" id={popoverId!}></div>
    </>
  );
};
interface IOverlayProps {
  children: ReactNode;
}
const Overlay = ({ children }: IOverlayProps) => {
  const { isOpen, closePopover } = usePopoverContext();
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains('overlay')) {
      closePopover();
    }
  };
  return (
    <>
      {isOpen && (
        <div className="overlay fixed h-full w-full" onClick={handleClick}>
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
  const { popoverId } = usePopoverContext();
  console.log(popoverId);
  const $portalElement = document.getElementById(popoverId!);
  return <>{$portalElement && createPortal(children, $portalElement)}</>;
};

const Popover = { Root, Overlay, Trigger, Content };
export default Popover;
