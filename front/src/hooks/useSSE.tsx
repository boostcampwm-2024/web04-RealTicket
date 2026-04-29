import { useEffect, useRef, useState } from 'react';

interface useSSEProps<T> {
  sseURL: string;
  onMessage?: (data: T) => void;
}
//에러 핸들링 필요, axios 레벨에서 가능?
export default function useSSE<T>({ sseURL, onMessage }: useSSEProps<T>) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const onMessageRef = useRef<typeof onMessage>(onMessage);
  onMessageRef.current = onMessage;

  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    setData(null);

    const eventSource = new EventSource(`${sseURL}`, {
      withCredentials: true,
    });
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      if (eventSourceRef.current !== eventSource) return;

      const parsed = JSON.parse(event.data);

      if (parsed) {
        onMessageRef.current?.(parsed);
        setData(() => parsed);
      }
    };

    return () => {
      eventSource.close();
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null;
      }
    };
  }, [sseURL]);

  const isLoading = data === null ? true : false;
  return { data, isLoading } as { data: T | null; isLoading: boolean };
}
