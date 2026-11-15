import { useState } from 'preact/hooks';

export function Favicon({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed || !/^https?:/.test(src)) return <span class="favicon" />;
  return <img class="favicon" src={src} alt="" onError={() => setFailed(true)} />;
}
