import { describe, expect, it } from 'vitest';
import {
  HANDLED_KEY_CODES,
  buildDesktopControlGuideRows,
  buildKeyboardGuideRows,
  buildTouchGuideRows,
  formatPressModeJa,
} from '../../src/input/bindings';

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

  it('builds inverted steer guide rows when requested', () => {
    const rows = buildKeyboardGuideRows(['steerLeft', 'steerRight'], { steerInverted: true });
    expect(rows[0].actionText).toContain('右に曲がる');
    expect(rows[1].actionText).toContain('左に曲がる');
  });

  it('builds condensed desktop control rows including overdrive help', () => {
    const rows = buildDesktopControlGuideRows();
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({
      keyText: 'W / ↑',
      actionText: 'ACCEL',
      pressMode: 'hold',
    });
    expect(rows[1]).toEqual({
      keyText: 'S / ↓',
      actionText: 'BRAKE',
      pressMode: 'hold',
    });
    expect(rows[2]).toEqual({
      keyText: 'A D / ← →',
      actionText: 'STEER',
      pressMode: 'hold',
    });
    expect(rows[3]).toEqual({
      keyText: 'SPACE',
      actionText: 'DRIFT',
      pressMode: 'hold',
    });
    expect(rows[4]).toEqual({
      keyText: 'SHIFT',
      actionText: 'OVERDRIVE',
      pressMode: 'tap',
    });
    expect(rows[5]).toEqual({
      keyText: 'Esc',
      actionText: 'PAUSE',
      pressMode: 'tap',
    });
  });

  it('builds touch guide rows from bindings', () => {
    const rows = buildTouchGuideRows(['steer', 'throttle', 'drift']);
    expect(rows[0].keyText).toBe('左ジョイスティック');
    expect(rows[1].keyText).toBe('GO');
    expect(rows[2].actionText).toContain('ドリフト');
  });
});
