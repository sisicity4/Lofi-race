import { clamp } from '../core/math';
import type { InputState } from '../types/game';

export type TouchAction = 'left' | 'right' | 'throttle' | 'brake' | 'handbrake' | 'boost' | 'pause' | 'mute';

interface ButtonBinding {
  element: HTMLElement;
  action: TouchAction;
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

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const code = event.code;
    if ([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Space',
      'ShiftLeft',
      'ShiftRight',
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'Escape',
      'KeyM',
    ].includes(code)) {
      event.preventDefault();
    }
    this.keyDown.add(code);
    if (code === 'Escape' && !event.repeat) this.oneShot.pause = true;
    if (code === 'KeyM' && !event.repeat) this.oneShot.mute = true;
    if ((code === 'ShiftLeft' || code === 'ShiftRight') && !event.repeat) this.oneShot.boost = true;
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
    const throttleKey = this.keyDown.has('KeyW') || this.keyDown.has('ArrowUp');
    const brakeKey = this.keyDown.has('KeyS') || this.keyDown.has('ArrowDown');
    const leftKey = this.keyDown.has('KeyA') || this.keyDown.has('ArrowLeft');
    const rightKey = this.keyDown.has('KeyD') || this.keyDown.has('ArrowRight');
    const handbrakeKey = this.keyDown.has('Space');

    // Positive steer turns right, so map left to -1 and right to +1 for intuitive WASD/Arrow control.
    const digitalSteer = clamp((leftKey || this.touchActive.left ? -1 : 0) + (rightKey || this.touchActive.right ? 1 : 0), -1, 1);
    const steer = Math.abs(this.touchSteerAxis) > 0.001 ? this.touchSteerAxis : digitalSteer;
    const snapshot: InputState = {
      throttle: throttleKey || this.touchActive.throttle ? 1 : 0,
      brake: brakeKey || this.touchActive.brake ? 1 : 0,
      steer,
      handbrake: handbrakeKey || this.touchActive.handbrake,
      boost: this.oneShot.boost,
      pause: this.oneShot.pause,
      mute: this.oneShot.mute,
    };

    this.oneShot = { pause: false, mute: false, boost: false };
    return snapshot;
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
}
