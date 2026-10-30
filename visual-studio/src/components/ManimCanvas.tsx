import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  MANIM_PALETTE,
  clamp,
  lerp,
  lerpColor,
  manimSmooth,
  thereAndBack,
  windowProgress,
} from '../constants/manimPalette';
import { SceneId } from '../scenes/sceneData';

export interface ManimRenderConfig {
  showNumberPlane: boolean;
  showCameraFrameHud: boolean;
  showMobjectBounds: boolean;
  strokeScale: number;
  cameraOverride: { active: boolean; x: number; y: number; zoom: number };
}

export interface ManimCanvasProps {
  sceneId: SceneId;
  currentTime: number;
  config: ManimRenderConfig;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onCameraTelemetry?: (cam: { x: number; y: number; zoom: number }) => void;
  nodeS?: { x: number; y: number };
  nodeG?: { x: number; y: number };
  nodeA?: { x: number; y: number };
  nodeB?: { x: number; y: number };
  onNodeChange?: (nodeId: 'S' | 'G' | 'A' | 'B', pos: { x: number; y: number }) => void;
  selectedNodeId?: 'S' | 'G' | 'A' | 'B' | null;
  onSelectNode?: (nodeId: 'S' | 'G' | 'A' | 'B' | null) => void;
  onRegionSelect?: (ids: string[], region: { x1: number; y1: number; x2: number; y2: number }) => void;
  onCameraOverrideChange?: (cam: { active: boolean; x: number; y: number; zoom: number }) => void;
}

// 7x7 recognizable grayscale pixel patterns (Cat, Dog, Digit 3)
const PIXEL_SPRITES: number[][][] = [
  [
    [0.9, 0.1, 0.0, 0.0, 0.0, 0.1, 0.9],
    [0.9, 0.8, 0.2, 0.0, 0.2, 0.8, 0.9],
    [0.6, 0.9, 0.9, 0.8, 0.9, 0.9, 0.6],
    [0.4, 0.9, 0.2, 0.9, 0.2, 0.9, 0.4],
    [0.4, 0.9, 0.9, 0.4, 0.9, 0.9, 0.4],
    [0.1, 0.6, 0.9, 0.9, 0.9, 0.6, 0.1],
    [0.0, 0.1, 0.5, 0.7, 0.5, 0.1, 0.0],
  ],
  [
    [0.2, 0.8, 0.6, 0.2, 0.6, 0.8, 0.2],
    [0.8, 0.9, 0.8, 0.7, 0.8, 0.9, 0.8],
    [0.8, 0.4, 0.9, 0.9, 0.9, 0.4, 0.8],
    [0.6, 0.2, 0.8, 0.3, 0.8, 0.2, 0.6],
    [0.1, 0.3, 0.9, 0.9, 0.9, 0.3, 0.1],
    [0.0, 0.2, 0.7, 0.4, 0.7, 0.2, 0.0],
    [0.0, 0.0, 0.3, 0.6, 0.3, 0.0, 0.0],
  ],
  [
    [0.0, 0.6, 0.9, 0.9, 0.8, 0.2, 0.0],
    [0.1, 0.2, 0.1, 0.1, 0.9, 0.6, 0.0],
    [0.0, 0.0, 0.3, 0.8, 0.9, 0.3, 0.0],
    [0.0, 0.0, 0.2, 0.7, 0.9, 0.6, 0.0],
    [0.0, 0.0, 0.0, 0.1, 0.8, 0.9, 0.1],
    [0.2, 0.7, 0.8, 0.9, 0.9, 0.5, 0.0],
    [0.0, 0.1, 0.4, 0.4, 0.1, 0.0, 0.0],
  ],
];

