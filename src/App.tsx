import React, { useState, useRef, useEffect, type MouseEvent } from 'react';
import { Upload, Download, Settings, Layers, Box, Pointer, Trash2 } from 'lucide-react';
import { type Point, detectContours, offsetPolygon } from './utils/imageProcessing';
import { getSmoothPath } from './utils/splineUtils';
import { Preview3D } from './components/Preview3D';
import { exportToSVG, exportToSTL } from './utils/exportUtils';

export function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'2d' | '3d'>('2d');

  const [points, setPoints] = useState<Point[]>([]);
  const [draggingPointIdx, setDraggingPointIdx] = useState<number | null>(null);
  const dragTimestamp = useRef<number>(0);

  const [sensitivity, setSensitivity] = useState(128);
  const [offsetAmount, setOffsetAmount] = useState(5);
  const [thickness, setThickness] = useState(3.0);

  const imageRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageSrc(event.target?.result as string);
      setPoints([]);
    };
    reader.readAsDataURL(file);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    setDisplaySize({ width: img.width, height: img.height });
  };

  useEffect(() => {
    // Update display size if window resizes
    const handleResize = () => {
       if (imageRef.current) {
          setDisplaySize({ width: imageRef.current.width, height: imageRef.current.height });
       }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const mapPointToImage = (x: number, y: number): Point => {
    const scaleX = imageSize.width / displaySize.width;
    const scaleY = imageSize.height / displaySize.height;
    return { x: x * scaleX, y: y * scaleY };
  };

  const mapPointToDisplay = (p: Point): Point => {
    const scaleX = displaySize.width / imageSize.width;
    const scaleY = displaySize.height / imageSize.height;
    return { x: p.x * scaleX, y: p.y * scaleY };
  };

  const handleSvgClick = (e: MouseEvent<SVGSVGElement>) => {
    if (draggingPointIdx !== null) return; // Ignore click if we were dragging
    if (Date.now() - dragTimestamp.current < 50) return; // Ignore click immediately after drag

    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const imagePoint = mapPointToImage(x, y);
    setPoints([...points, imagePoint]);
  };

  const handlePointMouseDown = (e: MouseEvent, index: number) => {
    e.stopPropagation();
    setDraggingPointIdx(index);
  };

  const handlePointContextMenu = (e: MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setPoints(points.filter((_, i) => i !== index));
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (draggingPointIdx === null || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newPoints = [...points];
    newPoints[draggingPointIdx] = mapPointToImage(x, y);
    setPoints(newPoints);
  };

  const handleMouseUp = () => {
    if (draggingPointIdx !== null) {
      dragTimestamp.current = Date.now();
      setDraggingPointIdx(null);
    }
  };

  const autoDetect = () => {
    if (!imageRef.current) return;
    const detectedPoints = detectContours(imageRef.current, sensitivity);
    if (detectedPoints) {
       let finalPoints = detectedPoints;
       if (offsetAmount > 0) {
           finalPoints = offsetPolygon(finalPoints, offsetAmount);
       }
       setPoints(finalPoints);
    } else {
       alert("No outline detected. Try adjusting sensitivity.");
    }
  };

  const displayPoints = points.map(mapPointToDisplay);
  const smoothPath = getSmoothPath(displayPoints, points.length > 2);

  return (
    <div className="flex h-screen bg-gray-100 text-gray-900 font-sans" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {/* Sidebar / Controls */}
      <div className="w-80 bg-white shadow-xl flex flex-col z-10">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-indigo-600 flex items-center gap-2">
            <Layers className="w-6 h-6" />
            BaseCreator
          </h1>
          <p className="text-sm text-gray-500 mt-1">Image to 3D Printable Base</p>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* Upload Section */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
              <Upload className="w-4 h-4" /> 1. Upload Image
            </h2>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-indigo-300 border-dashed rounded-lg cursor-pointer bg-indigo-50 hover:bg-indigo-100 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 mb-2 text-indigo-500" />
                <p className="mb-2 text-sm text-indigo-700"><span className="font-semibold">Click to upload</span></p>
              </div>
              <input type="file" className="hidden" accept="image/png, image/jpeg, image/svg+xml" onChange={handleImageUpload} />
            </label>
          </div>

          {imageSrc && (
            <>
              {/* Outline Settings */}
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  <Settings className="w-4 h-4" /> 2. Outline Generation
                </h2>

                <div className="space-y-2">
                   <div className="flex justify-between">
                     <label className="text-sm text-gray-600">Detection Sensitivity</label>
                     <span className="text-sm font-medium text-gray-900">{sensitivity}</span>
                   </div>
                   <input type="range" min="0" max="255" value={sensitivity} onChange={e => setSensitivity(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                </div>

                <div className="space-y-2">
                   <div className="flex justify-between">
                     <label className="text-sm text-gray-600">Base Offset (Dilation)</label>
                     <span className="text-sm font-medium text-gray-900">{offsetAmount}px</span>
                   </div>
                   <input type="range" min="0" max="50" value={offsetAmount} onChange={e => setOffsetAmount(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                </div>

                <button onClick={autoDetect} className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors shadow-sm">
                  Auto-Detect Outline
                </button>
              </div>

              {/* 3D Settings */}
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  <Box className="w-4 h-4" /> 3. 3D Properties
                </h2>

                <div className="space-y-2">
                   <div className="flex justify-between">
                     <label className="text-sm text-gray-600">Base Thickness (mm)</label>
                     <span className="text-sm font-medium text-gray-900">{thickness.toFixed(1)}</span>
                   </div>
                   <input type="range" min="0.5" max="20" step="0.5" value={thickness} onChange={e => setThickness(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Export Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 space-y-3">
           <button
              disabled={!imageSrc || points.length < 3}
              onClick={() => exportToSVG(points, getSmoothPath(points, true))}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-gray-800 hover:bg-gray-900 text-white rounded-md font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
           >
              <Download className="w-4 h-4" /> Export SVG (2D)
           </button>
           <button
              disabled={!imageSrc || points.length < 3}
              onClick={() => exportToSTL(points, thickness)}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
           >
              <Download className="w-4 h-4" /> Export STL (3D)
           </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-200">
        {/* Workspace Header / Tabs */}
        <div className="h-14 bg-white border-b border-gray-200 flex items-center px-6 justify-between shadow-sm z-10">
           <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
             <button
               onClick={() => setActiveTab('2d')}
               className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === '2d' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
             >
               2D Editor
             </button>
             <button
               onClick={() => setActiveTab('3d')}
               className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === '3d' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
             >
               3D Preview
             </button>
           </div>

           {activeTab === '2d' && imageSrc && (
             <div className="flex items-center gap-4 text-sm text-gray-600">
               <div className="flex items-center gap-1"><Pointer className="w-4 h-4" /> Click to add</div>
               <div className="w-px h-4 bg-gray-300"></div>
               <div className="flex items-center gap-1">Drag to move</div>
               <div className="w-px h-4 bg-gray-300"></div>
               <div className="flex items-center gap-1">Right-click to delete</div>
               <div className="w-px h-4 bg-gray-300"></div>
               <button onClick={() => setPoints([])} className="flex items-center gap-1 text-red-600 hover:text-red-700 font-medium">
                 <Trash2 className="w-4 h-4" /> Clear All
               </button>
             </div>
           )}
        </div>

        {/* Workspace Content */}
        <div className="flex-1 relative overflow-hidden">
           {activeTab === '2d' ? (
             <div className="absolute inset-0 flex items-center justify-center p-8">
               {imageSrc ? (
                 <div className="relative shadow-2xl bg-white select-none inline-block">
                    <img
                      ref={imageRef}
                      src={imageSrc}
                      alt="Uploaded"
                      onLoad={handleImageLoad}
                      className="max-w-full max-h-[calc(100vh-8rem)] object-contain opacity-70 pointer-events-none"
                      draggable={false}
                    />
                    <svg
                      ref={svgRef}
                      className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
                      onClick={handleSvgClick}
                    >
                       {smoothPath && (
                         <path
                           d={smoothPath}
                           fill="rgba(79, 70, 229, 0.2)"
                           stroke="#4f46e5"
                           strokeWidth="2"
                           strokeDasharray="4 4"
                         />
                       )}
                       {displayPoints.map((p, i) => (
                         <circle
                           key={i}
                           cx={p.x}
                           cy={p.y}
                           r="5"
                           fill="#ffffff"
                           stroke="#4f46e5"
                           strokeWidth="2"
                           className="cursor-move hover:r-6 transition-all"
                           onMouseDown={(e) => handlePointMouseDown(e, i)}
                           onContextMenu={(e) => handlePointContextMenu(e, i)}
                         />
                       ))}
                    </svg>
                 </div>
               ) : (
                 <div className="text-center text-gray-500 flex flex-col items-center">
                    <Layers className="w-16 h-16 mb-4 text-gray-300" />
                    <p className="text-lg">Upload an image to start creating your 3D base.</p>
                 </div>
               )}
             </div>
           ) : (
             <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                {imageSrc ? (
                   <Preview3D points={points} thickness={thickness} />
                ) : (
                   <p className="text-gray-500">Upload an image first.</p>
                )}
             </div>
           )}
        </div>
      </div>
    </div>
  );
}

export default App;