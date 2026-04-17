import React, { useEffect, useRef, useState } from "react";

/**
 * SearchableSelect (headless, zero-dependency)
 * Props:
 * - value: { value:any, label:string, meta?:any } | null
 * - onChange: (opt|null) => void
 * - placeholder?: string
 * - disabled?: boolean
 * - fetchOptions: async (query:string) => Promise<Array<{value,label,meta?}>>
 * - noResultsText?: string
 * - debounceMs?: number
 */
export default function SearchableSelect({
  value,
  onChange,
  placeholder = "Pesquisar...",
  disabled = false,
  fetchOptions,
  noResultsText = "Sem resultados",
  debounceMs = 250,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    const id = setTimeout(async () => {
      if (!fetchOptions) return;
      setLoading(true);
      try {
        const opts = await fetchOptions(query || "");
        if (active) setOptions(opts || []);
      } finally {
        if (active) setLoading(false);
      }
    }, debounceMs);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [query, fetchOptions, debounceMs]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  function onKeyDown(e) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && options[highlightIndex]) {
        onChange(options[highlightIndex]);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        className={`w-full text-left px-3 py-2 rounded border bg-white disabled:bg-gray-100 ${
          open ? "ring-2 ring-indigo-500 border-indigo-500" : "border-gray-300"
        }`}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        {value ? <span className="truncate">{value.label}</span> : <span className="text-gray-500">{placeholder}</span>}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg">
          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="w-full px-3 py-2 border rounded outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="max-h-64 overflow-auto divide-y divide-gray-100" onKeyDown={onKeyDown} tabIndex={-1}>
            {loading ? (
              <div className="p-3 text-sm text-gray-500">Carregando...</div>
            ) : options.length === 0 ? (
              <div className="p-3 text-sm text-gray-500">{noResultsText}</div>
            ) : (
              options.map((opt, idx) => (
                <button
                  key={`${opt.value}-${idx}`}
                  type="button"
                  className={
                    "w-full text-left px-3 py-2 hover:bg-gray-50 focus:bg-gray-50 " +
                    (idx === highlightIndex ? "bg-gray-50" : "")
                  }
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                >
                  <div className="font-medium">{opt.label}</div>
                  {opt.meta ? <div className="text-xs text-gray-500">{opt.meta}</div> : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
