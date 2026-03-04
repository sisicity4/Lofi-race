import { describe, expect, it } from 'vitest';
import { HANDLED_KEY_CODES, buildKeyboardGuideRows, buildTouchGuideRows, formatPressModeJa } from '../../src/input/bindings';

describe('input bindings guide generation', () => {
  it('contains the key codes that gameplay handles', () => {
    expect(HANDLED_KEY_CODES.has('KeyW')).toBe(true);
    expect(HANDLED_KEY_CODES.has('KeyA')).toBe(true);
    expect(HANDLED_KEY_CODES.has('KeyD')).toBe(true);
    expect(HANDLED_KEY_CODES.has('Space')).toBe(true);
    expect(HANDLED_KEY_CODES.has('Escape')).toBe(true);
  });

  it('builds keyboard guide rows from bindings', () => {
    const rows = buildKeyboardGuideRows(['throttle', 'steerLeft', 'steerRight']);
    expect(rows[0]).toEqual({
      keyText: 'W / ↑',
      actionText: `アクセル（${formatPressModeJa('hold')}）`,
      pressMode: 'hold',
    });
    expect(rows[1].keyText).toBe('A / ←');
    expect(rows[2].keyText).toBe('D / →');
  });

  it('builds touch guide rows from bindings', () => {
    const rows = buildTouchGuideRows(['steer', 'throttle', 'drift']);
    expect(rows[0].keyText).toBe('左ジョイスティック');
    expect(rows[1].keyText).toBe('GO');
    expect(rows[2].actionText).toContain('ドリフト');
  });
});
