import React from 'react';

interface PixelQMarkProps {
  size?: number;
  className?: string;
}

/**
 * Original restrained pixel-art Q emblem for QWEEPS.
 * Uses crisp integer pixel coordinates on a 12x12 grid.
 */
export const PixelQMark: React.FC<PixelQMarkProps> = ({ size = 26, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {/* Outer tile frame */}
      <rect x="0" y="0" width="12" height="12" fill="#142B25" />
      <rect x="0" y="0" width="12" height="1" fill="#486356" />
      <rect x="0" y="11" width="12" height="1" fill="#486356" />
      <rect x="0" y="0" width="1" height="12" fill="#486356" />
      <rect x="11" y="0" width="1" height="12" fill="#486356" />

      {/* Pixel Q top bar */}
      <rect x="3" y="2" width="5" height="1" fill="#E0BE72" />
      {/* Pixel Q left stroke */}
      <rect x="2" y="3" width="1" height="5" fill="#E0BE72" />
      {/* Pixel Q right stroke */}
      <rect x="8" y="3" width="1" height="4" fill="#E0BE72" />
      {/* Pixel Q bottom bar */}
      <rect x="3" y="8" width="4" height="1" fill="#E0BE72" />
      {/* Inner mint core spark */}
      <rect x="4" y="4" width="2" height="2" fill="#7BD3B0" />
      {/* Pixel Q tail */}
      <rect x="6" y="6" width="1" height="1" fill="#7BD3B0" />
      <rect x="7" y="7" width="1" height="1" fill="#E0BE72" />
      <rect x="8" y="8" width="2" height="1" fill="#E0BE72" />
      <rect x="9" y="9" width="1" height="1" fill="#7BD3B0" />
    </svg>
  );
};
