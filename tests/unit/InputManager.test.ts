import { describe, expect, it } from 'vitest';
import { InputManager } from '../../src/input/InputManager';
import type { InputState } from '../../src/types/game';

function keyDown(input: InputManager, code: string, repeat = false): void {
  (input as unknown as { onKeyDown: (event: KeyboardEvent) => void }).onKeyDown({
    code,
    repeat,
    preventDefault: () => undefined,
  } as unknown as KeyboardEvent);
}

function keyUp(input: InputManager, code: string): void {
  (input as unknown as { onKeyUp: (event: KeyboardEvent) => void }).onKeyUp({
    code,
  } as unknown as KeyboardEvent);
}

describe('InputManager', () => {
  it('clamps touch joystick steer axis to [-1, 1] after invert mapping', () => {
    const input = new InputManager();
    input.setTouchSteerAxis(2.5);
    expect(input.snapshot().steer).toBe(-1);
    input.setTouchSteerAxis(-5);
    expect(input.snapshot().steer).toBe(1);
  });

  it('prioritizes joystick steer over digital touch steer (default inverted)', () => {
    const input = new InputManager();
    input.setTouchAction('left', true);
    input.setTouchSteerAxis(-0.55);
    expect(input.snapshot().steer).toBeCloseTo(0.55, 5);
  });

  it('clearAll resets touch joystick steer to neutral', () => {
    const input = new InputManager();
    input.setTouchSteerAxis(0.77);
    input.clearAll();
    expect(input.snapshot().steer).toBe(0);
  });

  it('maps A/ArrowLeft to steer +1 and D/ArrowRight to steer -1 by default', () => {
    const input = new InputManager();

    keyDown(input, 'KeyA');
    expect(input.snapshot().steer).toBe(1);
    keyUp(input, 'KeyA');

    keyDown(input, 'ArrowLeft');
    expect(input.snapshot().steer).toBe(1);
    keyUp(input, 'ArrowLeft');

    keyDown(input, 'KeyD');
    expect(input.snapshot().steer).toBe(-1);
    keyUp(input, 'KeyD');

    keyDown(input, 'ArrowRight');
    expect(input.snapshot().steer).toBe(-1);
    keyUp(input, 'ArrowRight');
  });

  it('maps touch left/right buttons to expected steer direction with default inversion', () => {
    const input = new InputManager();
    input.setTouchAction('left', true);
    expect(input.snapshot().steer).toBe(1);
    input.setTouchAction('left', false);

    input.setTouchAction('right', true);
    expect(input.snapshot().steer).toBe(-1);
    input.setTouchAction('right', false);
  });

  it('supports acceleration with steering for WASD and arrow keys', () => {
    const input = new InputManager();

    keyDown(input, 'KeyW');
    keyDown(input, 'KeyA');
    let snap = input.snapshot();
    expect(snap.throttle).toBe(1);
    expect(snap.steer).toBe(1);

    keyUp(input, 'KeyA');
    keyUp(input, 'KeyW');
    keyDown(input, 'ArrowUp');
    keyDown(input, 'ArrowRight');
    snap = input.snapshot();
    expect(snap.throttle).toBe(1);
    expect(snap.steer).toBe(-1);
  });

  it('supports non-inverted steering when option is disabled', () => {
    const input = new InputManager();
    input.setSteeringInverted(false);

    keyDown(input, 'KeyA');
    expect(input.snapshot().steer).toBe(-1);
    keyUp(input, 'KeyA');

    keyDown(input, 'KeyD');
    expect(input.snapshot().steer).toBe(1);
    keyUp(input, 'KeyD');
  });

  it('treats throttle, brake, and drift as hold inputs', () => {
    const input = new InputManager();

    keyDown(input, 'KeyW');
    expect(input.snapshot().throttle).toBe(1);
    keyUp(input, 'KeyW');
    expect(input.snapshot().throttle).toBe(0);

    keyDown(input, 'KeyS');
    expect(input.snapshot().brake).toBe(1);
    keyUp(input, 'KeyS');
    expect(input.snapshot().brake).toBe(0);

    keyDown(input, 'Space');
    expect(input.snapshot().handbrake).toBe(true);
    keyUp(input, 'Space');
    expect(input.snapshot().handbrake).toBe(false);
  });

  it('cancels steering when left and right are pressed together', () => {
    const input = new InputManager();
    keyDown(input, 'KeyA');
    keyDown(input, 'KeyD');
    expect(input.snapshot().steer).toBe(0);
  });

  it('exposes pressed key labels in debug state', () => {
    const input = new InputManager();
    keyDown(input, 'KeyW');
    keyDown(input, 'ArrowRight');
    const debug = input.getDebugState(input.peekSnapshot());
    expect(debug.pressedKeys).toContain('W');
    expect(debug.pressedKeys).toContain('→');
    expect(debug.warnings.length).toBe(0);
  });

  it('emits warnings when provided snapshot is inconsistent with active inputs', () => {
    const input = new InputManager();
    keyDown(input, 'KeyW');
    keyDown(input, 'KeyA');
    const inconsistent: InputState = {
      throttle: 0,
      brake: 0,
      steer: 0,
      handbrake: false,
      boost: false,
      pause: false,
      mute: false,
    };
    const debug = input.getDebugState(inconsistent);
    expect(debug.warnings.length).toBeGreaterThan(0);
    expect(debug.warnings.some((warning) => warning.includes('throttle=0'))).toBe(true);
    expect(debug.warnings.some((warning) => warning.includes('steer'))).toBe(true);
  });

  it('treats touch boost as one-shot input', () => {
    const input = new InputManager();
    input.setTouchAction('boost', true);
    const first = input.snapshot();
    const second = input.snapshot();
    expect(first.boost).toBe(true);
    expect(second.boost).toBe(false);
  });

  it('clearAll clears pending one-shot boost', () => {
    const input = new InputManager();
    input.setTouchAction('boost', true);
    input.clearAll();
    expect(input.snapshot().boost).toBe(false);
  });

  it('treats Shift boost as one-shot and ignores repeat keydown', () => {
    const input = new InputManager();
    keyDown(input, 'ShiftLeft');
    expect(input.snapshot().boost).toBe(true);
    expect(input.snapshot().boost).toBe(false);

    keyDown(input, 'ShiftLeft', true);
    expect(input.snapshot().boost).toBe(false);
  });
});
