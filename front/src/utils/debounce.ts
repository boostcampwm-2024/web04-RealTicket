const setDebounce = (delayTime: number) => {
  let timer: null | number = null;

  return (callback: () => void) => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(callback, delayTime * 1000);
  };
};

export const changeSeatCountDebounce = setDebounce(3);
