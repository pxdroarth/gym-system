import { useEffect, useState } from "react";

// Acompanha uma media query CSS (ex.: "(max-width: 1023px)").
export default function useMediaQuery(query) {
  const getMatch = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(getMatch);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

// Mesmo limite usado no CSS do shell (gaveta abaixo de 1024 px).
export const COMPACT_SHELL_QUERY = "(max-width: 1023px)";
