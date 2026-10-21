import { useEffect, useState } from "react";

// A temporary address the browser can show a chosen file from, released when it is no longer shown.
export function useObjectUrl(file: File): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    // The URL comes from the browser's registry of object URLs, an external system, so it can only
    // be created here. (Making it during render would leak one per StrictMode render.)
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}
