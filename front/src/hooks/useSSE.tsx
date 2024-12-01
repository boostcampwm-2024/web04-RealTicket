import { useEffect, useRef, useState } from 'react';

interface useSSEProps {
  sseURL: string;
}
//에러 핸들링 필요, axios 레벨에서 가능?
export default function useSSE<T>({ sseURL }: useSSEProps) {
  const eventSourceRef = useRef<EventSource | null>(null);

  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    if (eventSourceRef.current === null) {
      eventSourceRef.current = new EventSource(`${sseURL}`, {
        withCredentials: true,
      });
      eventSourceRef.current.onmessage = (event) => {
        const parsed = JSON.parse(event.data);

        if (parsed) {
          setData(() => parsed);
        }
      };
    }
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [sseURL]);

  const isLoading = data === null ? true : false;
  return { data, isLoading } as { data: T | null; isLoading: boolean };
}
