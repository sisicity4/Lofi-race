export type BindingPressMode = 'hold' | 'tap';

export type KeyboardActionId =
  | 'throttle'
  | 'brake'
  | 'steerLeft'
  | 'steerRight'
  | 'drift'
  | 'boost'
  | 'pause'
  | 'mute';

export interface KeyboardBindingDefinition {
  action: KeyboardActionId;
  codes: readonly string[];
  keyLabels: readonly string[];
  actionLabelJa: string;
  pressMode: BindingPressMode;
}

export const KEYBOARD_BINDINGS: readonly KeyboardBindingDefinition[] = [
  {
    action: 'throttle',
    codes: ['KeyW', 'ArrowUp'],
    keyLabels: ['W', '↑'],
    actionLabelJa: 'アクセル',
    pressMode: 'hold',
  },
  {
    action: 'brake',
    codes: ['KeyS', 'ArrowDown'],
    keyLabels: ['S', '↓'],
    actionLabelJa: 'ブレーキ',
    pressMode: 'hold',
  },
  {
    action: 'steerLeft',
    codes: ['KeyA', 'ArrowLeft'],
    keyLabels: ['A', '←'],
    actionLabelJa: '左に曲がる',
    pressMode: 'hold',
  },
  {
    action: 'steerRight',
    codes: ['KeyD', 'ArrowRight'],
    keyLabels: ['D', '→'],
    actionLabelJa: '右に曲がる',
    pressMode: 'hold',
  },
  {
    action: 'drift',
    codes: ['Space'],
    keyLabels: ['Space'],
    actionLabelJa: 'ドリフト',
    pressMode: 'hold',
  },
  {
    action: 'boost',
    codes: ['ShiftLeft', 'ShiftRight'],
    keyLabels: ['Shift'],
    actionLabelJa: 'OVERDRIVE',
    pressMode: 'tap',
  },
  {
    action: 'pause',
    codes: ['Escape'],
    keyLabels: ['Esc'],
    actionLabelJa: 'ポーズ',
    pressMode: 'tap',
  },
  {
    action: 'mute',
    codes: ['KeyM'],
    keyLabels: ['M'],
    actionLabelJa: 'ミュート',
    pressMode: 'tap',
  },
] as const;

export type TouchGuideActionId = 'steer' | 'throttle' | 'brake' | 'drift' | 'boost' | 'pause';

export interface TouchGuideBindingDefinition {
  action: TouchGuideActionId;
  controlLabelJa: string;
  actionLabelJa: string;
  pressMode: BindingPressMode;
}

export const TOUCH_GUIDE_BINDINGS: readonly TouchGuideBindingDefinition[] = [
  {
    action: 'steer',
    controlLabelJa: '左ジョイスティック',
    actionLabelJa: '左右ステア',
    pressMode: 'hold',
  },
  {
    action: 'throttle',
    controlLabelJa: 'GO',
    actionLabelJa: 'アクセル',
    pressMode: 'hold',
  },
  {
    action: 'brake',
    controlLabelJa: 'BRAKE',
    actionLabelJa: 'ブレーキ',
    pressMode: 'hold',
  },
  {
    action: 'drift',
    controlLabelJa: 'DRIFT',
    actionLabelJa: 'ドリフト',
    pressMode: 'hold',
  },
  {
    action: 'boost',
    controlLabelJa: 'BOOST',
    actionLabelJa: 'OVERDRIVE',
    pressMode: 'tap',
  },
  {
    action: 'pause',
    controlLabelJa: 'II',
    actionLabelJa: 'ポーズ',
    pressMode: 'tap',
  },
] as const;

export interface InputGuideRow {
  keyText: string;
  actionText: string;
  pressMode: BindingPressMode;
}

interface InputGuideOptions {
  steerInverted?: boolean;
}

const keyboardBindingMap = new Map<KeyboardActionId, KeyboardBindingDefinition>(
  KEYBOARD_BINDINGS.map((binding) => [binding.action, binding]),
);

const touchGuideBindingMap = new Map<TouchGuideActionId, TouchGuideBindingDefinition>(
  TOUCH_GUIDE_BINDINGS.map((binding) => [binding.action, binding]),
);

