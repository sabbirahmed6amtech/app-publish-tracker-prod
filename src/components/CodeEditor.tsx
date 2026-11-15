"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/CopyButton";

/**
 * A plain textarea dressed as an editor: monospace, dark, line numbers, and
 * Tab indents instead of leaving the field. It grows with its content rather
 * than scrolling. Submits under `name` like any input.
 */
export function CodeEditor({
  id,
  name,
  defaultValue = "",
  placeholder,
  rows = 6,
  readOnly = false,
  onValueChange,
}: {
  id?: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  readOnly?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const [value, setRawValue] = useState(defaultValue);
  const setValue = (next: string) => {
    setRawValue(next);
    onValueChange?.(next);
  };
  const lines = Math.max(value.split("\n").length, rows);
  const area = useRef<HTMLTextAreaElement>(null);

  // Long lines wrap, so the line count alone undersizes the box — size it to
  // the rendered text instead, and again whenever its width changes.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab" || e.shiftKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = value.slice(0, start) + "  " + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
  }

  return (
    <div className="relative flex rounded-md border border-neutral-800 bg-neutral-900 font-mono text-[12px] leading-5 focus-within:border-neutral-500 focus-within:ring-2 focus-within:ring-neutral-500/40">
      <div
        aria-hidden
        className="select-none rounded-l-md border-r border-neutral-800 bg-neutral-950/60 px-2 py-2 text-right text-neutral-500"
      >
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={area}
        id={id}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={readOnly ? undefined : onKeyDown}
        readOnly={readOnly}
        rows={lines}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        placeholder={placeholder}
        className="block w-full resize-none overflow-hidden whitespace-pre-wrap break-all bg-transparent py-2 pl-3 pr-10 text-emerald-200 caret-white outline-none placeholder:text-neutral-600"
      />
      <CopyButton
        value={value}
        label="Copy JKS details"
        tone="dark"
        className="absolute right-1.5 top-1.5"
      />
    </div>
  );
}
