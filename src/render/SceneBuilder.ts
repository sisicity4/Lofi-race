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
    scene.add(this.createRouteChevrons(track));
    scene.add(this.createCheckpointGates(track));
    scene.add(this.createTracksideTown(track));
    scene.add(this.createFestivalBunting(track));
    scene.add(this.createPlayfulLandmarks(track));

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
    const hubColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.5);

    const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, flatShading: true, roughness: 0.7, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x102030, flatShading: true, roughness: 0.9 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x86c7ff, flatShading: true, roughness: 0.35, metalness: 0.15 });
    const accentMat = new THREE.MeshStandardMaterial({ color: stripeColor, flatShading: true, roughness: 0.8 });
    const noseMat = new THREE.MeshStandardMaterial({ color: noseColor, flatShading: true, roughness: 0.85 });
    const hubMat = new THREE.MeshStandardMaterial({ color: hubColor, flatShading: true, roughness: 0.6, metalness: 0.08 });

    // Rounded "toy car" shell: center hull + front/rear pods + wheel arches.
    const hullCenter = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.52, 2.45), bodyMat);
    hullCenter.position.set(0, 0.82, 0.05);
    root.add(hullCenter);

    const podGeo = new THREE.SphereGeometry(0.92, 10, 8);
    const frontPod = new THREE.Mesh(podGeo, bodyMat);
    frontPod.scale.set(1.12, 0.52, 0.92);
    frontPod.position.set(0, 0.82, 1.32);
    root.add(frontPod);

    const rearPod = new THREE.Mesh(podGeo, bodyMat);
    rearPod.scale.set(1.08, 0.5, 0.9);
    rearPod.position.set(0, 0.8, -1.24);
    root.add(rearPod);

    const archGeo = new THREE.SphereGeometry(0.52, 8, 6);
    const archOffsets = [
      [-0.9, 0.68, 1.25],
      [0.9, 0.68, 1.25],
      [-0.9, 0.68, -1.25],
      [0.9, 0.68, -1.25],
    ] as const;
    for (const [x, y, z] of archOffsets) {
      const arch = new THREE.Mesh(archGeo, bodyMat);
      arch.scale.set(1.06, 0.46, 1.38);
      arch.position.set(x, y, z);
      root.add(arch);
    }

    const belly = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.2, 3.35), darkMat);
    belly.position.set(0, 0.52, 0);
    root.add(belly);

    const cabinBase = new THREE.Mesh(new THREE.SphereGeometry(0.86, 10, 8), glassMat);
    cabinBase.scale.set(1.05, 0.58, 1.2);
    cabinBase.position.set(0, 1.19, 0.08);
    root.add(cabinBase);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 0.62), glassMat);
    windshield.position.set(0, 1.17, 0.68);
    windshield.rotation.x = -0.22;
    root.add(windshield);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 3.05), accentMat);
    stripe.position.set(0, 1.12, 0.08);
    root.add(stripe);

    const nosePatch = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.14, 0.52), noseMat);
    nosePatch.position.set(0, 0.94, 1.7);
    root.add(nosePatch);

    const smileBar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.65, 8), darkMat);
    smileBar.rotation.z = Math.PI / 2;
    smileBar.position.set(0, 0.58, 1.95);
    root.add(smileBar);

    const rearBar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 8), darkMat);
    rearBar.rotation.z = Math.PI / 2;
    rearBar.position.set(0, 0.58, -1.9);
    root.add(rearBar);

    const headlightMat = new THREE.MeshStandardMaterial({ color: 0xfff1b6, emissive: 0x3e2f08, flatShading: true, roughness: 0.55 });
    const taillightMat = new THREE.MeshStandardMaterial({ color: 0xff7c7c, emissive: 0x3b0909, flatShading: true, roughness: 0.65 });
    for (const x of [-0.58, 0.58] as const) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 6), headlightMat);
      lamp.position.set(x, 0.78, 1.95);
      lamp.scale.set(1.1, 0.9, 0.65);
      root.add(lamp);

      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), taillightMat);
      tail.position.set(x, 0.72, -1.9);
      tail.scale.set(1.05, 0.85, 0.55);
      root.add(tail);
    }

    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.08, 6);
    hubGeo.rotateZ(Math.PI / 2);
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

      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.position.set(x + Math.sign(x) * 0.18, y, z);
      root.add(hub);
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
    // Keep terrain slightly below the gameplay plane (y=0) so the road ribbon is never buried.
    sand.position.y = -1.98;
    group.add(sand);

    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(68, 74, 2.4, 24, 1),
      new THREE.MeshStandardMaterial({ color: 0x4dbd52, flatShading: true, roughness: 1 }),
    );
    grass.position.y = -1.24;
    group.add(grass);

    return group;
  }

  private createRoad(track: TrackDefinition): THREE.Mesh {
    const geometry = this.buildRibbonGeometry(track, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0x3c4752, flatShading: true, roughness: 0.95, metalness: 0.05 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.02;
    mesh.name = 'RoadMesh';
    return mesh;
  }

  private createRoadEdge(track: TrackDefinition): THREE.Mesh {
    const geometry = this.buildRibbonGeometry(track, 0.9);
    const material = new THREE.MeshStandardMaterial({ color: 0xfff6d8, flatShading: true, roughness: 1 });
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

  private createRouteChevrons(track: TrackDefinition): THREE.Group {
    const group = new THREE.Group();
    group.name = 'route-chevrons';

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x29d3c7, flatShading: true, roughness: 0.85, metalness: 0.05 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xffe08a, flatShading: true, roughness: 0.8, metalness: 0.04 });
    const stemGeo = new THREE.BoxGeometry(0.18, 0.05, 0.58);
    const headGeo = new THREE.ConeGeometry(0.36, 0.72, 3);
    headGeo.rotateX(Math.PI / 2);

    for (let i = 0; i < track.waypoints.length; i += 1) {
      const a = track.waypoints[i];
      const b = track.waypoints[(i + 1) % track.waypoints.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 4) continue;
      const tangent = normalize2({ x: dx, z: dz });
      const left = perpLeft2(tangent);
      const yaw = Math.atan2(dx, dz);
      const count = Math.max(1, Math.floor(segLen / 8));

      for (let j = 0; j < count; j += 1) {
        if ((i + j) % 2 === 1) continue;
        const t = (j + 0.5) / count;
        const x = a.x + dx * t;
        const z = a.z + dz * t;
        const lateralOffset = ((i + j) % 4 < 2 ? 1 : -1) * Math.min(0.95, a.width * 0.08);

        const chevron = new THREE.Group();
        chevron.position.set(x + left.x * lateralOffset, 0.075, z + left.z * lateralOffset);
        chevron.rotation.y = yaw;

        const stem = new THREE.Mesh(stemGeo, baseMat);
        stem.position.z = -0.18;
        chevron.add(stem);

        const head = new THREE.Mesh(headGeo, (i + j) % 4 === 0 ? glowMat : baseMat);
        head.position.set(0, 0.02, 0.34);
        chevron.add(head);

        group.add(chevron);
      }
    }

    return group;
  }

  private createCheckpointGates(track: TrackDefinition): THREE.Group {
    const group = new THREE.Group();
    group.name = 'checkpoint-gates';

    const postGeo = new THREE.BoxGeometry(0.42, 3.4, 0.42);
    const beamGeo = new THREE.BoxGeometry(1, 0.28, 0.34);
    const capGeo = new THREE.BoxGeometry(0.58, 0.16, 0.58);
    const floorStripeGeo = new THREE.BoxGeometry(1, 0.03, 0.7);
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x0f2d36, flatShading: true, roughness: 0.9 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x39e6d8, flatShading: true, roughness: 0.8 });
    const startMat = new THREE.MeshStandardMaterial({ color: 0xfff6de, flatShading: true, roughness: 0.9 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffd166, flatShading: true, roughness: 0.85 });

    for (let i = 0; i < track.checkpoints.length; i += 1) {
      const cp = track.checkpoints[i];
      const wpIndex = this.findNearestWaypointIndex(track, cp.x, cp.z);
      const prev = track.waypoints[(wpIndex - 1 + track.waypoints.length) % track.waypoints.length];
      const next = track.waypoints[(wpIndex + 1) % track.waypoints.length];
      const tangent = normalize2({ x: next.x - prev.x, z: next.z - prev.z });
      const yaw = Math.atan2(tangent.x, tangent.z);
      const halfSpan = Math.min(cp.radius * 0.9, (track.waypoints[wpIndex]?.width ?? cp.radius * 2) * 0.42);

      const gate = new THREE.Group();
      gate.position.set(cp.x, 0, cp.z);
      gate.rotation.y = yaw;

      const postMat = i === 0 ? startMat : gateMat;
      const capMat = i === 0 ? stripeMat : accentMat;

      const leftPost = new THREE.Mesh(postGeo, postMat);
      leftPost.position.set(-halfSpan, 1.7, 0);
      gate.add(leftPost);

      const rightPost = new THREE.Mesh(postGeo, postMat);
      rightPost.position.set(halfSpan, 1.7, 0);
      gate.add(rightPost);

      const beam = new THREE.Mesh(beamGeo, postMat);
      beam.scale.x = halfSpan * 2 + 0.42;
      beam.position.set(0, 3.25, 0);
      gate.add(beam);

      const leftCap = new THREE.Mesh(capGeo, capMat);
      leftCap.position.set(-halfSpan, 3.55, 0);
      gate.add(leftCap);

      const rightCap = new THREE.Mesh(capGeo, capMat);
      rightCap.position.set(halfSpan, 3.55, 0);
      gate.add(rightCap);

      const floorStripe = new THREE.Mesh(floorStripeGeo, i === 0 ? startMat : stripeMat);
      floorStripe.scale.x = halfSpan * 2 + 0.8;
      floorStripe.position.set(0, 0.05, 0);
      gate.add(floorStripe);

      group.add(gate);
    }

    return group;
  }

  private createTracksideTown(track: TrackDefinition): THREE.Group {
    const group = new THREE.Group();
    group.name = 'trackside-town';

    const palette = [0xf4a261, 0xe76f51, 0x8ecae6, 0x90be6d, 0xffd166, 0xbdb2ff];
    const roofPalette = [0x5f4b3b, 0x3d405b, 0x7a3e2b, 0x6c584c];
    const padMat = new THREE.MeshStandardMaterial({ color: 0x6f8a7d, flatShading: true, roughness: 1 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xdad7cd, flatShading: true, roughness: 1 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0xfff1bf, emissive: 0x2f240a, flatShading: true, roughness: 0.6 });
    const roadPropMat = new THREE.MeshStandardMaterial({ color: 0x17313a, flatShading: true, roughness: 0.9 });
    const lampLightMat = new THREE.MeshStandardMaterial({ color: 0xfff0c1, emissive: 0x4a3a12, flatShading: true, roughness: 0.55 });
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x7a4e2f, flatShading: true, roughness: 1 });
    const treeLeafMat = new THREE.MeshStandardMaterial({ color: 0x39b96e, flatShading: true, roughness: 1 });

    const padGeo = new THREE.BoxGeometry(8.6, 0.28, 6.6);
    const curbGeo = new THREE.BoxGeometry(8.95, 0.12, 6.95);
    const lampPoleGeo = new THREE.CylinderGeometry(0.07, 0.09, 2.8, 6);
    const lampArmGeo = new THREE.BoxGeometry(0.7, 0.07, 0.07);
    const lampHeadGeo = new THREE.BoxGeometry(0.24, 0.16, 0.24);
    const treeTrunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1.4, 6);
    const treeLeafGeo = new THREE.ConeGeometry(0.72, 1.55, 6);
    const signPostGeo = new THREE.BoxGeometry(0.1, 0.9, 0.1);
    const signBoardGeo = new THREE.BoxGeometry(1.6, 0.55, 0.08);
    const awningGeo = new THREE.BoxGeometry(1.6, 0.12, 0.8);
    const benchSeatGeo = new THREE.BoxGeometry(0.95, 0.08, 0.3);
    const benchLegGeo = new THREE.BoxGeometry(0.08, 0.28, 0.08);

    const clusterStep = 2;
    for (let i = 0; i < track.waypoints.length; i += clusterStep) {
      const curr = track.waypoints[i];
      const prev = track.waypoints[(i - 1 + track.waypoints.length) % track.waypoints.length];
      const next = track.waypoints[(i + 1) % track.waypoints.length];
      const tangent = normalize2({ x: next.x - prev.x, z: next.z - prev.z });
      const left = perpLeft2(tangent);

      const clusterIndex = Math.floor(i / clusterStep);
      const sideSign = clusterIndex % 2 === 0 ? 1 : -1;
      const baseOffset = curr.width * 0.5 + 5.4 + (clusterIndex % 3) * 1.1;
      const baseX = curr.x + left.x * baseOffset * sideSign;
      const baseZ = curr.z + left.z * baseOffset * sideSign;

      const district = new THREE.Group();
      district.position.set(baseX, 0.04, baseZ);
      district.rotation.y = Math.atan2(tangent.x, tangent.z) + (sideSign > 0 ? 0.12 : -0.12);

      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.y = 0.01;
      district.add(curb);

      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.y = 0.06;
      district.add(pad);

      const buildingCount = 2 + (clusterIndex % 3);
      for (let b = 0; b < buildingCount; b += 1) {
        const bw = 1.25 + ((clusterIndex + b * 2) % 3) * 0.45;
        const bd = 1.15 + ((clusterIndex + b) % 2) * 0.65;
        const bh = 1.4 + ((clusterIndex + b) % 4) * 0.95;
        const lx = -2.7 + b * (2.2 + (b % 2) * 0.4);
        const lz = (b % 2 === 0 ? -1.35 : 1.15) + (clusterIndex % 2 === 0 ? 0.2 : -0.15);

        const bodyMat = new THREE.MeshStandardMaterial({
          color: palette[(clusterIndex + b) % palette.length],
          flatShading: true,
          roughness: 0.92,
        });
        const roofMat = new THREE.MeshStandardMaterial({
          color: roofPalette[(clusterIndex + b) % roofPalette.length],
          flatShading: true,
          roughness: 0.9,
        });

        const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bodyMat);
        body.position.set(lx, 0.06 + bh * 0.5, lz);
        district.add(body);

        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(bw, bd) * 0.55, 0.7, 4), roofMat);
        roof.position.set(lx, 0.06 + bh + 0.35, lz);
        roof.rotation.y = (b % 2) * (Math.PI * 0.25);
        district.add(roof);

        const awning = new THREE.Mesh(
          awningGeo,
          new THREE.MeshStandardMaterial({
            color: palette[(clusterIndex + b + 2) % palette.length],
            flatShading: true,
            roughness: 0.8,
          }),
        );
        awning.position.set(lx, 0.06 + Math.min(1.25, bh * 0.55), lz + bd * 0.5 + 0.28);
        awning.rotation.x = -0.12;
        awning.scale.x = Math.max(0.8, bw / 1.6);
        district.add(awning);

        const windowRows = Math.max(1, Math.floor((bh - 0.5) / 0.9));
        for (let r = 0; r < windowRows; r += 1) {
          const wy = 0.42 + r * 0.82;
          if (wy > bh - 0.3) break;
          const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.3, bw - 0.36), 0.18, 0.04), windowMat);
          frontWindow.position.set(lx, 0.06 + wy, lz + bd * 0.5 + 0.03);
          district.add(frontWindow);
        }
      }

      const lampOffsets = [-3.7, 3.3] as const;
      for (const lx of lampOffsets) {
        const lamp = new THREE.Group();
        lamp.position.set(lx, 0.08, 2.45);

        const pole = new THREE.Mesh(lampPoleGeo, roadPropMat);
        pole.position.y = 1.4;
        lamp.add(pole);

        const arm = new THREE.Mesh(lampArmGeo, roadPropMat);
        arm.position.set(sideSign > 0 ? -0.28 : 0.28, 2.72, 0);
        lamp.add(arm);

        const head = new THREE.Mesh(lampHeadGeo, lampLightMat);
        head.position.set(sideSign > 0 ? -0.56 : 0.56, 2.62, 0);
        lamp.add(head);

        district.add(lamp);
      }

      const sign = new THREE.Group();
      sign.position.set(0, 0.08, -2.55);
      const signLeft = new THREE.Mesh(signPostGeo, roadPropMat);
      signLeft.position.set(-0.6, 0.45, 0);
      sign.add(signLeft);
      const signRight = new THREE.Mesh(signPostGeo, roadPropMat);
      signRight.position.set(0.6, 0.45, 0);
      sign.add(signRight);
      const signBoard = new THREE.Mesh(
        signBoardGeo,
        new THREE.MeshStandardMaterial({
          color: clusterIndex % 2 === 0 ? 0x1f8ef1 : 0xff7f50,
          flatShading: true,
          roughness: 0.82,
        }),
      );
      signBoard.position.y = 0.84;
      sign.add(signBoard);
      district.add(sign);

      const bench = new THREE.Group();
      bench.position.set(2.8, 0.08, -2.0);
      const seat = new THREE.Mesh(benchSeatGeo, roadPropMat);
      seat.position.y = 0.36;
      bench.add(seat);
      const back = new THREE.Mesh(benchSeatGeo, roadPropMat);
      back.position.set(0, 0.6, -0.11);
      back.rotation.x = -0.35;
      bench.add(back);
      for (const lx of [-0.34, 0.34] as const) {
        const legA = new THREE.Mesh(benchLegGeo, roadPropMat);
        legA.position.set(lx, 0.16, -0.08);
        bench.add(legA);
        const legB = new THREE.Mesh(benchLegGeo, roadPropMat);
        legB.position.set(lx, 0.16, 0.08);
        bench.add(legB);
      }
      district.add(bench);

      const tree = new THREE.Group();
      tree.position.set(-3.2, 0.08, -2.0);
      const trunk = new THREE.Mesh(treeTrunkGeo, treeTrunkMat);
      trunk.position.y = 0.7;
      tree.add(trunk);
      for (let l = 0; l < 2; l += 1) {
        const leaf = new THREE.Mesh(treeLeafGeo, treeLeafMat);
        leaf.position.y = 1.55 + l * 0.45;
        leaf.scale.set(1 - l * 0.15, 1 - l * 0.1, 1 - l * 0.15);
        tree.add(leaf);
      }
      district.add(tree);

      group.add(district);
    }

    return group;
  }

  private createFestivalBunting(track: TrackDefinition): THREE.Group {
    const group = new THREE.Group();
    group.name = 'festival-bunting';

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x18333a, flatShading: true, roughness: 0.92 });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xf6f1d8, flatShading: true, roughness: 0.9 });
    const flagColors = [0xff6b6b, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xb5179e];

    const poleGeo = new THREE.CylinderGeometry(0.09, 0.11, 3.6, 6);
    const ropeGeo = new THREE.BoxGeometry(1, 0.04, 0.04);
    const flagGeo = new THREE.ConeGeometry(0.22, 0.38, 3);
    flagGeo.rotateX(Math.PI / 2);

    const cpIndices = [1, 2, 4];
    for (const cpIndex of cpIndices) {
      if (cpIndex >= track.checkpoints.length) continue;
      const cp = track.checkpoints[cpIndex];
      const wpIndex = this.findNearestWaypointIndex(track, cp.x, cp.z);
      const prev = track.waypoints[(wpIndex - 1 + track.waypoints.length) % track.waypoints.length];
      const next = track.waypoints[(wpIndex + 1) % track.waypoints.length];
      const tangent = normalize2({ x: next.x - prev.x, z: next.z - prev.z });
      const left = perpLeft2(tangent);
      const yaw = Math.atan2(tangent.x, tangent.z);
      const width = track.waypoints[wpIndex]?.width ?? 10;
      const halfSpan = width * 0.5 + 1.7;

      const fest = new THREE.Group();
      fest.position.set(cp.x, 0.08, cp.z);
      fest.rotation.y = yaw;

      for (const side of [-1, 1] as const) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(side * halfSpan, 1.8, 0);
        fest.add(pole);

        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 5), ropeMat);
        cap.position.set(side * halfSpan, 3.75, 0);
        fest.add(cap);
      }

      const rope = new THREE.Mesh(ropeGeo, ropeMat);
      rope.scale.x = halfSpan * 2;
      rope.position.set(0, 3.25, 0);
      fest.add(rope);

      const rope2 = new THREE.Mesh(ropeGeo, ropeMat);
      rope2.scale.x = halfSpan * 1.8;
      rope2.position.set(0, 2.9, 0.55);
      fest.add(rope2);

      const flagCount = 8;
      for (let i = 0; i < flagCount; i += 1) {
        const t = (i + 0.5) / flagCount;
        const x = -halfSpan + t * (halfSpan * 2);
        const flag = new THREE.Mesh(
          flagGeo,
          new THREE.MeshStandardMaterial({
            color: flagColors[(cpIndex + i) % flagColors.length],
            flatShading: true,
            roughness: 0.82,
          }),
        );
        flag.position.set(x, 3.05 - Math.sin(t * Math.PI) * 0.22, 0.02);
        flag.rotation.z = i % 2 === 0 ? 0.1 : -0.1;
        fest.add(flag);
      }

      group.add(fest);
    }

    return group;
  }

  private createPlayfulLandmarks(track: TrackDefinition): THREE.Group {
    const group = new THREE.Group();
    group.name = 'playful-landmarks';

    const ferrisAnchor = this.getTracksideAnchor(track, 5, 1, 15.5);
    const ferris = this.createFerrisWheelLandmark();
    ferris.position.set(ferrisAnchor.x, 0.08, ferrisAnchor.z);
    ferris.rotation.y = ferrisAnchor.yaw + 0.6;
    group.add(ferris);

    const marketAnchor = this.getTracksideAnchor(track, 14, -1, 14.4);
    const market = this.createFoodTruckPlaza();
    market.position.set(marketAnchor.x, 0.08, marketAnchor.z);
    market.rotation.y = marketAnchor.yaw - 0.25;
    group.add(market);

    const mascotAnchor = this.getTracksideAnchor(track, 22, 1, 16.5);
    const mascot = this.createMascotPlaza();
    mascot.position.set(mascotAnchor.x, 0.08, mascotAnchor.z);
    mascot.rotation.y = mascotAnchor.yaw + 0.15;
    group.add(mascot);

    const starAnchor = this.getTracksideAnchor(track, 26, -1, 13.5);
    const starSign = this.createArcadeStarSign();
    starSign.position.set(starAnchor.x, 0.08, starAnchor.z);
    starSign.rotation.y = starAnchor.yaw + Math.PI * 0.9;
    group.add(starSign);

    return group;
  }

  private createFerrisWheelLandmark(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'ferris-wheel';

    const steelMat = new THREE.MeshStandardMaterial({ color: 0x46616b, flatShading: true, roughness: 0.92 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x4cc9f0, flatShading: true, roughness: 0.82 });
    const warmMat = new THREE.MeshStandardMaterial({ color: 0xffd166, flatShading: true, roughness: 0.82 });
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xff6b9f, flatShading: true, roughness: 0.82 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x8bb39a, flatShading: true, roughness: 1 });

    const pad = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.28, 8.4), baseMat);
    pad.position.y = 0.14;
    root.add(pad);

    const supportGeo = new THREE.BoxGeometry(0.34, 5.4, 0.34);
    const supportL = new THREE.Mesh(supportGeo, steelMat);
    supportL.position.set(-1.55, 2.9, 0);
    supportL.rotation.z = 0.23;
    root.add(supportL);
    const supportR = new THREE.Mesh(supportGeo, steelMat);
    supportR.position.set(1.55, 2.9, 0);
    supportR.rotation.z = -0.23;
    root.add(supportR);

    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.9, 8), steelMat);
    axle.rotation.z = Math.PI / 2;
    axle.position.y = 5.1;
    root.add(axle);

    const wheel = new THREE.Group();
    wheel.position.y = 5.1;
    root.add(wheel);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.14, 8, 24), accentMat);
    ring.rotation.y = Math.PI / 2;
    wheel.add(ring);

    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.09, 8, 18), steelMat);
    innerRing.rotation.y = Math.PI / 2;
    wheel.add(innerRing);

    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.05), steelMat);
      spoke.position.set(Math.cos(angle) * 1.52, Math.sin(angle) * 1.52, 0);
      spoke.rotation.z = angle;
      wheel.add(spoke);

      const cabin = new THREE.Group();
      cabin.position.set(Math.cos(angle) * 3.15, Math.sin(angle) * 3.15, 0);
      const cabinColor = i % 2 === 0 ? warmMat : pinkMat;
      const cabinBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.38, 0.62), cabinColor);
      cabinBody.position.y = -0.24;
      cabin.add(cabinBody);
      const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.68), steelMat);
      cabinRoof.position.y = 0.02;
      cabin.add(cabinRoof);
      wheel.add(cabin);
    }

    const booth = new THREE.Group();
    booth.position.set(-3.2, 0.14, 2.35);
    const boothBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.2, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xffb703, flatShading: true, roughness: 0.84 }),
    );
    boothBody.position.y = 0.74;
    booth.add(boothBody);
    const boothRoof = new THREE.Mesh(
      new THREE.ConeGeometry(1.25, 0.72, 4),
      new THREE.MeshStandardMaterial({ color: 0xe76f51, flatShading: true, roughness: 0.84 }),
    );
    boothRoof.position.y = 1.8;
    boothRoof.rotation.y = 0.5;
    booth.add(boothRoof);
    root.add(booth);

    return root;
  }

  private createFoodTruckPlaza(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'food-truck-plaza';

    const pavementMat = new THREE.MeshStandardMaterial({ color: 0x80948c, flatShading: true, roughness: 1 });
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, flatShading: true, roughness: 0.9 });
    const truckBodyMat = new THREE.MeshStandardMaterial({ color: 0xff7f50, flatShading: true, roughness: 0.85 });
    const truckCabMat = new THREE.MeshStandardMaterial({ color: 0x4cc9f0, flatShading: true, roughness: 0.82 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x18333a, flatShading: true, roughness: 0.92 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0xffefb0, emissive: 0x3e2e0b, flatShading: true, roughness: 0.6 });
    const umbrellaPoleMat = new THREE.MeshStandardMaterial({ color: 0x5a6770, flatShading: true, roughness: 0.9 });
    const umbrellaColors = [0xffd166, 0x06d6a0, 0x4cc9f0, 0xff6b6b];

    const pad = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.22, 8.8), pavementMat);
    pad.position.y = 0.11;
    root.add(pad);

    for (const [x, z] of [[-2.4, -2.6], [2.4, -2.6], [-2.4, 2.6], [2.4, 2.6]] as const) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 0.12), lineMat);
      line.position.set(x, 0.23, z);
      root.add(line);
    }

    const truck = new THREE.Group();
    truck.position.set(0.8, 0.15, 0.4);
    const truckBody = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.55, 1.85), truckBodyMat);
    truckBody.position.set(-0.3, 0.9, 0);
    truck.add(truckBody);
    const truckCab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.25, 1.75), truckCabMat);
    truckCab.position.set(1.75, 0.76, 0);
    truck.add(truckCab);
    const roofSign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.32), lineMat);
    roofSign.position.set(0.25, 1.86, 0);
    truck.add(roofSign);
    const serviceWindow = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 0.05), windowMat);
    serviceWindow.position.set(-0.45, 1.02, 0.96);
    truck.add(serviceWindow);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.12, 0.82), lineMat);
    awning.position.set(-0.45, 1.42, 1.35);
    awning.rotation.x = -0.14;
    truck.add(awning);
    for (const [x, z] of [[-1.35, 0.88], [0.2, 0.88], [1.75, 0.88], [-1.35, -0.88], [1.75, -0.88]] as const) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 8), trimMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.33, z);
      truck.add(wheel);
    }
    root.add(truck);

    for (let i = 0; i < 3; i += 1) {
      const x = -3.4 + i * 2.2;
      const z = 2.1 - (i % 2) * 1.6;
      const umbrella = new THREE.Group();
      umbrella.position.set(x, 0.15, z);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 6), umbrellaPoleMat);
      pole.position.y = 0.7;
      umbrella.add(pole);

      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.95, 0.55, 7),
        new THREE.MeshStandardMaterial({ color: umbrellaColors[i % umbrellaColors.length], flatShading: true, roughness: 0.82 }),
      );
      cap.position.y = 1.42;
      umbrella.add(cap);

      const table = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 8), lineMat);
      table.position.y = 0.8;
      umbrella.add(table);

      for (const stoolOffset of [-0.55, 0.55] as const) {
        const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.38, 6), trimMat);
        stool.position.set(stoolOffset, 0.34, 0.18);
        umbrella.add(stool);
      }
      root.add(umbrella);
    }

    return root;
  }

  private createMascotPlaza(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'mascot-plaza';

    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(4.8, 5.2, 0.36, 12),
      new THREE.MeshStandardMaterial({ color: 0x8fa69a, flatShading: true, roughness: 1 }),
    );
    plaza.position.y = 0.18;
    root.add(plaza);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffd166, flatShading: true, roughness: 0.82 });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xf77f00, flatShading: true, roughness: 0.8 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1d1d1d, flatShading: true, roughness: 0.7 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xffc84a, flatShading: true, roughness: 0.85 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 9), bodyMat);
    body.scale.set(1.25, 1, 1.05);
    body.position.set(0, 1.95, 0);
    root.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8), bodyMat);
    head.position.set(0, 3.45, 0.5);
    root.add(head);

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.95, 5), beakMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 3.3, 1.5);
    root.add(beak);

    for (const x of [-0.34, 0.34] as const) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), eyeMat);
      eye.position.set(x, 3.65, 1.15);
      root.add(eye);
    }

    const wingL = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), wingMat);
    wingL.scale.set(0.7, 0.45, 1.15);
    wingL.position.set(-1.6, 2.2, 0.25);
    root.add(wingL);
    const wingR = wingL.clone();
    wingR.position.x = 1.6;
    root.add(wingR);

    const floatRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.5, 0.32, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xff6b6b, flatShading: true, roughness: 0.78 }),
    );
    floatRing.rotation.x = Math.PI / 2;
    floatRing.position.y = 1.6;
    root.add(floatRing);

    for (let i = 0; i < 5; i += 1) {
      const confetti = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.04, 0.38),
        new THREE.MeshStandardMaterial({
          color: [0x06d6a0, 0x4cc9f0, 0xffd166, 0xb5179e, 0xff7f50][i],
          flatShading: true,
          roughness: 0.8,
        }),
      );
      const angle = (i / 5) * Math.PI * 2;
      confetti.position.set(Math.cos(angle) * 3.4, 0.42, Math.sin(angle) * 3.2);
      confetti.rotation.y = angle;
      root.add(confetti);
    }

    return root;
  }

  private createArcadeStarSign(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'arcade-star-sign';

    const postMat = new THREE.MeshStandardMaterial({ color: 0x20363d, flatShading: true, roughness: 0.92 });
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x7b2cbf, flatShading: true, roughness: 0.82 });
    const neonMat = new THREE.MeshStandardMaterial({ color: 0x80ffdb, emissive: 0x123a2f, flatShading: true, roughness: 0.65 });
    const warmMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x3f2f0a, flatShading: true, roughness: 0.65 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x88a79b, flatShading: true, roughness: 1 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.28, 3.4), baseMat);
    base.position.y = 0.14;
    root.add(base);

    for (const x of [-1.35, 1.35] as const) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.2, 0.22), postMat);
      post.position.set(x, 1.74, 0);
      root.add(post);
    }

    const plate = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.9, 0.22), plateMat);
    plate.position.set(0, 3.08, 0);
    root.add(plate);

    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.18, 0.08), neonMat);
    bar.position.set(0, 3.45, 0.16);
    root.add(bar);

    for (let i = 0; i < 5; i += 1) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 + (i % 2) * 0.05, 0), i % 2 === 0 ? warmMat : neonMat);
      star.position.set(-1.5 + i * 0.75, 2.78 + (i % 2) * 0.14, 0.16);
      root.add(star);
    }

    const arrow = new THREE.Group();
    arrow.position.set(0.55, 2.92, 0.18);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.2, 0.08), warmMat);
    shaft.position.x = -0.15;
    arrow.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.58, 3), warmMat);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 0.85;
    arrow.add(tip);
    root.add(arrow);

    const kiosk = new THREE.Group();
    kiosk.position.set(-1.4, 0.14, -0.85);
    const kioskBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 1.15, 1.25),
      new THREE.MeshStandardMaterial({ color: 0xf4a261, flatShading: true, roughness: 0.83 }),
    );
    kioskBody.position.y = 0.72;
    kiosk.add(kioskBody);
    const kioskRoof = new THREE.Mesh(
      new THREE.ConeGeometry(1.0, 0.62, 4),
      new THREE.MeshStandardMaterial({ color: 0xe76f51, flatShading: true, roughness: 0.85 }),
    );
    kioskRoof.position.y = 1.62;
    kioskRoof.rotation.y = 0.4;
    kiosk.add(kioskRoof);
    root.add(kiosk);

    return root;
  }

  private getTracksideAnchor(
    track: TrackDefinition,
    waypointIndex: number,
    sideSign: 1 | -1,
    lateralOffset: number,
    forwardOffset = 0,
  ): { x: number; z: number; yaw: number } {
    const count = track.waypoints.length;
    const idx = ((waypointIndex % count) + count) % count;
    const curr = track.waypoints[idx];
    const prev = track.waypoints[(idx - 1 + count) % count];
    const next = track.waypoints[(idx + 1) % count];
    const tangent = normalize2({ x: next.x - prev.x, z: next.z - prev.z });
    const left = perpLeft2(tangent);
    return {
      x: curr.x + left.x * lateralOffset * sideSign + tangent.x * forwardOffset,
      z: curr.z + left.z * lateralOffset * sideSign + tangent.z * forwardOffset,
      yaw: Math.atan2(tangent.x, tangent.z),
    };
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

  private findNearestWaypointIndex(track: TrackDefinition, x: number, z: number): number {
    let bestIndex = 0;
    let bestDistSq = Number.POSITIVE_INFINITY;
    for (let i = 0; i < track.waypoints.length; i += 1) {
      const wp = track.waypoints[i];
      const dx = wp.x - x;
      const dz = wp.z - z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestIndex = i;
      }
    }
    return bestIndex;
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
