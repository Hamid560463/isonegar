
import { FittingType, Direction } from '../types';
import { CONFIG } from '../constants';

export const drawFittingSymbol = (
  ctx: CanvasRenderingContext2D, 
  type: FittingType, 
  x: number, 
  y: number, 
  direction: Direction,
  zoom: number
) => {
  ctx.save();
  ctx.translate(x, y);

  let angle = 0;
  const rad30 = Math.PI / 6;
  switch(direction) {
    case 'UP': angle = -Math.PI / 2; break;
    case 'DOWN': angle = Math.PI / 2; break;
    case 'NORTH': angle = -rad30; break;
    case 'SOUTH': angle = Math.PI - rad30; break; 
    case 'EAST': angle = rad30; break;
    case 'WEST': angle = Math.PI + rad30; break; 
  }
  
  const S = 1.6; // Scale factor for symbols
  ctx.lineWidth = 1.8 / zoom;
  ctx.strokeStyle = CONFIG.COLORS.VALVE;
  ctx.fillStyle = '#fff';

  // --- VALVE DRAWING ---
  if (type.startsWith('VALVE')) {
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0); 
    ctx.lineTo(-7 * S, -4.5 * S); 
    ctx.lineTo(-7 * S, 4.5 * S); 
    ctx.closePath();
    ctx.moveTo(0, 0); 
    ctx.lineTo(7 * S, -4.5 * S); 
    ctx.lineTo(7 * S, 4.5 * S); 
    ctx.closePath();
    ctx.fill(); 
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, -9 * S);
    ctx.moveTo(-3 * S, -9 * S); ctx.lineTo(3 * S, -9 * S);
    ctx.stroke();

    let labelText = '';
    switch(type) {
      case 'VALVE_GC': labelText = 'GC'; break;
      case 'VALVE_RC': labelText = 'RC'; break;
      case 'VALVE_WH': labelText = 'WH'; break;
      case 'VALVE_PC': labelText = 'P'; break;
      case 'VALVE_H':  labelText = 'H';  break;
      case 'VALVE_LI': labelText = 'Li'; break;
      case 'VALVE_FP': labelText = 'FP'; break;
      case 'VALVE_B':  labelText = 'B';  break;
      case 'VALVE_MAIN': labelText = 'Main'; break;
      default: labelText = 'V';
    }
    
    ctx.rotate(-angle); 
    ctx.fillStyle = CONFIG.COLORS.VALVE;
    ctx.font = `bold ${9 * S}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(labelText, 10 * S, -4 * S);
    ctx.restore();
    return;
  }

  ctx.rotate(angle);

  // --- OTHER FITTINGS ---
  switch (type) {
    case 'METER':
    case 'REGULATOR':
      ctx.rotate(-angle);
      ctx.beginPath();
      ctx.arc(0, -5 * S, 10 * S, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
      ctx.strokeStyle = CONFIG.COLORS.EQUIPMENT_TEXT;
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
      ctx.fillStyle = CONFIG.COLORS.EQUIPMENT_TEXT;
      ctx.textAlign = 'center'; 
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${12 * S}px Vazirmatn, sans-serif`;
      ctx.fillText(type === 'METER' ? 'M' : 'R', 0, -5 * S);
      break;

    case 'TEE':
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, -10 * S);
      ctx.moveTo(-5 * S, -10 * S); ctx.lineTo(5 * S, -10 * S);
      ctx.stroke();
      break;

    case 'UNION':
      ctx.strokeStyle = CONFIG.COLORS.EQUIPMENT;
      ctx.beginPath();
      ctx.moveTo(-4 * S, -7 * S); ctx.lineTo(-4 * S, 7 * S);
      ctx.moveTo(4 * S, -7 * S); ctx.lineTo(4 * S, 7 * S);
      ctx.moveTo(0, -9 * S); ctx.lineTo(0, 9 * S);
      ctx.stroke();
      break;
      
    case 'CAP':
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(0, -6 * S); ctx.lineTo(0, 6 * S);
      ctx.lineWidth = 4 / zoom;
      ctx.stroke();
      break;

    case 'ELBOW45':
      ctx.beginPath();
      ctx.moveTo(-5 * S, -5 * S); ctx.lineTo(5 * S, 5 * S);
      ctx.strokeStyle = '#000';
      ctx.stroke();
      break;

    case 'COUPLING':
      ctx.beginPath();
      ctx.rect(-6 * S, -4 * S, 12 * S, 8 * S);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.stroke();
      break;

    case 'NIPPLE':
      ctx.beginPath();
      ctx.moveTo(-4 * S, -6 * S); ctx.lineTo(4 * S, -6 * S);
      ctx.moveTo(-4 * S, 6 * S); ctx.lineTo(4 * S, 6 * S);
      ctx.stroke();
      break;

    case 'FLANGE':
      ctx.beginPath();
      ctx.ellipse(0, 0, 10 * S, 3 * S, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
      
    case 'REDUCER':
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(-9 * S, -5 * S); 
      ctx.lineTo(0, -2.5 * S); 
      ctx.lineTo(0, 2.5 * S); 
      ctx.lineTo(-9 * S, 5 * S); 
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
  }

  ctx.restore();
};
