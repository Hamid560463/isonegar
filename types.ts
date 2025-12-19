
export type Direction = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'UP' | 'DOWN';

export type InstallationType = 'ABOVE' | 'UNDER';

export type FittingType = 
  | 'NONE' 
  | 'VALVE_GC' | 'VALVE_RC' | 'VALVE_WH' | 'VALVE_PC' | 'VALVE_H' | 'VALVE_MAIN' | 'VALVE'
  | 'VALVE_LI' | 'VALVE_FP' | 'VALVE_B'
  | 'METER' | 'REGULATOR' 
  | 'ELBOW45' | 'TEE' | 'COUPLING' | 'NIPPLE' | 'CAP' | 'FLANGE' | 'UNION' | 'REDUCER';

export interface PipeSegment {
  id: string;
  parentId: string;
  length: number;
  size: string;
  direction: Direction;
  fitting: FittingType;
  installationType: InstallationType;
  label?: string; // For custom annotations like "Unit 1" or height markers
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface ResolvedCoordinates {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}
