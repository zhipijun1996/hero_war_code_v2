import { useState, useRef, useEffect } from 'react';

export const useStageInteraction = (initialWidth: number, initialHeight: number) => {
  const calculateInitialScale = (w: number, h: number) => {
    const targetWidth = 1000;
    const targetHeight = 1600;
    return Math.min(w / targetWidth, h / targetHeight, 1);
  };

  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  const [stagePos, setStagePos] = useState({ x: initialWidth / 2, y: initialHeight / 2 });
  const [stageScale, setStageScale] = useState(() => calculateInitialScale(initialWidth, initialHeight));
  
  const lastCenter = useRef<{ x: number, y: number } | null>(null);
  const lastDist = useRef<number>(0);

  const getDistance = (p1: any, p2: any) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  const getCenter = (p1: any, p2: any) => {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    };
  };

  const handleTouchMove = (e: any) => {
    e.evt.preventDefault();
    const touch1 = e.evt.touches[0];
    const touch2 = e.evt.touches[1];

    if (touch1 && touch2) {
      const stage = e.target.getStage();
      if (!stage) return;

      if (stage.isDragging()) {
        stage.stopDrag();
      }

      const p1 = { x: touch1.clientX, y: touch1.clientY };
      const p2 = { x: touch2.clientX, y: touch2.clientY };

      if (!lastCenter.current) {
        lastCenter.current = getCenter(p1, p2);
        lastDist.current = getDistance(p1, p2);
        stage.setAttr('startScale', stage.scaleX());
        stage.setAttr('startPos', stage.position());
        return;
      }

      const newCenter = getCenter(p1, p2);
      const dist = getDistance(p1, p2);

      const startScale = stage.getAttr('startScale');
      const startPos = stage.getAttr('startPos');
      const startCenter = lastCenter.current;
      const startDist = lastDist.current;

      if (!startScale || !startPos || !startDist) return;

      const scale = startScale * (dist / startDist);

      const pointTo = {
        x: (startCenter.x - startPos.x) / startScale,
        y: (startCenter.y - startPos.y) / startScale,
      };

      const newPos = {
        x: newCenter.x - pointTo.x * scale,
        y: newCenter.y - pointTo.y * scale,
      };

      stage.scaleX(scale);
      stage.scaleY(scale);
      stage.position(newPos);
      stage.batchDraw();

      setStageScale(scale);
      setStagePos(newPos);
    }
  };

  const handleTouchEnd = (e: any) => {
    lastDist.current = 0;
    lastCenter.current = null;
    
    const stage = e.target.getStage();
    if (stage) {
      setStageScale(stage.scaleX());
      setStagePos(stage.position());
    }
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const mousePointTo = {
      x: stage.getPointerPosition().x / oldScale - stage.x() / oldScale,
      y: stage.getPointerPosition().y / oldScale - stage.y() / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setStageScale(newScale);
    setStagePos({
      x: -(mousePointTo.x - stage.getPointerPosition().x / newScale) * newScale,
      y: -(mousePointTo.y - stage.getPointerPosition().y / newScale) * newScale,
    });
  };

  const zoomIn = () => setStageScale(s => s * 1.2);
  const zoomOut = () => setStageScale(s => s / 1.2);
  const resetZoom = () => {
    setStageScale(calculateInitialScale(size.width, size.height));
    setStagePos({ x: size.width / 2, y: size.height / 2 });
  };

  return {
    size,
    setSize,
    stagePos,
    setStagePos,
    stageScale,
    setStageScale,
    handleWheel,
    handleTouchMove,
    handleTouchEnd,
    zoomIn,
    zoomOut,
    resetZoom,
  };
};
