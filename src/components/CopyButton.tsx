"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The Clipboard API needs a focused, secure context. Fall back to a hidden
 * textarea when it is unavailable, and report whether the write landed.
 */
export async function writeToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = value;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, value.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    } finally {
      document.body.removeChild(el);
    }
    return ok;
  }
}

/**
 * Copies a value to the clipboard. Store account names get pasted into the
 * Play Console and App Store Connect constantly, so they are worth one click.
 */
export function CopyButton({
  value,
  label = "Copy",
  className = "",
  tone = "light",
}: {
  value: string;
  label?: string;
  className?: string;
  tone?: "light" | "dark";
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copied = state === "copied";

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    // Only claim success if the write actually landed.
    setState((await writeToClipboard(value)) ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={
        state === "copied"
          ? "Copied"
          : state === "failed"
            ? "Could not copy — select the text and copy manually"
            : `${label} — ${value}`
      }
      aria-label={state === "copied" ? "Copied" : label}
      className={`inline-flex shrink-0 items-center gap-1 rounded p-1 align-middle
                  transition-colors ${
                    state === "copied"
                      ? "text-good"
                      : state === "failed"
                        ? "text-bad"
                        : tone === "dark"
                          ? "text-muted-foreground/80 hover:bg-neutral-800 hover:text-neutral-100"
                          : "text-muted-foreground/80 hover:bg-muted hover:text-foreground"
                  } ${className}`}
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="m5 13 4 4L19 7"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect
            x="9" y="9" width="11" height="11" rx="2"
            stroke="currentColor" strokeWidth="2"
          />
          <path
            d="M5 15V5a2 2 0 0 1 2-2h10"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          />
        </svg>
      )}
      {state !== "idle" && (
        <span className="text-[12px] font-medium">
          {state === "copied" ? "Copied" : "Failed"}
        </span>
      )}
    </button>
  );
}
