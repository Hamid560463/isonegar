
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Plus, ZoomIn, ZoomOut, Move, Target, Ruler, Printer, X, ShieldCheck, Calculator, Undo2, Redo2, Layers, Save, Upload, Loader2, Info, ChevronLeft, CheckCircle, Edit3, MousePointer2, Menu, ChevronUp, ChevronDown
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
  const {
    pipes, setPipes, selectedId, setSelectedId, history, redoStack,
    undo, redo, addPipe, updatePipe, deletePipe, commitToHistory
  } = usePipesState();

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

  // Mobile Specific States
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);

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
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setIsSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
            const padding = isMobile ? 50 : 150;
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
  }, [showPrintPreview, paperSize, orientation, pipes, pipeCoords, calculateBoundingBox, isMobile]);

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const worldX = (clientX - rect.left - viewOffset.x) / zoom;
    const worldY = (clientY - rect.top - viewOffset.y) / zoom;

    if (pipes.length === 0) {
      setViewOffset({ x: clientX - rect.left, y: clientY - rect.top });
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

    // Larger Hit Area for Mobile
    const threshold = (isMobile ? 35 : 20) / zoom;
    if (Math.hypot(worldX, worldY) < threshold) { setSelectedId('ROOT'); return; }
    
    let bestId = 'ROOT', minD = threshold;
    for (const [id, c] of pipeCoords.entries()) {
        const d = getDistanceToSegment(worldX, worldY, c.startX, c.startY, c.endX, c.endY);
        if (d < minD) { minD = d; bestId = id; }
    }
    setSelectedId(bestId);
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      // Prevent scrolling while interacting with canvas
      if (isDragging || isMeasureMode) e.preventDefault();
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setMousePos({ x, y });

    if (isDragging) {
        setViewOffset(v => ({ x: v.x + (clientX - lastMousePos.x), y: v.y + (clientY - lastMousePos.y) }));
        setLastMousePos({ x: clientX, y: clientY });
        return;
    }

    const worldX = (x - viewOffset.x) / zoom;
    const worldY = (y - viewOffset.y) / zoom;
    let newHoveredId = null;
    let minD = (isMobile ? 25 : 15) / zoom;

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
    if (isMobile) setIsSidebarOpen(false);
  };

  const onUpdatePipe = () => {
    updatePipe(selectedId, form);
    showStatus("تغییرات بخش ذخیره شد ✔");
    if (isMobile) setIsSidebarOpen(false);
  };

  return (
    <div className={`flex h-screen w-full bg-slate-50 text-slate-800 overflow-hidden ${isMobile ? 'flex-col' : 'flex-row'}`} dir="rtl">
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

      {/* Sidebar UI - Mobile Drawer or Desktop Aside */}
      <aside className={`
        ${isMobile 
          ? `fixed inset-x-0 bottom-0 z-[100] bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-[2.5rem] transition-transform duration-500 ease-out transform ${isSidebarOpen ? 'translate-y-0' : 'translate-y-[calc(100%-60px)]'}` 
          : 'w-80 bg-white border-l border-slate-200 shadow-2xl z-30'
        } flex flex-col h-full shrink-0 max-h-[90vh] md:max-h-full
      `}>
        {isMobile && (
          <div className="h-[60px] flex items-center justify-center cursor-pointer" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mb-1" />
            <div className="absolute left-6 text-blue-600 font-bold text-[11px] flex items-center gap-1">
              {isSidebarOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              تنظیمات طراحی
            </div>
          </div>
        )}

        <header className="p-4 border-b bg-slate-50/50">
          {!isMobile && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-600 rounded-lg text-white shadow-sm"><Layers size={18} /></div>
                <h1 className="text-sm font-bold tracking-tight truncate">ایزو نگار (IsoNegar)</h1>
              </div>
              <div className="flex gap-1.5">
                <button onClick={undo} disabled={history.length === 0} className={`p-2 rounded-lg transition-all border ${history.length > 0 ? 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 shadow-sm' : 'text-slate-200 border-slate-100 cursor-not-allowed'}`} title="Undo"><Undo2 size={16} /></button>
                <button onClick={redo} disabled={redoStack.length === 0} className={`p-2 rounded-lg transition-all border ${redoStack.length > 0 ? 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 shadow-sm' : 'text-slate-200 border-slate-100 cursor-not-allowed'}`} title="Redo"><Redo2 size={16} /></button>
              </div>
            </div>
          )}

          {/* Sidebar Tabs */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/50 overflow-x-auto scrollbar-hide">
            <button onClick={() => setActiveTab('DRAW')} className={`flex-1 min-w-[70px] py-2.5 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'DRAW' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:bg-slate-200'}`}>ترسیم</button>
            <button onClick={() => setActiveTab('MEASURE')} className={`flex-1 min-w-[70px] py-2.5 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'MEASURE' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:bg-slate-200'}`}>اندازه‌گیری</button>
            <button onClick={() => setActiveTab('ANALYZE')} className={`flex-1 min-w-[70px] py-2.5 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'ANALYZE' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:bg-slate-200'}`}>تحلیل</button>
            <button onClick={() => setActiveTab('EXPORT')} className={`flex-1 min-w-[70px] py-2.5 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'EXPORT' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:bg-slate-200'}`}>خروجی</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5 scrollbar-hide">
          {activeTab === 'DRAW' && (
            <>
              <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl shadow-sm">
                <label className="text-[9px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-widest"><Target size={12} /> گره فعال جهت انشعاب</label>
                <div className="text-[12px] font-bold text-blue-900 truncate mt-1 flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${selectedId === 'ROOT' ? 'bg-emerald-500' : 'bg-blue-500'} animate-pulse`} />
                  {selectedId === 'ROOT' ? 'نقطه شروع شبکه' : `انشعاب شماره ${selectedId.slice(0, 4)}`}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500">انتخاب جهت (۳بعدی ایزو)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['NORTH', 'SOUTH', 'EAST', 'WEST', 'UP', 'DOWN'].map((d) => (
                      <button 
                        key={d} 
                        onClick={() => setForm({...form, direction: d as Direction})} 
                        className={`py-3 px-1 text-[10px] font-bold rounded-xl border transition-all ${form.direction === d ? 'bg-blue-600 border-blue-600 text-white shadow-lg -translate-y-0.5' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 active:bg-slate-200'}`}
                      >
                        {d === 'NORTH' ? 'شمال' : d === 'SOUTH' ? 'جنوب' : d === 'EAST' ? 'شرق' : d === 'WEST' ? 'غرب' : d === 'UP' ? 'بالا' : 'پایین'}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500">طول بخش (CM)</label>
                  <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-left" dir="ltr" value={form.length} onChange={e => setForm({...form, length: Number(e.target.value)})} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-500">سایز لوله</label>
                    <select className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[12px] font-bold outline-none" value={form.size} onChange={e => setForm({...form, size: e.target.value})}>
                      {Object.keys(CONFIG.SIZES).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-500">نوع اجرا</label>
                    <select className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[12px] font-bold outline-none" value={form.installationType} onChange={e => setForm({...form, installationType: e.target.value as InstallationType})}>
                      <option value="ABOVE">روکار</option><option value="UNDER">زیرکار</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500">تجهیز/اتصال انتهایی</label>
                  <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[12px] font-bold outline-none" value={form.fitting} onChange={e => handleFittingChange(e.target.value as FittingType)}>
                    <option value="NONE">زانو (خم ساده)</option>
                    <optgroup label="شیرآلات مصرف‌کننده">
                      <option value="VALVE_GC">شیر اجاق گاز</option>
                      <option value="VALVE_PC">شیر پکیج</option>
                      <option value="VALVE_WH">شیر آبگرمکن</option>
                      <option value="VALVE_H">شیر بخاری</option>
                    </optgroup>
                    <optgroup label="تجهیزات ورودی">
                      <option value="METER">کنتور</option>
                      <option value="REGULATOR">رگولاتور</option>
                    </optgroup>
                    <optgroup label="اتصالات فنی">
                      <option value="TEE">سه‌راهی (Tee)</option>
                      <option value="ELBOW45">زانو ۴۵ درجه</option>
                      <option value="UNION">مهره ماسوره</option>
                      <option value="REDUCER">تبدیل</option>
                    </optgroup>
                  </select>
                </div>

                <div className="flex flex-col gap-3 pt-4 pb-8">
                  {selectedId !== 'ROOT' && (
                    <button onClick={onUpdatePipe} className="w-full py-3.5 bg-slate-800 text-white rounded-2xl text-[12px] font-bold shadow-md hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-2">
                      <Edit3 size={16} /> ذخیره تغییرات
                    </button>
                  )}
                  <button onClick={onAddPipe} className="w-full py-5 bg-blue-600 text-white rounded-2xl text-[13px] font-bold shadow-xl hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2">
                    <Plus size={20} /> افزودن به نقشه
                  </button>
                  {selectedId !== 'ROOT' && (
                    <button onClick={() => deletePipe(selectedId)} className="w-full py-2.5 text-red-500 font-bold text-[11px] hover:bg-red-50 rounded-2xl transition-all">حذف این بخش</button>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'MEASURE' && (
            <div className="space-y-4 pb-8">
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl shadow-sm">
                <p className="text-[12px] text-amber-800 leading-relaxed font-bold flex items-center gap-2"><Ruler size={14}/> اندازه‌گیری آزاد:</p>
                <p className="text-[11px] text-amber-700 leading-relaxed mt-1">روی هر دو نقطه از صفحه بزنید تا فاصله دقیق آن‌ها محاسبه شود.</p>
              </div>
              <button onClick={() => { setIsMeasureMode(!isMeasureMode); setMeasurePoints([]); if (isMobile && !isMeasureMode) setIsSidebarOpen(false); }} className={`w-full py-5 rounded-2xl text-[12px] font-bold shadow-lg transition-all flex items-center justify-center gap-3 border-2 ${isMeasureMode ? 'bg-amber-500 border-amber-400 text-white' : 'bg-white border-amber-100 text-amber-700 active:bg-amber-50'}`}>
                <Ruler size={22} /> {isMeasureMode ? 'در حال اندازه‌گیری...' : 'فعال‌سازی متر'}
              </button>
              {measurePoints.length > 0 && (
                <button onClick={() => setMeasurePoints([])} className="w-full py-3 text-slate-500 text-[11px] font-bold hover:text-amber-600 transition-colors flex items-center justify-center gap-1"><X size={16} /> پاکسازی نقاط</button>
              )}
            </div>
          )}

          {activeTab === 'ANALYZE' && (
            <div className="space-y-4 pb-8">
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl shadow-sm">
                <p className="text-[12px] text-emerald-800 leading-relaxed font-bold">هوش مصنوعی مهندسی:</p>
                <p className="text-[11px] text-emerald-700 leading-relaxed mt-1">تحلیل کامل نقشه بر اساس استانداردهای نظام مهندسی (مبحث ۱۷).</p>
              </div>
              <button onClick={() => handleAiAnalysis('SAFETY')} className="w-full py-6 bg-white border border-emerald-200 text-emerald-700 rounded-2xl flex flex-col items-center gap-3 text-[12px] font-bold hover:bg-emerald-50 shadow-md active:scale-95 transition-all">
                <ShieldCheck size={32} /> تحلیل ایمنی و استاندارد
              </button>
              <button onClick={() => handleAiAnalysis('MTO')} className="w-full py-6 bg-white border border-blue-200 text-blue-700 rounded-2xl flex flex-col items-center gap-3 text-[12px] font-bold hover:bg-blue-50 shadow-md active:scale-95 transition-all">
                <Calculator size={32} /> استخراج صورت متریال (MTO)
              </button>
            </div>
          )}

          {activeTab === 'EXPORT' && (
            <div className="space-y-4 pb-8">
              <button onClick={() => setShowPrintPreview(true)} className="w-full bg-blue-900 text-white py-6 rounded-2xl text-[13px] font-bold flex items-center justify-center gap-3 shadow-2xl hover:bg-black active:scale-95 transition-all">
                <Printer size={22} /> تهیه خروجی نقشه اجرایی
              </button>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button onClick={() => {
                  const blob = new Blob([JSON.stringify({ pipes })], {type: 'application/json'});
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'gas_iso_project.json'; a.click();
                  showStatus("پروژه ذخیره شد ✔");
                }} className="py-5 bg-white border border-slate-200 text-slate-600 rounded-2xl text-[11px] font-bold flex items-center justify-center gap-2 hover:bg-slate-50 shadow-sm active:scale-95 transition-all">
                  <Save size={18} /> ذخیره فایل
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="py-5 bg-white border border-slate-200 text-slate-600 rounded-2xl text-[11px] font-bold flex items-center justify-center gap-2 hover:bg-slate-50 shadow-sm active:scale-95 transition-all">
                  <Upload size={18} /> باز کردن فایل
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Canvas Area */}
      <main ref={containerRef} className="flex-1 relative bg-slate-100 overflow-hidden touch-none"
        onMouseDown={e => { if (e.button === 1 || e.shiftKey) { setIsDragging(true); setLastMousePos({ x: e.clientX, y: e.clientY }); } }}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setIsDragging(false)}
        onTouchStart={e => {
          if (e.touches.length === 1) {
            // Check if we hit a pipe/root first
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = e.touches[0].clientX - rect.left;
            const y = e.touches[0].clientY - rect.top;
            const worldX = (x - viewOffset.x) / zoom;
            const worldY = (y - viewOffset.y) / zoom;
            const threshold = (isMobile ? 35 : 20) / zoom;
            
            let found = Math.hypot(worldX, worldY) < threshold;
            if (!found) {
              for (const c of pipeCoords.values()) {
                if (getDistanceToSegment(worldX, worldY, c.startX, c.startY, c.endX, c.endY) < threshold) {
                  found = true; break;
                }
              }
            }

            if (!found) {
              // If not hitting anything, start panning
              setIsDragging(true);
              setLastMousePos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
            }
          }
        }}
        onTouchMove={handleMouseMove}
        onTouchEnd={() => setIsDragging(false)}
      >
        <canvas 
          ref={canvasRef} 
          onClick={handleCanvasClick} 
          className={`block w-full h-full ${isMeasureMode ? 'cursor-none' : hoveredId ? 'cursor-pointer' : 'cursor-default'}`} 
        />

        {/* Mobile-Only Gesture Hint / Mode Banner */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[90%] md:w-auto">
          <div className={`px-4 py-2.5 rounded-full text-[10px] md:text-[11px] font-bold shadow-2xl flex items-center justify-center gap-2 border backdrop-blur-md transition-all duration-300 ${isMeasureMode ? 'bg-amber-500 border-amber-400 text-white' : 'bg-white/90 border-slate-200 text-slate-700'}`}>
            {isMeasureMode ? <Ruler size={14} className="animate-pulse" /> : <Edit3 size={14} className="text-blue-500" />}
            {isMeasureMode ? 'حالت اندازه‌گیری: روی نقاط بزنید' : 'حالت طراحی فعال است'}
            {isMobile && !isDragging && <span className="mr-2 text-slate-400 text-[8px] border-r pr-2 border-slate-200">۲ انگشت: جابجایی</span>}
          </div>
        </div>

        {/* Floating Mobile Controls (Undo/Redo/Zoom) */}
        <div className={`absolute left-4 ${isMobile ? 'bottom-[80px]' : 'top-4'} flex flex-col gap-3 z-[10]`}>
          <div className="bg-white/95 backdrop-blur-lg border border-slate-200 p-1.5 rounded-2xl shadow-2xl flex flex-col gap-1.5">
            <button onClick={() => handleZoom(1.3)} className="p-3 hover:bg-blue-50 text-slate-600 rounded-xl transition-all active:scale-90"><ZoomIn size={24} /></button>
            <button onClick={() => { if (containerRef.current) setViewOffset({ x: containerRef.current.clientWidth/2, y: containerRef.current.clientHeight/2 }); }} className="p-3 hover:bg-blue-50 text-slate-600 rounded-xl transition-all active:scale-90"><Move size={24} /></button>
            <button onClick={() => handleZoom(0.7)} className="p-3 hover:bg-blue-50 text-slate-600 rounded-xl transition-all active:scale-90"><ZoomOut size={24} /></button>
          </div>
          
          {isMobile && (
            <div className="bg-white/95 backdrop-blur-lg border border-slate-200 p-1.5 rounded-2xl shadow-2xl flex flex-col gap-1.5">
              <button onClick={undo} disabled={history.length === 0} className={`p-3 rounded-xl transition-all ${history.length > 0 ? 'text-slate-700 active:bg-blue-50' : 'text-slate-200'}`}><Undo2 size={24} /></button>
              <button onClick={redo} disabled={redoStack.length === 0} className={`p-3 rounded-xl transition-all ${redoStack.length > 0 ? 'text-slate-700 active:bg-blue-50' : 'text-slate-200'}`}><Redo2 size={24} /></button>
            </div>
          )}
        </div>

        {/* Floating Action Menu for Mobile */}
        {isMobile && !isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="absolute bottom-10 right-6 w-16 h-16 bg-blue-600 text-white rounded-full shadow-[0_15px_30px_rgba(37,99,235,0.4)] flex items-center justify-center z-[150] active:scale-90 transition-transform"
          >
            <Menu size={28} />
          </button>
        )}

        {/* Status Feedback Toast */}
        {statusMessage && (
          <div className={`absolute ${isMobile ? 'top-20' : 'bottom-10'} left-1/2 -translate-x-1/2 bg-slate-900/95 text-white px-8 py-3 rounded-full text-[11px] font-bold shadow-2xl z-[1000] flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500 ring-4 ring-white/10`}>
             <CheckCircle size={14} className="text-emerald-400" />
             {statusMessage}
          </div>
        )}

        {pipes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
            <div className="bg-white/90 backdrop-blur-md p-10 md:p-14 rounded-[3.5rem] border border-white/60 shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in-95 fade-in duration-700 pointer-events-auto cursor-pointer transition-all hover:scale-105" onClick={(e) => { 
                const rect = canvasRef.current?.getBoundingClientRect(); 
                if (rect) { setViewOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top }); setSelectedId('ROOT'); } 
              }}>
              <div className="p-8 bg-blue-600 text-white rounded-[2.5rem] shadow-2xl"><Target size={isMobile ? 48 : 64} /></div>
              <div className="text-center">
                <p className="text-base md:text-lg font-bold text-blue-900">طراحی مهندسی را شروع کنید</p>
                <p className="text-[10px] md:text-[11px] text-slate-500 font-medium mt-2 leading-relaxed">روی صفحه بزنید تا گره اول بنا شود.</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals - Standard Responsiveness */}
      {showPrintPreview && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[200] flex items-center justify-center p-2 md:p-4">
           <div className="bg-white rounded-[2.5rem] w-full max-w-6xl h-[95vh] md:h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-white/20">
             <div className="p-4 md:p-8 border-b flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/80">
               <div className="flex flex-col text-center md:text-right w-full md:w-auto">
                  <h3 className="text-base md:text-lg font-bold text-slate-800">خروجی ایزومتریک</h3>
                  <p className="text-[10px] text-slate-500">انتخاب فرمت چاپ</p>
               </div>
               <div className="flex flex-wrap justify-center gap-2">
                 <div className="flex gap-1 bg-slate-200/50 p-1 rounded-xl">
                    <button onClick={() => setPaperSize('A4')} className={`px-4 md:px-8 py-2 rounded-lg text-[10px] font-bold transition-all ${paperSize === 'A4' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>A4</button>
                    <button onClick={() => setPaperSize('A3')} className={`px-4 md:px-8 py-2 rounded-lg text-[10px] font-bold transition-all ${paperSize === 'A3' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>A3</button>
                 </div>
                 <div className="flex gap-1 bg-slate-200/50 p-1 rounded-xl">
                    <button onClick={() => setOrientation('LANDSCAPE')} className={`px-4 md:px-8 py-2 rounded-lg text-[10px] font-bold transition-all ${orientation === 'LANDSCAPE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>افقی</button>
                    <button onClick={() => setOrientation('PORTRAIT')} className={`px-4 md:px-8 py-2 rounded-lg text-[10px] font-bold transition-all ${orientation === 'PORTRAIT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>عمودی</button>
                 </div>
               </div>
               <button onClick={() => setShowPrintPreview(false)} className="absolute top-4 right-4 md:static text-slate-400 p-2 bg-slate-100 rounded-2xl"><X size={24} /></button>
             </div>
             <div className="flex-1 bg-slate-200/30 p-4 md:p-10 flex items-center justify-center overflow-auto scrollbar-hide">
               <canvas ref={previewCanvasRef} className="bg-white shadow-2xl border border-slate-200 max-h-full max-w-full object-contain" />
             </div>
             <div className="p-6 md:p-8 border-t bg-white flex flex-col md:flex-row justify-end gap-4 items-center">
               <button onClick={() => setShowPrintPreview(false)} className="w-full md:w-auto px-8 py-4 text-[12px] font-bold text-slate-500 hover:text-slate-800 transition-colors">بازگشت</button>
               <button onClick={() => { 
                 const canvas = previewCanvasRef.current; 
                 if (canvas) { 
                   const link = document.createElement('a'); 
                   link.download = `IsoNegar_Final_${paperSize}.png`; 
                   link.href = canvas.toDataURL('image/png', 1.0); 
                   link.click(); 
                   showStatus("خروجی با موفقیت ذخیره شد");
                 } 
               }} className="w-full md:w-auto px-12 py-4 bg-blue-600 text-white rounded-2xl text-[12px] font-bold shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                 <Save size={20} /> دانلود تصویر نهایی
               </button>
             </div>
           </div>
        </div>
      )}

      {showAiModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl z-[500] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-10 duration-500">
                <div className="p-6 md:p-8 border-b flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-sm md:text-base font-bold flex items-center gap-4 text-slate-800">
                      {modalMode === 'SAFETY' ? <ShieldCheck className="text-emerald-600" size={24} /> : <Calculator className="text-blue-600" size={24} />}
                      تحلیل هوشمند مهندسی
                    </h3>
                    <button onClick={() => setShowAiModal(false)} className="text-slate-400 p-2 bg-slate-100 rounded-2xl"><X size={24} /></button>
                </div>
                <div className="p-6 md:p-10 overflow-y-auto text-[13px] md:text-[14px] leading-relaxed text-slate-700 whitespace-pre-wrap rtl scrollbar-hide">
                    {aiLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 md:py-24 gap-8">
                            <Loader2 className="animate-spin text-blue-600" size={54} />
                            <div className="text-center">
                              <p className="text-slate-800 font-bold">درحال پردازش توسط هوش مصنوعی...</p>
                              <p className="text-slate-400 text-[10px] mt-2">این فرآیند ممکن است ۳۰ ثانیه زمان ببرد</p>
                            </div>
                        </div>
                    ) : (
                      <div className="prose prose-sm prose-slate max-w-none rtl font-medium leading-[2]">{aiResponse}</div>
                    )}
                </div>
                <div className="p-6 bg-slate-50 border-t flex justify-end">
                  <button onClick={() => setShowAiModal(false)} className="w-full md:w-auto px-12 py-3 bg-slate-900 text-white rounded-2xl text-[12px] font-bold">تایید</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
