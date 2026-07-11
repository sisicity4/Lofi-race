import type { TrackDefinition } from '../types/game';

export interface PlayableTrackSpec {
  id: string;
  theme: TrackDefinition['theme'];
  outputFile: string;
  controlPoints: [number, number][];
  samplesPerSegment: number;
  widthBase: number;
  widthCornerBoost: number;
  widthWave: number;
  speedBase: number;
  speedCornerDrop: number;
  checkpointCount: number;
  checkpointRadius: number;
  hardBoundaryMargin: number;
}

export const PLAYABLE_TRACK_SPECS: readonly PlayableTrackSpec[];

export function createTrackFromSpec(spec: PlayableTrackSpec): TrackDefinition;
export function createPlayableTrackById(id: string): TrackDefinition;
export function createFallbackRacewayTrack(): TrackDefinition;
export function createFallbackDesertTrack(): TrackDefinition;
export function createFallbackForestTrack(): TrackDefinition;
export function createFallbackStudioTrack(): TrackDefinition;
export function createFallbackSolAbyssTrack(): TrackDefinition;
export function createFallbackCoastalTrack(): TrackDefinition;
