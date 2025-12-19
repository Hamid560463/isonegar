
export const CONFIG = {
  SCALE: 2.5,
  ISO_ANGLE: Math.PI / 6, // 30 degrees
  COLORS: {
    PIPE: '#1e293b',
    SELECTED: '#3b82f6',
    GRID: 'rgba(100, 116, 139, 0.05)',
    JOINT: '#ef4444',
    LABEL: '#475569',
    NODE_BG: '#ffffff',
    NODE_BORDER: '#3b82f6',
    ROOT: '#059669',
    MEASURE: '#f59e0b',
    VALVE: '#000000', 
    EQUIPMENT: '#000000',
    EQUIPMENT_TEXT: '#16a34a'
  },
  PAPER_SIZES: {
    A4: { width: 210, height: 297, label: 'A4' },
    A3: { width: 297, height: 420, label: 'A3' }
  },
  SIZES: {
    '1/2"': 1.8,
    '3/4"': 2.5,
    '1"': 3.5,
    '1 1/4"': 4.5,
    '1 1/2"': 5.5,
    '2"': 7
  },
  SIZE_COLORS: {
    '1/2"': '#64748b',   // Slate
    '3/4"': '#0891b2',   // Cyan
    '1"': '#059669',     // Emerald
    '1 1/4"': '#d97706', // Amber
    '1 1/2"': '#dc2626', // Red
    '2"': '#7c3aed'      // Violet
  }
};
