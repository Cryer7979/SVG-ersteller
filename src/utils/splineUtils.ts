import * as d3Shape from 'd3-shape';
import type { Point } from './imageProcessing';

export function getSmoothPath(points: Point[], closed = true): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  // Catmull-Rom spline creates a smooth curve passing through all points
  const curve = closed ? d3Shape.curveCatmullRomClosed.alpha(0.5) : d3Shape.curveCatmullRom.alpha(0.5);

  const lineGenerator = d3Shape.line<Point>()
    .x(d => d.x)
    .y(d => d.y)
    .curve(curve);

  return lineGenerator(points) || '';
}