
import { useState, useCallback, useEffect } from 'react';
import { PipeSegment } from '../domain/types';

interface HistoryState {
  pipes: PipeSegment[];
  selectedId: string;
}

export const usePipesState = () => {
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

  const [selectedId, setSelectedId] = useState<string>('ROOT');
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);

  useEffect(() => {
    localStorage.setItem('smartgas_project_data', JSON.stringify({ pipes }));
  }, [pipes]);

  const commitToHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-49), { pipes: JSON.parse(JSON.stringify(pipes)), selectedId }]);
    setRedoStack([]);
  }, [pipes, selectedId]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack(prev => [...prev, { pipes: JSON.parse(JSON.stringify(pipes)), selectedId }]);
    setHistory(prev => prev.slice(0, -1));
    setPipes(previous.pipes);
    setSelectedId(previous.selectedId);
  }, [history, pipes, selectedId]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(prev => [...prev, { pipes: JSON.parse(JSON.stringify(pipes)), selectedId }]);
    setRedoStack(prev => prev.slice(0, -1));
    setPipes(next.pipes);
    setSelectedId(next.selectedId);
  }, [redoStack, pipes, selectedId]);

  const addPipe = useCallback((newPipe: PipeSegment) => {
    commitToHistory();
    setPipes(prev => [...prev, newPipe]);
    setSelectedId(newPipe.id);
  }, [commitToHistory]);

  const updatePipe = useCallback((id: string, updates: Partial<PipeSegment>) => {
    commitToHistory();
    setPipes(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, [commitToHistory]);

  const deletePipe = useCallback((id: string) => {
    if (id === 'ROOT') return;
    commitToHistory();
    setPipes(prev => prev.filter(p => p.id !== id));
    setSelectedId('ROOT');
  }, [commitToHistory]);

  return {
    pipes,
    setPipes,
    selectedId,
    setSelectedId,
    history,
    redoStack,
    undo,
    redo,
    addPipe,
    updatePipe,
    deletePipe,
    commitToHistory
  };
};
