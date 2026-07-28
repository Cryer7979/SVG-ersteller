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

export function detectContours(imageElement: HTMLImageElement, thresholdValue: number = 128, log: (msg: string) => void = console.log): Point[] | null {
  // @ts-ignore - cv is loaded globally from script tag
  if (typeof cv === 'undefined' || !cv.Mat) {
    log("Error: OpenCV not loaded yet");
    return null;
  }

  try {
    // @ts-ignore
    const src = cv.imread(imageElement);
    // @ts-ignore
    const thresh = new cv.Mat();

    // Create an array of Mats to hold the channels
    // @ts-ignore
    const rgbaPlanes = new cv.MatVector();
    // @ts-ignore
    cv.split(src, rgbaPlanes);
    const alpha = rgbaPlanes.get(3);

    // Check if the image has actual transparency
    // @ts-ignore
    const minMax = cv.minMaxLoc(alpha);
    const hasTransparency = minMax.minVal < 255;

    if (hasTransparency) {
      log(`Detected transparency (min alpha: ${minMax.minVal}). Using alpha channel for thresholding.`);
      // Threshold the alpha channel (0 is transparent, >0 is opaque)
      // @ts-ignore
      cv.threshold(alpha, thresh, thresholdValue > 0 ? thresholdValue : 1, 255, cv.THRESH_BINARY);

      // Apply morphological operations to close small gaps and smooth edges
      // @ts-ignore
      const M = cv.Mat.ones(5, 5, cv.CV_8U);
      // @ts-ignore
      cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, M);
      M.delete();
    } else {
      log(`No transparency detected (min alpha: ${minMax.minVal}). Falling back to Canny Edge Detection.`);
      // @ts-ignore
      const gray = new cv.Mat();
      // @ts-ignore
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

      // Blur to reduce noise
      // @ts-ignore
      const blurred = new cv.Mat();
      // @ts-ignore
      const ksize = new cv.Size(5, 5);
      // @ts-ignore
      cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);

      // Canny Edge Detection
      // Map sensitivity (0-255) to Canny thresholds. Higher sensitivity = lower thresholds.
      const highThresh = 255 - thresholdValue;
      const lowThresh = highThresh * 0.5;
      log(`Using Canny edge detection with thresholds: ${lowThresh.toFixed(1)} / ${highThresh.toFixed(1)}`);

      // @ts-ignore
      cv.Canny(blurred, thresh, lowThresh, highThresh, 3, false);

      // Dilate edges to close loops so findContours works on the outer boundary
      // @ts-ignore
      const M = cv.Mat.ones(7, 7, cv.CV_8U);
      // @ts-ignore
      cv.dilate(thresh, thresh, M, new cv.Point(-1, -1), 2, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());

      M.delete();
      blurred.delete();
      gray.delete();
    }

    alpha.delete();
    rgbaPlanes.delete();

    // Find contours
    // @ts-ignore
    const contours = new cv.MatVector();
    // @ts-ignore
    const hierarchy = new cv.Mat();
    // @ts-ignore
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    log(`Found ${contours.size()} raw contours.`);

    if (contours.size() === 0) {
       log("Error: No contours found after thresholding.");
       src.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
       return null;
    }

    // Find largest valid contour (ignoring the image boundary itself)
    let largestContourIdx = -1;
    let maxArea = -1;

    const imageArea = src.cols * src.rows;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      // @ts-ignore
      const area = cv.contourArea(contour);

      // If the area is practically the whole image, it's probably the boundary
      if (area > imageArea * 0.95) {
        log(`Ignoring contour ${i} due to large area (boundary): ${area}`);
        contour.delete();
        continue;
      }

      if (area > maxArea) {
        maxArea = area;
        largestContourIdx = i;
      }
      contour.delete();
    }

    if (largestContourIdx === -1) {
       log("Error: Could not find a valid contour after filtering out boundaries.");
       src.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
       return null;
    }

    log(`Selected contour ${largestContourIdx} with area: ${maxArea}`);
    const largestContour = contours.get(largestContourIdx);

    // Extract points
    const points: Point[] = [];
    const data32S = largestContour.data32S;
    for (let i = 0; i < data32S.length; i += 2) {
      points.push({ x: data32S[i], y: data32S[i + 1] });
    }

    // Cleanup
    src.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();
    largestContour.delete();

    // Simplify the contour to a manageable number of points
    const finalPoints = simplifyPoints(points);
    log(`Successfully generated path with ${finalPoints.length} points.`);
    return finalPoints;

  } catch (err) {
    log(`Fatal Error in contour detection: ${err}`);
    return null;
  }
}
