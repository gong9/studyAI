'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SliderProps {
  value: number[];
  max: number;
  step?: number;
  onValueChange: (value: number[]) => void;
  className?: string;
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ value, max, step = 1, onValueChange, className }, ref) => {
    const trackRef = React.useRef<HTMLDivElement>(null);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newValue = Math.round((percent * max) / step) * step;
      onValueChange([newValue]);
    };

    const handleDrag = (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.buttons !== 1) return;
      handleClick(e);
    };

    const percent = max > 0 ? (value[0] / max) * 100 : 0;

    return (
      <div
        ref={ref}
        className={cn('relative w-full', className)}
      >
        <div
          ref={trackRef}
          className="relative h-2 w-full cursor-pointer rounded-full bg-zinc-700"
          onClick={handleClick}
          onMouseMove={handleDrag}
        >
          {/* 进度条 */}
          <div
            className="absolute h-full rounded-full bg-purple-500 transition-all duration-75"
            style={{ width: `${percent}%` }}
          />
          {/* 滑块 */}
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-lg ring-2 ring-purple-500 transition-all duration-75 hover:scale-110"
            style={{ left: `${percent}%` }}
          />
        </div>
      </div>
    );
  }
);

Slider.displayName = 'Slider';

export { Slider };

