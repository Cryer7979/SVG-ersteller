import * as ClipperLib from 'clipper-lib';

export type Point = { x: number; y: number };

import simplify from 'simplify-js';

// Simplify points using simplify-js
export function simplifyPoints(points: Point[], tolerance = 2, highestQuality = true): Point[] {
  if (points.length <= 3) return points;
  // @ts-ignore
  const simplified = simplify(points, tolerance, highestQuality);

  // If still too many points, sample down to max 60 points for easier editing
  if (simplified.length > 60) {
     const step = Math.ceil(simplified.length / 50);
     const sampled = [];
     for(let i=0; i<simplified.length; i+=step) sampled.push(simplified[i]);
     // ensure closed
     sampled.push(simplified[simplified.length-1]);
     return sampled;
  }
  return simplified;
}

export function offsetPolygon(points: Point[], offsetPixels: number): Point[] {
  if (points.length < 3 || offsetPixels === 0) return points;

  // Clipper works with integers, so we scale up, offset, and scale down
  const scale = 100;

  const path = points.map(p => ({ X: Math.round(p.x * scale), Y: Math.round(p.y * scale) }));

  const co = new ClipperLib.ClipperOffset();
  const offsetPaths = new ClipperLib.Paths();

  // jtRound is default
  co.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  co.Execute(offsetPaths, offsetPixels * scale);

  if (offsetPaths.length === 0) return points; // Fallback if offset fails

  // Return the largest path (usually the outer one)
  let largestPath = offsetPaths[0];
  let maxArea = ClipperLib.Clipper.Area(largestPath);

  for(let i=1; i<offsetPaths.length; i++) {
     const area = ClipperLib.Clipper.Area(offsetPaths[i]);
     if (Math.abs(area) > Math.abs(maxArea)) {
         maxArea = area;
         largestPath = offsetPaths[i];
     }
  }

  return largestPath.map((p: {X: number, Y: number}) => ({ x: p.X / scale, y: p.Y / scale }));
}

export function detectContours(imageElement: HTMLImageElement, thresholdValue: number = 128): Point[] | null {
  // @ts-ignore - cv is loaded globally from script tag
  if (typeof cv === 'undefined' || !cv.Mat) {
    console.error("OpenCV not loaded yet");
    return null;
  }

  try {
    // @ts-ignore
    const src = cv.imread(imageElement);
    // @ts-ignore
    const gray = new cv.Mat();
    // @ts-ignore
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    // Thresholding
    // @ts-ignore
    const thresh = new cv.Mat();
    // @ts-ignore
    cv.threshold(gray, thresh, thresholdValue, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);

    // Find contours
    // @ts-ignore
    const contours = new cv.MatVector();
    // @ts-ignore
    const hierarchy = new cv.Mat();
    // @ts-ignore
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    if (contours.size() === 0) {
       src.delete(); gray.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
       return null;
    }

    // Find largest contour
    let largestContourIdx = 0;
    // @ts-ignore
    let maxArea = cv.contourArea(contours.get(0));

    for (let i = 1; i < contours.size(); i++) {
      // @ts-ignore
      const area = cv.contourArea(contours.get(i));
      if (area > maxArea) {
        maxArea = area;
        largestContourIdx = i;
      }
    }

    const largestContour = contours.get(largestContourIdx);

    // Extract points
    const points: Point[] = [];
    const data32S = largestContour.data32S;
    for (let i = 0; i < data32S.length; i += 2) {
      points.push({ x: data32S[i], y: data32S[i + 1] });
    }

    // Cleanup
    src.delete();
    gray.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();
    largestContour.delete();

    // Simplify the contour to a manageable number of points
    return simplifyPoints(points);

  } catch (err) {
    console.error("Error in contour detection:", err);
    return null;
  }
}
