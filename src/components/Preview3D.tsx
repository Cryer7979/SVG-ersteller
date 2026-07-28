import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Center, Environment } from '@react-three/drei';
import * as THREE from 'three';
import type { Point } from '../utils/imageProcessing';

interface Preview3DProps {
  points: Point[];
  thickness: number;
}

export function Preview3D({ points, thickness }: Preview3DProps) {
  const geometry = useMemo(() => {
    if (points.length < 3) return null;

    // Create a Three.js Shape from the points
    const shape = new THREE.Shape();

    // We want the shape to be smooth like the Catmull-Rom spline in 2D.
    // So we use a CatmullRomCurve3 to generate intermediate points.
    const vectorPoints = points.map(p => new THREE.Vector2(p.x, -p.y)); // Invert Y for 3D coordinates

    // Close the loop
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

    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, [points, thickness]);

  if (!geometry) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        Need at least 3 points to generate 3D preview.
      </div>
    );
  }

  return (
    <Canvas camera={{ position: [0, 0, 500], fov: 50 }}>
      <color attach="background" args={['#111827']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} />
      <spotLight position={[-10, 20, 10]} angle={0.3} intensity={0.8} />

      <Center>
        <mesh geometry={geometry}>
          <meshStandardMaterial color="#4f46e5" roughness={0.4} metalness={0.1} />
        </mesh>
      </Center>

      <OrbitControls makeDefault />
      <Environment preset="city" />
    </Canvas>
  );
}