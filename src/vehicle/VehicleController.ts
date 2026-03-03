import { clamp } from '../core/math';
import type { InputState } from '../types/game';

export interface VehicleControllerContext {
  dtSec: number;
}

export interface VehicleController {
  update(context: VehicleControllerContext): InputState;
}

export const EMPTY_INPUT: InputState = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  boost: false,
  pause: false,
  mute: false,
};

export function sanitizeInput(input: InputState): InputState {
  return {
    throttle: clamp(input.throttle, 0, 1),
    brake: clamp(input.brake, 0, 1),
    steer: clamp(input.steer, -1, 1),
    handbrake: Boolean(input.handbrake),
    boost: Boolean(input.boost),
    pause: Boolean(input.pause),
    mute: Boolean(input.mute),
  };
}
