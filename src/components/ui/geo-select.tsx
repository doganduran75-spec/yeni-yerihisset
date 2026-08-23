"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GeoSelectProps {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function GeoSelect({
  options,
  value,
  onChange,
  placeholder = "Seçiniz...",
  disabled,
  className,
}: GeoSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ignoreBlur = useRef(false);

  /** Türkçe karakter normalizasyonu ile arama */
  function norm(str: string) {
    return str
      .toLocaleLowerCase("tr")
      .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
      .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c");
  }

  const filtered = query.trim()
    ? options.filter((o) => norm(o).includes(norm(query)))
    : options;

  /** Input değeri: arama modunda query, kapalıyken seçili değer */
  const inputValue = open ? query : value;

  function openDropdown() {
    if (disabled) return;
    setQuery("");
    setOpen(true);
  }

  function closeDropdown() {
    setOpen(false);
    setQuery("");
  }

  function handleSelect(option: string) {
    ignoreBlur.current = true;
    onChange(option);
    closeDropdown();
    // blur'u ignore ettikten sonra sıfırla
    requestAnimationFrame(() => { ignoreBlur.current = false; });
  }

  function handleClear(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    ignoreBlur.current = true;
    onChange("");
    closeDropdown();
    inputRef.current?.focus();
    requestAnimationFrame(() => { ignoreBlur.current = false; });
  }

  function handleInputFocus() {
    if (!disabled) openDropdown();
  }

  function handleInputBlur() {
    if (ignoreBlur.current) return;
    closeDropdown();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    if (!open) setOpen(true);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      closeDropdown();
      inputRef.current?.blur();
    }
    if (e.key === "Tab") {
      // Tab'a basınca dropdown kapanır, focus doğal olarak ilerler
      closeDropdown();
    }
    if (e.key === "Enter") {
      if (filtered.length === 1) {
        e.preventDefault();
        handleSelect(filtered[0]);
      }
    }
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Trigger + input container */}
      <div
        onClick={() => { if (!disabled) inputRef.current?.focus(); }}
        className={cn(
          "flex items-center h-12 w-full rounded-xl border border-input bg-white px-3 gap-2 cursor-pointer select-none transition-colors",
          open && "ring-2 ring-ring/20 border-ring",
          disabled && "opacity-50 pointer-events-none bg-muted cursor-not-allowed",
        )}
      >
        <input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          readOnly={!open}
          disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          className={cn(
            "flex-1 bg-transparent outline-none text-sm min-w-0 cursor-pointer",
            open ? "text-foreground placeholder:text-[#b2b5a8] cursor-text" : (value ? "text-foreground" : "text-[#b2b5a8]"),
          )}
        />

        {value && !open ? (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={handleClear}
            className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronDown
            size={15}
            className={cn("shrink-0 text-slate-400 transition-transform duration-150 pointer-events-none", open && "rotate-180")}
          />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-center text-slate-400">Sonuç bulunamadı</div>
          ) : (
            <div className="max-h-52 overflow-y-auto overscroll-contain">
              {filtered.map((option) => (
                <button
                  key={option}
                  type="button"
                  tabIndex={-1}
                  role="option"
                  aria-selected={option === value}
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(option); }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-muted",
                    option === value && "bg-primary/5 text-primary font-semibold",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
