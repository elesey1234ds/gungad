import React from 'react';

interface BottomSheetProps {
  onClose: () => void;
  children: React.ReactNode;
  /** Extra sizing classes for the panel, e.g. "sm:max-w-xl" */
  panelClassName?: string;
  /** z-index override (SupportModal stacks above everything) */
  zClassName?: string;
  labelledBy?: string;
}

/**
 * Unified Telegram Mini App bottom sheet.
 * Mobile: slides up from the bottom, clears the bottom nav + safe area.
 * Desktop: centered dialog. Pure presentational wrapper — no business logic.
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({
  onClose,
  children,
  panelClassName = 'sm:max-w-lg',
  zClassName = 'z-[350]',
  labelledBy,
}) => {
  return (
    <div
      className={`fixed inset-0 ${zClassName} flex items-end sm:items-center justify-center p-0 sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={onClose}
    >
      <div className="gg-sheet-backdrop absolute inset-0 bg-black/75 backdrop-blur-md" aria-hidden />
      <div
        className={`gg-sheet relative w-full ${panelClassName} bg-[#0e0e12] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-[0_18px_50px_rgba(0,0,0,0.65)] flex flex-col text-zinc-100 max-h-[min(85dvh,720px)] md:max-h-[min(90dvh,760px)] mb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:mb-0 overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gg-sheet-handle sm:hidden" aria-hidden />
        {children}
      </div>
    </div>
  );
};
