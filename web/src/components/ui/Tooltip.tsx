import {
  useState,
  useRef,
  useEffect,
  useId,
  useCallback,
  type ReactNode,
  type CSSProperties,
  type HTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

const TOOLTIP_GAP_PX = 8;
const VIEWPORT_PADDING_PX = 12;
const ESTIMATED_TOOLTIP_WIDTH_PX = 200;
const ESTIMATED_TOOLTIP_HEIGHT_PX = 36;

export interface TooltipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'content'> {
  content?: ReactNode;
  children: ReactNode;
  placement?: TooltipPlacement;
  delayMs?: number;
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
}

interface PositionCoords {
  top: number;
  left: number;
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  delayMs = 120,
  disabled = false,
  className = '',
  containerClassName = '',
  ...restProps
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<PositionCoords | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const tooltipId = useId();

  const isEnabled = !disabled && Boolean(content);

  const clearTimers = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();

    const tooltipEl = tooltipRef.current;
    const tooltipWidth = tooltipEl ? tooltipEl.offsetWidth : ESTIMATED_TOOLTIP_WIDTH_PX;
    const tooltipHeight = tooltipEl ? tooltipEl.offsetHeight : ESTIMATED_TOOLTIP_HEIGHT_PX;

    let targetPlacement = placement;

    // Flip if near viewport boundaries
    if (
      targetPlacement === 'top' &&
      triggerRect.top - TOOLTIP_GAP_PX - tooltipHeight < VIEWPORT_PADDING_PX
    ) {
      if (window.innerHeight - triggerRect.bottom > triggerRect.top) {
        targetPlacement = 'bottom';
      }
    } else if (
      targetPlacement === 'bottom' &&
      triggerRect.bottom + TOOLTIP_GAP_PX + tooltipHeight > window.innerHeight - VIEWPORT_PADDING_PX
    ) {
      if (triggerRect.top > window.innerHeight - triggerRect.bottom) {
        targetPlacement = 'top';
      }
    } else if (
      targetPlacement === 'left' &&
      triggerRect.left - TOOLTIP_GAP_PX - tooltipWidth < VIEWPORT_PADDING_PX
    ) {
      if (window.innerWidth - triggerRect.right > triggerRect.left) {
        targetPlacement = 'right';
      }
    } else if (
      targetPlacement === 'right' &&
      triggerRect.right + TOOLTIP_GAP_PX + tooltipWidth > window.innerWidth - VIEWPORT_PADDING_PX
    ) {
      if (triggerRect.left > window.innerWidth - triggerRect.right) {
        targetPlacement = 'left';
      }
    }

    let top = 0;
    let left = 0;

    if (targetPlacement === 'top') {
      top = triggerRect.top - tooltipHeight - TOOLTIP_GAP_PX;
      left = triggerRect.left + (triggerRect.width - tooltipWidth) / 2;
    } else if (targetPlacement === 'bottom') {
      top = triggerRect.bottom + TOOLTIP_GAP_PX;
      left = triggerRect.left + (triggerRect.width - tooltipWidth) / 2;
    } else if (targetPlacement === 'left') {
      top = triggerRect.top + (triggerRect.height - tooltipHeight) / 2;
      left = triggerRect.left - tooltipWidth - TOOLTIP_GAP_PX;
    } else if (targetPlacement === 'right') {
      top = triggerRect.top + (triggerRect.height - tooltipHeight) / 2;
      left = triggerRect.right + TOOLTIP_GAP_PX;
    }

    // Clamp within viewport boundaries
    const minLeft = VIEWPORT_PADDING_PX;
    const maxLeft = Math.max(
      VIEWPORT_PADDING_PX,
      window.innerWidth - tooltipWidth - VIEWPORT_PADDING_PX,
    );
    left = Math.max(minLeft, Math.min(maxLeft, left));

    const minTop = VIEWPORT_PADDING_PX;
    const maxTop = Math.max(
      VIEWPORT_PADDING_PX,
      window.innerHeight - tooltipHeight - VIEWPORT_PADDING_PX,
    );
    top = Math.max(minTop, Math.min(maxTop, top));

    setCoords({ top, left });
  }, [placement]);

  const show = useCallback(() => {
    if (!isEnabled) return;
    clearTimers();
    openTimerRef.current = window.setTimeout(() => {
      setIsOpen(true);
      updatePosition();
    }, delayMs);
  }, [clearTimers, delayMs, isEnabled, updatePosition]);

  const hide = useCallback(() => {
    clearTimers();
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 80);
  }, [clearTimers]);

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearTimers();
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, clearTimers, updatePosition]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const tooltipStyle: CSSProperties = coords
    ? {
        top: `${Math.round(coords.top)}px`,
        left: `${Math.round(coords.left)}px`,
        maxWidth: `min(20rem, calc(100vw - ${VIEWPORT_PADDING_PX * 2}px))`,
      }
    : { display: 'none' };

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={isEnabled ? 0 : undefined}
        aria-describedby={isOpen && isEnabled ? tooltipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={`inline-flex min-w-0 max-w-full items-center focus-visible:rounded focus-visible:outline-2 focus-visible:outline-interactive ${containerClassName}`}
        {...restProps}
      >
        {children}
      </span>

      {isOpen && isEnabled && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              style={tooltipStyle}
              onMouseEnter={show}
              onMouseLeave={hide}
              className={`fixed z-tooltip pointer-events-auto max-w-xs animate-fadeIn rounded-md border border-border-strong bg-surface-panel/95 px-2.5 py-1.5 font-sans text-forensic-meta text-text-primary shadow-panel backdrop-blur-md ${className}`}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