const keyLabelByCode = new Map<string, string>();
for (const binding of KEYBOARD_BINDINGS) {
  for (let i = 0; i < binding.codes.length; i += 1) {
    const code = binding.codes[i];
    const fallback = code.replace(/^Key/, '');
    const label = binding.keyLabels[Math.min(i, binding.keyLabels.length - 1)] ?? fallback;
    if (!keyLabelByCode.has(code)) {
      keyLabelByCode.set(code, label);
    }
  }
}

export const HANDLED_KEY_CODES = new Set<string>(KEYBOARD_BINDINGS.flatMap((binding) => [...binding.codes]));

export function getKeyboardBinding(action: KeyboardActionId): KeyboardBindingDefinition {
  const binding = keyboardBindingMap.get(action);
  if (!binding) {
    throw new Error(`Unknown keyboard action: ${action}`);
  }
  return binding;
}

export function isCodeBoundToKeyboardAction(action: KeyboardActionId, code: string): boolean {
  return getKeyboardBinding(action).codes.includes(code);
}

export function formatPressModeJa(mode: BindingPressMode): string {
  return mode === 'hold' ? 'ホールド' : 'タップ';
}

export function keyLabelFromCode(code: string): string {
  return keyLabelByCode.get(code) ?? code;
}

export function buildKeyboardGuideRows(actions: readonly KeyboardActionId[], options: InputGuideOptions = {}): InputGuideRow[] {
  const steerInverted = Boolean(options.steerInverted);
  return actions.map((action) => {
    const binding = getKeyboardBinding(action);
    let actionLabel = binding.actionLabelJa;
    if (steerInverted && action === 'steerLeft') {
      actionLabel = '右に曲がる';
    } else if (steerInverted && action === 'steerRight') {
      actionLabel = '左に曲がる';
    }
    return {
      keyText: binding.keyLabels.join(' / '),
      actionText: `${actionLabel}（${formatPressModeJa(binding.pressMode)}）`,
      pressMode: binding.pressMode,
    };
  });
}

export function buildDesktopControlGuideRows(): InputGuideRow[] {
  const throttle = getKeyboardBinding('throttle');
  const brake = getKeyboardBinding('brake');
  const steerLeft = getKeyboardBinding('steerLeft');
  const steerRight = getKeyboardBinding('steerRight');
  const drift = getKeyboardBinding('drift');
  const boost = getKeyboardBinding('boost');
  const pause = getKeyboardBinding('pause');

  const steerKeyText = `${steerLeft.keyLabels[0]} ${steerRight.keyLabels[0]} / ${steerLeft.keyLabels[1]} ${steerRight.keyLabels[1]}`;

  return [
    {
      keyText: throttle.keyLabels.join(' / '),
      actionText: 'ACCEL',
      pressMode: throttle.pressMode,
    },
    {
      keyText: brake.keyLabels.join(' / '),
      actionText: 'BRAKE',
      pressMode: brake.pressMode,
    },
    {
      keyText: steerKeyText,
      actionText: 'STEER',
      pressMode: steerLeft.pressMode,
    },
    {
      keyText: 'SPACE',
      actionText: 'DRIFT',
      pressMode: drift.pressMode,
    },
    {
      keyText: 'SHIFT',
      actionText: 'OVERDRIVE',
      pressMode: boost.pressMode,
    },
    {
      keyText: pause.keyLabels.join(' / '),
      actionText: 'PAUSE',
      pressMode: pause.pressMode,
    },
  ];
}

export function buildTouchGuideRows(actions: readonly TouchGuideActionId[], options: InputGuideOptions = {}): InputGuideRow[] {
  const steerInverted = Boolean(options.steerInverted);
  return actions.map((action) => {
    const binding = touchGuideBindingMap.get(action);
    if (!binding) {
      throw new Error(`Unknown touch guide action: ${action}`);
    }
    const actionLabel = steerInverted && action === 'steer' ? '左右ステア反転' : binding.actionLabelJa;
    return {
      keyText: binding.controlLabelJa,
      actionText: `${actionLabel}（${formatPressModeJa(binding.pressMode)}）`,
      pressMode: binding.pressMode,
    };
  });
}
