import * as THREE from 'three';
import type { GraphicsQuality } from '../types/game';

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private currentPixelRatio = 1;

  static isWebGLAvailable(canvas: HTMLCanvasElement): boolean {
    try {
      return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
      return false;
    }
  }

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x8fd8ff, 1);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xbfeeff, 65, 210);
    // Slightly tighter depth range improves precision and reduces z-fighting flicker.
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.35, 300);
    this.camera.position.set(0, 8, -12);
  }

  applyQuality(quality: GraphicsQuality): void {
    const isMobile = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const dpr = window.devicePixelRatio || 1;
    let pixelRatio = 1;
    if (quality === 'standard') pixelRatio = Math.min(dpr, 1.5);
    if (quality === 'low') pixelRatio = 1;
    if (quality === 'auto') pixelRatio = isMobile ? Math.min(dpr, 1.0) : Math.min(dpr, 1.25);

    this.currentPixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.resize();
  }

  resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  getPixelRatio(): number {
    return this.currentPixelRatio;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
