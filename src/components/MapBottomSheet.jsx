import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronUp, X } from 'lucide-react';

export function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpoint
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, [breakpoint]);
  return isMobile;
}

export function MapBottomSheet({ summary, children, onClose, count = 0 }) {
  const COLLAPSED = 76;
  const snapsRef = useRef({ collapsed: COLLAPSED, mid: 360, full: 640 });
  const [height, setHeight] = useState(COLLAPSED);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startY: 0, startH: 0 });

  const recomputeSnaps = useCallback(() => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    snapsRef.current = {
      collapsed: COLLAPSED,
      mid: Math.round(vh * 0.45),
      full: Math.round(vh * 0.85),
    };
  }, []);

  useEffect(() => {
    recomputeSnaps();
    setHeight(snapsRef.current.mid);
    const onResize = () => {
      recomputeSnaps();
      setHeight((h) => Math.min(h, snapsRef.current.full));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recomputeSnaps]);

  const snapTo = useCallback((h) => {
    const { collapsed, mid, full } = snapsRef.current;
    const points = [collapsed, mid, full];
    let best = points[0];
    let bestDist = Math.abs(h - points[0]);
    for (const p of points) {
      const d = Math.abs(h - p);
      if (d < bestDist) { best = p; bestDist = d; }
    }
    setHeight(best);
  }, []);

  const onTouchStart = (e) => {
    const y = e.touches[0].clientY;
    dragRef.current = { startY: y, startH: height };
    setDragging(true);
  };
  const onTouchMove = (e) => {
    if (!dragging) return;
    const y = e.touches[0].clientY;
    const delta = dragRef.current.startY - y;
    const { collapsed, full } = snapsRef.current;
    const next = Math.max(collapsed, Math.min(full, dragRef.current.startH + delta));
    setHeight(next);
  };
  const onTouchEnd = () => {
    setDragging(false);
    snapTo(height);
  };

  const cycle = () => {
    const { collapsed, mid, full } = snapsRef.current;
    if (height <= collapsed + 20) setHeight(mid);
    else if (height < full - 20) setHeight(full);
    else setHeight(collapsed);
  };

  const isCollapsed = height <= snapsRef.current.collapsed + 20;

  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-50 bg-stone-50/98 border-t border-stone-300 backdrop-blur-sm rounded-t-2xl shadow-2xl flex flex-col"
      style={{
        height: `${height}px`,
        transition: dragging ? 'none' : 'height 0.25s ease-out',
        touchAction: 'none',
      }}
    >
      <div
        className="shrink-0 select-none cursor-grab active:cursor-grabbing"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex justify-center pt-2 pb-1" onClick={cycle}>
          <div className="w-10 h-1.5 rounded-full bg-stone-400" />
        </div>
        <div className="flex items-center gap-2 px-4 pb-2.5">
          <button onClick={cycle} className="flex items-center gap-1.5 text-stone-700 font-mono text-xs">
            <ChevronUp className="w-4 h-4 transition-transform" style={{ transform: isCollapsed ? 'none' : 'rotate(180deg)' }} />
            {count > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-500 text-white text-[11px] font-bold">
                {count}
              </span>
            )}
          </button>
          <div className="flex-1 min-w-0 overflow-hidden">{summary}</div>
          <button onClick={onClose} className="shrink-0 w-9 h-9 -mr-1 flex items-center justify-center text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))]" style={{ touchAction: 'pan-y' }}>
        <div className="flex flex-col gap-2">{children}</div>
      </div>
    </div>
  );
}
