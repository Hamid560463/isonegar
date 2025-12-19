
import { Vector2D, PipeSegment, ResolvedCoordinates } from '../domain/types';
import { CONFIG } from '../domain/constants';
import { drawFittingSymbol } from './SymbolLibrary';

interface RenderOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  offset: Vector2D;
  scale: number;
  isExport: boolean;
  pipes: PipeSegment[];
  pipeCoords: Map<string, ResolvedCoordinates>;
  selectedId: string;
  isMeasureMode: boolean;
  measurePoints: Vector2D[];
  mousePos: Vector2D;
}

export const renderScene = ({
  ctx, width, height, offset, scale, isExport,
  pipes, pipeCoords, selectedId, isMeasureMode, measurePoints, mousePos
}: RenderOptions) => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = isExport ? '#ffffff' : '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  // Crosshairs for Measurement
  if (!isExport && isMeasureMode) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 1;
    ctx.moveTo(mousePos.x, 0); ctx.lineTo(mousePos.x, height);
    ctx.moveTo(0, mousePos.y); ctx.lineTo(width, mousePos.y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(offset.x, offset.y);
  ctx.scale(scale, scale);

  if (!isExport) {
    const step = 50;
    ctx.beginPath(); ctx.strokeStyle = CONFIG.COLORS.GRID; ctx.lineWidth = 1/scale;
    const vL = -offset.x/scale, vT = -offset.y/scale, vR = (width-offset.x)/scale, vB = (height-offset.y)/scale;
    for (let x = Math.floor(vL/step)*step; x < vR; x += step) { ctx.moveTo(x, vT); ctx.lineTo(x, vB); }
    for (let y = Math.floor(vT/step)*step; y < vB; y += step) { ctx.moveTo(vL, y); ctx.lineTo(vR, y); }
    ctx.stroke();
  }

  // Root Point
  ctx.beginPath();
  ctx.arc(0, 0, 8 / scale, 0, Math.PI * 2);
  ctx.fillStyle = CONFIG.COLORS.ROOT;
  ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5/scale; ctx.stroke();
  ctx.fillStyle = CONFIG.COLORS.ROOT;
  ctx.font = `bold ${14 / scale}px Vazirmatn`;
  ctx.textAlign = 'center';
  ctx.fillText("شروع", 0, 24 / scale);

  pipes.forEach(pipe => {
    const coords = pipeCoords.get(pipe.id);
    if (!coords) return;
    const isSelected = !isExport && selectedId === pipe.id;
    const sizePx = (CONFIG.SIZES[pipe.size as keyof typeof CONFIG.SIZES] || 2);
    const color = (CONFIG.SIZE_COLORS[pipe.size as keyof typeof CONFIG.SIZE_COLORS] || CONFIG.COLORS.PIPE);

    if (pipe.length > 0) {
      ctx.beginPath();
      ctx.moveTo(coords.startX, coords.startY);
      ctx.lineTo(coords.endX, coords.endY);
      ctx.strokeStyle = isSelected ? CONFIG.COLORS.SELECTED : color;
      ctx.lineWidth = (isSelected ? sizePx + 2 : sizePx) / scale;
      ctx.lineCap = 'round';
      if (pipe.installationType === 'UNDER') ctx.setLineDash([5/scale, 5/scale]);
      else ctx.setLineDash([]);
      ctx.stroke();

      const mx = (coords.startX + coords.endX) / 2;
      const my = (coords.startY + coords.endY) / 2;
      let ox = 28 / scale, oy = -12 / scale;
      if (pipe.direction === 'UP' || pipe.direction === 'DOWN') { ox = 35 / scale; oy = 0; }
      
      ctx.save();
      ctx.fillStyle = isSelected ? CONFIG.COLORS.SELECTED : CONFIG.COLORS.LABEL;
      ctx.font = `bold ${11 / scale}px Vazirmatn`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'white'; ctx.shadowBlur = 4/scale;
      ctx.fillText(`${pipe.size} - ${pipe.length}cm`, mx + ox, my + oy);
      ctx.restore();
    }

    if (pipe.fitting !== 'NONE') {
      drawFittingSymbol(ctx, pipe.fitting, coords.endX, coords.endY, pipe.direction, scale);
    }
  });

  if (!isExport && isMeasureMode && measurePoints.length > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = CONFIG.COLORS.MEASURE;
    ctx.setLineDash([5/scale, 5/scale]);
    ctx.lineWidth = 2/scale;
    ctx.moveTo(measurePoints[0].x, measurePoints[0].y);
    if (measurePoints.length > 1) {
      ctx.lineTo(measurePoints[1].x, measurePoints[1].y);
      ctx.stroke();
      const dist = Math.round(Math.hypot(measurePoints[1].x - measurePoints[0].x, measurePoints[1].y - measurePoints[0].y) / CONFIG.SCALE);
      ctx.fillStyle = CONFIG.COLORS.MEASURE;
      ctx.font = `bold ${14/scale}px Vazirmatn`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'white'; ctx.shadowBlur = 4/scale;
      ctx.fillText(`${dist} cm`, (measurePoints[0].x + measurePoints[1].x)/2, (measurePoints[0].y + measurePoints[1].y)/2 - 10/scale);
    }
    ctx.restore();
    measurePoints.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 5/scale, 0, Math.PI*2); ctx.fillStyle = CONFIG.COLORS.MEASURE; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5/scale; ctx.stroke();
    });
  }

  if (!isExport) {
      pipes.forEach(p => {
          const c = pipeCoords.get(p.id);
          if (c) {
              ctx.beginPath(); ctx.arc(c.endX, c.endY, 4/scale, 0, Math.PI*2);
              ctx.fillStyle = selectedId === p.id ? CONFIG.COLORS.SELECTED : '#fff';
              ctx.strokeStyle = CONFIG.COLORS.SELECTED;
              ctx.lineWidth = 1.5/scale;
              ctx.fill(); ctx.stroke();
          }
      });
  }
  ctx.restore();

  if (!isExport) {
    // Legend
    ctx.save();
    const lx = 20, ly = height - 160;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(lx, ly, 100, 140);
    ctx.strokeStyle = '#cbd5e1'; ctx.strokeRect(lx, ly, 100, 140);
    ctx.fillStyle = '#1e293b'; ctx.font = 'bold 11px Vazirmatn'; ctx.textAlign='center'; ctx.fillText('سایز لوله‌ها', lx + 50, ly + 20);
    Object.entries(CONFIG.SIZE_COLORS).forEach(([size, col], i) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx + 15, ly + 40 + i*18, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#475569'; ctx.textAlign='right'; ctx.font='10px Vazirmatn'; ctx.fillText(size, lx + 90, ly + 43 + i*18);
    });
    ctx.restore();

    // Compass
    ctx.save();
    const cx = width - 80, cy = height - 80;
    ctx.translate(cx, cy);
    const s = 30; const c30 = Math.cos(Math.PI/6), s30 = Math.sin(Math.PI/6);
    [[c30,-s30,'ش','#ef4444'],[-c30,s30,'ج','#64748b'],[c30,s30,'ق','#3b82f6'],[-c30,-s30,'غ','#64748b']].forEach(([dx,dy,l,cl]) => {
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Number(dx)*s, Number(dy)*s); ctx.strokeStyle = cl as string; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle = cl as string; ctx.font='bold 11px Vazirmatn'; ctx.textAlign='center'; ctx.fillText(l as string, Number(dx)*s*1.4, Number(dy)*s*1.4 + 4);
    });
    ctx.restore();
  }
};
