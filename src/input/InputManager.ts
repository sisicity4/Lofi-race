import { clamp } from '../core/math';
import type { InputState } from '../types/game';
import {
  HANDLED_KEY_CODES,
  getKeyboardBinding,
  isCodeBoundToKeyboardAction,
  keyLabelFromCode,
  type KeyboardActionId,
} from './bindings';

export type TouchAction = 'left' | 'right' | 'throttle' | 'brake' | 'handbrake' | 'boost' | 'pause' | 'mute';

interface ButtonBinding {
  element: HTMLElement;
  action: TouchAction;
}

export interface InputDebugState {
  readonly snapshot: InputState;
  readonly pressedKeys: readonly string[];
  readonly activeTouchActions: readonly TouchAction[];
  readonly warnings: readonly string[];
}

export class InputManager {
  private readonly keyDown = new Set<string>();
  private readonly touchActive: Record<TouchAction, boolean> = {
    left: false,
    right: false,
    throttle: false,
    brake: false,
    handbrake: false,
    boost: false,
    pause: false,
    mute: false,
  };
  private oneShot: Pick<InputState, 'pause' | 'mute' | 'boost'> = { pause: false, mute: false, boost: false };
  private bindings: ButtonBinding[] = [];
  private attached = false;
  private touchSteerAxis = 0;
  private joystickPointerId: number | null = null;
  private joystickZoneEl: HTMLElement | null = null;
  private joystickThumbEl: HTMLElement | null = null;
  private steeringInverted = true;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const code = event.code;
    if (HANDLED_KEY_CODES.has(code)) {
      event.preventDefault();
    }
    this.keyDown.add(code);
    if (isCodeBoundToKeyboardAction('pause', code) && !event.repeat) this.oneShot.pause = true;
    if (isCodeBoundToKeyboardAction('mute', code) && !event.repeat) this.oneShot.mute = true;
    if (isCodeBoundToKeyboardAction('boost', code) && !event.repeat) this.oneShot.boost = true;
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keyDown.delete(event.code);
  };

  attach(): void {
    if (this.attached) return;
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.clearAll());
    this.attached = true;
  }

  dispose(): void {
    if (!this.attached) return;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.attached = false;
  }

  snapshot(): InputState {
    return this.composeSnapshot(true);
  }

  peekSnapshot(): InputState {
    return this.composeSnapshot(false);
  }

  getDebugState(snapshot: InputState = this.peekSnapshot()): InputDebugState {
    const pressedKeys = Array.from(this.keyDown)
      .sort()
      .map((code) => keyLabelFromCode(code));
    const activeTouchActions = (Object.keys(this.touchActive) as TouchAction[]).filter((action) => this.touchActive[action]);
    const warnings = this.computeConsistencyWarnings(snapshot);
    return {
      snapshot,
      pressedKeys,
      activeTouchActions,
      warnings,
    };
  }

  isTouchLikely(): boolean {
    return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  }

  setTouchAction(action: TouchAction, active: boolean): void {
    if (action === 'pause' || action === 'mute' || action === 'boost') {
      if (active) {
        this.oneShot[action] = true;
      }
      this.touchActive[action] = false;
      return;
    }
    this.touchActive[action] = active;
  }

  setTouchSteerAxis(axis: number): void {
    this.touchSteerAxis = clamp(axis, -1, 1);
  }

  setSteeringInverted(inverted: boolean): void {
    this.steeringInverted = inverted;
  }

  clearTouchSteerAxis(): void {
    this.touchSteerAxis = 0;
    this.joystickPointerId = null;
    this.resetJoystickVisual();
  }

  bindTouchButton(element: HTMLElement, action: TouchAction): void {
    const activate = (e: Event): void => {
      e.preventDefault();
      this.setTouchAction(action, true);
      element.classList.add('active');
    };
    const deactivate = (e: Event): void => {
      e.preventDefault();
      this.setTouchAction(action, false);
      element.classList.remove('active');
    };

    element.addEventListener('pointerdown', activate);
    element.addEventListener('pointerup', deactivate);
    element.addEventListener('pointercancel', deactivate);
    element.addEventListener('pointerleave', deactivate);
    element.addEventListener('contextmenu', (e) => e.preventDefault());

    this.bindings.push({ element, action });
  }

  bindVirtualJoystick(zoneEl: HTMLElement, knobEl: HTMLElement): void {
    this.joystickZoneEl = zoneEl;
    this.joystickThumbEl = knobEl;

    const DEADZONE = 0.12;

    const updateFromPointer = (event: PointerEvent): void => {
      if (this.joystickPointerId !== event.pointerId) return;
      const rect = zoneEl.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.34);
      const len = Math.hypot(dx, dy);
      const clampedLen = Math.min(len, radius);
      const nx = len > 1e-6 ? dx / len : 0;
      const ny = len > 1e-6 ? dy / len : 0;
      const tx = nx * clampedLen;
      const ty = ny * clampedLen;
      const xNormRaw = tx / radius;
      const xNorm = Math.abs(xNormRaw) < DEADZONE ? 0 : clamp((Math.abs(xNormRaw) - DEADZONE) / (1 - DEADZONE), 0, 1) * Math.sign(xNormRaw);

      this.setTouchSteerAxis(xNorm);
      knobEl.style.transform = `translate(${tx}px, ${ty}px)`;
      zoneEl.classList.add('active');
      knobEl.classList.add('active');
    };

    const endPointer = (event: PointerEvent): void => {
      if (this.joystickPointerId !== event.pointerId) return;
      this.clearTouchSteerAxis();
    };

    zoneEl.addEventListener('pointerdown', (event) => {
      if (this.joystickPointerId !== null) return;
      event.preventDefault();
      this.joystickPointerId = event.pointerId;
      try {
        zoneEl.setPointerCapture(event.pointerId);
      } catch {
        // ignore capture failure
      }
      updateFromPointer(event);
    });

    zoneEl.addEventListener('pointermove', (event) => {
      if (this.joystickPointerId !== event.pointerId) return;
      event.preventDefault();
      updateFromPointer(event);
    });

    zoneEl.addEventListener('pointerup', (event) => {
      event.preventDefault();
      endPointer(event);
    });
    zoneEl.addEventListener('pointercancel', (event) => {
      event.preventDefault();
      endPointer(event);
    });
    zoneEl.addEventListener('lostpointercapture', (event) => {
      const pointerEvent = event as PointerEvent;
      endPointer(pointerEvent);
    });
    zoneEl.addEventListener('contextmenu', (event) => event.preventDefault());

    this.resetJoystickVisual();
  }

  clearAll(): void {
    this.keyDown.clear();
    for (const key of Object.keys(this.touchActive) as TouchAction[]) {
      this.touchActive[key] = false;
    }
    this.oneShot = { pause: false, mute: false, boost: false };
    this.touchSteerAxis = 0;
    this.joystickPointerId = null;
    for (const binding of this.bindings) {
      binding.element.classList.remove('active');
    }
    this.resetJoystickVisual();
  }

  private resetJoystickVisual(): void {
    if (this.joystickZoneEl) {
      this.joystickZoneEl.classList.remove('active');
    }
    if (this.joystickThumbEl) {
      this.joystickThumbEl.style.transform = 'translate(0px, 0px)';
      this.joystickThumbEl.classList.remove('active');
    }
  }

  private composeSnapshot(consumeOneShot: boolean): InputState {
    const throttleKey = this.isKeyboardActionPressed('throttle');
    const brakeKey = this.isKeyboardActionPressed('brake');
    const leftKey = this.isKeyboardActionPressed('steerLeft');
    const rightKey = this.isKeyboardActionPressed('steerRight');
    const handbrakeKey = this.isKeyboardActionPressed('drift');

    // Positive steer turns right.
    const digitalSteer = clamp((leftKey || this.touchActive.left ? -1 : 0) + (rightKey || this.touchActive.right ? 1 : 0), -1, 1);
    const baseSteer = Math.abs(this.touchSteerAxis) > 0.001 ? this.touchSteerAxis : digitalSteer;
    const steerRaw = this.steeringInverted ? -baseSteer : baseSteer;
    const steer = Math.abs(steerRaw) < 1e-6 ? 0 : steerRaw;
    const snapshot: InputState = {
      throttle: throttleKey || this.touchActive.throttle ? 1 : 0,
      brake: brakeKey || this.touchActive.brake ? 1 : 0,
      steer,
      handbrake: handbrakeKey || this.touchActive.handbrake,
      boost: this.oneShot.boost,
      pause: this.oneShot.pause,
      mute: this.oneShot.mute,
    };

    if (consumeOneShot) {
      this.oneShot = { pause: false, mute: false, boost: false };
    }
    return snapshot;
  }

  private isKeyboardActionPressed(action: KeyboardActionId): boolean {
    const binding = getKeyboardBinding(action);
    for (const code of binding.codes) {
      if (this.keyDown.has(code)) {
        return true;
      }
    }
    return false;
  }

  private computeConsistencyWarnings(snapshot: InputState): string[] {
    const warnings: string[] = [];

    const throttleExpected = this.isKeyboardActionPressed('throttle') || this.touchActive.throttle;
    if (throttleExpected && snapshot.throttle <= 0) {
      warnings.push('アクセル入力が押下中なのに throttle=0 です');
    }

    const brakeExpected = this.isKeyboardActionPressed('brake') || this.touchActive.brake;
    if (brakeExpected && snapshot.brake <= 0) {
      warnings.push('ブレーキ入力が押下中なのに brake=0 です');
    }

    const driftExpected = this.isKeyboardActionPressed('drift') || this.touchActive.handbrake;
    if (driftExpected && !snapshot.handbrake) {
      warnings.push('ドリフト入力が押下中なのに handbrake=false です');
    }

    const joystickSteerActive = Math.abs(this.touchSteerAxis) > 0.001;
    const leftExpected = this.isKeyboardActionPressed('steerLeft') || this.touchActive.left;
    const rightExpected = this.isKeyboardActionPressed('steerRight') || this.touchActive.right;

    if (!joystickSteerActive) {
      const expectedLeftSteer = this.steeringInverted ? 1 : -1;
      const expectedRightSteer = this.steeringInverted ? -1 : 1;
      if (leftExpected && !rightExpected && expectedLeftSteer < 0 && snapshot.steer >= -0.001) {
        warnings.push('左入力中なのに steer が左方向ではありません');
      }
      if (leftExpected && !rightExpected && expectedLeftSteer > 0 && snapshot.steer <= 0.001) {
        warnings.push('左入力中なのに steer が反転設定どおりの方向ではありません');
      }
      if (rightExpected && !leftExpected && expectedRightSteer > 0 && snapshot.steer <= 0.001) {
        warnings.push('右入力中なのに steer が右方向ではありません');
      }
      if (rightExpected && !leftExpected && expectedRightSteer < 0 && snapshot.steer >= -0.001) {
        warnings.push('右入力中なのに steer が反転設定どおりの方向ではありません');
      }
      if (leftExpected && rightExpected && Math.abs(snapshot.steer) > 0.001) {
        warnings.push('左右同時入力なのに steer が0になっていません');
      }
    }

    return warnings;
  }
}
