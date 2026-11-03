"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Literal classes, so Tailwind can see them.
const WIDTHS: Record<string, string> = {
  "max-w-md": "sm:max-w-md",
  "max-w-lg": "sm:max-w-lg",
  "max-w-xl": "sm:max-w-xl",
  "max-w-2xl": "sm:max-w-2xl",
  "max-w-3xl": "sm:max-w-3xl",
  "max-w-4xl": "sm:max-w-4xl",
  // Wide, like the Publish popup.
  "max-w-wide": "sm:max-w-[min(1240px,calc(100vw-2rem))]",
};

/**
 * The app's form dialog: a titled shadcn Dialog whose body and footer are
 * laid out by the caller. `width` is a Tailwind max-width class.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  width?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-modal
        className={`max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 ${WIDTHS[width] ?? WIDTHS["max-w-xl"]}`}
      >
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle className="text-[15px]">{title}</DialogTitle>
          {subtitle ? (
            <DialogDescription className="text-[12px]">{subtitle}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
