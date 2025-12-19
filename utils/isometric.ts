
import { Direction, ResolvedCoordinates, Vector2D, PipeSegment } from '../types';
import { CONFIG } from '../constants';

export const calculateIsoVector = (lengthCm: number, direction: Direction): Vector2D => {
  const len = lengthCm * CONFIG.SCALE;
  const cos30 = Math.cos(CONFIG.ISO_ANGLE);
  const sin30 = Math.sin(CONFIG.ISO_ANGLE);
  
  let dx = 0, dy = 0;
  switch (direction) {
    case 'UP':    dy = -len; break;
    case 'DOWN':  dy = len; break;
    case 'NORTH': dx = len * cos30; dy = -len * sin30; break;
    case 'SOUTH': dx = -len * cos30; dy = len * sin30; break;
    case 'EAST':  dx = len * cos30; dy = len * sin30; break;
    case 'WEST':  dx = -len * cos30; dy = -len * sin30; break;
  }
  return { x: dx, y: dy };
};

export const resolveAllCoordinates = (pipes: PipeSegment[]): Map<string, ResolvedCoordinates> => {
  const coords = new Map<string, ResolvedCoordinates>();
  const nodePositions = new Map<string, Vector2D>();
  
  nodePositions.set('ROOT', { x: 0, y: 0 });

  const resolve = (id: string): Vector2D | null => {
    if (nodePositions.has(id)) return nodePositions.get(id)!;
    
    const pipe = pipes.find(p => p.id === id);
    if (!pipe) return null;

    const parentPos = resolve(pipe.parentId);
    if (!parentPos) return null;

    const vector = calculateIsoVector(pipe.length, pipe.direction);
    const endPos = { x: parentPos.x + vector.x, y: parentPos.y + vector.y };
    
    nodePositions.set(id, endPos);
    coords.set(id, {
      startX: parentPos.x,
      startY: parentPos.y,
      endX: endPos.x,
      endY: endPos.y
    });
    
    return endPos;
  };

  pipes.forEach(p => resolve(p.id));
  return coords;
};

/**
 * Finds the nearest node (snap point) to a given isometric coordinate.
 */
export const findNearestNode = (
  x: number, 
  y: number, 
  pipeCoords: Map<string, ResolvedCoordinates>, 
  threshold: number
): Vector2D | null => {
  let minDict = threshold;
  let nearest: Vector2D | null = null;

  // Check Root
  const rootDist = Math.hypot(x, y);
  if (rootDist < minDict) {
    minDict = rootDist;
    nearest = { x: 0, y: 0 };
  }

  // Check Pipe Ends
  for (const coords of pipeCoords.values()) {
    const d = Math.hypot(x - coords.endX, y - coords.endY);
    if (d < minDict) {
      minDict = d;
      nearest = { x: coords.endX, y: coords.endY };
    }
  }

  return nearest;
};

/**
 * Calculates the shortest distance from a point to a line segment.
 */
export const getDistanceToSegment = (
  px: number, py: number, 
  x1: number, y1: number, 
  x2: number, y2: number
): number => {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
};
