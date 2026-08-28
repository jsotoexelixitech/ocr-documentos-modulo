import { useEffect, useState } from 'react';

/** true cuando el módulo corre embebido (p. ej. QASys2000 → iframe OCR). */
export function useInIframe(): boolean {
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    try {
      setInIframe(window.self !== window.top);
    } catch {
      setInIframe(true);
    }
  }, []);

  return inIframe;
}
