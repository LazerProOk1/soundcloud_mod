import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface VirtualListProps<T> {
  items: T[];
  rowHeight: number;
  overscan?: number;
  className?: string;
  disabled?: boolean;
  getItemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
}

export function VirtualList<T>({
  items,
  rowHeight,
  overscan = 6,
  className,
  disabled = false,
  getItemKey,
  renderItem,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setScrollElement((containerRef.current?.closest('main') as HTMLElement | null) ?? null);
  }, []);

  // Where the list starts inside the scroll container. Without it the virtualizer assumes
  // the list sits at the very top, so with a page header above it the first rows of the
  // viewport were never rendered (blank rows while scrolling).
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !scrollElement) return;
    const measure = () => {
      const top =
        el.getBoundingClientRect().top -
        scrollElement.getBoundingClientRect().top +
        scrollElement.scrollTop;
      setScrollMargin((prev) => (Math.abs(prev - top) > 0.5 ? top : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scrollElement);
    if (scrollElement.firstElementChild) ro.observe(scrollElement.firstElementChild);
    return () => ro.disconnect();
  }, [scrollElement]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => rowHeight,
    overscan,
    scrollMargin,
  });

  if (disabled) {
    return (
      <div ref={containerRef} className={className}>
        {items.map((item, index) => (
          <React.Fragment key={getItemKey(item, index)}>{renderItem(item, index)}</React.Fragment>
        ))}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height: totalHeight, position: 'relative', width: '100%' }}
    >
      {virtualItems.map((virtualItem) => {
        const item = items[virtualItem.index];
        return (
          <div
            key={getItemKey(item, virtualItem.index)}
            data-index={virtualItem.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: virtualItem.size,
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
            }}
          >
            {renderItem(item, virtualItem.index)}
          </div>
        );
      })}
    </div>
  );
}
