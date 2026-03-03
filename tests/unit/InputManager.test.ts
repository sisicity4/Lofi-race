import { describe, expect, it } from 'vitest';
import { InputManager } from '../../src/input/InputManager';

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
    (input as unknown as { onKeyDown: (event: KeyboardEvent) => void }).onKeyDown({
      code: 'ShiftLeft',
      repeat: false,
      preventDefault: () => undefined,
    } as unknown as KeyboardEvent);
    expect(input.snapshot().boost).toBe(true);
    expect(input.snapshot().boost).toBe(false);

    (input as unknown as { onKeyDown: (event: KeyboardEvent) => void }).onKeyDown({
      code: 'ShiftLeft',
      repeat: true,
      preventDefault: () => undefined,
    } as unknown as KeyboardEvent);
    expect(input.snapshot().boost).toBe(false);
  });
});
