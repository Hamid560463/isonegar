
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Plus, ZoomIn, ZoomOut, Move, Target, Ruler, Printer, X, ShieldCheck, Calculator, Undo2, Redo2, Layers, Save, Upload, Loader2, Info, ChevronLeft, CheckCircle
} from 'lucide-react';
import { Direction, FittingType, InstallationType, Vector2D } from '../domain/types';
import { CONFIG } from '../domain/constants';
import { resolveAllCoordinates, getDistanceToSegment } from '../utils/isometric';
import { geminiService } from '../services/geminiService';
import { usePipesState } from '../state/usePipesState';
import { renderScene } from '../canvas/SceneRenderer';

type PaperSize = 'A4' | 'A3';
type Orientation = 'PORTRAIT' | 'LANDSCAPE';
type SidebarTab = 'DRAW' | 'MEASURE' | 'ANALYZE' | 'EXPORT';

const App: React.FC = () => {
  // Modular State
  const {
    pipes, setPipes, selectedId, setSelectedId, history, redoStack,
    undo, redo, addPipe, updatePipe, deletePipe, commitToHistory
  } = usePipesState();

  // UI Local State
  const [activeTab, setActiveTab] = useState<SidebarTab>('DRAW');
  const [viewOffset, setViewOffset] = useState<Vector2D>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1.2);
  const [isMeasureMode, setIsMeasureMode] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<Vector2D[]>([]);
  const [mousePos, setMousePos] = useState<Vector2D>({ x: 0, y: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);
  const [modalMode, setModalMode] = useState<'SAFETY' | 'MTO'>('SAFETY');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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

  // Sync Initial View
  useEffect(() => {
    if (viewOffset.x === 0 && viewOffset.y === 0 && containerRef.current) {
        setViewOffset({ 
            x: containerRef.current.clientWidth / 2, 
            y: containerRef.current.clientHeight / 2 
        });
    }
  }, []);

  // Sync Form to Selected Item
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

  const pipeCoords = useMemo(() => resolveAllCoordinates(pipes), [pipes]);

  const handleFittingChange = (type: FittingType) => {
    setForm(prev => ({
      ...prev,
      fitting: type,
      length: type !== 'NONE' ? 0 : (prev.length === 0 ? 100 : prev.length)
    }));
  };

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

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

  const handleZoom = (factor: number) => setZoom(z => Math.max(0.1, Math.min(10, z * factor)));

  const calculateBoundingBox = useCallback(() => {
    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    if (pipes.length === 0) return { minX: -50, minY: -50, maxX: 50, maxY: 50, width: 100, height: 100 };
    pipeCoords.forEach(c => {
      minX = Math.min(minX, c.startX, c.endX);
      maxX = Math.max(maxX, c.startX, c.endX);
      minY = Math.min(minY, c.startY, c.endY);
      maxY = Math.max(maxY, c.startY, c.endY);
    });
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [pipes, pipeCoords]);

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
    renderScene({
      ctx, width: w, height: h, offset: viewOffset, scale: zoom, isExport: false,
      pipes, pipeCoords, selectedId, hoveredId, isMeasureMode, measurePoints, mousePos
    });
  }, [viewOffset, zoom, pipes, pipeCoords, selectedId, hoveredId, isMeasureMode, measurePoints, mousePos]);

  useEffect(() => {
    const frameId = requestAnimationFrame(mainDraw);
    return () => cancelAnimationFrame(frameId);
  }, [mainDraw]);

  // Print Preview rendering
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
            renderScene({
              ctx, width: cvs.width, height: cvs.height, offset: { x: centerX, y: centerY }, scale: fitScale, isExport: true,
              pipes, pipeCoords, selectedId, hoveredId: null, isMeasureMode: false, measurePoints: [], mousePos: {x:0,y:0}
            });
        }
    }
  }, [showPrintPreview, paperSize, orientation, pipes, pipeCoords, calculateBoundingBox]);

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
        return;
    }

    // Hover Highlight Logic
    const worldX = (x - viewOffset.x) / zoom;
    const worldY = (y - viewOffset.y) / zoom;
    let newHoveredId = null;
    let minD = 15 / zoom;

    for (const [id, c] of pipeCoords.entries()) {
      const d = getDistanceToSegment(worldX, worldY, c.startX, c.startY, c.endX, c.endY);
      if (d < minD) {
        minD = d;
        newHoveredId = id;
      }
    }
    setHoveredId(newHoveredId);
  };

  const onAddPipe = () => {
    addPipe({ id: Math.random().toString(36).substr(2, 9), parentId: selectedId, ...form });
    showStatus("این لوله به نقشه اضافه شد ✔");
    if (form.fitting !== 'NONE') {
        setForm(f => ({ ...f, fitting: 'NONE', length: 100 }));
    }
  };

  const onUpdatePipe = () => {
    updatePipe(selectedId, form);
    showStatus("تغییرات بخش ذخیره شد ✔");
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
              showStatus("فایل پروژه بارگذاری شد");
            } catch(e) { alert("خطا در خواندن فایل"); }
          };
          reader.readAsText(file);
      }} className="hidden" />

      {/* Sidebar UI */}
      <aside className="w-80 bg-white border-l border-slate-200 shadow-2xl z-30 flex flex-col h-full shrink-0">
        <header className="p-4 border-b bg-slate-50/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-600 rounded-lg text-white shadow-sm"><Layers size={18} /></div>
              <h1 className="text-sm font-bold tracking-tight truncate">ایزو نگار (IsoNegar)</h1>
            </div>
            <div className="flex gap-1.5">
              <button onClick={undo} disabled={history.length === 0} className={`p-1.5 rounded-lg transition-all border ${history.length > 0 ? 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 shadow-sm' : 'text-slate-200 border-slate-100 cursor-not-allowed'}`} title="Undo"><Undo2 size={16} /></button>
              <button onClick={redo} disabled={redoStack.length === 0} className={`p-1.5 rounded-lg transition-all border ${redoStack.length > 0 ? 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 shadow-sm' : 'text-slate-200 border-slate-100 cursor-not-allowed'}`} title="Redo"><Redo2 size={16} /></button>
            </div>
          </div>

          {/* Step-by-Step Guide */}
          <div className="bg-blue-50/80 rounded-xl p-3 border border-blue-100 mb-2">
            <div className="flex items-center gap-1.5 text-blue-800 text-[10px] font-bold mb-2">
              <Info size={12} /> راهنمای گام‌به‌گام
            </div>
            <ul className="space-y-1.5 text-[9px] text-blue-700/80 font-medium">
              <li className={`flex items-center gap-2 ${pipes.length === 0 ? 'text-blue-900 font-bold' : ''}`}>
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">۱</span>
                نقطه شروع را روی صفحه انتخاب کن
              </li>
              <li className={`flex items-center gap-2 ${pipes.length > 0 && selectedId !== 'ROOT' ? 'text-blue-900 font-bold' : ''}`}>
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">۲</span>
                جهت و طول لوله را تنظیم کن
              </li>
              <li className={`flex items-center gap-2 ${pipes.length > 0 ? 'text-blue-900 font-bold' : ''}`}>
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">۳</span>
                دکمه «افزودن به نقشه» را بزن
              </li>
            </ul>
          </div>

          {/* Sidebar Tabs */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mt-4">
            <button onClick={() => setActiveTab('DRAW')} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'DRAW' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>ترسیم</button>
            <button onClick={() => setActiveTab('MEASURE')} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'MEASURE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>اندازه‌گیری</button>
            <button onClick={() => setActiveTab('ANALYZE')} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'ANALYZE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>تحلیل</button>
            <button onClick={() => setActiveTab('EXPORT')} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'EXPORT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>خروجی</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-hide">
          {activeTab === 'DRAW' && (
            <>
              <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
                <label className="text-[8px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-widest"><Target size={10} /> المان فعال</label>
                <div className="text-[11px] font-bold text-blue-900 truncate mt-1">
                  {selectedId === 'ROOT' ? 'نقطه شروع (شیر اصلی)' : `انشعاب ${selectedId.slice(0, 4)}`}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500">جهت ترسیم بعدی</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {['NORTH', 'SOUTH', 'EAST', 'WEST', 'UP', 'DOWN'].map((d) => (
                      <button 
                        key={d} 
                        onClick={() => setForm({...form, direction: d as Direction})} 
                        className={`py-2 px-1 text-[9px] font-bold rounded-lg border transition-all ${form.direction === d ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                      >
                        {d === 'NORTH' ? 'شمال' : d === 'SOUTH' ? 'جنوب' : d === 'EAST' ? 'شرق' : d === 'WEST' ? 'غرب' : d === 'UP' ? 'بالا' : 'پایین'}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500">طول لوله (سانتی‌متر)</label>
                  <input type="number" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" value={form.length} onChange={e => setForm({...form, length: Number(e.target.value)})} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500">سایز لوله</label>
                    <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none" value={form.size} onChange={e => setForm({...form, size: e.target.value})}>
                      {Object.keys(CONFIG.SIZES).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500">نوع اجرا</label>
                    <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none" value={form.installationType} onChange={e => setForm({...form, installationType: e.target.value as InstallationType})}>
                      <option value="ABOVE">روکار</option><option value="UNDER">زیرکار</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500">تجهیز و المان نهایی</label>
                  <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none" value={form.fitting} onChange={e => handleFittingChange(e.target.value as FittingType)}>
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

                <div className="flex flex-col gap-3 pt-2">
                  {selectedId !== 'ROOT' && (
                    <button onClick={onUpdatePipe} className="w-full py-2.5 bg-slate-800 text-white rounded-xl text-[11px] font-bold shadow-sm active:scale-95 transition-all hover:bg-black">ذخیره تغییرات بخش</button>
                  )}
                  <button onClick={onAddPipe} className="w-full py-4 bg-blue-600 text-white rounded-xl text-[11px] font-bold shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2">
                    <Plus size={16} /> افزودن به نقشه ✔
                  </button>
                  {selectedId !== 'ROOT' && (
                    <button onClick={() => deletePipe(selectedId)} className="w-full py-2 text-red-500 font-bold text-[10px] hover:bg-red-50 rounded-xl transition-all">حذف این انشعاب</button>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'MEASURE' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                <p className="text-[10px] text-amber-800 leading-relaxed font-medium">ابزار اندازه‌گیری آزاد به شما اجازه می‌دهد فاصله بین هر دو نقطه دلخواه در نقشه را محاسبه کنید.</p>
              </div>
              <button onClick={() => { setIsMeasureMode(!isMeasureMode); setMeasurePoints([]); }} className={`w-full py-4 rounded-xl text-[11px] font-bold shadow-md transition-all flex items-center justify-center gap-2 ${isMeasureMode ? 'bg-amber-500 text-white animate-pulse' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                <Ruler size={18} /> {isMeasureMode ? 'در حال اندازه‌گیری...' : 'فعال‌سازی خط‌کش آزاد'}
              </button>
              {measurePoints.length > 0 && (
                <button onClick={() => setMeasurePoints([])} className="w-full py-2 text-slate-500 text-[10px] font-bold hover:text-slate-800 transition-colors">پاک کردن نقاط اندازه‌گیری</button>
              )}
            </div>
          )}

          {activeTab === 'ANALYZE' && (
            <div className="space-y-3">
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl mb-2">
                <p className="text-[10px] text-emerald-800 leading-relaxed font-medium">هوش مصنوعی Gemini نقشه شما را از نظر استانداردهای ایمنی و مهندسی بررسی می‌کند.</p>
              </div>
              <button onClick={() => handleAiAnalysis('SAFETY')} className="w-full py-4 bg-white border border-emerald-100 text-emerald-700 rounded-xl flex flex-col items-center gap-2 text-[11px] font-bold hover:bg-emerald-50 transition-all shadow-sm">
                <ShieldCheck size={24} /> بررسی استانداردهای ایمنی
              </button>
              <button onClick={() => handleAiAnalysis('MTO')} className="w-full py-4 bg-white border border-blue-100 text-blue-700 rounded-xl flex flex-col items-center gap-2 text-[11px] font-bold hover:bg-blue-50 transition-all shadow-sm">
                <Calculator size={24} /> استخراج متره و برآورد (MTO)
              </button>
            </div>
          )}

          {activeTab === 'EXPORT' && (
            <div className="space-y-3">
              <button onClick={() => setShowPrintPreview(true)} className="w-full bg-blue-900 text-white py-4 rounded-xl text-[11px] font-bold flex items-center justify-center gap-2 shadow-xl hover:bg-black transition-all active:scale-95">
                <Printer size={18} /> آماده‌سازی خروجی نهایی نقشه
              </button>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button onClick={() => {
                  const blob = new Blob([JSON.stringify({ pipes })], {type: 'application/json'});
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'gas_iso_project.json'; a.click();
                  showStatus("پروژه ذخیره شد");
                }} className="py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all">
                  <Save size={16} /> ذخیره پروژه
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all">
                  <Upload size={16} /> فراخوانی فایل
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="p-4 border-t bg-slate-50/80 flex items-center justify-center">
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Powered by IsoNegar Engine</p>
        </footer>
      </aside>

      {/* Main Canvas Area */}
      <main ref={containerRef} className="flex-1 relative bg-slate-100 overflow-hidden"
        onMouseDown={e => { if (e.button === 1 || e.shiftKey) { setIsDragging(true); setLastMousePos({ x: e.clientX, y: e.clientY }); } }}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setIsDragging(false)}
      >
        <canvas 
          ref={canvasRef} 
          onClick={handleCanvasClick} 
          className={`block w-full h-full ${isMeasureMode ? 'cursor-none' : hoveredId ? 'cursor-pointer' : 'cursor-default'}`} 
        />

        {/* Status Feedback Toast */}
        {statusMessage && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-2 rounded-full text-[11px] font-bold shadow-2xl z-[1000] flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
             <CheckCircle size={14} className="text-emerald-400" />
             {statusMessage}
          </div>
        )}

        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <div className="bg-white/90 backdrop-blur border border-slate-200 p-1 rounded-xl shadow-xl flex flex-col gap-1">
            <button onClick={() => handleZoom(1.2)} className="p-2 hover:bg-blue-50 text-slate-600 rounded-lg transition-colors"><ZoomIn size={20} /></button>
            <button onClick={() => { if (containerRef.current) setViewOffset({ x: containerRef.current.clientWidth/2, y: containerRef.current.clientHeight/2 }); }} className="p-2 hover:bg-blue-50 text-slate-600 rounded-lg transition-colors" title="Reset View"><Move size={20} /></button>
            <button onClick={() => handleZoom(0.8)} className="p-2 hover:bg-blue-50 text-slate-600 rounded-lg transition-colors"><ZoomOut size={20} /></button>
          </div>
        </div>

        {pipes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/70 backdrop-blur-sm p-10 rounded-[3rem] border border-white/40 shadow-2xl flex flex-col items-center gap-4 animate-pulse pointer-events-auto cursor-pointer transition-all hover:scale-105 hover:bg-white/90" onClick={(e) => { const rect = canvasRef.current?.getBoundingClientRect(); if (rect) { setViewOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top }); setSelectedId('ROOT'); } }}>
              <div className="p-6 bg-blue-600 text-white rounded-full shadow-2xl ring-8 ring-blue-500/10"><Target size={48} /></div>
              <div className="text-center">
                <p className="text-sm font-bold text-blue-900">نقطه شروع نقشه را تعیین کنید</p>
                <p className="text-[10px] text-slate-500 font-medium mt-1">روی هر قسمت از صفحه کلیک کنید</p>
              </div>
            </div>
          </div>
        )}

        {isMeasureMode && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-6 py-2 rounded-full text-[11px] font-bold shadow-2xl animate-bounce">
            {measurePoints.length === 0 ? 'نقطه اول را روی نقشه انتخاب کنید' : measurePoints.length === 1 ? 'نقطه دوم را برای محاسبه فاصله انتخاب کنید' : 'فاصله اندازه‌گیری شد'}
          </div>
        )}
      </main>

      {/* Modals Logic */}
      {showPrintPreview && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-lg z-[200] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2rem] w-full max-w-5xl h-[90vh] shadow-2xl flex flex-col overflow-hidden">
             <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
               <div className="flex items-center gap-6">
                 <h3 className="text-sm font-bold">پیش‌نمایش چاپ نهایی</h3>
                 <div className="flex gap-1.5 bg-slate-200 p-1.5 rounded-xl">
                    <button onClick={() => setPaperSize('A4')} className={`px-6 py-1.5 rounded-lg text-[10px] font-bold transition-all ${paperSize === 'A4' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>A4</button>
                    <button onClick={() => setPaperSize('A3')} className={`px-6 py-1.5 rounded-lg text-[10px] font-bold transition-all ${paperSize === 'A3' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>A3</button>
                 </div>
                 <div className="flex gap-1.5 bg-slate-200 p-1.5 rounded-xl">
                    <button onClick={() => setOrientation('LANDSCAPE')} className={`px-6 py-1.5 rounded-lg text-[10px] font-bold transition-all ${orientation === 'LANDSCAPE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>افقی</button>
                    <button onClick={() => setOrientation('PORTRAIT')} className={`px-6 py-1.5 rounded-lg text-[10px] font-bold transition-all ${orientation === 'PORTRAIT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>عمودی</button>
                 </div>
               </div>
               <button onClick={() => setShowPrintPreview(false)} className="text-slate-400 hover:text-red-500 transition-colors p-2 bg-slate-100 rounded-full"><X size={24} /></button>
             </div>
             <div className="flex-1 bg-slate-200/50 p-8 flex items-center justify-center overflow-auto scrollbar-hide">
               <canvas ref={previewCanvasRef} className="bg-white shadow-2xl border border-slate-300 max-h-full max-w-full object-contain transition-opacity duration-300" />
             </div>
             <div className="p-6 border-t bg-white flex justify-end gap-4">
               <button onClick={() => setShowPrintPreview(false)} className="px-8 py-3 text-[11px] font-bold text-slate-500 hover:text-slate-800 transition-colors">بازگشت به ویرایش</button>
               <button onClick={() => { const canvas = previewCanvasRef.current; if (canvas) { const link = document.createElement('a'); link.download = `IsoPlan_${paperSize}_${orientation}.png`; link.href = canvas.toDataURL('image/png', 1.0); link.click(); } }} className="px-12 py-3.5 bg-blue-600 text-white rounded-xl text-[11px] font-bold shadow-xl hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2">
                 <Save size={18} /> دانلود تصویر با کیفیت عالی
               </button>
             </div>
           </div>
        </div>
      )}

      {showAiModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur z-[500] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="text-sm font-bold flex items-center gap-3">
                      {modalMode === 'SAFETY' ? <ShieldCheck className="text-emerald-500" size={20} /> : <Calculator className="text-blue-500" size={20} />}
                      تحلیل هوشمند پروژه (توسط Gemini 2.0)
                    </h3>
                    <button onClick={() => setShowAiModal(false)} className="text-slate-400 hover:text-red-500 transition-colors p-2 bg-slate-100 rounded-full"><X size={24} /></button>
                </div>
                <div className="p-8 overflow-y-auto text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap rtl scrollbar-hide">
                    {aiLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-6">
                            <Loader2 className="animate-spin text-blue-600" size={48} />
                            <div className="text-center">
                              <p className="text-slate-800 font-bold">درحال پردازش اطلاعات فنی نقشه...</p>
                              <p className="text-slate-400 text-[11px] mt-2">این فرآیند ممکن است چند لحظه طول بکشد</p>
                            </div>
                        </div>
                    ) : (
                      <div className="prose prose-sm prose-slate max-w-none rtl font-medium leading-loose">{aiResponse}</div>
                    )}
                </div>
                <div className="p-4 bg-slate-50 border-t flex justify-end">
                  <button onClick={() => setShowAiModal(false)} className="px-8 py-2 bg-slate-800 text-white rounded-xl text-[11px] font-bold shadow-md hover:bg-black transition-all">بسیار عالی</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
