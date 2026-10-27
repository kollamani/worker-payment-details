import React, { useId } from 'react';
import { buildSparklineGeometry } from '../../utils/financialMetrics';

const WIDTH = 120;
const HEIGHT = 32;
const PADDING = 3;

/**
 * Miniature, dependency-free SVG sparkline used by the trend metric cards.
 * Renders a flat mid-line for an empty/flat series so the card never looks
 * broken, and a gradient area fill under the stroke when there is a shape.
 */
const Sparkline = ({ values = [], stroke = '#10b981', className = '' }) => {
  // useId() guarantees a unique gradient id per instance (React 18).
  const gradientId = `sparkline-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { line, area } = buildSparklineGeometry(values, WIDTH, HEIGHT, PADDING);
  const flatLine = `M${PADDING},${HEIGHT - PADDING} L${WIDTH - PADDING},${HEIGHT - PADDING}`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area ? <path d={area} fill={`url(#${gradientId})`} /> : null}
      <path
        d={line || flatLine}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

export default Sparkline;
