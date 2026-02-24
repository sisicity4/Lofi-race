import { clamp } from '../core/math';
import type { InputState } from '../types/game';

export type TouchAction = 'left' | 'right' | 'throttle' | 'brake' | 'handbrake' | 'reset' | 'pause' | 'mute';

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
    reset: false,
    pause: false,
    mute: false,
  };
  private oneShot: Pick<InputState, 'reset' | 'pause' | 'mute'> = { reset: false, pause: false, mute: false };
  private bindings: ButtonBinding[] = [];
  private attached = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const code = event.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'Escape', 'KeyM'].includes(code)) {
      event.preventDefault();
    }
    this.keyDown.add(code);
    if (code === 'KeyR') this.oneShot.reset = true;
    if (code === 'Escape') this.oneShot.pause = true;
    if (code === 'KeyM') this.oneShot.mute = true;
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

    // Camera/vehicle yaw convention makes positive steer turn right, so map left/right inversely.
    const steer = clamp((leftKey || this.touchActive.left ? 1 : 0) + (rightKey || this.touchActive.right ? -1 : 0), -1, 1);
    const snapshot: InputState = {
      throttle: throttleKey || this.touchActive.throttle ? 1 : 0,
      brake: brakeKey || this.touchActive.brake ? 1 : 0,
      steer,
      handbrake: handbrakeKey || this.touchActive.handbrake,
      reset: this.oneShot.reset,
      pause: this.oneShot.pause,
      mute: this.oneShot.mute,
    };

    this.oneShot = { reset: false, pause: false, mute: false };
    return snapshot;
  }

  isTouchLikely(): boolean {
    return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  }

  setTouchAction(action: TouchAction, active: boolean): void {
    if (action === 'reset' || action === 'pause' || action === 'mute') {
      if (active) {
        this.oneShot[action] = true;
      }
      this.touchActive[action] = false;
      return;
    }
    this.touchActive[action] = active;
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

  clearAll(): void {
    this.keyDown.clear();
    for (const key of Object.keys(this.touchActive) as TouchAction[]) {
      this.touchActive[key] = false;
    }
    this.oneShot = { reset: false, pause: false, mute: false };
    for (const binding of this.bindings) {
      binding.element.classList.remove('active');
    }
  }
}
