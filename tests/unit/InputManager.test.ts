import { describe, expect, it } from 'vitest';
import { InputManager } from '../../src/input/InputManager';

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
  it('clamps touch joystick steer axis to [-1, 1]', () => {
    const input = new InputManager();
    input.setTouchSteerAxis(2.5);
    expect(input.snapshot().steer).toBe(1);
    input.setTouchSteerAxis(-5);
    expect(input.snapshot().steer).toBe(-1);
  });

  it('prioritizes joystick steer over digital touch steer', () => {
    const input = new InputManager();
    input.setTouchAction('left', true);
    input.setTouchSteerAxis(-0.55);
    expect(input.snapshot().steer).toBeCloseTo(-0.55, 5);
  });

  it('clearAll resets touch joystick steer to neutral', () => {
    const input = new InputManager();
    input.setTouchSteerAxis(0.77);
    input.clearAll();
    expect(input.snapshot().steer).toBe(0);
  });

  it('maps A/ArrowLeft to steer -1 and D/ArrowRight to steer +1', () => {
    const input = new InputManager();

    keyDown(input, 'KeyA');
    expect(input.snapshot().steer).toBe(-1);
    keyUp(input, 'KeyA');

    keyDown(input, 'ArrowLeft');
    expect(input.snapshot().steer).toBe(-1);
    keyUp(input, 'ArrowLeft');

    keyDown(input, 'KeyD');
    expect(input.snapshot().steer).toBe(1);
    keyUp(input, 'KeyD');

    keyDown(input, 'ArrowRight');
    expect(input.snapshot().steer).toBe(1);
    keyUp(input, 'ArrowRight');
  });

  it('maps touch left/right buttons to expected steer direction', () => {
    const input = new InputManager();
    input.setTouchAction('left', true);
    expect(input.snapshot().steer).toBe(-1);
    input.setTouchAction('left', false);

    input.setTouchAction('right', true);
    expect(input.snapshot().steer).toBe(1);
    input.setTouchAction('right', false);
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
