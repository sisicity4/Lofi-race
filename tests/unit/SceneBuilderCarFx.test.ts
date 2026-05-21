import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { SceneBuilder } from '../../src/render/SceneBuilder';

describe('SceneBuilder.createCarMesh drift FX refs', () => {
  it('attaches drift FX meshes to car userData and initializes them hidden', () => {
    const sceneBuilder = new SceneBuilder();
    const carMesh = sceneBuilder.createCarMesh(0x4bd9ff, true);

    const refs = carMesh.userData as {
      driftFxLeft?: THREE.Mesh;
      driftFxRight?: THREE.Mesh;
      driftFxMaterial?: THREE.MeshBasicMaterial;
      speedTrailLeft?: THREE.Mesh;
      speedTrailRight?: THREE.Mesh;
      speedTrailMaterial?: THREE.MeshBasicMaterial;
      rearGlow?: THREE.Mesh;
      rearGlowMaterial?: THREE.MeshBasicMaterial;
    };

    expect(refs.driftFxLeft).toBeDefined();
    expect(refs.driftFxRight).toBeDefined();
    expect(refs.driftFxMaterial).toBeDefined();
    expect(refs.driftFxLeft?.visible).toBe(false);
    expect(refs.driftFxRight?.visible).toBe(false);
    expect(refs.driftFxMaterial?.transparent).toBe(true);
    expect(refs.driftFxMaterial?.opacity).toBe(0);
    expect(refs.speedTrailLeft).toBeDefined();
    expect(refs.speedTrailRight).toBeDefined();
    expect(refs.speedTrailMaterial).toBeDefined();
    expect(refs.speedTrailLeft?.visible).toBe(false);
    expect(refs.speedTrailRight?.visible).toBe(false);
    expect(refs.speedTrailMaterial?.transparent).toBe(true);
    expect(refs.speedTrailMaterial?.opacity).toBe(0);
    expect(refs.rearGlow).toBeDefined();
    expect(refs.rearGlowMaterial).toBeDefined();
    expect(refs.rearGlow?.visible).toBe(false);
    expect(refs.rearGlowMaterial?.transparent).toBe(true);
    expect(refs.rearGlowMaterial?.opacity).toBe(0);
  });
});
