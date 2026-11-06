import React, { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Maximize2 } from 'lucide-react';
import { db } from '../../db/database';

interface CardImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageId?: string;
  fallbackDataUrl?: string;
  title?: string;
}

/**
 * 全螢幕高畫質名片照片放大檢視器 (支援手機雙指 Pinch-to-Zoom、單指拖曳平移、雙擊放大、旋轉 90 度)
 */
export const CardImageLightbox: React.FC<CardImageLightboxProps> = ({
  isOpen,
  onClose,
  imageId,
  fallbackDataUrl,
  title = '名片原圖檢視',
}) => {
  const [imgSrc, setImgSrc] = useState<string>(fallbackDataUrl || '');
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  const lastTapTimeRef = useRef<number>(0);

  // 載入 IndexedDB 1920px 高清原圖
  useEffect(() => {
    if (!isOpen) return;
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setImgSrc(fallbackDataUrl || '');

    let objectUrlToRevoke: string | null = null;
    if (imageId) {
      db.cardImages
        .get(imageId)
        .then((record) => {
          if (record && record.data) {
            const blob = new Blob([record.data as unknown as BlobPart], {
              type: record.mimeType || 'image/jpeg',
            });
            objectUrlToRevoke = URL.createObjectURL(blob);
            setImgSrc(objectUrlToRevoke);
          }
        })
        .catch(() => {});
    }

    return () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [isOpen, imageId, fallbackDataUrl]);

  if (!isOpen || !imgSrc) return null;

  const updateScale = (nextScale: number) => {
    const clamped = Math.min(5, Math.max(1, Number(nextScale.toFixed(2))));
    setScale(clamped);
    if (clamped === 1) {
      setPosition({ x: 0, y: 0 });
    }
  };

  // 手機觸控：支援單指平移 + 雙指 Pinch 縮放 + 雙擊快速放大
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartScaleRef.current = scale;
      setIsDragging(false);
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapTimeRef.current < 300) {
        // 雙擊切換 1x / 2.5x
        if (scale > 1.2) {
          updateScale(1);
        } else {
          updateScale(2.5);
        }
        lastTapTimeRef.current = 0;
        return;
      }
      lastTapTimeRef.current = now;

      if (scale > 1) {
        setIsDragging(true);
        dragStartRef.current = {
          x: e.touches[0].clientX - position.x,
          y: e.touches[0].clientY - position.y,
        };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchStartDistRef.current;
      updateScale(pinchStartScaleRef.current * ratio);
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      e.preventDefault();
      setPosition({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      });
    }
  };

  const handleTouchEnd = () => {
    pinchStartDistRef.current = null;
    setIsDragging(false);
  };

  // 滑鼠拖曳支援
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[80] bg-slate-950/95 backdrop-blur-md flex flex-col justify-between select-none animate-in fade-in duration-150"
    >
      {/* 頂部工具列 */}
      <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-20">
        <div className="text-white text-xs sm:text-sm font-bold truncate pr-2">
          🔍 {title} <span className="text-blue-400 font-mono ml-1">({Math.round(scale * 100)}%)</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center space-x-1.5 border border-slate-700 min-h-[40px] flex-shrink-0"
        >
          <X className="w-4 h-4" />
          <span>關閉放大</span>
        </button>
      </div>

      {/* 影像互動畫布區 */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={() => updateScale(scale > 1.2 ? 1 : 2.5)}
        onClick={(e) => {
          if (e.target === e.currentTarget && scale === 1) onClose();
        }}
        className="flex-1 overflow-hidden flex items-center justify-center relative touch-none p-2 sm:p-6"
      >
        <img
          src={imgSrc}
          alt={title}
          draggable={false}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
          }}
          className={`max-w-full max-h-[75dvh] object-contain rounded-lg shadow-2xl ${
            scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
          }`}
        />
      </div>

      {/* 底部大按鈕縮放與旋轉控制列 */}
      <div className="px-3 py-3.5 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center justify-center gap-2 z-20">
        <button
          type="button"
          onClick={() => updateScale(scale - 0.5)}
          disabled={scale <= 1}
          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs font-bold flex items-center space-x-1 border border-slate-700 min-h-[40px]"
        >
          <ZoomOut className="w-4 h-4" />
          <span>縮小</span>
        </button>

        <button
          type="button"
          onClick={() => updateScale(1)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border min-h-[40px] ${
            scale === 1
              ? 'bg-blue-600 text-white border-blue-500'
              : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
          }`}
        >
          1x 原始
        </button>

        <button
          type="button"
          onClick={() => updateScale(2)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border min-h-[40px] ${
            scale === 2
              ? 'bg-blue-600 text-white border-blue-500'
              : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
          }`}
        >
          2x 放大
        </button>

        <button
          type="button"
          onClick={() => updateScale(3)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border min-h-[40px] ${
            scale === 3
              ? 'bg-blue-600 text-white border-blue-500'
              : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
          }`}
        >
          3x 特寫
        </button>

        <button
          type="button"
          onClick={() => updateScale(scale + 0.5)}
          disabled={scale >= 5}
          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs font-bold flex items-center space-x-1 border border-slate-700 min-h-[40px]"
        >
          <ZoomIn className="w-4 h-4" />
          <span>放大</span>
        </button>

        <button
          type="button"
          onClick={() => setRotation((r) => (r + 90) % 360)}
          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center space-x-1 border border-slate-700 min-h-[40px]"
        >
          <RotateCw className="w-4 h-4" />
          <span>旋轉</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center space-x-1 min-h-[40px]"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>完成關閉</span>
        </button>
      </div>
    </div>
  );
};
