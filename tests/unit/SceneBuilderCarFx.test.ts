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
    };

    expect(refs.driftFxLeft).toBeDefined();
    expect(refs.driftFxRight).toBeDefined();
    expect(refs.driftFxMaterial).toBeDefined();
    expect(refs.driftFxLeft?.visible).toBe(false);
    expect(refs.driftFxRight?.visible).toBe(false);
    expect(refs.driftFxMaterial?.transparent).toBe(true);
    expect(refs.driftFxMaterial?.opacity).toBe(0);
  });
});
