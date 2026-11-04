import {useEffect, useState} from 'react';

export function useCompactLayout() {
  const read = () => ({compact: matchMedia('(max-width: 900px), (max-height: 500px), (pointer: coarse)').matches,
    landscape: matchMedia('(orientation: landscape) and (max-height: 500px)').matches,
    pageSize: innerHeight < 700 ? 2 : 3,
    keyboard: document.activeElement instanceof HTMLTextAreaElement && (window.visualViewport?.height ?? innerHeight) < screen.height * .65});
  const [layout, setLayout] = useState(read);
  useEffect(() => {
    const update = () => setLayout(read());
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {window.removeEventListener('resize', update);window.visualViewport?.removeEventListener('resize', update);document.removeEventListener('focusin', update);document.removeEventListener('focusout', update);};
  }, []);
  return layout;
}
