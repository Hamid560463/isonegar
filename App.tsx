
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Plus, Trash2, RotateCcw, RotateCw, Download, Layers, Save, AlertCircle, 
  FileText, Loader2, Wrench, ZoomIn, ZoomOut, Move, Target,
  Settings, ChevronRight, Share2, Info, CheckCircle2, Ruler,
  Upload, FileJson, Tag, Eye, EyeOff, Printer, Maximize2, X, List, Edit3, SaveAll,
  ShieldCheck, Calculator, FileStack, Layout
} from 'lucide-react';
import { Direction, FittingType, InstallationType, PipeSegment, ResolvedCoordinates, Vector2D } from './types';
import { CONFIG } from './constants';
import { resolveAllCoordinates, findNearestNode, getDistanceToSegment } from './utils/isometric';
import { drawFittingSymbol } from './components/SymbolLibrary';
import { geminiService } from './services/geminiService';

interface ProjectState {
  pipes: PipeSegment[];
  viewOffset: Vector2D;
  zoom: number;
  isMeasureMode: boolean;
}

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
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : (parsed.pipes || []);
    }
    return [];
  });

  const [viewOffset, setViewOffset] = useState<Vector2D>(() => {
    const saved = localStorage.getItem('smartgas_project_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.viewOffset || { x: 0, y: 0 };
    }
    return { x: 400, y: 300 }; // Default initial position
  });

  const [zoom, setZoom] = useState<number>(() => {
    const saved = localStorage.getItem('smartgas_project_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.zoom || 1.2;
    }
    return 1.2;
  });

  const [isMeasureMode, setIsMeasureMode] = useState<boolean>(false);
  const [selectedId, setSelectedId] = useState<string>('ROOT');
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  
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

  const [measureStart, setMeasureStart] = useState<Vector2D | null>(null);
  const [measureCurrent, setMeasureCurrent] = useState<Vector2D | null>(null);

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
  }, [selectedId]);

  useEffect(() => {
    const data = { pipes, viewOffset, zoom, isMeasureMode };
    localStorage.setItem('smartgas_project_data', JSON.stringify(data));
  }, [pipes, viewOffset, zoom, isMeasureMode]);

  const pipeCoords = useMemo(() => resolveAllCoordinates(pipes), [pipes]);

  const centerView = useCallback(() => {
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      setViewOffset({ x: clientWidth / 2, y: clientHeight / 2 });
      setZoom(1.2);
    }
  }, []);

  const handleZoom = (factor: number) => setZoom(z => Math.max(0.2, Math.min(5, z * factor)));

  // --- Drawing Subroutines ---
  const drawOverlayElements = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // 1. Isometric Compass
    ctx.save();
    const margin = 100;
    const cx = width - margin;
    const cy = height - margin;
    ctx.translate(cx, cy);
    const size = 35;
    const cos30 = Math.cos(CONFIG.ISO_ANGLE);
    const sin30 = Math.sin(CONFIG.ISO_ANGLE);

    const dirs = [
      { label: 'شمال', dx: size * cos30, dy: -size * sin30, color: '#ef4444' },
      { label: 'جنوب', dx: -size * cos30, dy: size * sin30, color: '#64748b' },
      { label: 'شرق', dx: size * cos30, dy: size * sin30, color: '#3b82f6' },
      { label: 'غرب', dx: -size * cos30, dy: -size * sin30, color: '#64748b' }
    ];

    dirs.forEach(d => {
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(d.dx, d.dy);
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = d.color;
      ctx.font = 'bold 10px Vazirmatn';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, d.dx * 1.6, d.dy * 1.6 + 4);
    });
    ctx.restore();

    // 2. Color Legend
    ctx.save();
    const lx = 25, ly = height - 180;
    ctx.translate(lx, ly);
    const boxW = 100, itemH = 18;
    const entries = Object.entries(CONFIG.SIZE_COLORS);
    const totalH = (entries.length * itemH) + 30;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, boxW, totalH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(0, 0, boxW, totalH);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 11px Vazirmatn';
    ctx.textAlign = 'center';
    ctx.fillText('راهنمای سایز', boxW / 2, 20);

    entries.forEach(([size, color], i) => {
      const iy = 35 + i * itemH;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(15, iy - 4, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'right';
      ctx.font = 'bold 10px Vazirmatn';
      ctx.fillText(size, boxW - 15, iy);
    });
    ctx.restore();
  };

  const drawTitleBlock = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    const margin = 30;
    const w = 240, h = 80;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.strokeRect(width - margin - w, height - margin - h, w, h);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'right';
    ctx.font = 'bold 14px Vazirmatn';
    ctx.fillText('پروژه: طراحی گازرسانی ایزومتریک', width - margin - 15, height - margin - 50);
    ctx.font = '11px Vazirmatn';
    ctx.fillText(`تاریخ: ${new Date().toLocaleDateString('fa-IR')}`, width - margin - 15, height - margin - 30);
    ctx.fillText(`تاییدیه: هوش مصنوعی (Gemini Pro)`, width - margin - 15, height - margin - 10);
    ctx.restore();
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

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Grid
    if (!isExport) {
      const step = 50;
      ctx.beginPath(); ctx.strokeStyle = CONFIG.COLORS.GRID; ctx.lineWidth = 1/scale;
      const vL = -offset.x/scale, vT = -offset.y/scale, vR = (width-offset.x)/scale, vB = (height-offset.y)/scale;
      for (let x = Math.floor(vL/step)*step; x < vR; x += step) { ctx.moveTo(x, vT); ctx.lineTo(x, vB); }
      for (let y = Math.floor(vT/step)*step; y < vB; y += step) { ctx.moveTo(vL, y); ctx.lineTo(vR, y); }
      ctx.stroke();
    }

    // --- Starting Point (Root) ---
    ctx.beginPath();
    ctx.arc(0, 0, 6 / scale, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.COLORS.ROOT;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2/scale;
    ctx.stroke();
    
    ctx.fillStyle = CONFIG.COLORS.ROOT;
    ctx.font = `bold ${12 / scale}px Vazirmatn`;
    ctx.textAlign = 'center';
    ctx.fillText("شروع (کنتور)", 0, 18 / scale);

    // Pipes
    pipes.forEach(pipe => {
      const coords = pipeCoords.get(pipe.id);
      if (!coords) return;
      const isSelected = !isExport && selectedId === pipe.id;
      const sizePx = (CONFIG.SIZES[pipe.size as keyof typeof CONFIG.SIZES] || 2);
      const color = (CONFIG.SIZE_COLORS[pipe.size as keyof typeof CONFIG.SIZE_COLORS] || CONFIG.COLORS.PIPE);

      ctx.beginPath();
      ctx.moveTo(coords.startX, coords.startY);
      ctx.lineTo(coords.endX, coords.endY);
      ctx.strokeStyle = isSelected ? CONFIG.COLORS.SELECTED : color;
      ctx.lineWidth = (isSelected ? sizePx + 2 : sizePx) / scale;
      ctx.lineCap = 'round';
      if (pipe.installationType === 'UNDER') ctx.setLineDash([5/scale, 5/scale]);
      else ctx.setLineDash([]);
      ctx.stroke();

      // Labels
      if (pipe.length > 0) {
        const mx = (coords.startX + coords.endX) / 2;
        const my = (coords.startY + coords.endY) / 2;
        let ox = 20 / scale, oy = -20 / scale;
        if (pipe.direction === 'UP' || pipe.direction === 'DOWN') { ox = 30 / scale; oy = 0; }
        else if (pipe.direction === 'NORTH' || pipe.direction === 'WEST') { ox = -35 / scale; oy = -20 / scale; }

        ctx.save();
        ctx.fillStyle = isSelected ? CONFIG.COLORS.SELECTED : CONFIG.COLORS.LABEL;
        ctx.font = `bold ${11 / scale}px Vazirmatn`;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'white'; ctx.shadowBlur = 4/scale;
        ctx.fillText(`${pipe.size} - ${pipe.length}cm`, mx + ox, my + oy);
        ctx.restore();
      }

      if (pipe.label) {
        ctx.fillStyle = '#ef4444';
        ctx.font = `italic bold ${12 / scale}px Vazirmatn`;
        ctx.fillText(pipe.label, coords.endX + 15/scale, coords.endY + 15/scale);
      }

      if (pipe.fitting !== 'NONE') {
        drawFittingSymbol(ctx, pipe.fitting, coords.endX, coords.endY, pipe.direction, scale);
      }
    });

    // Nodes for interactive selection
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

    // Ruler
    if (!isExport && isMeasureMode && measureStart && measureCurrent) {
        ctx.beginPath(); ctx.moveTo(measureStart.x, measureStart.y); ctx.lineTo(measureCurrent.x, measureCurrent.y);
        ctx.strokeStyle = CONFIG.COLORS.MEASURE; ctx.setLineDash([5/scale, 5/scale]); ctx.stroke();
        const dist = Math.round(Math.hypot(measureCurrent.x - measureStart.x, measureCurrent.y - measureStart.y) / CONFIG.SCALE);
        ctx.fillStyle = CONFIG.COLORS.MEASURE; ctx.font = `bold ${14/scale}px Vazirmatn`;
        ctx.fillText(`${dist} cm`, (measureStart.x+measureCurrent.x)/2, (measureStart.y+measureCurrent.y)/2 - 10/scale);
    }
    ctx.restore();

    // Overlays
    drawOverlayElements(ctx, width, height);
    if (isExport) drawTitleBlock(ctx, width, height);
  }, [pipes, pipeCoords, selectedId, isMeasureMode, measureStart, measureCurrent]);

  const mainDraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    renderScene(ctx, w, h, viewOffset, zoom, false);
  }, [renderScene, viewOffset, zoom]);

  useEffect(() => { requestAnimationFrame(mainDraw); }, [mainDraw]);

  // Handle Resize and print preview
  useEffect(() => {
    if (showPrintPreview && previewCanvasRef.current) {
        const cvs = previewCanvasRef.current;
        const ctx = cvs.getContext('2d');
        if (ctx) {
            // A4 dimensions at 150dpi for reasonable preview
            const baseW = paperSize === 'A4' ? 1123 : 1587;
            const baseH = paperSize === 'A4' ? 794 : 1123;
            cvs.width = orientation === 'LANDSCAPE' ? baseW : baseH;
            cvs.height = orientation === 'LANDSCAPE' ? baseH : baseW;
            renderScene(ctx, cvs.width, cvs.height, { x: cvs.width/2, y: cvs.height/2 }, 1.5, true);
        }
    }
  }, [showPrintPreview, paperSize, orientation, pipes]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (isDragging || isMeasureMode) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - viewOffset.x) / zoom;
    const y = (e.clientY - rect.top - viewOffset.y) / zoom;

    // Selection logic
    if (Math.hypot(x, y) < 15/zoom) { setSelectedId('ROOT'); return; }
    let bestId = 'ROOT', minD = 10/zoom;
    for (const [id, c] of pipeCoords.entries()) {
        const d = getDistanceToSegment(x, y, c.startX, c.startY, c.endX, c.endY);
        if (d < minD) { minD = d; bestId = id; }
    }
    setSelectedId(bestId);
  };

  const handleAddPipe = () => {
    const id = Math.random().toString(36).substr(2, 9);
    setPipes(prev => [...prev, { id, parentId: selectedId, ...form }]);
    setSelectedId(id);
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-800 overflow-hidden" dir="rtl">
      <input type="file" ref={fileInputRef} onChange={(e) => {
          const file = e.target.files?.[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const data = JSON.parse(ev.target?.result as string);
            if (data.pipes) { setPipes(data.pipes); setViewOffset(data.viewOffset); setZoom(data.zoom); setSelectedId('ROOT'); }
          };
          reader.readAsText(file);
      }} className="hidden" />

      <aside className="w-80 bg-white border-l border-slate-200 shadow-2xl z-30 flex flex-col h-full">
        <header className="p-6 border-b bg-slate-50/50 flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg text-white"><Layers size={20} /></div>
          <div>
            <h1 className="text-lg font-bold">طراحی هوشمند گاز</h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold">SmartGas Iso v2.5</p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
            <label className="text-xs font-bold text-slate-500 flex items-center gap-2"><Target size={14} className="text-blue-500" /> موقعیت انتخاب شده</label>
            <div className="text-sm font-bold text-blue-900 mt-1">{selectedId === 'ROOT' ? 'ورودی اصلی (کنتور)' : 'انشعاب فرعی'}</div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500">جهت ایزومتریک</label>
                <select className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs" value={form.direction} onChange={e => setForm({...form, direction: e.target.value as Direction})}>
                  <option value="NORTH">شمال</option><option value="SOUTH">جنوب</option><option value="EAST">شرق</option><option value="WEST">غرب</option><option value="UP">بالا</option><option value="DOWN">پایین</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500">طول (CM)</label>
                <input type="number" className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs" value={form.length} onChange={e => setForm({...form, length: Number(e.target.value)})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500">سایز لوله</label>
                <select className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs" value={form.size} onChange={e => setForm({...form, size: e.target.value})}>
                  {Object.keys(CONFIG.SIZES).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500">نوع اجرا</label>
                <select className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs" value={form.installationType} onChange={e => setForm({...form, installationType: e.target.value as InstallationType})}>
                  <option value="ABOVE">روکار</option><option value="UNDER">زیرکار</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500">اتصالات و تجهیزات</label>
              <select className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs" value={form.fitting} onChange={e => setForm({...form, fitting: e.target.value as FittingType})}>
                <option value="NONE">لوله ساده</option>
                <optgroup label="شیرآلات">
                  <option value="VALVE_MAIN">شیر اصلی</option>
                  <option value="VALVE_GC">اجاق گاز (GC)</option>
                  <option value="VALVE_PC">پکیج (P)</option>
                </optgroup>
                <optgroup label="سایر">
                  <option value="TEE">سه‌راهی</option>
                  <option value="METER">کنتور فرعی</option>
                </optgroup>
              </select>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {selectedId !== 'ROOT' && (
                <button onClick={() => setPipes(prev => prev.map(p => p.id === selectedId ? {...p, ...form} : p))} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all shadow-md"><SaveAll size={18} /> ویرایش این بخش</button>
              )}
              <button onClick={handleAddPipe} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-blue-700 transition-all"><Plus size={20} /> افزودن لوله جدید</button>
            </div>
          </div>

          <div className="pt-4 border-t space-y-2">
            <button onClick={() => { setAiLoading(true); setShowAiModal(true); setModalMode('SAFETY'); geminiService.analyzeProject(pipes, 'SAFETY').then(r => { setAiResponse(r); setAiLoading(false); }); }} className="w-full p-3 bg-emerald-50 text-emerald-700 rounded-xl text-[11px] font-bold flex items-center justify-center gap-2 border border-emerald-100"><ShieldCheck size={18} /> بازبینی ایمنی توسط هوش مصنوعی</button>
          </div>
        </div>

        <footer className="p-4 border-t bg-slate-50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => {
              const data = JSON.stringify({ pipes, viewOffset, zoom });
              const blob = new Blob([data], {type: 'application/json'});
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'project.json'; a.click();
            }} className="py-2.5 bg-white border text-slate-600 rounded-xl text-xs font-bold flex items-center justify-center gap-2"><Save size={14} /> ذخیره</button>
            <button onClick={() => fileInputRef.current?.click()} className="py-2.5 bg-white border text-slate-600 rounded-xl text-xs font-bold flex items-center justify-center gap-2"><Upload size={14} /> باز کردن</button>
          </div>
          <button onClick={() => setShowPrintPreview(true)} className="w-full bg-blue-900 text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-black transition-all"><Printer size={16} /> چاپ و خروجی نقشه</button>
        </footer>
      </aside>

      <main ref={containerRef} className="flex-1 relative bg-slate-100 overflow-hidden"
        onMouseDown={e => { if (e.button === 1 || e.shiftKey) { setIsDragging(true); setLastMousePos({ x: e.clientX, y: e.clientY }); } }}
        onMouseMove={e => {
            if (isDragging) {
                setViewOffset(v => ({ x: v.x + (e.clientX - lastMousePos.x), y: v.y + (e.clientY - lastMousePos.y) }));
                setLastMousePos({ x: e.clientX, y: e.clientY });
            }
            if (isMeasureMode && measureStart) {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) setMeasureCurrent({ x: (e.clientX - rect.left - viewOffset.x)/zoom, y: (e.clientY - rect.top - viewOffset.y)/zoom });
            }
        }}
        onMouseUp={() => { setIsDragging(false); if(isMeasureMode) setMeasureStart(null); }}
      >
        <canvas ref={canvasRef} onClick={handleCanvasClick} onMouseDown={e => {
            if (isMeasureMode) {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                    const x = (e.clientX - rect.left - viewOffset.x)/zoom;
                    const y = (e.clientY - rect.top - viewOffset.y)/zoom;
                    setMeasureStart({x, y}); setMeasureCurrent({x, y});
                }
            }
        }} className="block w-full h-full cursor-crosshair" />

        <div className="absolute top-6 left-6 flex flex-col gap-3">
          <div className="bg-white/80 backdrop-blur border border-slate-200 p-2 rounded-2xl shadow-xl flex flex-col gap-1">
            <button onClick={() => handleZoom(1.2)} className="p-2 hover:bg-blue-50 rounded-xl"><ZoomIn size={22} /></button>
            <button onClick={centerView} className="p-2 hover:bg-blue-50 rounded-xl"><Move size={22} /></button>
            <button onClick={() => handleZoom(0.8)} className="p-2 hover:bg-blue-50 rounded-xl"><ZoomOut size={22} /></button>
            <div className="h-px bg-slate-200 my-1 mx-2" />
            <button onClick={() => { setIsMeasureMode(!isMeasureMode); setSelectedId('ROOT'); }} className={`p-2 rounded-xl ${isMeasureMode ? 'bg-amber-500 text-white shadow-lg' : 'hover:bg-amber-50 text-slate-600'}`} title="خط‌کش"><Ruler size={22} /></button>
          </div>
        </div>
      </main>

      {/* Modern Print Preview Modal */}
      {showPrintPreview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-6">
           <div className="bg-white rounded-[2.5rem] w-full max-w-6xl h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-white/20">
             <div className="p-6 border-b flex justify-between items-center bg-white">
               <div className="flex items-center gap-4">
                 <h3 className="text-xl font-bold">آماده‌سازی خروجی نهایی</h3>
                 <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
                   <button onClick={() => setPaperSize('A4')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${paperSize === 'A4' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>A4</button>
                   <button onClick={() => setPaperSize('A3')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${paperSize === 'A3' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>A3</button>
                 </div>
                 <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
                   <button onClick={() => setOrientation('LANDSCAPE')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${orientation === 'LANDSCAPE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>افقی</button>
                   <button onClick={() => setOrientation('PORTRAIT')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${orientation === 'PORTRAIT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>عمودی</button>
                 </div>
               </div>
               <button onClick={() => setShowPrintPreview(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={28} /></button>
             </div>
             <div className="flex-1 bg-slate-200 p-10 flex items-center justify-center overflow-auto">
               <canvas ref={previewCanvasRef} className="bg-white shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] border border-slate-300 rounded-sm" />
             </div>
             <div className="p-8 border-t bg-white flex justify-end gap-4">
               <button onClick={() => setShowPrintPreview(false)} className="px-8 py-3 font-bold text-slate-500 hover:text-slate-800">لغو</button>
               <button onClick={() => {
                 const canvas = previewCanvasRef.current;
                 if (canvas) {
                   const link = document.createElement('a');
                   link.download = `Iso-Plan-${Date.now()}.png`;
                   link.href = canvas.toDataURL('image/png', 1.0);
                   link.click();
                 }
               }} className="px-12 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">دانلود تصویر با کیفیت (PNG)</button>
             </div>
           </div>
        </div>
      )}

      {/* AI Modal */}
      {showAiModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur z-[500] flex items-center justify-center p-6">
            <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <ShieldCheck className="text-emerald-500" /> بازبینی هوشمند مهندسی
                    </h3>
                    <button onClick={() => setShowAiModal(false)} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
                </div>
                <div className="p-8 overflow-y-auto whitespace-pre-wrap leading-relaxed text-slate-700 font-medium">
                    {aiLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                            <Loader2 className="animate-spin text-blue-600" size={48} />
                            <p className="text-slate-500 animate-pulse font-bold">درحال تحلیل محاسبات و استانداردهای ایمنی...</p>
                        </div>
                    ) : aiResponse}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
