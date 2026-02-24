import * as THREE from 'three';
import { normalize2, perpLeft2 } from '../core/math';
import type { TrackDefinition } from '../types/game';

export class SceneBuilder {
  buildScene(scene: THREE.Scene, track: TrackDefinition): void {
    scene.clear();

    const hemi = new THREE.HemisphereLight(0xd6f4ff, 0x6e7f4c, 1.0);
    hemi.position.set(0, 100, 0);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2c2, 1.15);
    sun.position.set(40, 60, 20);
    scene.add(sun);

    scene.add(this.createSea());
    scene.add(this.createIslandBase());
    scene.add(this.createRoad(track));
    scene.add(this.createRoadEdge(track));
    scene.add(this.createStartLine(track));
    scene.add(this.createCenterMarkers(track));

    const decoGroup = new THREE.Group();
    decoGroup.name = 'deco';
    this.populateCoastalDeco(decoGroup);
    scene.add(decoGroup);
  }

  createCarMesh(colorHex: number, isPlayer: boolean): THREE.Group {
    const root = new THREE.Group();
    root.name = isPlayer ? 'player-car' : 'cpu-car';

    const baseColor = new THREE.Color(colorHex);
    const hsl = { h: 0, s: 0, l: 0 };
    baseColor.getHSL(hsl);
    const stripeColor = new THREE.Color().setHSL((hsl.h + 0.5) % 1, Math.min(1, hsl.s * 0.55 + 0.15), Math.min(0.9, Math.max(0.22, 0.7 - hsl.l * 0.35)));
    const noseColor = baseColor.clone().multiplyScalar(0.66);

    const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, flatShading: true, roughness: 0.7, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x102030, flatShading: true, roughness: 0.9 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x86c7ff, flatShading: true, roughness: 0.35, metalness: 0.15 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 4.2), bodyMat);
    body.position.y = 0.75;
    root.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 1.9), glassMat);
    cabin.position.set(0, 1.2, 0.1);
    root.add(cabin);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.04, 3.6),
      new THREE.MeshStandardMaterial({ color: stripeColor, flatShading: true, roughness: 0.8 }),
    );
    stripe.position.set(0, 1.1, 0);
    root.add(stripe);

    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 0.18, 0.68),
      new THREE.MeshStandardMaterial({ color: noseColor, flatShading: true, roughness: 0.85 }),
    );
    nose.position.set(0, 0.9, 1.52);
    root.add(nose);

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 0.35), darkMat);
    bumper.position.set(0, 0.45, 2.05);
    root.add(bumper);
    const bumperRear = bumper.clone();
    bumperRear.position.z = -2.05;
    root.add(bumperRear);

    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelOffsets = [
      [-0.95, 0.45, 1.35],
      [0.95, 0.45, 1.35],
      [-0.95, 0.45, -1.35],
      [0.95, 0.45, -1.35],
    ] as const;
    for (const [x, y, z] of wheelOffsets) {
      const wheel = new THREE.Mesh(wheelGeo, darkMat);
      wheel.position.set(x, y, z);
      root.add(wheel);
    }

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.8, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    root.add(shadow);

    return root;
  }

  private createSea(): THREE.Mesh {
    const sea = new THREE.Mesh(
      new THREE.CircleGeometry(220, 48),
      new THREE.MeshStandardMaterial({ color: 0x2d8fd6, flatShading: true, roughness: 0.65, metalness: 0.05 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -2.8;
    return sea;
  }

  private createIslandBase(): THREE.Group {
    const group = new THREE.Group();
    const sand = new THREE.Mesh(
      new THREE.CylinderGeometry(82, 94, 3.8, 28, 1),
      new THREE.MeshStandardMaterial({ color: 0xeccf84, flatShading: true, roughness: 1 }),
    );
    sand.position.y = -1.1;
    group.add(sand);

    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(68, 74, 2.4, 24, 1),
      new THREE.MeshStandardMaterial({ color: 0x4dbd52, flatShading: true, roughness: 1 }),
    );
    grass.position.y = 0.1;
    group.add(grass);

    return group;
  }

  private createRoad(track: TrackDefinition): THREE.Mesh {
    const geometry = this.buildRibbonGeometry(track, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0x1f262d, flatShading: true, roughness: 0.95, metalness: 0.05 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.02;
    mesh.name = 'RoadMesh';
    return mesh;
  }

  private createRoadEdge(track: TrackDefinition): THREE.Mesh {
    const geometry = this.buildRibbonGeometry(track, 0.9);
    const material = new THREE.MeshStandardMaterial({ color: 0xfff1bf, flatShading: true, roughness: 1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.015;
    mesh.scale.set(1.024, 1, 1.024);
    return mesh;
  }

  private createStartLine(track: TrackDefinition): THREE.Mesh {
    const start = track.waypoints[0];
    const next = track.waypoints[1] ?? track.waypoints[0];
    const tangent = normalize2({ x: next.x - start.x, z: next.z - start.z });
    const normal = perpLeft2(tangent);
    const width = start.width * 0.5;

    const geometry = new THREE.PlaneGeometry(width * 2, 1.2);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 });
    const line = new THREE.Mesh(geometry, material);
    line.rotation.x = -Math.PI / 2;
    line.position.set(start.x, 0.04, start.z);
    line.rotation.z = Math.atan2(normal.z, normal.x);
    return line;
  }

  private createCenterMarkers(track: TrackDefinition): THREE.Group {
    const group = new THREE.Group();
    group.name = 'center-markers';
    const mat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, flatShading: true, roughness: 0.95 });
    const geo = new THREE.BoxGeometry(0.32, 0.03, 1.45);

    for (let i = 0; i < track.waypoints.length; i += 1) {
      const a = track.waypoints[i];
      const b = track.waypoints[(i + 1) % track.waypoints.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const segLen = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      const count = Math.max(1, Math.floor(segLen / 4.8));
      for (let j = 0; j < count; j += 1) {
        if (j % 2 === 1) continue;
        const t = (j + 0.5) / count;
        const marker = new THREE.Mesh(geo, mat);
        marker.position.set(a.x + dx * t, 0.045, a.z + dz * t);
        marker.rotation.y = yaw;
        group.add(marker);
      }
    }

    return group;
  }

  private buildRibbonGeometry(track: TrackDefinition, inflate: number): THREE.BufferGeometry {
    const waypoints = track.waypoints;
    const count = waypoints.length;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < count; i += 1) {
      const prev = waypoints[(i - 1 + count) % count];
      const curr = waypoints[i];
      const next = waypoints[(i + 1) % count];
      const tangent = normalize2({ x: next.x - prev.x, z: next.z - prev.z });
      const left = perpLeft2(tangent);
      const halfWidth = curr.width * 0.5 + inflate;
      const lx = curr.x + left.x * halfWidth;
      const lz = curr.z + left.z * halfWidth;
      const rx = curr.x - left.x * halfWidth;
      const rz = curr.z - left.z * halfWidth;
      positions.push(lx, 0, lz, rx, 0, rz);
      normals.push(0, 1, 0, 0, 1, 0);
    }

    for (let i = 0; i < count; i += 1) {
      const a = i * 2;
      const b = ((i + 1) % count) * 2;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private populateCoastalDeco(group: THREE.Group): void {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d99ae, flatShading: true, roughness: 1 });
    const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x7a4e2f, flatShading: true, roughness: 1 });
    const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x2fbf71, flatShading: true, roughness: 1 });

    const ringCount = 28;
    for (let i = 0; i < ringCount; i += 1) {
      const t = (i / ringCount) * Math.PI * 2;
      const radius = 58 + (i % 4) * 5 + Math.sin(i * 1.7) * 2;
      const x = Math.cos(t) * radius;
      const z = Math.sin(t) * radius * 0.72;

      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.8 + (i % 3) * 0.7, 0),
        rockMat,
      );
      rock.position.set(x, 0.8 + (i % 2) * 0.3, z);
      rock.rotation.set(i * 0.3, i * 0.9, i * 0.2);
      group.add(rock);

      if (i % 3 === 0) {
        const palm = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 3.2, 6), palmTrunkMat);
        trunk.position.y = 1.6;
        trunk.rotation.z = 0.12 - (i % 2) * 0.08;
        palm.add(trunk);

        for (let leafIndex = 0; leafIndex < 4; leafIndex += 1) {
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.9, 5), palmLeafMat);
          leaf.position.y = 3.2;
          leaf.rotation.z = Math.PI / 2;
          leaf.rotation.y = (leafIndex / 4) * Math.PI * 2 + 0.2;
          palm.add(leaf);
        }

        palm.position.set(x * 0.88, 0, z * 0.88);
        group.add(palm);
      }
    }

    const cliffMat = new THREE.MeshStandardMaterial({ color: 0x7e6d5a, flatShading: true, roughness: 1 });
    for (let i = 0; i < 14; i += 1) {
      const cliff = new THREE.Mesh(new THREE.BoxGeometry(5 + (i % 3) * 2, 4 + (i % 4), 6 + (i % 2) * 2), cliffMat);
      const t = (i / 14) * Math.PI * 2 + 0.35;
      cliff.position.set(Math.cos(t) * 78, 1.1, Math.sin(t) * 52);
      cliff.rotation.y = t;
      group.add(cliff);
    }
  }
}