export const ManimCanvas: React.FC<ManimCanvasProps> = ({
  sceneId,
  currentTime,
  config,
  canvasRef,
  onCameraTelemetry,
  nodeS = { x: -4.0, y: -1.5 },
  nodeG = { x: 3.5, y: 2.0 },
  nodeA = { x: -1.0, y: 0.0 },
  nodeB = { x: -3.0, y: 1.0 },
  onNodeChange,
  selectedNodeId,
  onSelectNode,
  onRegionSelect,
  onCameraOverrideChange,
}) => {
  const lastTelemetryRef = useRef<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 });

  const isRightDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ px: number; py: number; camX: number; camY: number; zoom: number } | null>(null);
  const draggingNodeRef = useRef<'S' | 'G' | 'A' | 'B' | null>(null);
  const isMarqueeRef = useRef<boolean>(false);
  const marqueeStartRef = useRef<{ px: number; py: number } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<'S' | 'G' | 'A' | 'B' | null>(null);

  const currentCam = computeCameraState(sceneId, currentTime, config);
  const baseScale = 900 / 8.0;

  const toPxXHelper = (mx: number) => 1600 / 2 + (mx - currentCam.x) * baseScale * currentCam.zoom;
  const toPxYHelper = (my: number) => 900 / 2 - (my - currentCam.y) * baseScale * currentCam.zoom;
  const toManimXHelper = (px: number) => (px - 1600 / 2) / (baseScale * currentCam.zoom) + currentCam.x;
  const toManimYHelper = (py: number) => -(py - 900 / 2) / (baseScale * currentCam.zoom) + currentCam.y;

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { px: 0, py: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      px: (e.clientX - rect.left) * scaleX,
      py: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { px, py } = getCanvasCoords(e);

    if (e.button === 2) {
      // Right click: start canvas pan
      e.preventDefault();
      isRightDraggingRef.current = true;
      dragStartRef.current = { px, py, camX: currentCam.x, camY: currentCam.y, zoom: currentCam.zoom };
      return;
    }

    if (e.button === 0) {
      // Left click: test node hit on all 4 nodes
      const sPxX = toPxXHelper(nodeS.x);
      const sPxY = toPxYHelper(nodeS.y);
      const gPxX = toPxXHelper(nodeG.x);
      const gPxY = toPxYHelper(nodeG.y);
      const aPxX = toPxXHelper(nodeA.x);
      const aPxY = toPxYHelper(nodeA.y);
      const bPxX = toPxXHelper(nodeB.x);
      const bPxY = toPxYHelper(nodeB.y);

      if (Math.hypot(px - sPxX, py - sPxY) <= 32) {
        draggingNodeRef.current = 'S';
        onSelectNode?.('S');
        return;
      }
      if (Math.hypot(px - gPxX, py - gPxY) <= 32) {
        draggingNodeRef.current = 'G';
        onSelectNode?.('G');
        return;
      }
      if (Math.hypot(px - aPxX, py - aPxY) <= 32 && (sceneId !== 'astar_heuristic' || currentTime >= 9.0)) {
        draggingNodeRef.current = 'A';
        onSelectNode?.('A');
        return;
      }
      if (Math.hypot(px - bPxX, py - bPxY) <= 32 && sceneId === 'astar_heuristic' && currentTime >= 14.5) {
        draggingNodeRef.current = 'B';
        onSelectNode?.('B');
        return;
      }

      // Marquee selection start
      isMarqueeRef.current = true;
      marqueeStartRef.current = { px, py };
      setMarqueeBox({ x1: px, y1: py, x2: px, y2: py });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { px, py } = getCanvasCoords(e);

    // 1. Right-click Pan
    if (isRightDraggingRef.current && dragStartRef.current) {
      const dx = px - dragStartRef.current.px;
      const dy = py - dragStartRef.current.py;
      const newCamX = dragStartRef.current.camX - dx / (baseScale * dragStartRef.current.zoom);
      const newCamY = dragStartRef.current.camY + dy / (baseScale * dragStartRef.current.zoom);
      onCameraOverrideChange?.({
        active: true,
        x: newCamX,
        y: newCamY,
        zoom: dragStartRef.current.zoom,
      });
      return;
    }

    // 2. Left-click Node Drag
    if (draggingNodeRef.current) {
      const mx = toManimXHelper(px);
      const my = toManimYHelper(py);
      const clampedX = clamp(mx, -6.8, 6.8);
      const clampedY = clamp(my, -3.8, 3.8);
      onNodeChange?.(draggingNodeRef.current, {
        x: Math.round(clampedX * 100) / 100,
        y: Math.round(clampedY * 100) / 100,
      });
      return;
    }

    // 3. Marquee Box
    if (isMarqueeRef.current && marqueeStartRef.current) {
      setMarqueeBox({
        x1: marqueeStartRef.current.px,
        y1: marqueeStartRef.current.py,
        x2: px,
        y2: py,
      });
      return;
    }

    // 4. Hover states on all 4 nodes
    const sPxX = toPxXHelper(nodeS.x);
    const sPxY = toPxYHelper(nodeS.y);
    const gPxX = toPxXHelper(nodeG.x);
    const gPxY = toPxYHelper(nodeG.y);
    const aPxX = toPxXHelper(nodeA.x);
    const aPxY = toPxYHelper(nodeA.y);
    const bPxX = toPxXHelper(nodeB.x);
    const bPxY = toPxYHelper(nodeB.y);

    if (Math.hypot(px - sPxX, py - sPxY) <= 32) {
      if (hoveredNode !== 'S') setHoveredNode('S');
      return;
    }
    if (Math.hypot(px - gPxX, py - gPxY) <= 32) {
      if (hoveredNode !== 'G') setHoveredNode('G');
      return;
    }
    if (Math.hypot(px - aPxX, py - aPxY) <= 32 && (sceneId !== 'astar_heuristic' || currentTime >= 9.0)) {
      if (hoveredNode !== 'A') setHoveredNode('A');
      return;
    }
    if (Math.hypot(px - bPxX, py - bPxY) <= 32 && sceneId === 'astar_heuristic' && currentTime >= 14.5) {
      if (hoveredNode !== 'B') setHoveredNode('B');
      return;
    }

    if (hoveredNode !== null) {
      setHoveredNode(null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isRightDraggingRef.current = false;
    dragStartRef.current = null;
    draggingNodeRef.current = null;

    if (isMarqueeRef.current && marqueeBox) {
      isMarqueeRef.current = false;
      const minX = Math.min(marqueeBox.x1, marqueeBox.x2);
      const maxX = Math.max(marqueeBox.x1, marqueeBox.x2);
      const minY = Math.min(marqueeBox.y1, marqueeBox.y2);
      const maxY = Math.max(marqueeBox.y1, marqueeBox.y2);

      const sPxX = toPxXHelper(nodeS.x);
      const sPxY = toPxYHelper(nodeS.y);
      const gPxX = toPxXHelper(nodeG.x);
      const gPxY = toPxYHelper(nodeG.y);
      const aPxX = toPxXHelper(nodeA.x);
      const aPxY = toPxYHelper(nodeA.y);
      const bPxX = toPxXHelper(nodeB.x);
      const bPxY = toPxYHelper(nodeB.y);

      if (onRegionSelect) {
        const visible = [{ id: 'S', x: sPxX, y: sPxY }, { id: 'G', x: gPxX, y: gPxY },
          ...(currentTime >= 9 ? [{ id: 'A', x: aPxX, y: aPxY }] : []),
          ...(currentTime >= 14.5 ? [{ id: 'B', x: bPxX, y: bPxY }] : [])];
        onRegionSelect(visible.filter(n => n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY).map(n => n.id),
          { x1: toManimXHelper(minX), x2: toManimXHelper(maxX), y1: toManimYHelper(maxY), y2: toManimYHelper(minY) });
        setMarqueeBox(null);
        return;
      }

      if (sPxX >= minX && sPxX <= maxX && sPxY >= minY && sPxY <= maxY) {
        onSelectNode?.('S');
      } else if (gPxX >= minX && gPxX <= maxX && gPxY >= minY && gPxY <= maxY) {
        onSelectNode?.('G');
      } else if (aPxX >= minX && aPxX <= maxX && aPxY >= minY && aPxY <= maxY && (sceneId !== 'astar_heuristic' || currentTime >= 9.0)) {
        onSelectNode?.('A');
      } else if (bPxX >= minX && bPxX <= maxX && bPxY >= minY && bPxY <= maxY && sceneId === 'astar_heuristic' && currentTime >= 14.5) {
        onSelectNode?.('B');
      } else if (Math.abs(marqueeBox.x2 - marqueeBox.x1) < 8 && Math.abs(marqueeBox.y2 - marqueeBox.y1) < 8) {
        onSelectNode?.(null);
      }
      setMarqueeBox(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = clamp(currentCam.zoom * factor, 0.45, 3.5);
    onCameraOverrideChange?.({
      active: true,
      x: currentCam.x,
      y: currentCam.y,
      zoom: Math.round(newZoom * 1000) / 1000,
    });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const cursorStyle = isRightDraggingRef.current
    ? 'grabbing'
    : draggingNodeRef.current
      ? 'grabbing'
      : hoveredNode
        ? 'grab'
        : isMarqueeRef.current
          ? 'crosshair'
          : 'default';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Strictly enforce ZERO neon shadow or blur
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Pure Black Manim Canvas (#000000)
    ctx.fillStyle = MANIM_PALETTE.BLACK;
    ctx.fillRect(0, 0, W, H);

    // Manim coordinate system: height = 8.0 units (-4 to +4), width = 14.222 units (-7.11 to +7.11)
    const baseScale = H / 8.0;

    // Compute camera trajectory for the active scene
    const cam = computeCameraState(sceneId, currentTime, config);

    if (
      onCameraTelemetry &&
      (Math.abs(cam.x - lastTelemetryRef.current.x) > 0.01 ||
        Math.abs(cam.y - lastTelemetryRef.current.y) > 0.01 ||
        Math.abs(cam.zoom - lastTelemetryRef.current.zoom) > 0.005)
    ) {
      lastTelemetryRef.current = cam;
      onCameraTelemetry(cam);
    }

    const toPxX = (mx: number) => W / 2 + (mx - cam.x) * baseScale * cam.zoom;
    const toPxY = (my: number) => H / 2 - (my - cam.y) * baseScale * cam.zoom;
    const toLen = (mLen: number) => mLen * baseScale * cam.zoom;
    const sw = (width: number) => Math.max(1, width * config.strokeScale * Math.sqrt(cam.zoom));

    // Optional Manim NumberPlane background
    if (config.showNumberPlane && sceneId !== 'linear_transform') {
      drawManimNumberPlane(ctx, W, H, toPxX, toPxY, sw(1), 0.22, cam);
    }

    // Dispatch to specific MovingCameraScene renderer
    if (sceneId === 'astar_heuristic') {
      renderAStarScene(
        ctx,
        currentTime,
        { toPxX, toPxY, toLen, sw, config, W, H },
        {
          nodeS,
          nodeG,
          nodeA,
          nodeB,
          selectedNodeId: selectedNodeId ?? null,
          hoveredNodeId: hoveredNode,
          marqueeBox,
        }
      );
    } else if (sceneId === 'chapter2_pdf') {
      renderChapter2PdfScene(ctx, currentTime, { toPxX, toPxY, toLen, sw, config });
    } else if (sceneId === 'neural_net') {
      renderNeuralNetScene(ctx, currentTime, { toPxX, toPxY, toLen, sw, config });
    } else if (sceneId === 'fourier') {
      renderFourierScene(ctx, currentTime, { toPxX, toPxY, toLen, sw, config });
    } else if (sceneId === 'linear_transform') {
      renderLinearTransformScene(ctx, currentTime, { toPxX, toPxY, toLen, sw, config, W, H });
    } else if (sceneId === 'riemann_calculus') {
      renderRiemannScene(ctx, currentTime, { toPxX, toPxY, toLen, sw, config });
    }

    if (config.showCameraFrameHud) {
      drawCameraHud(ctx, W, H, cam);
    }
  }, [
    sceneId,
    currentTime,
    config,
    canvasRef,
    onCameraTelemetry,
    nodeS,
    nodeG,
    nodeA,
    nodeB,
    selectedNodeId,
    hoveredNode,
    marqueeBox,
  ]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center select-none">
      <canvas
        ref={canvasRef}
        width={1600}
        height={900}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        style={{ cursor: cursorStyle }}
        className="max-w-full max-h-full aspect-video block bg-black"
      />
    </div>
  );
};

/**
 * Computes C2-smooth MovingCameraScene (x, y, zoom) per scene & timestamp
 */
function computeCameraState(
  sceneId: SceneId,
  t: number,
  config: ManimRenderConfig
): { x: number; y: number; zoom: number } {
  if (config.cameraOverride.active) {
    return {
      x: config.cameraOverride.x,
      y: config.cameraOverride.y,
      zoom: config.cameraOverride.zoom,
    };
  }

  if (sceneId === 'astar_heuristic') {
    let x = 0.0;
    let y = 0.0;
    let zoom = 1.0;

    // Beat 2: Dijkstra's blind wave - center slightly toward Start node S
    const p2 = windowProgress(t, 4.8, 6.2);
    x = lerp(x, -0.25, p2);
    y = lerp(y, 0.0, p2);
    zoom = lerp(zoom, 1.02, p2);

    // Beat 3: Heuristic vector - center around candidate Node A and Goal G
    const p3 = windowProgress(t, 9.2, 10.8);
    x = lerp(x, 0.15, p3);
    y = lerp(y, 0.08, p3);
    zoom = lerp(zoom, 1.10, p3);

    // Beat 4: Frontier evaluation overview
    const p4 = windowProgress(t, 14.6, 16.0);
    x = lerp(x, 0.0, p4);
    y = lerp(y, 0.0, p4);
    zoom = lerp(zoom, 1.0, p4);

    // Beat 5: Admissibility branch - focus on Manhattan staircase vs Euclidean hypotenuse
    const p5 = windowProgress(t, 19.6, 21.0);
    x = lerp(x, 0.2, p5);
    y = lerp(y, -0.08, p5);
    zoom = lerp(zoom, 1.03, p5);

    return { x, y, zoom };
  }

  if (sceneId === 'chapter2_pdf') {
    // 6-Zone Spatial Blackboard for Chapter 2 PDF:
    // Zone 1 (0.0 - 5.2s): (-7.0, 0.0)   — Lesson 1A: 3 Perspectives Triad
    // Zone 2 (5.2 - 10.5s): (+7.0, 0.0)  — Lesson 1B: Past vs Today Matrix
    // Zone 3 (10.5 - 16.2s): (-7.0, -9.0) — Lesson 1C: 10 Characteristics & Risk Curve
    // Zone 4 (16.2 - 20.8s): (+7.0, -9.0) — Lesson 2: How Entrepreneurs Think
    // Zone 5 (20.8 - 25.4s): (-7.0, -18.0)— Lesson 3: Camuffo Emotional 2x2 Portfolio
    // Zone 6 (25.4 - 30.0s): (+7.0, -18.0)— Lesson 4: 8 Decision Styles & Maxim
    let x = -7.0;
    let y = 0.0;
    let zoom = 1.0;

    const p1to2 = windowProgress(t, 4.8, 6.2);
    x = lerp(x, 7.0, p1to2);
    y = lerp(y, 0.0, p1to2);

    const p2to3 = windowProgress(t, 10.1, 11.6);
    x = lerp(x, -7.0, p2to3);
    y = lerp(y, -9.0, p2to3);

    const p3to4 = windowProgress(t, 15.8, 17.2);
    x = lerp(x, 7.0, p3to4);
    y = lerp(y, -9.0, p3to4);

    const p4to5 = windowProgress(t, 20.4, 21.8);
    x = lerp(x, -7.0, p4to5);
    y = lerp(y, -18.0, p4to5);

    const p5to6 = windowProgress(t, 25.0, 26.4);
    x = lerp(x, 7.0, p5to6);
    y = lerp(y, -18.0, p5to6);

    return { x, y, zoom };
  }

  if (sceneId === 'neural_net') {
    let x = 0;
    let y = 0;
    let zoom = 1.0;

    const p3 = windowProgress(t, 6.6, 8.2);
    x = lerp(x, -0.45, p3);
    y = lerp(y, -0.1, p3);
    zoom = lerp(zoom, 1.04, p3);

    const p4 = windowProgress(t, 10.0, 11.4);
    x = lerp(x, 0.35, p4);
    y = lerp(y, -0.15, p4);
    zoom = lerp(zoom, 1.05, p4);

    const p5 = windowProgress(t, 13.6, 15.8);
    x = lerp(x, 2.75, p5);
    y = lerp(y, -0.12, p5);
    zoom = lerp(zoom, 0.88, p5);

    const p6 = windowProgress(t, 18.2, 19.6);
    x = lerp(x, 3.35, p6);
    y = lerp(y, -0.08, p6);
    zoom = lerp(zoom, 0.94, p6);

    const p7 = windowProgress(t, 21.3, 22.6);
    x = lerp(x, 2.35, p7);
    y = lerp(y, -0.08, p7);
    zoom = lerp(zoom, 0.87, p7);

    return { x, y, zoom };
  }

  if (sceneId === 'fourier') {
    const pZoomIn = windowProgress(t, 8.2, 10.4);
    const pZoomOut = windowProgress(t, 13.5, 15.6);
    const activeZoom = pZoomIn * (1 - pZoomOut);
    return {
      x: lerp(0, -2.6, activeZoom),
      y: lerp(0, -0.25, activeZoom),
      zoom: lerp(1.0, 1.72, activeZoom),
    };
  }

  if (sceneId === 'linear_transform') {
    const pWarp = windowProgress(t, 8.0, 12.5);
    return {
      x: lerp(0, 0.35, pWarp),
      y: lerp(0, 0.15, pWarp),
      zoom: lerp(1.0, 0.88, pWarp),
    };
  }

  if (sceneId === 'riemann_calculus') {
    const pFocusRect = windowProgress(t, 4.0, 5.8);
    const pUnfocus = windowProgress(t, 8.8, 10.2);
    const pPanRight = windowProgress(t, 13.8, 15.8);
    let x = -1.2;
    let y = -0.1;
    let zoom = 1.02;
    x = lerp(x, -1.65, pFocusRect);
    zoom = lerp(zoom, 1.12, pFocusRect);
    x = lerp(x, -1.0, pUnfocus);
    zoom = lerp(zoom, 0.98, pUnfocus);
    x = lerp(x, 1.65, pPanRight);
    zoom = lerp(zoom, 0.88, pPanRight);
    return { x, y, zoom };
  }

  return { x: 0, y: 0, zoom: 1 };
}

interface RenderHelpers {
  toPxX: (mx: number) => number;
  toPxY: (my: number) => number;
  toLen: (mLen: number) => number;
  sw: (w: number) => number;
  config: ManimRenderConfig;
  W?: number;
  H?: number;
}

interface AStarInteractiveState {
  nodeS: { x: number; y: number };
  nodeG: { x: number; y: number };
  nodeA: { x: number; y: number };
  nodeB: { x: number; y: number };
  selectedNodeId: 'S' | 'G' | 'A' | 'B' | null;
  hoveredNodeId: 'S' | 'G' | 'A' | 'B' | null;
  marqueeBox: { x1: number; y1: number; x2: number; y2: number } | null;
}

/* ============================================================================
 * A* PATHFINDING & HEURISTICS (Authentic 3Blue1Brown MovingCameraScene)
 * Strict Layer Ordering: Grid -> Dijkstra Wave -> Manhattan Path -> Projections -> Arrows -> Nodes -> Math
 * ============================================================================ */
function renderAStarScene(
  ctx: CanvasRenderingContext2D,
  t: number,
  h: RenderHelpers,
  interactive: AStarInteractiveState
) {
  const { toPxX, toPxY, toLen, sw } = h;
  const { nodeS, nodeG, nodeA, nodeB, selectedNodeId, hoveredNodeId, marqueeBox } = interactive;

  // Real-time calculations based on active node positions
  const dxA = nodeG.x - nodeA.x;
  const dyA = nodeG.y - nodeA.y;
  const hA = Math.hypot(dxA, dyA);
  const gA = Math.hypot(nodeA.x - nodeS.x, nodeA.y - nodeS.y);
  const fA = gA + hA;

  const dxB = nodeG.x - nodeB.x;
  const dyB = nodeG.y - nodeB.y;
  const hB = Math.hypot(dxB, dyB);
  const gB = Math.hypot(nodeB.x - nodeS.x, nodeB.y - nodeS.y);
  const fB = gB + hB;

  const hMan = Math.abs(dxA) + Math.abs(dyA);

  // Screen pixel coordinates for all 4 interactive nodes
  const sPxX = toPxX(nodeS.x);
  const sPxY = toPxY(nodeS.y);
  const gPxX = toPxX(nodeG.x);
  const gPxY = toPxY(nodeG.y);
  const aPxX = toPxX(nodeA.x);
  const aPxY = toPxY(nodeA.y);
  const bPxX = toPxX(nodeB.x);
  const bPxY = toPxY(nodeB.y);

  const radS = toLen(0.28);
  const radG = toLen(0.28);
  const radA = toLen(0.25);
  const radB = toLen(0.25);

  // C2-continuous smooth rate progress curves
  const pBeat1 = windowProgress(t, 0.2, 1.8);
  const pBeat2 = windowProgress(t, 5.0, 7.8);
  const pBeat3 = windowProgress(t, 9.4, 11.2);
  const pBeat4 = windowProgress(t, 14.8, 16.5);
  const pBeat5 = windowProgress(t, 19.8, 21.8);

  // =========================================================================
  // LAYER 0: NUMBERPLANE GRID ARENA & AXES
  // =========================================================================
  ctx.save();
  ctx.globalAlpha = pBeat1;
  ctx.lineWidth = sw(1.0);
  ctx.strokeStyle = '#181C24';
  for (let gx = -7; gx <= 7; gx += 1) {
    ctx.beginPath();
    const reveal = windowProgress(t, .05 + Math.abs(gx) * .055, 1.1 + Math.abs(gx) * .055);
    ctx.moveTo(toPxX(gx), toPxY(-4 * reveal));
    ctx.lineTo(toPxX(gx), toPxY(4 * reveal));
    ctx.stroke();
  }
  for (let gy = -4; gy <= 4; gy += 1) {
    ctx.beginPath();
    const reveal = windowProgress(t, .08 + Math.abs(gy) * .08, 1.2 + Math.abs(gy) * .08);
    ctx.moveTo(toPxX(-7 * reveal), toPxY(gy));
    ctx.lineTo(toPxX(7 * reveal), toPxY(gy));
    ctx.stroke();
  }

  // Coordinate axes
  ctx.strokeStyle = '#2B3245';
  ctx.lineWidth = sw(1.5);
  ctx.beginPath();
  ctx.moveTo(toPxX(-7.2), toPxY(0));
  ctx.lineTo(toPxX(7.2), toPxY(0));
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toPxX(0), toPxY(-4.2));
  ctx.lineTo(toPxX(0), toPxY(4.2));
  ctx.stroke();

  // Axis Labels
  ctx.font = 'italic 12px "Lora", Georgia, serif';
  ctx.fillStyle = MANIM_PALETTE.GREY_C;
  ctx.fillText('+x', toPxX(7.2) - 15, toPxY(0) + 18);
  ctx.fillText('+y', toPxX(0) + 12, toPxY(4.2) + 15);
  ctx.restore();

  // =========================================================================
  // LAYER 1: DIJKSTRA BLIND EXPANSION WAVE (BEAT 2: 5.0s - 9.5s)
  // Origin dynamically follows nodeS
  // =========================================================================
  if (t >= 5.0) {
    const waveProgress = windowProgress(t, 5.0, 7.8);
    const waveFade = windowProgress(t, 8.8, 9.8);
    const waveAlpha = (1 - waveFade) * 0.75;

    if (waveAlpha > 0.01) {
      const maxRadius = toLen(4.2 * manimSmooth(waveProgress));
      ctx.save();
      ctx.globalAlpha = waveAlpha;
      ctx.lineWidth = sw(1.8);
      ctx.setLineDash([8, 6]);

      for (let r = 1; r <= 3; r++) {
        const rad = (maxRadius * r) / 3;
        if (rad > 5) {
          ctx.strokeStyle = r === 3 ? MANIM_PALETTE.BLUE_C : MANIM_PALETTE.BLUE_E;
          ctx.beginPath();
          ctx.arc(sPxX, sPxY, rad, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Indicator arrow showing blind expansion moving away from Goal
      const angleWasted = Math.PI * 1.15;
      const wX = sPxX + Math.cos(angleWasted) * maxRadius * 0.85;
      const wY = sPxY + Math.sin(angleWasted) * maxRadius * 0.85;
      ctx.setLineDash([]);
      drawManimArrow(ctx, sPxX, sPxY, wX, wY, MANIM_PALETTE.BLUE_D, sw(1.4), waveAlpha * 0.8);
      ctx.restore();
    }
  }

  // =========================================================================
  // LAYER 2: MANHATTAN 4-CONNECTED GRID STAIRCASE PATH (BEAT 5: 20.0s - 25.0s)
  // CRITICAL: Drawn BEFORE nodes and arrows so dots sit ON TOP!
  // =========================================================================
  if (t >= 20.0) {
    ctx.save();
    ctx.globalAlpha = pBeat5;
    ctx.strokeStyle = MANIM_PALETTE.RED_C;
    ctx.lineWidth = sw(2.2);
    ctx.setLineDash([8, 6]);

    const steps = 4;
    const totalSegs = steps * 2;
    const drawP = manimSmooth(pBeat5);
    const activeSegs = drawP * totalSegs;

    ctx.beginPath();
    ctx.moveTo(aPxX, aPxY);

    let curX = nodeA.x;
    let curY = nodeA.y;
    const stepDx = dxA / steps;
    const stepDy = dyA / steps;

    for (let s = 0; s < steps; s++) {
      const segH = s * 2;
      const segV = s * 2 + 1;

      // Horizontal step
      if (activeSegs > segH) {
        const segP = clamp(activeSegs - segH, 0, 1);
        const targetX = lerp(curX, curX + stepDx, segP);
        ctx.lineTo(toPxX(targetX), toPxY(curY));
        if (segP >= 1.0) curX += stepDx;
      }

      // Vertical step
      if (activeSegs > segV) {
        const segP = clamp(activeSegs - segV, 0, 1);
        const targetY = lerp(curY, curY + stepDy, segP);
        ctx.lineTo(toPxX(curX), toPxY(targetY));
        if (segP >= 1.0) curY += stepDy;
      }
    }
    ctx.stroke();
    ctx.restore();

    if (pBeat5 >= 0.5) {
      ctx.save();
      ctx.font = 'italic 13.5px "Lora", Georgia, serif';
      ctx.fillStyle = MANIM_PALETTE.RED_C;
      ctx.textAlign = 'center';
      const labelX = toPxX(nodeA.x + dxA * 0.5);
      const labelY = toPxY(nodeA.y + dyA * 0.2);
      ctx.fillText(`Manhattan Grid Path = ${hMan.toFixed(1)}`, labelX, labelY + 22);
      ctx.restore();
    }
  }

  // =========================================================================
  // LAYER 3: DASHED PROJECTION TRIANGLE (BEAT 3: 9.5s - 20.5s)
  // Dashed right triangle: horizontal Δx, vertical Δy with inward right-angle
  // =========================================================================
  if (t >= 9.5) {
    const pTriLeg1 = windowProgress(t, 11.0, 12.2);
    const pTriLeg2 = windowProgress(t, 12.0, 13.2);
    // Smoothly fade out when Beat 5 begins so it never overlaps with the Manhattan grid path
    const pTriFade = windowProgress(t, 19.8, 20.8);
    const triAlpha = 1.0 - pTriFade;

    if (triAlpha > 0.01) {
      const cornerPxX = toPxX(nodeG.x);
      const cornerPxY = toPxY(nodeA.y);

      ctx.save();
      ctx.globalAlpha = triAlpha;
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = MANIM_PALETTE.GREY_B;
      ctx.lineWidth = sw(1.6);

      // Horizontal leg (Δx)
      if (pTriLeg1 > 0) {
        ctx.beginPath();
        ctx.moveTo(aPxX, aPxY);
        ctx.lineTo(lerp(aPxX, cornerPxX, pTriLeg1), aPxY);
        ctx.stroke();
      }

      // Vertical leg (Δy)
      if (pTriLeg2 > 0) {
        ctx.beginPath();
        ctx.moveTo(cornerPxX, cornerPxY);
        ctx.lineTo(cornerPxX, lerp(cornerPxY, gPxY, pTriLeg2));
        ctx.stroke();
      }

      // 3B1B Right-angle square bracket at corner, strictly INSIDE the triangle facing hypotenuse
      if (pTriLeg2 >= 0.9) {
        const sqSize = toLen(0.18);
        ctx.setLineDash([]);
        ctx.strokeStyle = MANIM_PALETTE.GREY_C;
        ctx.lineWidth = sw(1.3);

        const signX = Math.sign(aPxX - cornerPxX) || -1;
        const signY = Math.sign(gPxY - cornerPxY) || -1;
        const hx = signX * sqSize;
        const vy = signY * sqSize;

        ctx.beginPath();
        ctx.moveTo(cornerPxX + hx, cornerPxY);
        ctx.lineTo(cornerPxX + hx, cornerPxY + vy);
        ctx.lineTo(cornerPxX, cornerPxY + vy);
        ctx.stroke();
      }

      // Δx and Δy labels
      if (pTriLeg1 >= 0.5) {
        ctx.font = 'italic 12.5px "Lora", Georgia, serif';
        ctx.fillStyle = MANIM_PALETTE.GREY_A;
        ctx.textAlign = 'center';
        ctx.fillText(`Δx = ${Math.abs(dxA).toFixed(1)}`, (aPxX + cornerPxX) / 2, aPxY + (dyA >= 0 ? 16 : -12));
      }
      if (pTriLeg2 >= 0.5) {
        ctx.font = 'italic 12.5px "Lora", Georgia, serif';
        ctx.fillStyle = MANIM_PALETTE.GREY_A;
        ctx.textAlign = dxA >= 0 ? 'left' : 'right';
        ctx.fillText(`Δy = ${Math.abs(dyA).toFixed(1)}`, cornerPxX + (dxA >= 0 ? 10 : -10), (cornerPxY + gPxY) / 2);
      }
      ctx.restore();
    }
  }

  // =========================================================================
  // LAYER 4: HEURISTIC VECTOR ARROWS
  // Animated arrow tips connecting node circle perimeters cleanly
  // =========================================================================
  // Trace the cost already travelled before comparing it to the estimate.
  if (t >= 14.8) {
    for (const [node, label, cost, begin] of [[nodeA, 'A', gA, 14.8], [nodeB, 'B', gB, 15.5]] as const) {
      const p = windowProgress(t, begin, begin + 1.5);
      const x = lerp(nodeS.x, node.x, p), y = lerp(nodeS.y, node.y, p);
      ctx.save();
      ctx.strokeStyle = MANIM_PALETTE.GREEN_C; ctx.lineWidth = sw(2.3); ctx.globalAlpha = p;
      ctx.beginPath(); ctx.moveTo(sPxX, sPxY); ctx.lineTo(toPxX(x), toPxY(y)); ctx.stroke();
      if (p > .02 && p < .99) {
        ctx.fillStyle = MANIM_PALETTE.GREEN_C; ctx.beginPath(); ctx.arc(toPxX(x), toPxY(y), toLen(.065), 0, Math.PI * 2); ctx.fill();
      }
      if (p > .8) {
        ctx.fillStyle = MANIM_PALETTE.GREEN_C; ctx.font = `italic ${Math.round(toLen(.18))}px Georgia,serif`; ctx.textAlign = 'center';
        ctx.fillText(`g(${label}) = ${cost.toFixed(2)}`, toPxX((nodeS.x + node.x) / 2), toPxY((nodeS.y + node.y) / 2) + toLen(.25));
      }
      ctx.restore();
    }
  }

  // Arrow A (from Node A to Goal G)
  if (t >= 9.5) {
    const pArrowA = windowProgress(t, 10.2, 11.6);
    if (pArrowA > 0.05) {
      const angleA = Math.atan2(gPxY - aPxY, gPxX - aPxX);
      const startX = aPxX + Math.cos(angleA) * radA;
      const startY = aPxY + Math.sin(angleA) * radA;
      const endX = gPxX - Math.cos(angleA) * (radG + 2);
      const endY = gPxY - Math.sin(angleA) * (radG + 2);

      const curTargetX = lerp(startX, endX, manimSmooth(pArrowA));
      const curTargetY = lerp(startY, endY, manimSmooth(pArrowA));
      drawManimArrow(ctx, startX, startY, curTargetX, curTargetY, MANIM_PALETTE.YELLOW_C, sw(2.8), pArrowA);

      if (pArrowA >= 0.8) {
        ctx.save();
        ctx.font = 'bold italic 14px "Lora", Georgia, serif';
        ctx.fillStyle = MANIM_PALETTE.YELLOW_C;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`h(A) = ${hA.toFixed(2)}`, (aPxX + gPxX) / 2, (aPxY + gPxY) / 2 - 8);
        ctx.restore();
      }
    }
  }

  // Arrow B (from Node B to Goal G)
  if (t >= 14.8) {
    const pArrowB = windowProgress(t, 15.4, 16.8);
    if (pArrowB > 0.05) {
      const angleB = Math.atan2(gPxY - bPxY, gPxX - bPxX);
      const startX = bPxX + Math.cos(angleB) * radB;
      const startY = bPxY + Math.sin(angleB) * radB;
      const endX = gPxX - Math.cos(angleB) * (radG + 2);
      const endY = gPxY - Math.sin(angleB) * (radG + 2);

      const curTargetX = lerp(startX, endX, manimSmooth(pArrowB));
      const curTargetY = lerp(startY, endY, manimSmooth(pArrowB));
      drawManimArrow(ctx, startX, startY, curTargetX, curTargetY, MANIM_PALETTE.YELLOW_D, sw(2.2), pArrowB);
    }
  }

  // =========================================================================
  // LAYER 5: INTERACTIVE NODE DOTS (S, G, A, B)
  // With GrowFromCenter radius animation and crisp white borders
  // =========================================================================
  // 1. Start Node S (Green)
  {
    const curRadS = radS * manimSmooth(pBeat1);
    if (curRadS > 0.5) {
      // Subtle pulse during 1.5s visual absorption pause
      const sPulse = thereAndBack(windowProgress(t, 1.5, 3.2));
      if (sPulse > 0) {
        ctx.save();
        ctx.strokeStyle = MANIM_PALETTE.GREEN_C;
        ctx.lineWidth = sw(1.5);
        ctx.beginPath();
        ctx.arc(sPxX, sPxY, curRadS + toLen(0.16) * sPulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.fillStyle = MANIM_PALETTE.GREEN_C;
      ctx.beginPath();
      ctx.arc(sPxX, sPxY, curRadS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = MANIM_PALETTE.WHITE;
      ctx.lineWidth = sw(2.0);
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = `bold ${Math.round(toLen(0.3))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('S', sPxX, sPxY);

      // Clean label below node (no bubble box)
      ctx.font = 'italic 13px "Lora", Georgia, serif';
      ctx.fillStyle = MANIM_PALETTE.GREEN_C;
      ctx.fillText(`Start S (${nodeS.x.toFixed(1)}, ${nodeS.y.toFixed(1)})`, sPxX, sPxY + toLen(0.48));
      ctx.restore();
    }
  }

  // 2. Goal Node G (Red)
  {
    const curRadG = radG * manimSmooth(pBeat1);
    if (curRadG > 0.5) {
      const gPulse = thereAndBack(windowProgress(t, 2.0, 3.8));
      if (gPulse > 0) {
        ctx.save();
        ctx.strokeStyle = MANIM_PALETTE.RED_C;
        ctx.lineWidth = sw(1.5);
        ctx.beginPath();
        ctx.arc(gPxX, gPxY, curRadG + toLen(0.16) * gPulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.fillStyle = MANIM_PALETTE.RED_C;
      ctx.beginPath();
      ctx.arc(gPxX, gPxY, curRadG, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = MANIM_PALETTE.WHITE;
      ctx.lineWidth = sw(2.0);
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = `bold ${Math.round(toLen(0.3))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('G', gPxX, gPxY);

      ctx.font = 'italic 13px "Lora", Georgia, serif';
      ctx.fillStyle = MANIM_PALETTE.RED_C;
      ctx.fillText(`Goal G (${nodeG.x.toFixed(1)}, ${nodeG.y.toFixed(1)})`, gPxX, gPxY + toLen(0.48));
      ctx.restore();
    }
  }

  // 3. Candidate Node A (Blue)
  if (t >= 9.2) {
    const pNodeA = windowProgress(t, 9.2, 10.4);
    const curRadA = radA * manimSmooth(pNodeA);
    if (curRadA > 0.5) {
      ctx.save();
      ctx.fillStyle = MANIM_PALETTE.BLUE_C;
      ctx.beginPath();
      ctx.arc(aPxX, aPxY, curRadA, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = MANIM_PALETTE.WHITE;
      ctx.lineWidth = sw(2.0);
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = `bold ${Math.round(toLen(0.28))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('A', aPxX, aPxY);

      ctx.font = 'italic 13px "Lora", Georgia, serif';
      ctx.fillStyle = MANIM_PALETTE.BLUE_C;
      ctx.fillText(`Node A (${nodeA.x.toFixed(1)}, ${nodeA.y.toFixed(1)})`, aPxX, aPxY + toLen(0.48));
      ctx.restore();
    }
  }

  // 4. Candidate Node B (Yellow)
  if (t >= 14.6) {
    const pNodeB = windowProgress(t, 14.6, 15.6);
    const curRadB = radB * manimSmooth(pNodeB);
    if (curRadB > 0.5) {
      ctx.save();
      ctx.fillStyle = MANIM_PALETTE.YELLOW_D;
      ctx.beginPath();
      ctx.arc(bPxX, bPxY, curRadB, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = MANIM_PALETTE.WHITE;
      ctx.lineWidth = sw(2.0);
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = `bold ${Math.round(toLen(0.28))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('B', bPxX, bPxY);

      ctx.font = 'italic 13px "Lora", Georgia, serif';
      ctx.fillStyle = MANIM_PALETTE.YELLOW_D;
      ctx.fillText(`Node B (${nodeB.x.toFixed(1)}, ${nodeB.y.toFixed(1)})`, bPxX, bPxY + toLen(0.48));
      ctx.restore();
    }
  }

  // Selection & Hover Halo Ring (No grey bubble box)
  if (selectedNodeId || hoveredNodeId) {
    const target = selectedNodeId || hoveredNodeId;
    const isTargetVisible =
      target === 'S' || target === 'G'
        ? t >= 0.5
        : target === 'A'
          ? t >= 9.2
          : t >= 14.6;

    if (isTargetVisible) {
      const tPos =
        target === 'S'
          ? { px: sPxX, py: sPxY, col: MANIM_PALETTE.GREEN_C }
          : target === 'G'
            ? { px: gPxX, py: gPxY, col: MANIM_PALETTE.RED_C }
            : target === 'A'
              ? { px: aPxX, py: aPxY, col: MANIM_PALETTE.BLUE_C }
              : { px: bPxX, py: bPxY, col: MANIM_PALETTE.YELLOW_D };

      ctx.save();
      ctx.strokeStyle = tPos.col;
      ctx.lineWidth = sw(1.8);
      ctx.beginPath();
      ctx.arc(tPos.px, tPos.py, toLen(0.42), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // =========================================================================
  // LAYER 6: MATHEMATICAL EQUATIONS & LABELS DIRECTLY ON BLACK CANVAS
  // ZERO GREY BUBBLE BOXES!
  // =========================================================================
  // Top Title (Center, y = 3.45)
  {
    drawManimWriteText(
      ctx,
      t < 9.5 ? 'How can we choose a direction?' : t < 15 ? 'Estimate the distance still to go' : 'Balance travelled cost with the remaining estimate',
      toPxX(0.0),
      toPxY(3.45),
      toLen(0.28),
      MANIM_PALETTE.WHITE,
      pBeat1,
      'center'
    );
  }

  // Beat 2: Dijkstra Blind Wave Text (Top Left)
  if (t >= 5.0 && t < 10.0) {
    const pDijkstra = windowProgress(t, 5.2, 6.4);
    const fade = windowProgress(t, 8.8, 9.8);
    ctx.save();
    ctx.globalAlpha = 1 - fade;
    drawManimWriteText(
      ctx,
      'Search by travelled cost: g(n) alone',
      toPxX(-5.8),
      toPxY(2.9),
      toLen(0.22),
      MANIM_PALETTE.BLUE_C,
      pDijkstra,
      'left'
    );
    drawManimWriteText(
      ctx,
      'Equal-cost open space: the frontier spreads outward',
      toPxX(-5.8),
      toPxY(2.5),
      toLen(0.18),
      MANIM_PALETTE.GREY_B,
      pDijkstra,
      'left'
    );
    drawManimWriteText(
      ctx,
      'h(n) = 0: no estimate of the distance still to go',
      toPxX(-5.8),
      toPxY(2.1),
      toLen(0.18),
      MANIM_PALETTE.YELLOW_D,
      pDijkstra,
      'left'
    );
    ctx.restore();
  }

  // Beat 3: Heuristic Formula (Top Left)
  if (t >= 9.6) {
    const pForm = windowProgress(t, 12.9, 14.4);
    drawManimWriteText(
      ctx,
      'Euclidean Heuristic: h(n) = √(Δx² + Δy²)',
      toPxX(-5.8),
      toPxY(2.9),
      toLen(0.22),
      MANIM_PALETTE.YELLOW_C,
      pForm,
      'left'
    );
    drawManimWriteText(
      ctx,
      `• h(A) = √(${Math.abs(dxA).toFixed(1)}² + ${Math.abs(dyA).toFixed(1)}²) = ${hA.toFixed(2)}`,
      toPxX(-5.8),
      toPxY(2.5),
      toLen(0.19),
      MANIM_PALETTE.WHITE,
      pForm,
      'left'
    );
    drawManimWriteText(
      ctx,
      '• Straight-line Euclidean hypotenuse pulls search toward Goal G',
      toPxX(-5.8),
      toPxY(2.1),
      toLen(0.17),
      MANIM_PALETTE.GREY_B,
      pForm,
      'left'
    );
  }

  // Beat 4: Frontier Evaluation (Top Right)
  if (t >= 14.8) {
    const pTable = windowProgress(t, 16.8, 18.4);
    const isAPrioritized = fA <= fB;

    drawManimWriteText(
      ctx,
      'Frontier Evaluation: f(n) = g(n) + h(n)',
      toPxX(5.8),
      toPxY(3.15),
      toLen(0.22),
      MANIM_PALETTE.BLUE_C,
      pTable,
      'right'
    );
    drawManimWriteText(
      ctx,
      `Node A: g=${gA.toFixed(2)} + h=${hA.toFixed(2)} ⇒ f=${fA.toFixed(2)} ${isAPrioritized ? '★ PRIORITIZED' : ''}`,
      toPxX(5.8),
      toPxY(2.75),
      toLen(0.19),
      isAPrioritized ? MANIM_PALETTE.GREEN_C : MANIM_PALETTE.GREY_B,
      pTable,
      'right'
    );
    drawManimWriteText(
      ctx,
      `Node B: g=${gB.toFixed(2)} + h=${hB.toFixed(2)} ⇒ f=${fB.toFixed(2)} ${!isAPrioritized ? '★ PRIORITIZED' : '[HELD IN QUEUE]'}`,
      toPxX(5.8),
      toPxY(2.35),
      toLen(0.19),
      !isAPrioritized ? MANIM_PALETTE.GREEN_C : MANIM_PALETTE.YELLOW_D,
      pTable,
      'right'
    );
  }

  // Beat 5: Admissibility Theorem (Center, comfortably above chat bar)
  if (t >= 20.0) {
    const pAdmiss = windowProgress(t, 20.4, 21.8);
    drawManimWriteText(
      ctx,
      `A lower bound: Euclidean h(A) = ${hA.toFixed(2)} ≤ remaining path cost`,
      toPxX(0.0),
      toPxY(-2.05),
      toLen(0.24),
      MANIM_PALETTE.GREEN_C,
      pAdmiss,
      'center'
    );
    drawManimWriteText(
      ctx,
      `Four-way unit grid: Manhattan = ${hMan.toFixed(2)}. The movement costs determine which estimate is valid.`,
      toPxX(0.0),
      toPxY(-2.45),
      toLen(0.18),
      MANIM_PALETTE.WHITE,
      pAdmiss,
      'center'
    );
  }

  // Marquee Selection Box
  if (marqueeBox) {
    ctx.save();
    ctx.strokeStyle = MANIM_PALETTE.BLUE_C;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    const bx = Math.min(marqueeBox.x1, marqueeBox.x2);
    const by = Math.min(marqueeBox.y1, marqueeBox.y2);
    const bw = Math.abs(marqueeBox.x2 - marqueeBox.x1);
    const bh = Math.abs(marqueeBox.y2 - marqueeBox.y1);
    ctx.fillStyle = 'rgba(88, 196, 221, 0.12)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.restore();
  }
}

/* ============================================================================
 * CHAPTER 2 PDF EXPLAINER: ENTREPRENEURS & ENTREPRENEURIAL COMPETENCIES
 * 6-Zone Spatial MovingCameraScene covering all 53 slides of the uploaded PDF
 * ============================================================================ */
function renderChapter2PdfScene(ctx: CanvasRenderingContext2D, t: number, h: RenderHelpers) {
  const { toPxX, toPxY, toLen, sw, config } = h;

  // ---------------------------------------------------------------------------
  // ZONE 1 (-7.0, 0.0): LESSON 1A — 3 PERSPECTIVES ON ENTREPRENEURS (Slides 1–6)
  // ---------------------------------------------------------------------------
  {
    const zx = -7.0;
    const zy = 0.0;
    const writeP = windowProgress(t, 0.1, 1.4, false);

    drawManimWriteText(
      ctx,
      'Chapter 2 · Lesson 1: Concepts of Entrepreneurs Today',
      toPxX(zx),
      toPxY(zy + 3.25),
      toLen(0.32),
      MANIM_PALETTE.WHITE,
      writeP,
      'center'
    );

    // Subtle header rule
    const ruleP = windowProgress(t, 0.9, 1.8);
    if (ruleP > 0) {
      ctx.strokeStyle = MANIM_PALETTE.GREY_C;
      ctx.lineWidth = sw(1.5);
      ctx.beginPath();
      ctx.moveTo(toPxX(zx - 4.8 * ruleP), toPxY(zy + 2.88));
      ctx.lineTo(toPxX(zx + 4.8 * ruleP), toPxY(zy + 2.88));
      ctx.stroke();
    }

    // Central Entrepreneur Node E
    const centerP = windowProgress(t, 1.0, 2.0);
    if (centerP > 0) {
      const cx = toPxX(zx);
      const cy = toPxY(zy - 0.25);
      const r = toLen(0.78);

      ctx.fillStyle = MANIM_PALETTE.BLACK;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = MANIM_PALETTE.WHITE;
      ctx.lineWidth = sw(2.6);
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * centerP);
      ctx.stroke();

      ctx.globalAlpha = centerP;
      ctx.fillStyle = MANIM_PALETTE.WHITE;
      ctx.font = `italic 600 ${Math.round(toLen(0.24))}px "Lora", serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Entrepreneur', cx, cy - toLen(0.12));
      ctx.fillStyle = MANIM_PALETTE.YELLOW_C;
      ctx.font = `italic ${Math.round(toLen(0.22))}px "Lora", serif`;
      ctx.fillText('E(R, F, M)', cx, cy + toLen(0.22));
      ctx.globalAlpha = 1.0;
    }

    // 3 Perspective Boxes & Converging Vector Arrows
    const perspectives = [
      {
        title: '1. From an Economist (Slide 4)',
        line1: 'Combines resources, labor & materials;',
        line2: 'introduces innovations & a new order',
        math: 'ΔV = f(K, L, Innovation) > 0',
        color: MANIM_PALETTE.BLUE_C,
        bx: zx - 4.45,
        by: zy + 1.15,
        ax1: zx - 2.45,
        ay1: zy + 0.85,
        ax2: zx - 0.78,
        ay2: zy + 0.1,
        startT: 1.6,
      },
      {
        title: '2. From a Psychologist (Slide 5)',
        line1: 'Driven by inner forces: need to attain,',
        line2: 'experiment, accomplish, or escape authority',
        math: 'F_drive = α·Attain + β·Autonomy',
        color: MANIM_PALETTE.YELLOW_C,
        bx: zx - 4.45,
        by: zy - 1.75,
        ax1: zx - 2.45,
        ay1: zy - 1.4,
        ax2: zx - 0.78,
        ay2: zy - 0.58,
        startT: 2.3,
      },
      {
        title: '3. Management Perspective (Slide 6)',
        line1: 'Identifies opportunities, plans, mobilizes',
        line2: 'resources, manages & assumes business risk',
        math: 'Opportunity → Plan → Mobilize → Risk',
        color: MANIM_PALETTE.TEAL_C,
        bx: zx + 4.35,
        by: zy - 0.25,
        ax1: zx + 2.35,
        ay1: zy - 0.25,
        ax2: zx + 0.82,
        ay2: zy - 0.25,
        startT: 3.0,
      },
    ];

    for (const p of perspectives) {
      const boxP = windowProgress(t, p.startT, p.startT + 1.0);
      if (boxP <= 0) continue;

      const bw = 3.85;
      const bh = 1.65;
      const rx = toPxX(p.bx - bw / 2);
      const ry = toPxY(p.by + bh / 2);

      drawSurroundingRectangle(
        ctx,
        rx,
        ry,
        toLen(bw),
        toLen(bh),
        p.color,
        sw(2.0),
        boxP
      );

      ctx.save();
      ctx.globalAlpha = boxP;
      ctx.textAlign = 'left';
      ctx.fillStyle = p.color;
      ctx.font = `600 ${Math.round(toLen(0.22))}px "Lora", serif`;
      ctx.fillText(p.title, toPxX(p.bx - bw / 2 + 0.2), toPxY(p.by + 0.48));

      ctx.fillStyle = MANIM_PALETTE.WHITE;
      ctx.font = `${Math.round(toLen(0.185))}px "Lora", serif`;
      ctx.fillText(p.line1, toPxX(p.bx - bw / 2 + 0.2), toPxY(p.by + 0.1));
      ctx.fillText(p.line2, toPxX(p.bx - bw / 2 + 0.2), toPxY(p.by - 0.2));

      ctx.fillStyle = p.color;
      ctx.font = `italic ${Math.round(toLen(0.185))}px "IBM Plex Mono", monospace`;
      ctx.fillText(p.math, toPxX(p.bx - bw / 2 + 0.2), toPxY(p.by - 0.56));
      ctx.restore();

      // Converging Vector Arrow into E
      drawManimArrow(
        ctx,
        toPxX(p.ax1),
        toPxY(p.ay1),
        toPxX(lerp(p.ax1, p.ax2, boxP)),
        toPxY(lerp(p.ay1, p.ay2, boxP)),
        p.color,
        sw(2.4),
        boxP
      );
    }

    if (config.showMobjectBounds) {
      drawSurroundingRectangle(
        ctx,
        toPxX(zx - 6.6),
        toPxY(zy + 3.6),
        toLen(13.2),
        toLen(7.2),
        MANIM_PALETTE.TEAL_C,
        sw(1.0),
        1.0,
        true
      );
    }
  }

  // ---------------------------------------------------------------------------
  // ZONE 2 (+7.0, 0.0): LESSON 1B — 21st CENTURY SHIFT: PAST vs TODAY (Slides 7–9)
  // ---------------------------------------------------------------------------
  if (t >= 4.8) {
    const zx = 7.0;
    const zy = 0.0;
    const headP = windowProgress(t, 5.2, 6.4, false);

    drawManimWriteText(
      ctx,
      '21st Century Entrepreneurial Era: Past vs. Today (Slides 7–9)',
      toPxX(zx),
      toPxY(zy + 3.25),
      toLen(0.31),
      MANIM_PALETTE.YELLOW_C,
      headP,
      'center'
    );

    const rows = [
      { dim: '1. Educational Attainment', past: 'Less educated', today: 'Highly educated' },
      { dim: '2. Age Profile', past: 'Older', today: 'Younger' },
      { dim: '3. Gender Ownership', past: 'Dominated by males', today: 'Mixed ownership' },
      { dim: '4. Previous Experience', past: 'Less experienced', today: 'More experienced' },
      { dim: '5. Work Structure', past: 'Highly structured', today: 'Flexible (work-life balance)' },
      { dim: '6. Leadership Style', past: 'Directing', today: 'Empowering' },
      { dim: '7. Drive Orientation', past: 'To get ahead', today: 'To make a difference' },
      { dim: '8. Self-Confidence', past: '“I can do it”', today: '“We can do it”' },
    ];

    // Column Headers
    const colFade = windowProgress(t, 5.6, 6.4);
    ctx.save();
    ctx.globalAlpha = colFade;
    ctx.font = `600 ${Math.round(toLen(0.22))}px "Lora", serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = MANIM_PALETTE.GREY_B;
    ctx.fillText('Entrepreneur Dimension', toPxX(zx - 6.1), toPxY(zy + 2.45));
    ctx.fillStyle = MANIM_PALETTE.RED_C;
    ctx.fillText('Past Era', toPxX(zx - 1.65), toPxY(zy + 2.45));
    ctx.fillStyle = MANIM_PALETTE.GREEN_C;
    ctx.fillText('21st Century Today', toPxX(zx + 2.25), toPxY(zy + 2.45));

    ctx.strokeStyle = MANIM_PALETTE.GREY_D;
    ctx.lineWidth = sw(1.4);
    ctx.beginPath();
    ctx.moveTo(toPxX(zx - 6.2), toPxY(zy + 2.2));
    ctx.lineTo(toPxX(zx + 6.2), toPxY(zy + 2.2));
    ctx.stroke();

    for (let i = 0; i < rows.length; i++) {
      const rP = windowProgress(t, 6.0 + i * 0.32, 6.8 + i * 0.32);
      if (rP <= 0) continue;

      const ry = zy + 1.75 - i * 0.65;
      ctx.globalAlpha = rP;
      ctx.font = `${Math.round(toLen(0.205))}px "Lora", serif`;

      // Dimension
      ctx.fillStyle = MANIM_PALETTE.WHITE;
      ctx.fillText(rows[i].dim, toPxX(zx - 6.1), toPxY(ry));

      // Past
      ctx.fillStyle = MANIM_PALETTE.RED_C;
      ctx.fillText(rows[i].past, toPxX(zx - 1.65), toPxY(ry));

      // Transform Arrow
      drawManimArrow(
        ctx,
        toPxX(zx + 1.05),
        toPxY(ry + 0.06),
        toPxX(lerp(zx + 1.05, zx + 1.95, rP)),
        toPxY(ry + 0.06),
        MANIM_PALETTE.YELLOW_C,
        sw(1.8),
        rP
      );

      // Today
      ctx.fillStyle = i === 7 ? MANIM_PALETTE.YELLOW_C : MANIM_PALETTE.GREEN_C;
      ctx.font = i === 7 ? `600 italic ${Math.round(toLen(0.22))}px "Lora", serif` : `${Math.round(toLen(0.205))}px "Lora", serif`;
      ctx.fillText(rows[i].today, toPxX(zx + 2.25), toPxY(ry));

      // Row divider
      ctx.strokeStyle = '#1E2430';
      ctx.lineWidth = sw(1.0);
      ctx.beginPath();
      ctx.moveTo(toPxX(zx - 6.2), toPxY(ry - 0.25));
      ctx.lineTo(toPxX(zx + 6.2), toPxY(ry - 0.25));
      ctx.stroke();
    }

    // SurroundingRectangle around Row 8: "I can do it" -> "We can do it"
    const weBoxP = windowProgress(t, 8.8, 9.8);
    if (weBoxP > 0) {
      drawSurroundingRectangle(
        ctx,
        toPxX(zx - 6.25),
        toPxY(zy - 2.52),
        toLen(12.5),
        toLen(0.58),
        MANIM_PALETTE.YELLOW_C,
        sw(2.2),
        weBoxP
      );
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // ZONE 3 (-7.0, -9.0): LESSON 1C — 10 CHARACTERISTICS & CALCULATED RISK (Slides 10–27)
  // ---------------------------------------------------------------------------
  if (t >= 10.0) {
    const zx = -7.0;
    const zy = -9.0;
    const headP = windowProgress(t, 10.6, 11.8, false);

    drawManimWriteText(
      ctx,
      '10 Personal Characteristics & Calculated Risk-Taking (Slides 10–27)',
      toPxX(zx),
      toPxY(zy + 3.3),
      toLen(0.3),
      MANIM_PALETTE.WHITE,
      headP,
      'center'
    );

    // Left Sub-Zone: 10-Vertex Competency Radar Polygon
    const radarCx = zx - 3.35;
    const radarCy = zy - 0.25;
    const radarR = 2.15;
    const radarP = windowProgress(t, 11.2, 13.5);

    const traits = [
      { name: '1. Calculated Risk (Musk)', val: 0.92, col: MANIM_PALETTE.BLUE_C },
      { name: '2. Commitment (Zuckerberg)', val: 0.88, col: MANIM_PALETTE.TEAL_C },
      { name: '3. Feedback Seeking', val: 0.85, col: MANIM_PALETTE.YELLOW_C },
      { name: '4. Perseverance (Hershey)', val: 0.95, col: MANIM_PALETTE.GREEN_C },
      { name: '5. Drive to Achieve (Jack Ma)', val: 0.94, col: MANIM_PALETTE.BLUE_C },
      { name: '6. Self-Confidence (“Possible”)', val: 0.9, col: MANIM_PALETTE.YELLOW_C },
      { name: '7. Opportunity Orientation', val: 0.87, col: MANIM_PALETTE.TEAL_C },
      { name: '8. Innovativeness (Disney)', val: 0.93, col: MANIM_PALETTE.GREEN_C },
      { name: '9. Responsibility (S. Ramos)', val: 0.91, col: MANIM_PALETTE.BLUE_C },
      { name: '10. Failure Tolerance (Edison/Gates)', val: 0.94, col: MANIM_PALETTE.YELLOW_C },
    ];

    if (radarP > 0) {
      ctx.save();
      // Concentric reference decagons
      for (const ring of [0.4, 0.7, 1.0]) {
        ctx.strokeStyle = MANIM_PALETTE.GREY_D;
        ctx.lineWidth = sw(1.0);
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 10;
          const px = toPxX(radarCx + Math.cos(ang) * radarR * ring);
          const py = toPxY(radarCy - Math.sin(ang) * radarR * ring);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Active Competency Polygon
      ctx.fillStyle = MANIM_PALETTE.BLUE_C;
      ctx.globalAlpha = 0.22 * radarP;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const idx = i % 10;
        const ang = -Math.PI / 2 + (idx * 2 * Math.PI) / 10;
        const rVal = radarR * traits[idx].val * radarP;
        const px = toPxX(radarCx + Math.cos(ang) * rVal);
        const py = toPxY(radarCy - Math.sin(ang) * rVal);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.fill();

      ctx.strokeStyle = MANIM_PALETTE.BLUE_C;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = sw(2.4);
      ctx.stroke();

      // Vertex Dots & Labels
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 10;
        const rVal = radarR * traits[i].val * radarP;
        const vx = radarCx + Math.cos(ang) * rVal;
        const vy = radarCy - Math.sin(ang) * rVal;

        ctx.fillStyle = traits[i].col;
        ctx.beginPath();
        ctx.arc(toPxX(vx), toPxY(vy), toLen(0.075), 0, Math.PI * 2);
        ctx.fill();

        const lx = radarCx + Math.cos(ang) * (radarR + 0.42);
        const ly = radarCy - Math.sin(ang) * (radarR + 0.32);
        ctx.font = `${Math.round(toLen(0.165))}px "Lora", serif`;
        ctx.textAlign = Math.cos(ang) > 0.2 ? 'left' : Math.cos(ang) < -0.2 ? 'right' : 'center';
        ctx.fillStyle = traits[i].col;
        ctx.fillText(traits[i].name, toPxX(lx), toPxY(ly));
      }
      ctx.restore();
    }

    // Right Sub-Zone: Ticked Axes for Calculated Risk vs. Unnecessary Risk
    const axOx = zx + 1.45;
    const axOy = zy - 2.15;
    const axW = 4.65;
    const axH = 3.6;
    const axP = windowProgress(t, 12.2, 13.8);

    drawManimAxes(ctx, {
      ox: toPxX(axOx),
      oy: toPxY(axOy),
      w: toLen(axW),
      h: toLen(axH),
      xTicks: 5,
      yTicks: 4,
      progress: axP,
      strokeWidth: sw(2.0),
      fontSize: toLen(0.185),
      xLabel: 'Feedback & Perseverance Iterations k',
      yLabel: 'Odds in Favor P(Success)',
      yLabelColor: MANIM_PALETTE.GREEN_C,
    });

    const curveP = windowProgress(t, 13.2, 15.4);
    if (curveP > 0) {
      const steps = 80;
      // Curve 1: Calculated Risk + Feedback Seeking (climbs to high odds)
      ctx.strokeStyle = MANIM_PALETTE.GREEN_C;
      ctx.lineWidth = sw(2.8);
      ctx.beginPath();
      for (let s = 0; s <= steps * curveP; s++) {
        const u = s / steps;
        const yVal = 0.92 / (1 + Math.exp(-6.5 * (u - 0.35)));
        const px = toPxX(axOx + u * (axW - 0.3));
        const py = toPxY(axOy + yVal * (axH - 0.3));
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Curve 2: Unnecessary / Blind Risk (decays)
      ctx.strokeStyle = MANIM_PALETTE.RED_C;
      ctx.lineWidth = sw(2.0);
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      for (let s = 0; s <= steps * curveP; s++) {
        const u = s / steps;
        const yVal = 0.65 * Math.exp(-3.2 * u) + 0.08;
        const px = toPxX(axOx + u * (axW - 0.3));
        const py = toPxY(axOy + yVal * (axH - 0.3));
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Curve Labels
      ctx.fillStyle = MANIM_PALETTE.GREEN_C;
      ctx.font = `italic ${Math.round(toLen(0.19))}px "Lora", serif`;
      ctx.textAlign = 'left';
      ctx.fillText('Calculated Risk + Feedback Seeking', toPxX(axOx + 1.25), toPxY(axOy + 3.05));

      ctx.fillStyle = MANIM_PALETTE.RED_C;
      ctx.fillText('Unnecessary Blind Risk', toPxX(axOx + 1.65), toPxY(axOy + 0.68));
    }
  }

  // ---------------------------------------------------------------------------
  // ZONE 4 (+7.0, -9.0): LESSON 2 — HOW ENTREPRENEURS THINK (Slides 28–31)
  // ---------------------------------------------------------------------------
  if (t >= 15.6) {
    const zx = 7.0;
    const zy = -9.0;
    const headP = windowProgress(t, 16.2, 17.3, false);

    drawManimWriteText(
      ctx,
      'Lesson 2: How Entrepreneurs Think — 3-Stage Cognitive Architecture (Slides 28–31)',
      toPxX(zx),
      toPxY(zy + 3.25),
      toLen(0.29),
      MANIM_PALETTE.WHITE,
      headP,
      'center'
    );

    const s1P = windowProgress(t, 16.8, 17.8);
    const s2P = windowProgress(t, 17.6, 18.8);
    const s3P = windowProgress(t, 18.6, 19.8);

    // Stage 1 Box: Actuate Self-Assessment
    if (s1P > 0) {
      const x1 = zx - 4.5;
      const y1 = zy + 0.2;
      drawSurroundingRectangle(
        ctx,
        toPxX(x1 - 1.65),
        toPxY(y1 + 1.15),
        toLen(3.3),
        toLen(2.3),
        MANIM_PALETTE.BLUE_C,
        sw(2.2),
        s1P
      );
      ctx.save();
      ctx.globalAlpha = s1P;
      ctx.fillStyle = MANIM_PALETTE.BLUE_C;
      ctx.font = `600 ${Math.round(toLen(0.22))}px "Lora", serif`;
      ctx.textAlign = 'center';
      ctx.fillText('1. Actuate Self-Assessment', toPxX(x1), toPxY(y1 + 0.65));
      ctx.fillStyle = MANIM_PALETTE.WHITE;
      ctx.font = `${Math.round(toLen(0.185))}px "Lora", serif`;
      ctx.fillText('& Choose Course of Action', toPxX(x1), toPxY(y1 + 0.28));
      ctx.fillStyle = MANIM_PALETTE.GREY_B;
      ctx.font = `italic ${Math.round(toLen(0.175))}px "IBM Plex Mono", monospace`;
      ctx.fillText('[✓] Evaluate Strengths', toPxX(x1), toPxY(y1 - 0.22));
      ctx.fillText('[✓] Calibrate Resources', toPxX(x1), toPxY(y1 - 0.58));
      ctx.restore();
    }

    // Stage 2: Generate Multiple Decision Models (Branching Vectors M1, M2, M3)
    if (s2P > 0) {
      const x2 = zx;
      const y2 = zy + 0.2;

      ctx.save();
      ctx.globalAlpha = s2P;
      ctx.fillStyle = MANIM_PALETTE.YELLOW_C;
      ctx.font = `600 ${Math.round(toLen(0.22))}px "Lora", serif`;
      ctx.textAlign = 'center';
      ctx.fillText('2. Generate Multiple Decision Models', toPxX(x2), toPxY(y2 + 1.75));
      ctx.restore();

      const branches = [
        { label: 'Model M₁ (Conservative)', dy: 1.05, col: MANIM_PALETTE.BLUE_C },
        { label: 'Model M₂ (Adaptive Pivot)', dy: 0.0, col: MANIM_PALETTE.GREEN_C },
        { label: 'Model M₃ (Disruptive)', dy: -1.05, col: MANIM_PALETTE.TEAL_C },
      ];

      for (const b of branches) {
        drawManimArrow(
          ctx,
          toPxX(zx - 2.7),
          toPxY(y2),
          toPxX(lerp(zx - 2.7, zx - 0.85, s2P)),
          toPxY(lerp(y2, y2 + b.dy, s2P)),
          b.col,
          sw(2.2),
          s2P
        );
        drawSurroundingRectangle(
          ctx,
          toPxX(zx - 0.8),
          toPxY(y2 + b.dy + 0.34),
          toLen(2.35),
          toLen(0.68),
          b.col,
          sw(1.8),
          s2P
        );
        ctx.save();
        ctx.globalAlpha = s2P;
        ctx.fillStyle = MANIM_PALETTE.WHITE;
        ctx.font = `italic ${Math.round(toLen(0.18))}px "Lora", serif`;
        ctx.textAlign = 'center';
        ctx.fillText(b.label, toPxX(zx + 0.38), toPxY(y2 + b.dy));
        ctx.restore();
      }
    }

    // Stage 3: Learn from Failure Target & Feedback Loop
    if (s3P > 0) {
      const x3 = zx + 4.35;
      const y3 = zy + 0.2;

      // Target concentric circles (Slide 31 Bram Stoker archery motif in crisp Manim geometry)
      for (const [r, col] of [
        [1.1, MANIM_PALETTE.BLUE_E],
        [0.72, MANIM_PALETTE.RED_C],
        [0.34, MANIM_PALETTE.YELLOW_C],
      ] as [number, string][]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = sw(2.0);
        ctx.beginPath();
        ctx.arc(toPxX(x3), toPxY(y3), toLen(r * s3P), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Converging arrow into bullseye
      drawManimArrow(
        ctx,
        toPxX(zx + 1.65),
        toPxY(y3),
        toPxX(lerp(zx + 1.65, x3 - 0.1, s3P)),
        toPxY(y3),
        MANIM_PALETTE.GREEN_C,
        sw(2.6),
        s3P
      );

      ctx.save();
      ctx.globalAlpha = s3P;
      ctx.fillStyle = MANIM_PALETTE.GREEN_C;
      ctx.font = `600 ${Math.round(toLen(0.22))}px "Lora", serif`;
      ctx.textAlign = 'center';
      ctx.fillText('3. Learn from Failure (Slide 31)', toPxX(x3), toPxY(y3 + 1.55));
      ctx.fillStyle = MANIM_PALETTE.GREY_A;
      ctx.font = `italic ${Math.round(toLen(0.185))}px "Lora", serif`;
      ctx.fillText('“We Learn From Failure, Not From Success.”', toPxX(x3), toPxY(y3 - 1.5));
      ctx.restore();

      // Curly underbrace showing feedback update loop back to Stage 1
      drawCurlyBrace(
        ctx,
        toPxX(zx - 4.5),
        toPxY(zy - 1.85),
        toPxX(zx + 4.35),
        toPxY(zy - 1.85),
        'down',
        MANIM_PALETTE.YELLOW_C,
        sw(2.0),
        s3P,
        'Iterative Bayesian Update: Failure Error e(t) Refines Self-Assessment & Decision Models',
        toLen(0.2)
      );
    }
  }

  // ---------------------------------------------------------------------------
  // ZONE 5 (-7.0, -18.0): LESSON 3 — EMOTIONAL COMPETENCIES PORTFOLIO (Slides 32–41)
  // ---------------------------------------------------------------------------
  if (t >= 20.2) {
    const zx = -7.0;
    const zy = -18.0;
    const headP = windowProgress(t, 20.8, 22.0, false);

    drawManimWriteText(
      ctx,
      'Lesson 3: Emotional Competencies Portfolio — Camuffo, Gerli & Gubitta (2012)',
      toPxX(zx),
      toPxY(zy + 3.25),
      toLen(0.28),
      MANIM_PALETTE.WHITE,
      headP,
      'center'
    );

    const quadrants = [
      {
        title: '1. Self-Awareness (Slides 36–37)',
        sub1: 'Understanding one’s inner feelings & state',
        sub2: 'Calibrates Reality vs. Perceived “Lion” Mirror',
        color: MANIM_PALETTE.BLUE_C,
        qx: zx - 2.9,
        qy: zy + 1.05,
        delay: 21.4,
      },
      {
        title: '2. Self-Management (Slides 38–39)',
        sub1: 'Set Goals · Make Plan · Be Patient · Focus',
        sub2: 'Stay Organized · Work Hard · Reach Goals',
        color: MANIM_PALETTE.TEAL_C,
        qx: zx + 2.9,
        qy: zy + 1.05,
        delay: 22.0,
      },
      {
        title: '3. Social Awareness (Slide 40)',
        sub1: 'Recognizing emotions & needs of the community',
        sub2: 'Empathy across interconnected market actors',
        color: MANIM_PALETTE.YELLOW_C,
        qx: zx - 2.9,
        qy: zy - 1.45,
        delay: 22.6,
      },
      {
        title: '4. Relationship Management (Slide 41)',
        sub1: 'Building collaborative partnerships & trust',
        sub2: 'Bridging human & digital networks effectively',
        color: MANIM_PALETTE.GREEN_C,
        qx: zx + 2.9,
        qy: zy - 1.45,
        delay: 23.2,
      },
    ];

    // Orthogonal Matrix Crosshairs
    const axisP = windowProgress(t, 21.2, 22.2);
    ctx.strokeStyle = MANIM_PALETTE.GREY_C;
    ctx.lineWidth = sw(1.8);
    ctx.beginPath();
    ctx.moveTo(toPxX(zx - 5.8 * axisP), toPxY(zy - 0.2));
    ctx.lineTo(toPxX(zx + 5.8 * axisP), toPxY(zy - 0.2));
    ctx.moveTo(toPxX(zx), toPxY(zy + 2.35 * axisP));
    ctx.lineTo(toPxX(zx), toPxY(zy - 2.75 * axisP));
    ctx.stroke();

    for (const q of quadrants) {
      const qP = windowProgress(t, q.delay, q.delay + 1.0);
      if (qP <= 0) continue;

      const qw = 5.1;
      const qh = 1.95;
      drawSurroundingRectangle(
        ctx,
        toPxX(q.qx - qw / 2),
        toPxY(q.qy + qh / 2),
        toLen(qw),
        toLen(qh),
        q.color,
        sw(2.1),
        qP
      );

      ctx.save();
      ctx.globalAlpha = qP;
      ctx.textAlign = 'left';
      ctx.fillStyle = q.color;
      ctx.font = `600 ${Math.round(toLen(0.22))}px "Lora", serif`;
      ctx.fillText(q.title, toPxX(q.qx - qw / 2 + 0.25), toPxY(q.qy + 0.45));

      ctx.fillStyle = MANIM_PALETTE.WHITE;
      ctx.font = `${Math.round(toLen(0.19))}px "Lora", serif`;
      ctx.fillText(q.sub1, toPxX(q.qx - qw / 2 + 0.25), toPxY(q.qy - 0.02));

      ctx.fillStyle = MANIM_PALETTE.GREY_B;
      ctx.font = `italic ${Math.round(toLen(0.18))}px "Lora", serif`;
      ctx.fillText(q.sub2, toPxX(q.qx - qw / 2 + 0.25), toPxY(q.qy - 0.44));
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // ZONE 6 (+7.0, -18.0): LESSON 4 — 8 DECISION-MAKING STYLES & MAXIM (Slides 42–51)
  // ---------------------------------------------------------------------------
  if (t >= 24.8) {
    const zx = 7.0;
    const zy = -18.0;
    const headP = windowProgress(t, 25.4, 26.5, false);

    drawManimWriteText(
      ctx,
      'Lesson 4: Entrepreneurial Decision-Making as a Core Competency (Slides 42–51)',
      toPxX(zx),
      toPxY(zy + 3.25),
      toLen(0.28),
      MANIM_PALETTE.WHITE,
      headP,
      'center'
    );

    const styles = [
      { name: '1. Rational / Specific', desc: 'Systematic data optimization', col: MANIM_PALETTE.BLUE_C, colIdx: 0, rowIdx: 0 },
      { name: '2. Use of Intuition', desc: 'Fast pattern-recognition heuristic', col: MANIM_PALETTE.TEAL_C, colIdx: 1, rowIdx: 0 },
      { name: '3. Affect Infusion', desc: 'Emotional state shaping judgment', col: MANIM_PALETTE.YELLOW_C, colIdx: 2, rowIdx: 0 },
      { name: '4. Attributional Style', desc: 'Causal explanation of outcomes', col: MANIM_PALETTE.BLUE_C, colIdx: 3, rowIdx: 0 },
      { name: '5. Counterfactual Thinking', desc: '“What if...” alternate branches', col: MANIM_PALETTE.TEAL_C, colIdx: 0, rowIdx: 1 },
      { name: '6. Over-Confidence Bias', desc: 'Underestimating risk variance', col: MANIM_PALETTE.RED_C, colIdx: 1, rowIdx: 1 },
      { name: '7. Knowing Style', desc: 'Logical, analytical precision', col: MANIM_PALETTE.BLUE_C, colIdx: 2, rowIdx: 1 },
      { name: '8. Creative Style', desc: 'Divergent, out-of-the-box synthesis', col: MANIM_PALETTE.GREEN_C, colIdx: 3, rowIdx: 1 },
    ];

    for (let i = 0; i < styles.length; i++) {
      const st = styles[i];
      const stP = windowProgress(t, 25.8 + i * 0.22, 26.6 + i * 0.22);
      if (stP <= 0) continue;

      const cardW = 2.95;
      const cardH = 1.45;
      const cx = zx - 4.65 + st.colIdx * 3.1;
      const cy = zy + 1.45 - st.rowIdx * 1.85;

      drawSurroundingRectangle(
        ctx,
        toPxX(cx - cardW / 2),
        toPxY(cy + cardH / 2),
        toLen(cardW),
        toLen(cardH),
        st.col,
        sw(1.9),
        stP
      );

      ctx.save();
      ctx.globalAlpha = stP;
      ctx.textAlign = 'center';
      ctx.fillStyle = st.col;
      ctx.font = `600 ${Math.round(toLen(0.19))}px "Lora", serif`;
      ctx.fillText(st.name, toPxX(cx), toPxY(cy + 0.25));

      ctx.fillStyle = MANIM_PALETTE.GREY_A;
      ctx.font = `italic ${Math.round(toLen(0.165))}px "Lora", serif`;
      ctx.fillText(st.desc, toPxX(cx), toPxY(cy - 0.22));
      ctx.restore();
    }

    // Closing Maxim (Slide 51) with Manim Indicate()
    const maximP = windowProgress(t, 27.6, 28.6);
    if (maximP > 0) {
      const pulse = t >= 28.6 ? thereAndBack(clamp((t - 28.6) / 1.2, 0, 1)) : 0;
      const scale = 1.0 + 0.08 * pulse;
      const boxCol = lerpColor(MANIM_PALETTE.GREEN_C, MANIM_PALETTE.YELLOW_C, pulse);

      ctx.save();
      ctx.translate(toPxX(zx), toPxY(zy - 2.35));
      ctx.scale(scale, scale);
      ctx.globalAlpha = maximP;

      drawSurroundingRectangle(
        ctx,
        -toLen(5.9),
        -toLen(0.68),
        toLen(11.8),
        toLen(1.36),
        boxCol,
        sw(2.4),
        maximP
      );

      ctx.textAlign = 'center';
      ctx.fillStyle = MANIM_PALETTE.GREY_B;
      ctx.font = `${Math.round(toLen(0.19))}px "Lora", serif`;
      ctx.fillText(
        'Slide 51: Doctors don’t make you healthy · Teachers don’t make you learn · Coaches don’t make you rich',
        0,
        -toLen(0.22)
      );

      ctx.fillStyle = boxCol;
      ctx.font = `600 italic ${Math.round(toLen(0.28))}px "Lora", serif`;
      ctx.fillText(
        '“At some point you have to realize: Your Growth Is Your Responsibility.”',
        0,
        toLen(0.28)
      );

      ctx.restore();
    }
  }
}

/* ============================================================================
 * SCENE 1: NEURAL NETWORK & LOSS LANDSCAPE (EXACT USER PROMPT EXPLAINER)
 * ============================================================================ */
function renderNeuralNetScene(ctx: CanvasRenderingContext2D, t: number, h: RenderHelpers) {
  const { toPxX, toPxY, toLen, sw, config } = h;

  const writeP = windowProgress(t, 0.1, 1.7, false);
  const transformHeaderP = windowProgress(t, 1.85, 3.1, true);

  const qCenterX = lerp(0, -3.55, transformHeaderP);
  const qCenterY = lerp(0.2, 3.35, transformHeaderP);
  const qFontSize = lerp(42, 25, transformHeaderP);

  drawManimWriteText(
    ctx,
    'How does a neural network learn to see?',
    toPxX(qCenterX),
    toPxY(qCenterY),
    toLen(qFontSize / 100),
    MANIM_PALETTE.WHITE,
    writeP,
    'center'
  );

  if (transformHeaderP > 0.1) {
    const lineP = windowProgress(t, 2.2, 3.2);
    const lx1 = toPxX(-6.45);
    const lx2 = toPxX(lerp(-6.45, -0.65, lineP));
    const ly = toPxY(3.02);
    ctx.strokeStyle = MANIM_PALETTE.GREY_C;
    ctx.lineWidth = sw(1.5);
    ctx.beginPath();
    ctx.moveTo(lx1, ly);
    ctx.lineTo(lx2, ly);
    ctx.stroke();
  }

  if (t < 3.0) return;

  const layerConfigs = [
    { x: -4.2, count: 6, spacing: 0.72, label: 'Input x' },
    { x: -2.5, count: 5, spacing: 0.78, label: 'Hidden h₁' },
    { x: -0.8, count: 4, spacing: 0.84, label: 'Hidden h₂' },
    { x: 0.85, count: 3, spacing: 0.95, label: 'Output ŷ' },
  ];

  const yOffset = -0.35;
  const nodes: { x: number; y: number }[][] = layerConfigs.map((layer) => {
    const arr: { x: number; y: number }[] = [];
    const totalH = (layer.count - 1) * layer.spacing;
    for (let i = 0; i < layer.count; i++) {
      arr.push({
        x: layer.x,
        y: yOffset + totalH / 2 - i * layer.spacing,
      });
    }
    return arr;
  });

  const recolorP = windowProgress(t, 14.8, 18.2);
  const edgeCreateP = windowProgress(t, 3.5, 6.4);
  const flashGlobalP = (t - 10.2) / 1.9;

  let edgeIdx = 0;
  const totalEdges = 6 * 5 + 5 * 4 + 4 * 3;

  for (let l = 0; l < nodes.length - 1; l++) {
    const currLayer = nodes[l];
    const nextLayer = nodes[l + 1];

    for (let i = 0; i < currLayer.length; i++) {
      for (let j = 0; j < nextLayer.length; j++) {
        const n1 = currLayer[i];
        const n2 = nextLayer[j];

        const lag = (edgeIdx / totalEdges) * 0.55;
        const localCreate = clamp((edgeCreateP - lag) / 0.45, 0, 1);

        if (localCreate > 0) {
          const initialPositive = (l * 7 + i * 3 + j * 2) % 3 !== 0;
          const learnedPositive = (l * 5 + i + j * 3) % 2 === 0;

          const startColor = initialPositive ? MANIM_PALETTE.BLUE_C : MANIM_PALETTE.RED_C;
          const targetColor = learnedPositive ? MANIM_PALETTE.BLUE_C : MANIM_PALETTE.RED_C;
          const edgeColor = lerpColor(startColor, targetColor, recolorP);

          const baseAlpha = 0.28 + ((i * 5 + j * 3) % 5) * 0.11;
          const x1 = toPxX(n1.x);
          const y1 = toPxY(n1.y);
          const x2 = toPxX(lerp(n1.x, n2.x, manimSmooth(localCreate)));
          const y2 = toPxY(lerp(n1.y, n2.y, manimSmooth(localCreate)));

          ctx.strokeStyle = edgeColor;
          ctx.globalAlpha = baseAlpha;
          ctx.lineWidth = sw(1.65);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          if (flashGlobalP > 0 && flashGlobalP < 1.35) {
            const layerWindowStart = l * 0.28;
            const layerFlashP = (flashGlobalP - layerWindowStart) / 0.45;
            if (layerFlashP > 0 && layerFlashP < 1) {
              const fStart = clamp(layerFlashP - 0.28, 0, 1);
              const fEnd = clamp(layerFlashP + 0.12, 0, 1);
              ctx.strokeStyle = MANIM_PALETTE.YELLOW_C;
              ctx.globalAlpha = 0.95;
              ctx.lineWidth = sw(3.2);
              ctx.beginPath();
              ctx.moveTo(toPxX(lerp(n1.x, n2.x, fStart)), toPxY(lerp(n1.y, n2.y, fStart)));
              ctx.lineTo(toPxX(lerp(n1.x, n2.x, fEnd)), toPxY(lerp(n1.y, n2.y, fEnd)));
              ctx.stroke();
            }
          }

          const flashAccP = (t - 21.0) / 1.4;
          if (flashAccP > 0 && flashAccP < 1.3) {
            const layerFlashP = (flashAccP - l * 0.26) / 0.42;
            if (layerFlashP > 0 && layerFlashP < 1) {
              const fStart = clamp(layerFlashP - 0.25, 0, 1);
              const fEnd = clamp(layerFlashP + 0.12, 0, 1);
              ctx.strokeStyle = MANIM_PALETTE.GREEN_C;
              ctx.globalAlpha = 0.9;
              ctx.lineWidth = sw(3.0);
              ctx.beginPath();
              ctx.moveTo(toPxX(lerp(n1.x, n2.x, fStart)), toPxY(lerp(n1.y, n2.y, fStart)));
              ctx.lineTo(toPxX(lerp(n1.x, n2.x, fEnd)), toPxY(lerp(n1.y, n2.y, fEnd)));
              ctx.stroke();
            }
          }
        }
        edgeIdx++;
      }
    }
  }
  ctx.globalAlpha = 1.0;

  const nodeRadius = 0.21;
  for (let l = 0; l < nodes.length; l++) {
    const layerCreateP = windowProgress(t, 3.2 + l * 0.35, 4.4 + l * 0.35);
    if (layerCreateP <= 0) continue;

    for (let i = 0; i < nodes[l].length; i++) {
      const nd = nodes[l][i];
      const cx = toPxX(nd.x);
      const cy = toPxY(nd.y);
      const r = toLen(nodeRadius);

      let actLevel = 0.12 + ((l * 3 + i * 2) % 5) * 0.12;
      if (t >= 10.2 && t < 14.0) {
        const layerHit = windowProgress(t, 10.2 + l * 0.35, 10.9 + l * 0.35);
        actLevel = lerp(0.1, l === 3 && i === 1 ? 0.82 : 0.35, layerHit);
      } else if (t >= 20.5) {
        actLevel = l === 3 && i === 0 ? 0.92 : 0.18;
      }

      ctx.fillStyle = MANIM_PALETTE.BLACK;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      if (layerCreateP > 0.8) {
        const fillCol =
          l === 3 && i === 1 && t >= 11.2 && t < 18.5
            ? MANIM_PALETTE.RED_C
            : l === 3 && i === 0 && t >= 19.5
            ? MANIM_PALETTE.GREEN_C
            : MANIM_PALETTE.BLUE_C;
        ctx.fillStyle = fillCol;
        ctx.globalAlpha = actLevel * 0.45;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      ctx.strokeStyle = MANIM_PALETTE.WHITE;
      ctx.lineWidth = sw(2.2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * layerCreateP);
      ctx.stroke();
    }

    if (layerCreateP > 0.6) {
      ctx.fillStyle = MANIM_PALETTE.GREY_B;
      ctx.globalAlpha = (layerCreateP - 0.6) / 0.4;
      ctx.font = `italic ${Math.round(toLen(0.21))}px "Lora", serif`;
      ctx.textAlign = 'center';
      ctx.fillText(layerConfigs[l].label, toPxX(layerConfigs[l].x), toPxY(-2.72));
      ctx.globalAlpha = 1.0;
    }
  }

  if (t >= 4.5 && t <= 14.5) {
    const fadeLegend =
      windowProgress(t, 4.5, 5.3) * (1 - windowProgress(t, 13.6, 14.4));
    ctx.globalAlpha = fadeLegend;
    ctx.font = `italic ${Math.round(toLen(0.21))}px "Lora", serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = MANIM_PALETTE.BLUE_C;
    ctx.fillText('wᵢⱼ > 0 (excitatory)', toPxX(-2.8), toPxY(-3.25));
    ctx.fillStyle = MANIM_PALETTE.RED_C;
    ctx.fillText('wᵢⱼ < 0 (inhibitory)', toPxX(-0.6), toPxY(-3.25));
    ctx.globalAlpha = 1.0;
  }

  if (t >= 6.8) {
    const counterFade = windowProgress(t, 6.8, 7.4);
    const sampleCount = Math.floor(lerp(1, 128, windowProgress(t, 7.0, 10.1, true)));

    ctx.globalAlpha = counterFade;
    ctx.font = `${Math.round(toLen(0.24))}px "Lora", serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = MANIM_PALETTE.GREY_B;
    ctx.fillText('Training Sample #', toPxX(-5.25), toPxY(2.25));

    const numTransformP = windowProgress(t, 21.5, 22.5);
    if (numTransformP < 1) {
      ctx.font = `600 ${Math.round(toLen(0.28))}px "IBM Plex Mono", monospace`;
      ctx.fillStyle = MANIM_PALETTE.YELLOW_C;
      ctx.globalAlpha = counterFade * (1 - numTransformP);
      ctx.fillText(String(sampleCount).padStart(3, '0'), toPxX(-3.1), toPxY(2.25));
    }
    ctx.globalAlpha = 1.0;

    const flyWindow = (t - 6.9) / 3.2;
    if (flyWindow >= 0 && flyWindow <= 1.25) {
      for (let s = 0; s < 5; s++) {
        const spriteP = clamp((flyWindow - s * 0.16) / 0.45, 0, 1);
        if (spriteP > 0 && spriteP < 1) {
          const easeP = manimSmooth(spriteP);
          const startX = -6.55;
          const startY = 1.1 - (s % 3) * 1.1;
          const targetNode = nodes[0][s % nodes[0].length];
          const curX = lerp(startX, targetNode.x - 0.35, easeP);
          const curY = lerp(startY, targetNode.y, easeP) + Math.sin(easeP * Math.PI) * 0.28;
          const scale = lerp(0.95, 0.38, easeP);
          const alpha = spriteP < 0.85 ? 1.0 : (1 - spriteP) / 0.15;

          drawPixelMatrix(
            ctx,
            toPxX(curX),
            toPxY(curY),
            toLen(0.75 * scale),
            PIXEL_SPRITES[s % PIXEL_SPRITES.length],
            alpha,
            sw(1.2)
          );
        }
      }
    }

    const thumbAlpha = windowProgress(t, 7.2, 8.0);
    if (thumbAlpha > 0) {
      drawPixelMatrix(
        ctx,
        toPxX(-5.65),
        toPxY(-0.35),
        toLen(0.95),
        PIXEL_SPRITES[0],
        thumbAlpha,
        sw(1.5)
      );
      ctx.globalAlpha = thumbAlpha;
      ctx.fillStyle = MANIM_PALETTE.GREY_B;
      ctx.font = `italic ${Math.round(toLen(0.2))}px "Lora", serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Input: "cat"', toPxX(-5.65), toPxY(-1.1));
      drawManimArrow(
        ctx,
        toPxX(-5.05),
        toPxY(-0.35),
        toPxX(-4.52),
        toPxY(-0.35),
        MANIM_PALETTE.GREY_B,
        sw(1.8),
        thumbAlpha
      );
      ctx.globalAlpha = 1.0;
    }
  }

  if (t >= 11.2) {
    const outFade = windowProgress(t, 11.2, 12.0);
    const postTrainP = windowProgress(t, 19.2, 21.0);

    const catProb = lerp(0.18, 0.97, postTrainP).toFixed(2);
    const dogProb = lerp(0.74, 0.02, postTrainP).toFixed(2);
    const birdProb = lerp(0.08, 0.01, postTrainP).toFixed(2);

    const outNodes = nodes[3];
    const labels = [
      {
        text: `cat: ${catProb}`,
        color: postTrainP > 0.6 ? MANIM_PALETTE.GREEN_C : MANIM_PALETTE.GREY_B,
      },
      {
        text: postTrainP < 0.5 ? `dog?: ${dogProb}` : `dog: ${dogProb}`,
        color: postTrainP < 0.5 ? MANIM_PALETTE.RED_C : MANIM_PALETTE.GREY_C,
      },
      {
        text: `bird: ${birdProb}`,
        color: MANIM_PALETTE.GREY_C,
      },
    ];

    ctx.globalAlpha = outFade;
    ctx.textAlign = 'left';
    for (let k = 0; k < 3; k++) {
      const ny = outNodes[k].y;
      ctx.font = `italic ${Math.round(toLen(0.25))}px "Lora", serif`;
      ctx.fillStyle = labels[k].color;
      ctx.fillText(labels[k].text, toPxX(1.22), toPxY(ny - 0.08));
    }
    ctx.globalAlpha = 1.0;

    const rectCreateP = windowProgress(t, 11.7, 12.7);
    const rectFadeOut = 1 - windowProgress(t, 18.4, 19.4);
    if (rectCreateP > 0 && rectFadeOut > 0) {
      const dogY = outNodes[1].y;
      ctx.globalAlpha = rectFadeOut;
      drawSurroundingRectangle(
        ctx,
        toPxX(1.12),
        toPxY(dogY + 0.25),
        toLen(1.62),
        toLen(0.5),
        MANIM_PALETTE.RED_C,
        sw(2.4),
        rectCreateP
      );

      if (t >= 12.3) {
        const braceP = windowProgress(t, 12.3, 13.2);
        drawCurlyBrace(
          ctx,
          toPxX(1.15),
          toPxY(dogY - 0.34),
          toPxX(2.7),
          toPxY(dogY - 0.34),
          'down',
          MANIM_PALETTE.RED_C,
          sw(1.8),
          braceP,
          'High Loss L(w)',
          toLen(0.2)
        );
      }
      ctx.globalAlpha = 1.0;
    }

    if (t >= 20.5) {
      const catRectP = windowProgress(t, 20.5, 21.4);
      const catY = outNodes[0].y;
      drawSurroundingRectangle(
        ctx,
        toPxX(1.12),
        toPxY(catY + 0.25),
        toLen(1.55),
        toLen(0.5),
        MANIM_PALETTE.GREEN_C,
        sw(2.4),
        catRectP
      );
    }
  }

  if (t >= 13.6) {
    const axesCreateP = windowProgress(t, 13.7, 15.2);
    const morphToAccP = windowProgress(t, 18.4, 20.6, true);

    const originX = 3.55;
    const originY = -1.95;
    const axisW = 4.6;
    const axisH = 3.6;

    drawManimAxes(ctx, {
      ox: toPxX(originX),
      oy: toPxY(originY),
      w: toLen(axisW),
      h: toLen(axisH),
      xTicks: 5,
      yTicks: 4,
      progress: axesCreateP,
      strokeWidth: sw(2.0),
      fontSize: toLen(0.19),
      xLabel: 'Training Epoch t',
      yLabel: morphToAccP < 0.5 ? 'Loss L(w)' : 'Accuracy (%)',
      yLabelColor: lerpColor(MANIM_PALETTE.RED_C, MANIM_PALETTE.GREEN_C, morphToAccP),
    });

    const curveDrawP = windowProgress(t, 14.4, 15.8);
    if (curveDrawP > 0) {
      const steps = 90;
      const maxStep = Math.floor(steps * curveDrawP);
      const curveColor = lerpColor(MANIM_PALETTE.BLUE_C, MANIM_PALETTE.GREEN_C, morphToAccP);

      ctx.strokeStyle = curveColor;
      ctx.lineWidth = sw(3.0);
      ctx.beginPath();

      for (let s = 0; s <= maxStep; s++) {
        const u = s / steps;
        const lossVal = 0.86 * Math.exp(-3.4 * u) + 0.08;
        const accVal = 0.965 / (1 + Math.exp(-7.5 * (u - 0.34)));
        const yNorm = lerp(lossVal, accVal, morphToAccP);

        const px = toPxX(originX + u * (axisW - 0.35));
        const py = toPxY(originY + yNorm * (axisH - 0.3));
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      if (t >= 15.0) {
        const descendP = windowProgress(t, 15.2, 18.2, true);
        const climbP = windowProgress(t, 18.4, 21.2, true);
        const uDot = morphToAccP < 0.05 ? lerp(0.06, 0.88, descendP) : lerp(0.88, 0.95, climbP);

        const lossVal = 0.86 * Math.exp(-3.4 * uDot) + 0.08;
        const accVal = 0.965 / (1 + Math.exp(-7.5 * (uDot - 0.34)));
        const yNorm = lerp(lossVal, accVal, morphToAccP);

        const dotX = originX + uDot * (axisW - 0.35);
        const dotY = originY + yNorm * (axisH - 0.3);

        if (morphToAccP < 0.3 && descendP > 0.02 && descendP < 0.96) {
          const du = 0.08;
          const nextLoss = 0.86 * Math.exp(-3.4 * (uDot + du)) + 0.08;
          const dx = du * (axisW - 0.35);
          const dy = (nextLoss - lossVal) * (axisH - 0.3);
          const len = Math.hypot(dx, dy);
          const arrowScale = 0.85 / (len || 1);

          drawManimArrow(
            ctx,
            toPxX(dotX),
            toPxY(dotY),
            toPxX(dotX + dx * arrowScale),
            toPxY(dotY + dy * arrowScale),
            MANIM_PALETTE.YELLOW_C,
            sw(2.2),
            1.0
          );

          ctx.fillStyle = MANIM_PALETTE.YELLOW_C;
          ctx.font = `italic ${Math.round(toLen(0.21))}px "Lora", serif`;
          ctx.textAlign = 'left';
          ctx.fillText('−∇L(w)', toPxX(dotX + 0.22), toPxY(dotY + 0.22));
        }

        ctx.fillStyle = MANIM_PALETTE.YELLOW_C;
        ctx.beginPath();
        ctx.arc(toPxX(dotX), toPxY(dotY), toLen(0.11), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = MANIM_PALETTE.BLACK;
        ctx.lineWidth = sw(1.5);
        ctx.stroke();

        if (t >= 20.8) {
          const badgeFade = windowProgress(t, 20.8, 21.6);
          const indicatePulse = t >= 21.8 ? thereAndBack(clamp((t - 21.8) / 1.3, 0, 1)) : 0;
          const scaleFactor = 1.0 + 0.24 * indicatePulse;
          const badgeColor = lerpColor(MANIM_PALETTE.GREEN_C, MANIM_PALETTE.YELLOW_C, indicatePulse);

          const bx = toPxX(originX + 3.45);
          const by = toPxY(originY + 3.45);

          ctx.save();
          ctx.translate(bx, by);
          ctx.scale(scaleFactor, scaleFactor);
          ctx.globalAlpha = badgeFade;

          ctx.font = `600 ${Math.round(toLen(0.46))}px "Lora", serif`;
          ctx.fillStyle = badgeColor;
          ctx.textAlign = 'center';
          ctx.fillText('97.4%', 0, 0);

          if (indicatePulse > 0.05) {
            drawSurroundingRectangle(
              ctx,
              -toLen(0.85),
              -toLen(0.45),
              toLen(1.7),
              toLen(0.62),
              MANIM_PALETTE.YELLOW_C,
              sw(2.5),
              1.0
            );
          }

          ctx.restore();
          ctx.globalAlpha = 1.0;
        }
      }
    }
  }

  if (config.showMobjectBounds) {
    drawSurroundingRectangle(
      ctx,
      toPxX(-4.55),
      toPxY(1.85),
      toLen(5.75),
      toLen(4.35),
      MANIM_PALETTE.TEAL_C,
      sw(1.0),
      1.0,
      true
    );
  }
}

/* ============================================================================
 * SCENE 2: FOURIER EPICYCLES & COMPLEX ROTATING VECTORS
 * ============================================================================ */
function renderFourierScene(ctx: CanvasRenderingContext2D, t: number, h: RenderHelpers) {
  const { toPxX, toPxY, toLen, sw } = h;

  const writeP = windowProgress(t, 0.1, 2.0, false);
  drawManimWriteText(
    ctx,
    'f(t) = Σ cₙ e^(i 2π n t)   —   Harmonic Epicycle Synthesis',
    toPxX(0),
    toPxY(3.35),
    toLen(0.28),
    MANIM_PALETTE.WHITE,
    writeP,
    'center'
  );

  const centerX = -2.8;
  const centerY = -0.25;
  const baseRadius = 1.55;
  const harmonics = [1, 3, 5, 7, 9, 11];
  const circleCreateP = windowProgress(t, 1.2, 3.5);

  const omega = 1.15;
  const phase = t * omega;

  let vx = centerX;
  let vy = centerY;

  for (let idx = 0; idx < harmonics.length; idx++) {
    const n = harmonics[idx];
    const r = baseRadius * (4 / (Math.PI * n));
    const angle = n * phase;

    const nextX = vx + r * Math.cos(angle);
    const nextY = vy + r * Math.sin(angle);

    ctx.strokeStyle = idx % 2 === 0 ? MANIM_PALETTE.BLUE_C : MANIM_PALETTE.TEAL_C;
    ctx.globalAlpha = 0.55 * circleCreateP;
    ctx.lineWidth = sw(1.5);
    ctx.beginPath();
    ctx.arc(toPxX(vx), toPxY(vy), toLen(r), 0, Math.PI * 2 * circleCreateP);
    ctx.stroke();

    if (t >= 2.0) {
      const vecP = windowProgress(t, 2.0 + idx * 0.2, 3.2 + idx * 0.2);
      ctx.globalAlpha = 0.95;
      drawManimArrow(
        ctx,
        toPxX(vx),
        toPxY(vy),
        toPxX(lerp(vx, nextX, vecP)),
        toPxY(lerp(vy, nextY, vecP)),
        idx === harmonics.length - 1 ? MANIM_PALETTE.YELLOW_C : MANIM_PALETTE.WHITE,
        sw(idx === 0 ? 2.4 : 1.7),
        1.0
      );
    }

    vx = nextX;
    vy = nextY;
  }
  ctx.globalAlpha = 1.0;

  if (t >= 3.2) {
    const waveStartX = 0.35;
    const waveSpan = 5.4;

    ctx.strokeStyle = MANIM_PALETTE.GREY_B;
    ctx.lineWidth = sw(1.4);
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(toPxX(vx), toPxY(vy));
    ctx.lineTo(toPxX(waveStartX), toPxY(vy));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = MANIM_PALETTE.YELLOW_C;
    ctx.beginPath();
    ctx.arc(toPxX(waveStartX), toPxY(vy), toLen(0.08), 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = MANIM_PALETTE.YELLOW_C;
    ctx.lineWidth = sw(2.6);
    ctx.beginPath();
    const samples = 220;
    for (let s = 0; s <= samples; s++) {
      const u = s / samples;
      const histTime = t - u * 4.5;
      if (histTime < 3.2) break;
      let wy = centerY;
      for (const n of harmonics) {
        wy += baseRadius * (4 / (Math.PI * n)) * Math.sin(n * histTime * omega);
      }
      const wx = waveStartX + u * waveSpan;
      if (s === 0) ctx.moveTo(toPxX(wx), toPxY(wy));
      else ctx.lineTo(toPxX(wx), toPxY(wy));
    }
    ctx.stroke();
  }
}

/* ============================================================================
 * SCENE 3: LINEAR TRANSFORMATIONS, EIGENVECTORS & DETERMINANT
 * ============================================================================ */
function renderLinearTransformScene(ctx: CanvasRenderingContext2D, t: number, h: RenderHelpers) {
  const { toPxX, toPxY, toLen, sw, W = 1600, H = 900 } = h;

  drawManimNumberPlane(ctx, W, H, toPxX, toPxY, sw(1), 0.25, { x: 0, y: 0, zoom: 1 });

  const warpP = windowProgress(t, 8.0, 12.8, true);
  const a11 = lerp(1.0, 1.6, warpP);
  const a12 = lerp(0.0, 0.6, warpP);
  const a21 = lerp(0.0, 0.6, warpP);
  const a22 = lerp(1.0, 1.6, warpP);

  const tx = (x: number, y: number) => a11 * x + a12 * y;
  const ty = (x: number, y: number) => a21 * x + a22 * y;

  if (t >= 4.0) {
    const eigenP = windowProgress(t, 4.0, 5.8);
    ctx.strokeStyle = MANIM_PALETTE.TEAL_C;
    ctx.lineWidth = sw(2.0);
    ctx.setLineDash([8, 6]);
    ctx.globalAlpha = 0.8 * eigenP;

    ctx.beginPath();
    ctx.moveTo(toPxX(-4.5), toPxY(-4.5));
    ctx.lineTo(toPxX(4.5), toPxY(4.5));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toPxX(-4.5), toPxY(4.5));
    ctx.lineTo(toPxX(4.5), toPxY(-4.5));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }

  const gridCreateP = windowProgress(t, 0.4, 2.8);
  ctx.strokeStyle = MANIM_PALETTE.BLUE_C;
  ctx.lineWidth = sw(1.5);
  ctx.globalAlpha = 0.65 * gridCreateP;

  for (let k = -5; k <= 5; k++) {
    ctx.beginPath();
    ctx.moveTo(toPxX(tx(k, -5)), toPxY(ty(k, -5)));
    ctx.lineTo(toPxX(tx(k, 5)), toPxY(ty(k, 5)));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toPxX(tx(-5, k)), toPxY(ty(-5, k)));
    ctx.lineTo(toPxX(tx(5, k)), toPxY(ty(5, k)));
    ctx.stroke();
  }
  ctx.globalAlpha = 1.0;

  if (t >= 4.5) {
    const sqP = windowProgress(t, 4.5, 6.0);
    ctx.fillStyle = MANIM_PALETTE.YELLOW_C;
    ctx.globalAlpha = 0.24 * sqP;
    ctx.beginPath();
    ctx.moveTo(toPxX(0), toPxY(0));
    ctx.lineTo(toPxX(tx(1, 0)), toPxY(ty(1, 0)));
    ctx.lineTo(toPxX(tx(1, 1)), toPxY(ty(1, 1)));
    ctx.lineTo(toPxX(tx(0, 1)), toPxY(ty(0, 1)));
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = MANIM_PALETTE.YELLOW_C;
    ctx.globalAlpha = 0.9 * sqP;
    ctx.lineWidth = sw(2.0);
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    const detVal = (a11 * a22 - a12 * a21).toFixed(2);
    ctx.fillStyle = MANIM_PALETTE.YELLOW_C;
    ctx.font = `italic 600 ${Math.round(toLen(0.24))}px "Lora", serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`det(A) = ${detVal}`, toPxX(tx(0.55, 0.55)), toPxY(ty(0.55, 0.55)));
  }

  const basisP = windowProgress(t, 2.2, 3.6);
  if (basisP > 0) {
    drawManimArrow(
      ctx,
      toPxX(0),
      toPxY(0),
      toPxX(tx(1, 0) * basisP),
      toPxY(ty(1, 0) * basisP),
      MANIM_PALETTE.GREEN_C,
      sw(3.2),
      1.0
    );
    ctx.fillStyle = MANIM_PALETTE.GREEN_C;
    ctx.font = `italic 600 ${Math.round(toLen(0.26))}px "Lora", serif`;
    ctx.fillText('î', toPxX(tx(1, 0) + 0.2), toPxY(ty(1, 0) - 0.1));

    drawManimArrow(
      ctx,
      toPxX(0),
      toPxY(0),
      toPxX(tx(0, 1) * basisP),
      toPxY(ty(0, 1) * basisP),
      MANIM_PALETTE.RED_C,
      sw(3.2),
      1.0
    );
    ctx.fillStyle = MANIM_PALETTE.RED_C;
    ctx.fillText('ĵ', toPxX(tx(0, 1) - 0.22), toPxY(ty(0, 1) + 0.15));
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(toPxX(-6.5), toPxY(3.6), toLen(3.6), toLen(1.35));
  drawSurroundingRectangle(
    ctx,
    toPxX(-6.5),
    toPxY(3.6),
    toLen(3.6),
    toLen(1.35),
    t >= 13.5 ? MANIM_PALETTE.YELLOW_C : MANIM_PALETTE.GREY_C,
    sw(1.8),
    1.0
  );
  ctx.fillStyle = MANIM_PALETTE.WHITE;
  ctx.font = `italic ${Math.round(toLen(0.25))}px "Lora", serif`;
  ctx.textAlign = 'left';
  ctx.fillText(`A = [ [${a11.toFixed(2)}, ${a12.toFixed(2)}], [${a21.toFixed(2)}, ${a22.toFixed(2)}] ]`, toPxX(-6.25), toPxY(3.05));
  ctx.fillStyle = MANIM_PALETTE.TEAL_C;
  ctx.fillText('Eigenvalues: λ₁ = 2.20,  λ₂ = 1.00', toPxX(-6.25), toPxY(2.55));
}

/* ============================================================================
 * SCENE 4: RIEMANN SUMS TO FUNDAMENTAL THEOREM OF CALCULUS
 * ============================================================================ */
function renderRiemannScene(ctx: CanvasRenderingContext2D, t: number, h: RenderHelpers) {
  const { toPxX, toPxY, toLen, sw } = h;

  const axesP = windowProgress(t, 0.2, 2.2);
  const ox = -5.6;
  const oy = -2.2;
  const axW = 5.6;
  const axH = 4.2;

  drawManimAxes(ctx, {
    ox: toPxX(ox),
    oy: toPxY(oy),
    w: toLen(axW),
    h: toLen(axH),
    xTicks: 5,
    yTicks: 4,
    progress: axesP,
    strokeWidth: sw(2.0),
    fontSize: toLen(0.2),
    xLabel: 'x',
    yLabel: 'f(x)',
    yLabelColor: MANIM_PALETTE.BLUE_C,
  });

  const fx = (x: number) => 0.14 * (x - 0.8) * (x - 2.6) * (x - 4.4) + 1.85 + 0.18 * x;

  let N = 6;
  if (t >= 9.0 && t < 11.5) N = 16;
  else if (t >= 11.5 && t < 13.5) N = 40;
  else if (t >= 13.5) N = 96;

  if (t >= 4.0) {
    const rectCreateP = windowProgress(t, 4.0, 6.2);
    const a = 0.5;
    const b = 4.6;
    const dx = (b - a) / N;

    for (let i = 0; i < N; i++) {
      if (i / N > rectCreateP) break;
      const xLeft = a + i * dx;
      const height = fx(xLeft + dx * 0.5);
      const col = lerpColor(MANIM_PALETTE.BLUE_D, MANIM_PALETTE.GREEN_C, i / Math.max(1, N - 1));

      const rx = toPxX(ox + xLeft);
      const ry = toPxY(oy + height);
      const rw = toLen(dx);
      const rh = toLen(height);

      ctx.fillStyle = col;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(rx, ry, rw, rh);

      if (N <= 40) {
        ctx.strokeStyle = MANIM_PALETTE.BLACK;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = sw(1.2);
        ctx.strokeRect(rx, ry, rw, rh);
      }
    }
    ctx.globalAlpha = 1.0;

    if (N === 6 && t >= 5.5 && t < 9.0) {
      const braceP = windowProgress(t, 5.5, 6.5);
      const x1 = ox + a + dx;
      const x2 = ox + a + 2 * dx;
      drawCurlyBrace(
        ctx,
        toPxX(x1),
        toPxY(oy - 0.15),
        toPxX(x2),
        toPxY(oy - 0.15),
        'down',
        MANIM_PALETTE.YELLOW_C,
        sw(2.0),
        braceP,
        'Δx',
        toLen(0.24)
      );
    }

    ctx.fillStyle = MANIM_PALETTE.WHITE;
    ctx.font = `italic ${Math.round(toLen(0.26))}px "Lora", serif`;
    ctx.textAlign = 'left';
    const approxArea = (9.42 - 0.65 / N).toFixed(3);
    ctx.fillText(`Partitions N = ${N}    Area ≈ ${approxArea}`, toPxX(ox + 0.4), toPxY(oy + axH + 0.45));
  }

  const curveP = windowProgress(t, 1.8, 3.8);
  if (curveP > 0) {
    ctx.strokeStyle = MANIM_PALETTE.BLUE_C;
    ctx.lineWidth = sw(3.2);
    ctx.beginPath();
    const steps = 100;
    for (let s = 0; s <= steps * curveP; s++) {
      const x = (s / steps) * 5.0;
      const y = fx(x);
      const px = toPxX(ox + x);
      const py = toPxY(oy + y);
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  if (t >= 14.0) {
    const ftcP = windowProgress(t, 14.2, 16.2);
    const ox2 = 1.35;
    drawManimAxes(ctx, {
      ox: toPxX(ox2),
      oy: toPxY(oy),
      w: toLen(axW * 0.9),
      h: toLen(axH),
      xTicks: 5,
      yTicks: 4,
      progress: ftcP,
      strokeWidth: sw(2.0),
      fontSize: toLen(0.2),
      xLabel: 'x',
      yLabel: 'F(x) = ∫ f(t) dt',
      yLabelColor: MANIM_PALETTE.YELLOW_C,
    });

    ctx.strokeStyle = MANIM_PALETTE.YELLOW_C;
    ctx.lineWidth = sw(3.0);
    ctx.beginPath();
    let accum = 0;
    const steps = 90;
    for (let s = 0; s <= steps * ftcP; s++) {
      const x = (s / steps) * 4.6;
      accum += fx(x) * (4.6 / steps) * 0.34;
      const px = toPxX(ox2 + x);
      const py = toPxY(oy + accum);
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

/* ============================================================================
 * MANIM VECTOR PRIMITIVES (Crisp Anti-Aliased Geometry, Zero Neon)
 * ============================================================================ */

function drawManimWriteText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSizePx: number,
  color: string,
  progress: number,
  align: CanvasTextAlign = 'center'
) {
  if (progress <= 0) return;
  ctx.save();
  ctx.font = `italic ${Math.round(fontSizePx)}px "Lora", Georgia, serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  const charCount = Math.ceil(text.length * clamp(progress, 0, 1));
  const visibleSub = text.slice(0, charCount);

  ctx.fillStyle = color;
  ctx.fillText(visibleSub, x, y);

  if (progress < 0.99 && charCount > 0) {
    ctx.strokeStyle = MANIM_PALETTE.BLUE_C;
    ctx.lineWidth = 1.2;
    ctx.strokeText(visibleSub.slice(-2), x, y);
  }
  ctx.restore();
}

function drawManimArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number,
  alpha = 1.0
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;

  const angle = Math.atan2(dy, dx);
  const tipLen = Math.min(len * 0.45, Math.max(10, lineWidth * 4.5));
  const tipWidth = tipLen * 0.65;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - Math.cos(angle) * (tipLen * 0.7), y2 - Math.sin(angle) * (tipLen * 0.7));
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - tipLen * Math.cos(angle) + (tipWidth / 2) * Math.sin(angle),
    y2 - tipLen * Math.sin(angle) - (tipWidth / 2) * Math.cos(angle)
  );
  ctx.lineTo(
    x2 - tipLen * 0.82 * Math.cos(angle),
    y2 - tipLen * 0.82 * Math.sin(angle)
  );
  ctx.lineTo(
    x2 - tipLen * Math.cos(angle) - (tipWidth / 2) * Math.sin(angle),
    y2 - tipLen * Math.sin(angle) + (tipWidth / 2) * Math.cos(angle)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSurroundingRectangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  lineWidth: number,
  progress: number,
  dashed = false
) {
  if (progress <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  const perimeter = 2 * (w + h);
  if (dashed) {
    ctx.setLineDash([6, 4]);
  } else if (progress < 0.999) {
    ctx.setLineDash([perimeter * progress, perimeter]);
  }
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawCurlyBrace(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  direction: 'down' | 'up',
  color: string,
  lineWidth: number,
  progress: number,
  label: string,
  fontSizePx: number
) {
  if (progress <= 0) return;
  const sign = direction === 'down' ? 1 : -1;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const amp = 11 * sign;

  ctx.save();
  ctx.globalAlpha *= progress;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1, y1 + amp, midX, midY, midX, midY + amp * 1.15);
  ctx.bezierCurveTo(midX, midY, x2, y2 + amp, x2, y2);
  ctx.stroke();

  if (label) {
    ctx.fillStyle = color;
    ctx.font = `italic ${Math.round(fontSizePx)}px "Lora", serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, midX, midY + amp * 2.6);
  }
  ctx.restore();
}

function drawManimAxes(
  ctx: CanvasRenderingContext2D,
  cfg: {
    ox: number;
    oy: number;
    w: number;
    h: number;
    xTicks: number;
    yTicks: number;
    progress: number;
    strokeWidth: number;
    fontSize: number;
    xLabel: string;
    yLabel: string;
    yLabelColor: string;
  }
) {
  if (cfg.progress <= 0) return;
  const { ox, oy, w, h, xTicks, yTicks, progress, strokeWidth, fontSize } = cfg;

  drawManimArrow(
    ctx,
    ox - 12,
    oy,
    ox + w * progress,
    oy,
    MANIM_PALETTE.GREY_B,
    strokeWidth,
    1.0
  );

  drawManimArrow(
    ctx,
    ox,
    oy + 12,
    ox,
    oy - h * progress,
    MANIM_PALETTE.GREY_B,
    strokeWidth,
    1.0
  );

  ctx.strokeStyle = MANIM_PALETTE.GREY_B;
  ctx.lineWidth = strokeWidth * 0.85;
  const tickHalf = 5;

  for (let i = 1; i <= xTicks; i++) {
    if (i / xTicks > progress) break;
    const tx = ox + (i / (xTicks + 0.4)) * w;
    ctx.beginPath();
    ctx.moveTo(tx, oy - tickHalf);
    ctx.lineTo(tx, oy + tickHalf);
    ctx.stroke();
  }

  for (let j = 1; j <= yTicks; j++) {
    if (j / yTicks > progress) break;
    const ty = oy - (j / (yTicks + 0.4)) * h;
    ctx.beginPath();
    ctx.moveTo(ox - tickHalf, ty);
    ctx.lineTo(ox + tickHalf, ty);
    ctx.stroke();
  }

  if (progress > 0.7) {
    const lblAlpha = (progress - 0.7) / 0.3;
    ctx.save();
    ctx.globalAlpha = lblAlpha;
    ctx.font = `italic ${Math.round(fontSize)}px "Lora", serif`;
    ctx.fillStyle = MANIM_PALETTE.GREY_A;
    ctx.textAlign = 'right';
    ctx.fillText(cfg.xLabel, ox + w, oy + fontSize * 1.6);

    ctx.fillStyle = cfg.yLabelColor;
    ctx.textAlign = 'left';
    ctx.fillText(cfg.yLabel, ox + 12, oy - h + 6);
    ctx.restore();
  }
}

function drawPixelMatrix(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  grid: number[][],
  alpha: number,
  borderWidth: number
) {
  if (alpha <= 0) return;
  const rows = grid.length;
  const cols = grid[0].length;
  const cell = size / rows;
  const x0 = cx - size / 2;
  const y0 = cy - size / 2;

  ctx.save();
  ctx.globalAlpha = alpha;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = Math.round(grid[r][c] * 240);
      ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
      ctx.fillRect(x0 + c * cell, y0 + r * cell, cell + 0.5, cell + 0.5);
    }
  }

  ctx.strokeStyle = MANIM_PALETTE.BLUE_C;
  ctx.lineWidth = borderWidth;
  ctx.strokeRect(x0, y0, size, size);
  ctx.restore();
}

function drawManimNumberPlane(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  toPxX: (mx: number) => number,
  toPxY: (my: number) => number,
  lineWidth: number,
  alpha: number,
  cam: { x: number; y: number; zoom: number }
) {
  ctx.save();
  ctx.strokeStyle = MANIM_PALETTE.BLUE_E;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = lineWidth;

  const minX = Math.floor(cam.x - 12);
  const maxX = Math.ceil(cam.x + 12);
  const minY = Math.floor(cam.y - 8);
  const maxY = Math.ceil(cam.y + 8);

  for (let x = minX; x <= maxX; x++) {
    const px = toPxX(x);
    if (px < 0 || px > W) continue;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, H);
    ctx.stroke();
  }

  for (let y = minY; y <= maxY; y++) {
    const py = toPxY(y);
    if (py < 0 || py > H) continue;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(W, py);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCameraHud(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cam: { x: number; y: number; zoom: number }
) {
  ctx.save();
  ctx.strokeStyle = MANIM_PALETTE.YELLOW_C;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.setLineDash([]);

  const cx = W / 2;
  const cy = H / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy);
  ctx.lineTo(cx + 12, cy);
  ctx.moveTo(cx, cy - 12);
  ctx.lineTo(cx, cy + 12);
  ctx.stroke();

  ctx.fillStyle = MANIM_PALETTE.YELLOW_C;
  ctx.globalAlpha = 0.85;
  ctx.font = '18px "IBM Plex Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(
    `MovingCameraScene.frame: center=(${cam.x.toFixed(2)}, ${cam.y.toFixed(2)})  zoom=${cam.zoom.toFixed(2)}x`,
    W - 36,
    H - 36
  );
  ctx.restore();
}
