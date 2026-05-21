import { useEffect, useRef, useState, useCallback } from "react";

export function useOtpCountdown(initialSeconds = 30) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const timerRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback((s = initialSeconds) => {
    stop();
    setSeconds(s);
    timerRef.current = window.setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          stop();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [initialSeconds, stop]);

  useEffect(() => {
    start(initialSeconds);
    return stop;
  }, [start, stop, initialSeconds]);

  return { seconds, restart: start, stop, canResend: seconds === 0 };
}
