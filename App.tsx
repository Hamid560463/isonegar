
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Plus, Trash2, RotateCcw, RotateCw, Download, Layers, Save, AlertCircle, 
  FileText, Loader2, Wrench, ZoomIn, ZoomOut, Move, Target,
  Settings, ChevronRight, Share2, Info, CheckCircle2, Ruler,
  Upload, FileJson, Tag, Eye, EyeOff, Printer, Maximize2, X, List, Edit3, SaveAll,
  ShieldCheck, Calculator, FileStack, Layout, Undo2, Redo2
} from 'lucide-react';
import { Direction, FittingType, InstallationType, PipeSegment, ResolvedCoordinates, Vector2D } from './types';
import { CONFIG } from './constants';
import { resolveAllCoordinates, findNearestNode, getDistanceToSegment } from './utils/isometric';
import { drawFittingSymbol } from './components/SymbolLibrary';
import { geminiService } from './services/geminiService';

interface HistoryState {
  pipes: PipeSegment[];
  selectedId: string;
}

type PaperSize = 'A4' | 'A3';
type Orientation = 'PORTRAIT' | 'LANDSCAPE';

const App: React.FC = () => {
  const [pipes, setPipes] = useState<PipeSegment[]>(() => {
    const saved = localStorage.getItem('smartgas_project_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : (parsed?.pipes || []);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [viewOffset, setViewOffset] = useState<Vector2D>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1.2);
  const [isMeasureMode, setIsMeasureMode] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<Vector2D[]>([]);
  const [mousePos, setMousePos] = useState<Vector2D>({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string>('ROOT');
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  
  // Professional History Management
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);
  
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);
  const [modalMode, setModalMode] = useState<'SAFETY' | 'MTO'>('SAFETY');

  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [orientation, setOrientation] = useState<Orientation>('LANDSCAPE');

  const [form, setForm] = useState<{ 
    length: number; 
    size: string; 
    direction: Direction; 
    fitting: FittingType; 
    installationType: InstallationType;
    label: string 
  }>({
    length: 100,
    size: '1"',
    direction: 'NORTH',
    fitting: 'NONE',
    installationType: 'ABOVE',
    label: ''
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('smartgas_project_data', JSON.stringify({ pipes }));
  }, [pipes]);

  useEffect(() => {
    if (viewOffset.x === 0 && viewOffset.y === 0 && containerRef.current) {
        setViewOffset({ 
            x: containerRef.current.clientWidth / 2, 
            y: containerRef.current.clientHeight / 2 
        });
    }
  }, []);

  useEffect(() => {
    if (selectedId !== 'ROOT') {
      const pipe = pipes.find(p => p.id === selectedId);
      if (pipe) {
        setForm({
          length: pipe.length,
          size: pipe.size,
          direction: pipe.direction,
          fitting: pipe.fitting,
          installationType: pipe.installationType,
          label: pipe.label || ''
        });
      }
    }
  }, [selectedId, pipes]);

  // Utility to capture state before mutation
  const commitToHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-49), { pipes: JSON.parse(JSON.stringify(pipes)), selectedId }]);
    setRedoStack([]); // Clear redo stack on new action
  }, [pipes, selectedId]);

  const handleFittingChange = (type: FittingType) => {
    setForm(prev => ({
      ...prev,
      fitting: type,
      length: type !== 'NONE' ? 0 : (prev.length === 0 ? 100 : prev.length)
    }));
  };

  const pipeCoords = useMemo(() => resolveAllCoordinates(pipes), [pipes]);

  const handleAiAnalysis = async (mode: 'SAFETY' | 'MTO') => {
    setAiLoading(true);
    setModalMode(mode);
    setAiResponse("");
    setShowAiModal(true);
    try {
      const response = await geminiService.analyzeProject(pipes, mode);
      setAiResponse(response);
    } catch (error) {
      setAiResponse("خطا در برقراری ارتباط با سرویس هوشمند.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack(prev => [...prev, { pipes: JSON.parse(JSON.stringify(pipes)), selectedId }]);
    setHistory(prev => prev.slice(0, -1));
    setPipes(previous.pipes);
    setSelectedId(previous.selectedId);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(prev => [...prev, { pipes: JSON.parse(JSON.stringify(pipes)), selectedId }]);
    setRedoStack(prev => prev.slice(0, -1));
    setPipes(next.pipes);
    setSelectedId(next.selectedId);
  };

  const handleZoom = (factor: number) => setZoom(z => Math.max(0.1, Math.min(10, z * factor)));

  const calculateBoundingBox = () => {
    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    if (pipes.length === 0) return { minX: -50, minY: -50, maxX: 50, maxY: 50, width: 100, height: 100 };
    pipeCoords.forEach(c => {
      minX = Math.min(minX, c.startX, c.endX);
      maxX = Math.max(maxX, c.startX, c.endX);
      minY = Math.min(minY, c.startY, c.endY);
      maxY = Math.max(maxY, c.startY, c.endY);
    });
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  };

  const renderScene = useCallback((
    ctx: CanvasRenderingContext2D, 
    width: number, 
    height: number, 
    offset: Vector2D, 
    scale: number, 
    isExport: boolean
  ) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = isExport ? '#ffffff' : '#f8fafc';
    ctx.fillRect(0, 0, width, height);

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
  }, [pipes, pipeCoords, selectedId, isMeasureMode, measurePoints, mousePos]);

  const mainDraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    renderScene(ctx, w, h, viewOffset, zoom, false);
  }, [renderScene, viewOffset, zoom]);

  useEffect(() => {
    const frameId = requestAnimationFrame(mainDraw);
    return () => cancelAnimationFrame(frameId);
  }, [mainDraw]);

  useEffect(() => {
    if (showPrintPreview && previewCanvasRef.current) {
        const cvs = previewCanvasRef.current;
        const ctx = cvs.getContext('2d');
        if (ctx) {
            const baseW = paperSize === 'A4' ? 1123 : 1587;
            const baseH = paperSize === 'A4' ? 794 : 1123;
            cvs.width = orientation === 'LANDSCAPE' ? baseW : baseH;
            cvs.height = orientation === 'LANDSCAPE' ? baseH : baseW;
            const box = calculateBoundingBox();
            const padding = 150;
            const availableW = cvs.width - padding * 2;
            const availableH = cvs.height - padding * 2;
            const scaleX = availableW / (box.width || 1);
            const scaleY = availableH / (box.height || 1);
            const fitScale = Math.min(scaleX, scaleY, 2.5);
            const centerX = cvs.width / 2 - (box.minX + box.width / 2) * fitScale;
            const centerY = cvs.height / 2 - (box.minY + box.height / 2) * fitScale;
            renderScene(ctx, cvs.width, cvs.height, { x: centerX, y: centerY }, fitScale, true);
        }
    }
  }, [showPrintPreview, paperSize, orientation, pipes, pipeCoords, renderScene]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldX = (e.clientX - rect.left - viewOffset.x) / zoom;
    const worldY = (e.clientY - rect.top - viewOffset.y) / zoom;

    if (pipes.length === 0) {
      setViewOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setSelectedId('ROOT');
      return;
    }

    if (isDragging) return;

    if (isMeasureMode) {
      setMeasurePoints(prev => {
        if (prev.length >= 2) return [{ x: worldX, y: worldY }];
        return [...prev, { x: worldX, y: worldY }];
      });
      return;
    }

    if (Math.hypot(worldX, worldY) < 20/zoom) { setSelectedId('ROOT'); return; }
    let bestId = 'ROOT', minD = 20/zoom;
    for (const [id, c] of pipeCoords.entries()) {
        const d = getDistanceToSegment(worldX, worldY, c.startX, c.startY, c.endX, c.endY);
        if (d < minD) { minD = d; bestId = id; }
    }
    setSelectedId(bestId);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });
    if (isDragging) {
        setViewOffset(v => ({ x: v.x + (e.clientX - lastMousePos.x), y: v.y + (e.clientY - lastMousePos.y) }));
        setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleAddPipe = () => {
    commitToHistory();
    const id = Math.random().toString(36).substr(2, 9);
    setPipes(prev => [...prev, { id, parentId: selectedId, ...form }]);
    setSelectedId(id);
    if (form.fitting !== 'NONE') {
        setForm(f => ({ ...f, fitting: 'NONE', length: 100 }));
    }
  };

  const handleDeletePipe = () => {
    if (selectedId === 'ROOT') return;
    commitToHistory();
    setPipes(prev => prev.filter(p => p.id !== selectedId));
    setSelectedId('ROOT');
  };

  const handleUpdatePipe = () => {
    if (selectedId === 'ROOT') return;
    commitToHistory();
    setPipes(prev => prev.map(p => p.id === selectedId ? {...p, ...form} : p));
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-800 overflow-hidden" dir="rtl">
      <input type="file" ref={fileInputRef} onChange={(e) => {
          const file = e.target.files?.[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const data = JSON.parse(ev.target?.result as string);
              if (data.pipes) { commitToHistory(); setPipes(data.pipes); }
              else if (Array.isArray(data)) { commitToHistory(); setPipes(data); }
              setSelectedId('ROOT');
            } catch(e) { alert("خطا در خواندن فایل"); }
          };
          reader.readAsText(file);
      }} className="hidden" />

      <aside className="w-64 bg-white border-l border-slate-200 shadow-2xl z-30 flex flex-col h-full shrink-0">
        <header className="p-3 border-b bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-blue-600 rounded text-white shadow-sm"><Layers size={14} /></div>
            <h1 className="text-xs font-bold tracking-tight truncate">ایزو نگار (IsoNegar)</h1>
          </div>
          <div className="flex gap-1">
            <button 
              onClick={handleUndo} 
              disabled={history.length === 0} 
              className={`p-1 rounded transition-all border ${history.length > 0 ? 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 shadow-sm' : 'text-slate-200 border-slate-100 cursor-not-allowed'}`}
              title="Undo"
            >
              <Undo2 size={14} />
            </button>
            <button 
              onClick={handleRedo} 
              disabled={redoStack.length === 0} 
              className={`p-1 rounded transition-all border ${redoStack.length > 0 ? 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 shadow-sm' : 'text-slate-200 border-slate-100 cursor-not-allowed'}`}
              title="Redo"
            >
              <Redo2 size={14} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-hide">
          <div className="p-2 bg-blue-50/50 border border-blue-100 rounded-lg">
            <label className="text-[8px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-widest"><Target size={10} /> انتخاب شده</label>
            <div className="text-[10px] font-bold text-blue-900 truncate mt-0.5">{selectedId === 'ROOT' ? 'نقطه شروع' : `انشعاب ${selectedId.slice(0, 4)}`}</div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500">جهت ترسیم</label>
              <select className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-[10px] outline-none" value={form.direction} onChange={e => setForm({...form, direction: e.target.value as Direction})}>
                <option value="NORTH">شمال</option><option value="SOUTH">جنوب</option><option value="EAST">شرق</option><option value="WEST">غرب</option><option value="UP">بالا</option><option value="DOWN">پایین</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500">طول لوله (CM)</label>
              <input type="number" className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-[10px] outline-none" value={form.length} onChange={e => setForm({...form, length: Number(e.target.value)})} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">سایز</label>
                <select className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-[10px] outline-none" value={form.size} onChange={e => setForm({...form, size: e.target.value})}>
                  {Object.keys(CONFIG.SIZES).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">اجرا</label>
                <select className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-[10px] outline-none" value={form.installationType} onChange={e => setForm({...form, installationType: e.target.value as InstallationType})}>
                  <option value="ABOVE">روکار</option><option value="UNDER">زیرکار</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500">تجهیز و المان</label>
              <select 
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-[10px] outline-none" 
                value={form.fitting} 
                onChange={e => handleFittingChange(e.target.value as FittingType)}
              >
                <option value="NONE">بدون تجهیز (زانو)</option>
                <optgroup label="شیرآلات">
                  <option value="VALVE_MAIN">شیر اصلی</option>
                  <option value="VALVE_GC">شیر اجاق گاز</option>
                  <option value="VALVE_PC">شیر پکیج</option>
                  <option value="VALVE_WH">شیر آبگرمکن</option>
                  <option value="VALVE_RC">شیر روشنایی</option>
                  <option value="VALVE_H">شیر بخاری</option>
                  <option value="VALVE">شیر عمومی</option>
                </optgroup>
                <optgroup label="تجهیزات">
                  <option value="METER">کنتور</option>
                  <option value="REGULATOR">رگولاتور</option>
                </optgroup>
                <optgroup label="اتصالات">
                  <option value="TEE">سه‌راهی (Tee)</option>
                  <option value="ELBOW45">زانو ۴۵ درجه</option>
                  <option value="COUPLING">بوشن</option>
                  <option value="NIPPLE">مغزی</option>
                  <option value="UNION">مهره ماسوره</option>
                  <option value="REDUCER">تبدیل</option>
                  <option value="CAP">درپوش</option>
                  <option value="FLANGE">فلنج</option>
                </optgroup>
              </select>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              {selectedId !== 'ROOT' && (
                <button onClick={handleUpdatePipe} className="w-full py-2 bg-slate-800 text-white rounded text-[10px] font-bold shadow-sm active:scale-95 transition-all">بروزرسانی تغییرات</button>
              )}
              <button onClick={handleAddPipe} className="w-full py-3 bg-blue-600 text-white rounded text-[10px] font-bold shadow-md hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-1">
                <Plus size={14} /> {form.fitting !== 'NONE' ? 'ثبت تجهیز' : 'ثبت انشعاب'}
              </button>
              {selectedId !== 'ROOT' && (
                <button onClick={handleDeletePipe} className="w-full py-1 text-red-500 font-bold text-[9px] hover:bg-red-50 rounded transition-all">حذف این بخش</button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t mt-2">
              <button onClick={() => handleAiAnalysis('SAFETY')} className="p-1.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-100 flex flex-col items-center gap-1 text-[9px] font-bold hover:bg-emerald-100 transition-all"><ShieldCheck size={14} />تحلیل ایمنی</button>
              <button onClick={() => handleAiAnalysis('MTO')} className="p-1.5 bg-blue-50 text-blue-700 rounded border border-blue-100 flex flex-col items-center gap-1 text-[9px] font-bold hover:bg-blue-100 transition-all"><Calculator size={14} />متره و برآورد</button>
            </div>
          </div>
        </div>

        <footer className="p-3 border-t bg-slate-50/80 space-y-2">
          <button onClick={() => setShowPrintPreview(true)} className="w-full bg-blue-900 text-white py-2.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 shadow hover:bg-black transition-all"><Printer size={14} /> خروجی نقشه نهایی</button>
          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={() => {
              const blob = new Blob([JSON.stringify({ pipes })], {type: 'application/json'});
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'gas_iso_project.json'; a.click();
            }} className="py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-[9px] font-bold flex items-center justify-center gap-1 hover:bg-slate-50"><Save size={12} /> ذخیره</button>
            <button onClick={() => fileInputRef.current?.click()} className="py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-[9px] font-bold flex items-center justify-center gap-1 hover:bg-slate-50"><Upload size={12} /> باز کردن</button>
          </div>
        </footer>
      </aside>

      <main 
        ref={containerRef} 
        className="flex-1 relative bg-slate-100 overflow-hidden"
        onMouseDown={e => { if (e.button === 1 || e.shiftKey) { setIsDragging(true); setLastMousePos({ x: e.clientX, y: e.clientY }); } }}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setIsDragging(false)}
      >
        <canvas 
          ref={canvasRef} 
          onClick={handleCanvasClick} 
          className={`block w-full h-full ${isMeasureMode ? 'cursor-none' : 'cursor-default'}`} 
        />

        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <div className="bg-white/90 backdrop-blur border border-slate-200 p-1 rounded shadow-xl flex flex-col gap-1">
            <button onClick={() => handleZoom(1.2)} className="p-1.5 hover:bg-blue-50 text-slate-600 rounded"><ZoomIn size={18} /></button>
            <button onClick={() => {
                if (containerRef.current) setViewOffset({ x: containerRef.current.clientWidth/2, y: containerRef.current.clientHeight/2 });
            }} className="p-1.5 hover:bg-blue-50 text-slate-600 rounded" title="Reset View"><Move size={18} /></button>
            <button onClick={() => handleZoom(0.8)} className="p-1.5 hover:bg-blue-50 text-slate-600 rounded"><ZoomOut size={18} /></button>
            <div className="h-px bg-slate-200 my-0.5 mx-1" />
            <button 
              onClick={() => {
                setIsMeasureMode(!isMeasureMode);
                setMeasurePoints([]);
              }} 
              className={`p-1.5 rounded transition-all ${isMeasureMode ? 'bg-amber-500 text-white shadow-lg' : 'hover:bg-amber-50 text-slate-600'}`}
              title="اندازه‌گیری"
            >
              <Ruler size={18} />
            </button>
          </div>
        </div>

        {pipes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div 
              className="bg-white/70 backdrop-blur-sm p-6 rounded-[2rem] border border-white/40 shadow-2xl flex flex-col items-center gap-2 animate-pulse pointer-events-auto cursor-pointer transition-all hover:scale-105 hover:bg-white/90"
              onClick={(e) => {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                  setViewOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  setSelectedId('ROOT');
                }
              }}
            >
              <div className="p-4 bg-blue-500 text-white rounded-full shadow-lg"><Target size={36} /></div>
              <p className="text-xs font-bold text-blue-900">روی صفحه کلیک کنید تا نقطه شروع مشخص شود</p>
              <p className="text-[9px] text-slate-500 font-medium">(نقطه شروع ترسیم در محل کلیک شما تنظیم می‌شود)</p>
            </div>
          </div>
        )}

        {isMeasureMode && (
          <div className="absolute bottom-4 right-72 bg-amber-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg animate-bounce">
            {measurePoints.length === 0 ? 'نقطه اول را انتخاب کنید' : measurePoints.length === 1 ? 'نقطه دوم را انتخاب کنید' : 'فاصله اندازه‌گیری شد'}
          </div>
        )}
      </main>

      {showPrintPreview && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-lg z-[200] flex items-center justify-center p-4">
           <div className="bg-white rounded-[1.5rem] w-full max-w-5xl h-[90vh] shadow-2xl flex flex-col overflow-hidden">
             <div className="p-4 border-b flex justify-between items-center bg-slate-50/50">
               <div className="flex items-center gap-4">
                 <h3 className="text-sm font-bold">پیش‌نمایش چاپ و فیت کاغذ</h3>
                 <div className="flex gap-1 bg-slate-200 p-1 rounded-lg">
                    <button onClick={() => setPaperSize('A4')} className={`px-4 py-1 rounded text-[10px] font-bold transition-all ${paperSize === 'A4' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>A4</button>
                    <button onClick={() => setPaperSize('A3')} className={`px-4 py-1 rounded text-[10px] font-bold transition-all ${paperSize === 'A3' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>A3</button>
                 </div>
                 <div className="flex gap-1 bg-slate-200 p-1 rounded-lg">
                    <button onClick={() => setOrientation('LANDSCAPE')} className={`px-4 py-1 rounded text-[10px] font-bold transition-all ${orientation === 'LANDSCAPE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>افقی</button>
                    <button onClick={() => setOrientation('PORTRAIT')} className={`px-4 py-1 rounded text-[10px] font-bold transition-all ${orientation === 'PORTRAIT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>عمودی</button>
                 </div>
               </div>
               <button onClick={() => setShowPrintPreview(false)} className="text-slate-400 hover:text-red-500 transition-colors p-1"><X size={20} /></button>
             </div>
             <div className="flex-1 bg-slate-200/50 p-6 flex items-center justify-center overflow-auto scrollbar-hide">
               <canvas ref={previewCanvasRef} className="bg-white shadow-2xl border border-slate-300 max-h-full max-w-full object-contain transition-opacity duration-300" />
             </div>
             <div className="p-4 border-t bg-white flex justify-end gap-3">
               <button onClick={() => setShowPrintPreview(false)} className="px-6 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors">بازگشت</button>
               <button onClick={() => {
                 const canvas = previewCanvasRef.current;
                 if (canvas) {
                   const link = document.createElement('a');
                   link.download = `IsoPlan_${paperSize}_${orientation}.png`;
                   link.href = canvas.toDataURL('image/png', 1.0);
                   link.click();
                 }
               }} className="px-10 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-lg hover:bg-blue-700 transition-all active:scale-95">دانلود تصویر با کیفیت نهایی</button>
             </div>
           </div>
        </div>
      )}

      {showAiModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur z-[500] flex items-center justify-center p-4">
            <div className="bg-white rounded-[1.5rem] w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      {modalMode === 'SAFETY' ? <ShieldCheck className="text-emerald-500" size={16} /> : <Calculator className="text-blue-500" size={16} />}
                      تحلیل هوشمند مهندسی
                    </h3>
                    <button onClick={() => setShowAiModal(false)} className="text-slate-400 hover:text-red-500 transition-colors p-1"><X size={20} /></button>
                </div>
                <div className="p-6 overflow-y-auto text-[12px] leading-relaxed text-slate-700 whitespace-pre-wrap rtl scrollbar-hide">
                    {aiLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                            <Loader2 className="animate-spin text-blue-600" size={32} />
                            <p className="text-slate-500 animate-pulse font-bold">درحال پردازش اطلاعات فنی...</p>
                        </div>
                    ) : (
                      <div className="prose prose-sm prose-slate max-w-none rtl">
                        {aiResponse}
                      </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
