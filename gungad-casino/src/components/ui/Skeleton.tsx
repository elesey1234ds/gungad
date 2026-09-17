import React from 'react';

interface SkeletonProps {
  className?: string;
}

/** Dark-red impulse skeleton loader (no bright shimmer). */
export const Skeleton: React.FC<SkeletonProps> = ({ className = 'h-4 w-full' }) => (
  <div className={`gg-skeleton ${className}`} aria-hidden />
);
