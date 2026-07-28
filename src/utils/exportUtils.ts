import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { saveAs } from 'file-saver';
import type { Point } from './imageProcessing';

export function exportToSVG(points: Point[], smoothPath: string) {
  if (points.length < 3) return;

  // Determine bounding box to set viewBox correctly
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  points.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });

  const padding = 10;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const viewBox = `${minX - padding} ${minY - padding} ${width} ${height}`;

  const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${width}" height="${height}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">
  <path d="${smoothPath}" fill="none" stroke="black" stroke-width="2" />
</svg>`;

  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  saveAs(blob, "base_outline.svg");
}

export function exportToSTL(points: Point[], thickness: number) {
  if (points.length < 3) return;

  const shape = new THREE.Shape();

  // Need to recreate the smooth curve same as in preview
  const vectorPoints = points.map(p => new THREE.Vector2(p.x, -p.y));
  vectorPoints.push(vectorPoints[0]);
  const curve = new THREE.SplineCurve(vectorPoints);
  const smoothPoints = curve.getPoints(Math.max(50, points.length * 5));

  shape.moveTo(smoothPoints[0].x, smoothPoints[0].y);
  for (let i = 1; i < smoothPoints.length; i++) {
    shape.lineTo(smoothPoints[i].x, smoothPoints[i].y);
  }

  const extrudeSettings = {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.5,
    bevelThickness: 0.5,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const mesh = new THREE.Mesh(geometry, material);

  // Exporter requires a scene or object
  const exporter = new STLExporter();
  const stlString = exporter.parse(mesh);

  const blob = new Blob([stlString], { type: 'text/plain' });
  saveAs(blob, "3d_base.stl");
}