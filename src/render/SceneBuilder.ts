import * as THREE from 'three';
import { normalize2, perpLeft2 } from '../core/math';
import type { TrackDefinition } from '../types/game';

export class SceneBuilder {
  buildScene(scene: THREE.Scene, track: TrackDefinition): void {
    scene.clear();
    scene.background = this.getSkyColor(track.theme);
    scene.fog = new THREE.Fog(this.getFogColor(track.theme), 120, 320);

    const hemi = new THREE.HemisphereLight(this.getSkyLightColor(track.theme), this.getGroundLightColor(track.theme), 1.0);
    hemi.position.set(0, 100, 0);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(this.getSunColor(track.theme), 1.12);
    sun.position.set(40, 60, 20);
    scene.add(sun);

    scene.add(this.createThemeBase(track));
    scene.add(this.createRoad(track, track.theme));
    scene.add(this.createRoadEdge(track, track.theme));
    scene.add(this.createStartLine(track));
    scene.add(this.createCenterMarkers(track));
    scene.add(this.createRouteChevrons(track));
    scene.add(this.createCheckpointGates(track));
    scene.add(this.createLapZoneGuides(track));
    scene.add(this.createCornerWarningSignals(track));
    scene.add(this.createSpeedShadowFrames(track));
    scene.add(this.createZoneLandmarkSet(track));
    scene.add(this.createThemeLandmarks(track));

    const decoGroup = new THREE.Group();
    decoGroup.name = 'deco';
    this.populateThemeDeco(decoGroup, track);
    decoGroup.add(this.createTracksideObjectField(track));
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

  private getSkyColor(theme: TrackDefinition['theme']): THREE.Color {
    switch (theme) {
      case 'raceway':
        return new THREE.Color(0x92d7ff);
      case 'desert':
        return new THREE.Color(0xf4cd95);
      case 'forest':
        return new THREE.Color(0xa8d8b5);
      case 'studio':
        return new THREE.Color(0x9aa6be);
      case 'coastal':
      default:
        return new THREE.Color(0x93dcff);
    }
  }

  private getFogColor(theme: TrackDefinition['theme']): THREE.Color {
    switch (theme) {
      case 'raceway':
        return new THREE.Color(0xb9dff5);
      case 'desert':
        return new THREE.Color(0xd7b98a);
      case 'forest':
        return new THREE.Color(0x9bb59f);
      case 'studio':
        return new THREE.Color(0xa3adbb);
      case 'coastal':
      default:
        return new THREE.Color(0xb4e5ff);
    }
  }

  private getSkyLightColor(theme: TrackDefinition['theme']): number {
    switch (theme) {
      case 'desert':
        return 0xffe1b1;
      case 'forest':
        return 0xc4e8c8;
      case 'studio':
        return 0xd7def3;
      case 'raceway':
        return 0xd6eeff;
      case 'coastal':
      default:
        return 0xd6f4ff;
    }
  }

  private getGroundLightColor(theme: TrackDefinition['theme']): number {
    switch (theme) {
      case 'desert':
        return 0x9a7a43;
      case 'forest':
        return 0x4d6a45;
      case 'studio':
        return 0x5a5f70;
      case 'raceway':
        return 0x607350;
      case 'coastal':
      default:
        return 0x6e7f4c;
    }
  }

  private getSunColor(theme: TrackDefinition['theme']): number {
    switch (theme) {
      case 'studio':
        return 0xf4f6ff;
      case 'forest':
        return 0xffefc8;
      case 'desert':
        return 0xffdfab;
      case 'raceway':
      case 'coastal':
      default:
        return 0xfff2c2;
    }
  }

  private getRoadColor(theme: TrackDefinition['theme']): number {
    switch (theme) {
      case 'desert':
        return 0x4a4138;
      case 'forest':
        return 0x384043;
      case 'studio':
        return 0x434b5b;
      case 'raceway':
        return 0x2f353c;
      case 'coastal':
      default:
        return 0x3c4752;
    }
  }

  private getRoadEdgeColor(theme: TrackDefinition['theme']): number {
    switch (theme) {
      case 'desert':
        return 0xf3d7a6;
      case 'forest':
        return 0xd7e8cd;
      case 'studio':
        return 0xe3e5ea;
      case 'raceway':
        return 0xffe7c4;
      case 'coastal':
      default:
        return 0xfff6d8;
    }
  }

  private createThemeBase(track: TrackDefinition): THREE.Group {
    const group = new THREE.Group();

    switch (track.theme) {
      case 'raceway': {
        const outer = new THREE.Mesh(
          new THREE.CircleGeometry(240, 64),
          new THREE.MeshStandardMaterial({ color: 0x7d875c, flatShading: true, roughness: 1 }),
        );
        outer.rotation.x = -Math.PI / 2;
        outer.position.y = -2.6;
        group.add(outer);

        const infield = new THREE.Mesh(
          new THREE.CircleGeometry(190, 56),
          new THREE.MeshStandardMaterial({ color: 0x5da048, flatShading: true, roughness: 1 }),
        );
        infield.rotation.x = -Math.PI / 2;
        infield.position.y = -1.9;
        group.add(infield);
        break;
      }
      case 'desert': {
        const sand = new THREE.Mesh(
          new THREE.CircleGeometry(250, 60),
          new THREE.MeshStandardMaterial({ color: 0xd6b37b, flatShading: true, roughness: 1 }),
        );
        sand.rotation.x = -Math.PI / 2;
        sand.position.y = -2.4;
        group.add(sand);

        const dune = new THREE.Mesh(
          new THREE.CircleGeometry(180, 44),
          new THREE.MeshStandardMaterial({ color: 0xc69c62, flatShading: true, roughness: 1 }),
        );
        dune.rotation.x = -Math.PI / 2;
        dune.position.y = -1.8;
        group.add(dune);
        break;
      }
      case 'forest': {
        const meadow = new THREE.Mesh(
          new THREE.CircleGeometry(240, 64),
          new THREE.MeshStandardMaterial({ color: 0x4f8f4e, flatShading: true, roughness: 1 }),
        );
        meadow.rotation.x = -Math.PI / 2;
        meadow.position.y = -2.5;
        group.add(meadow);

        const soil = new THREE.Mesh(
          new THREE.CircleGeometry(172, 52),
          new THREE.MeshStandardMaterial({ color: 0x6d6048, flatShading: true, roughness: 1 }),
        );
        soil.rotation.x = -Math.PI / 2;
        soil.position.y = -2.0;
        group.add(soil);
        break;
      }
      case 'studio': {
        const slab = new THREE.Mesh(
          new THREE.CircleGeometry(235, 56),
          new THREE.MeshStandardMaterial({ color: 0x727984, flatShading: true, roughness: 0.96 }),
        );
        slab.rotation.x = -Math.PI / 2;
        slab.position.y = -2.45;
        group.add(slab);

        const lot = new THREE.Mesh(
          new THREE.CircleGeometry(178, 40),
          new THREE.MeshStandardMaterial({ color: 0x5e6672, flatShading: true, roughness: 0.95 }),
        );
        lot.rotation.x = -Math.PI / 2;
        lot.position.y = -1.95;
        group.add(lot);
        break;
      }
      case 'coastal':
      default: {
        const sea = new THREE.Mesh(
          new THREE.CircleGeometry(220, 48),
          new THREE.MeshStandardMaterial({ color: 0x2d8fd6, flatShading: true, roughness: 0.65, metalness: 0.05 }),
        );
        sea.rotation.x = -Math.PI / 2;
        sea.position.y = -2.8;
        group.add(sea);

        const sand = new THREE.Mesh(
          new THREE.CylinderGeometry(82, 94, 3.8, 28, 1),
          new THREE.MeshStandardMaterial({ color: 0xeccf84, flatShading: true, roughness: 1 }),
        );
        sand.position.y = -1.98;
        group.add(sand);

        const grass = new THREE.Mesh(
          new THREE.CylinderGeometry(68, 74, 2.4, 24, 1),
          new THREE.MeshStandardMaterial({ color: 0x4dbd52, flatShading: true, roughness: 1 }),
        );
        grass.position.y = -1.24;
        group.add(grass);
      }
    }

    return group;
  }

  private createThemeLandmarks(track: TrackDefinition): THREE.Group {
    if (track.theme === 'coastal') {
      const coastal = new THREE.Group();
      coastal.add(this.createTracksideTown(track));
      coastal.add(this.createFestivalBunting(track));
      coastal.add(this.createPlayfulLandmarks(track));
      return coastal;
    }

    switch (track.theme) {
      case 'raceway':
        return this.createRacewayLandmarks(track);
      case 'desert':
        return this.createDesertLandmarks(track);
      case 'forest':
        return this.createForestLandmarks(track);
      case 'studio':
        return this.createStudioLandmarks(track);
      default:
        return new THREE.Group();
    }
  }

  private populateThemeDeco(group: THREE.Group, track: TrackDefinition): void {
    switch (track.theme) {
      case 'raceway':
        this.populateRacewayDeco(group, track);
        break;
      case 'desert':
        this.populateDesertDeco(group, track);
        break;
      case 'forest':
        this.populateForestDeco(group, track);
        break;
      case 'studio':
        this.populateStudioDeco(group, track);
        break;
      case 'coastal':
      default:
        this.populateCoastalDeco(group);
        break;
    }
  }

  private createRoad(track: TrackDefinition, theme: TrackDefinition['theme']): THREE.Mesh {
    const geometry = this.buildRibbonGeometry(track, 0);
    const material = new THREE.MeshStandardMaterial({
      color: this.getRoadColor(theme),
      flatShading: true,
      roughness: 0.95,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.02;
    mesh.name = 'RoadMesh';
    mesh.renderOrder = 1;
    return mesh;
  }

  private createRoadEdge(track: TrackDefinition, theme: TrackDefinition['theme']): THREE.Mesh {
    const geometry = this.buildRibbonGeometry(track, 0.9);
    const material = new THREE.MeshStandardMaterial({
      color: this.getRoadEdgeColor(theme),
      flatShading: true,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.015;
    mesh.scale.set(1.024, 1, 1.024);
    mesh.renderOrder = 2;
    return mesh;
  }

  private createStartLine(track: TrackDefinition): THREE.Mesh {
    const start = track.waypoints[0];
    const next = track.waypoints[1] ?? track.waypoints[0];
    const tangent = normalize2({ x: next.x - start.x, z: next.z - start.z });
    const normal = perpLeft2(tangent);
    const width = start.width * 0.5;

    const geometry = new THREE.PlaneGeometry(width * 2, 1.2);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -3,
    });
    const line = new THREE.Mesh(geometry, material);
    line.rotation.x = -Math.PI / 2;
    line.position.set(start.x, 0.04, start.z);
    line.rotation.z = Math.atan2(normal.z, normal.x);
    line.renderOrder = 3;
    return line;
  }

  private createCenterMarkers(track: TrackDefinition): THREE.Group {
    const group = new THREE.Group();
    group.name = 'center-markers';
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfff4d6,
      flatShading: true,
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -3,
    });
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
        marker.renderOrder = 4;
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

  private createRacewayLandmarks(track: TrackDefinition): THREE.Group {
    const root = new THREE.Group();
    root.name = 'raceway-landmarks';

    for (const idx of [2, 11, 20, 30, 38]) {
      const anchor = this.getTracksideAnchor(track, idx, idx % 2 === 0 ? 1 : -1, 18);
      const stand = new THREE.Group();
      stand.position.set(anchor.x, 0.08, anchor.z);
      stand.rotation.y = anchor.yaw + (idx % 2 === 0 ? 0.2 : -0.2);

      const base = new THREE.Mesh(
        new THREE.BoxGeometry(10.5, 0.5, 3.8),
        new THREE.MeshStandardMaterial({ color: 0x5c646e, flatShading: true, roughness: 0.95 }),
      );
      base.position.y = 0.25;
      stand.add(base);

      for (let r = 0; r < 4; r += 1) {
        const row = new THREE.Mesh(
          new THREE.BoxGeometry(10.0 - r * 1.2, 0.55, 0.72),
          new THREE.MeshStandardMaterial({ color: r % 2 === 0 ? 0x247ba0 : 0xffb703, flatShading: true, roughness: 0.85 }),
        );
        row.position.set(0, 0.64 + r * 0.42, -1.35 + r * 0.62);
        stand.add(row);
      }

      const banner = new THREE.Mesh(
        new THREE.BoxGeometry(5.2, 1.1, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xff5d73, flatShading: true, roughness: 0.82 }),
      );
      banner.position.set(0, 3.15, 0.95);
      stand.add(banner);
      root.add(stand);
    }

    root.add(this.createRacewayMegaObjects(track));

    return root;
  }

  private createDesertLandmarks(track: TrackDefinition): THREE.Group {
    const root = new THREE.Group();
    root.name = 'desert-landmarks';

    for (const idx of [4, 13, 22, 31, 40]) {
      const anchor = this.getTracksideAnchor(track, idx, idx % 2 === 0 ? 1 : -1, 20);
      const outpost = new THREE.Group();
      outpost.position.set(anchor.x, 0.08, anchor.z);
      outpost.rotation.y = anchor.yaw;

      const base = new THREE.Mesh(
        new THREE.BoxGeometry(6.4, 0.3, 5.4),
        new THREE.MeshStandardMaterial({ color: 0xb38a57, flatShading: true, roughness: 1 }),
      );
      base.position.y = 0.15;
      outpost.add(base);

      const hut = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 1.8, 2.6),
        new THREE.MeshStandardMaterial({ color: 0xd0ab72, flatShading: true, roughness: 0.95 }),
      );
      hut.position.set(-0.8, 1.05, 0.4);
      outpost.add(hut);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(2.1, 1.2, 4),
        new THREE.MeshStandardMaterial({ color: 0x9a6f3f, flatShading: true, roughness: 0.95 }),
      );
      roof.position.set(-0.8, 2.55, 0.4);
      roof.rotation.y = 0.8;
      outpost.add(roof);

      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(1.6, 0.18, 8, 18, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x8a6138, flatShading: true, roughness: 0.96 }),
      );
      arch.position.set(1.8, 1.4, 0.1);
      arch.rotation.z = Math.PI;
      outpost.add(arch);

      root.add(outpost);
    }

    root.add(this.createDesertMegaObjects(track));

    return root;
  }

  private createForestLandmarks(track: TrackDefinition): THREE.Group {
    const root = new THREE.Group();
    root.name = 'forest-landmarks';

    for (const idx of [3, 10, 17, 24, 32, 41]) {
      const anchor = this.getTracksideAnchor(track, idx, idx % 2 === 0 ? 1 : -1, 18.5);
      const camp = new THREE.Group();
      camp.position.set(anchor.x, 0.08, anchor.z);
      camp.rotation.y = anchor.yaw + 0.1;

      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(5.8, 0.22, 4.6),
        new THREE.MeshStandardMaterial({ color: 0x6f6047, flatShading: true, roughness: 1 }),
      );
      deck.position.y = 0.11;
      camp.add(deck);

      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(2.9, 1.6, 2.6),
        new THREE.MeshStandardMaterial({ color: 0x8a7255, flatShading: true, roughness: 0.96 }),
      );
      cabin.position.set(-0.8, 0.92, 0.2);
      camp.add(cabin);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(1.95, 1.05, 4),
        new THREE.MeshStandardMaterial({ color: 0x45553f, flatShading: true, roughness: 0.95 }),
      );
      roof.position.set(-0.8, 2.15, 0.2);
      roof.rotation.y = 0.8;
      camp.add(roof);

      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.58, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xdec06f, flatShading: true, roughness: 0.88 }),
      );
      sign.position.set(1.6, 1.05, 0.5);
      camp.add(sign);

      root.add(camp);
    }

    root.add(this.createForestMegaObjects(track));

    return root;
  }

  private createStudioLandmarks(track: TrackDefinition): THREE.Group {
    const root = new THREE.Group();
    root.name = 'studio-landmarks';

    for (const idx of [1, 9, 16, 23, 31, 39]) {
      const anchor = this.getTracksideAnchor(track, idx, idx % 2 === 0 ? 1 : -1, 18);
      const stage = new THREE.Group();
      stage.position.set(anchor.x, 0.08, anchor.z);
      stage.rotation.y = anchor.yaw;

      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(8.6, 0.3, 5.8),
        new THREE.MeshStandardMaterial({ color: 0x7f8792, flatShading: true, roughness: 0.96 }),
      );
      slab.position.y = 0.15;
      stage.add(slab);

      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(6.2, 3.8, 0.32),
        new THREE.MeshStandardMaterial({ color: 0xb4becb, flatShading: true, roughness: 0.9 }),
      );
      wall.position.set(0, 2.05, -1.9);
      stage.add(wall);

      const truss = new THREE.Mesh(
        new THREE.BoxGeometry(6.8, 0.18, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x3d4656, flatShading: true, roughness: 0.85 }),
      );
      truss.position.set(0, 4.1, -1.6);
      stage.add(truss);

      for (const lx of [-2.2, 0, 2.2] as const) {
        const light = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 0.24, 8),
          new THREE.MeshStandardMaterial({ color: 0xf8f0cf, emissive: 0x41350f, flatShading: true, roughness: 0.7 }),
        );
        light.position.set(lx, 3.85, -1.42);
        light.rotation.x = Math.PI / 2;
        stage.add(light);
      }

      root.add(stage);
    }

    root.add(this.createStudioMegaObjects(track));

    return root;
  }

  private createRacewayMegaObjects(track: TrackDefinition): THREE.Group {
    const root = new THREE.Group();
    root.name = 'raceway-mega';
    const bridgeSpan = this.findRacewayBridgeSpan(track);
    const bridge = new THREE.Group();
    bridge.name = 'raceway-coastal-bridge';
    bridge.position.set(bridgeSpan.center.x, 0.08, bridgeSpan.center.z);
    bridge.rotation.y = bridgeSpan.yaw;
    root.add(bridge);

    const concreteMat = new THREE.MeshStandardMaterial({ color: 0xe7ebef, flatShading: true, roughness: 0.92 });
    const concreteDarkMat = new THREE.MeshStandardMaterial({ color: 0xcfd6de, flatShading: true, roughness: 0.94 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, flatShading: true, roughness: 0.88 });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x63bce7,
      emissive: 0x12384a,
      flatShading: true,
      roughness: 0.48,
      metalness: 0.05,
    });
    const horizonMat = new THREE.MeshStandardMaterial({ color: 0xa6d9f2, flatShading: true, roughness: 0.8 });

    const deckWidth = bridgeSpan.roadWidth + 15;
    const deckLength = bridgeSpan.length + 18;

    const water = new THREE.Mesh(new THREE.PlaneGeometry(deckLength + 120, 180), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -2.86;
    bridge.add(water);

    for (const side of [-1, 1] as const) {
      const horizon = new THREE.Mesh(new THREE.BoxGeometry(deckLength + 140, 1.4, 9), horizonMat);
      horizon.position.set(side * 78, -2.08, 0);
      bridge.add(horizon);
    }

    const deck = new THREE.Mesh(new THREE.BoxGeometry(deckWidth, 0.55, deckLength), concreteMat);
    deck.position.y = -0.22;
    bridge.add(deck);

    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(bridgeSpan.roadWidth + 6.4, 0.18, deckLength - 4), concreteDarkMat);
    shoulder.position.y = -0.01;
    bridge.add(shoulder);

    const railX = deckWidth * 0.5 - 0.55;
    for (const side of [-1, 1] as const) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.25, deckLength), railMat);
      rail.position.set(side * railX, 0.34, 0);
      bridge.add(rail);

      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, deckLength), concreteDarkMat);
      curb.position.set(side * (railX - side * 0.36), 0.06, 0);
      bridge.add(curb);
    }

    const archCount = deckLength > 88 ? 4 : 3;
    const archStep = archCount > 1 ? (deckLength * 0.76) / (archCount - 1) : 0;
    const archStartZ = -deckLength * 0.38;
    const archRadius = deckWidth * 0.5 - 1.3;
    const columnX = archRadius;

    for (let i = 0; i < archCount; i += 1) {
      const z = archStartZ + archStep * i;
      for (const side of [-1, 1] as const) {
        const column = new THREE.Mesh(new THREE.BoxGeometry(1.18, 6.2, 1.35), concreteDarkMat);
        column.position.set(side * columnX, 3.1, z);
        bridge.add(column);
      }

      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(archRadius, 0.38, 8, 26, Math.PI),
        concreteMat,
      );
      arch.position.set(0, 3.1, z);
      arch.scale.y = 0.57;
      bridge.add(arch);
    }

    const shadowFlow = new THREE.Group();
    shadowFlow.name = 'raceway-bridge-shadow-flow';
    const flowData = shadowFlow.userData as {
      shadowFlow?: boolean;
      span?: number;
      speed?: number;
      spacing?: number;
    };
    flowData.shadowFlow = true;
    flowData.span = deckLength * 0.86;
    flowData.speed = 28;
    flowData.spacing = 7;

    const shadowBandGeo = new THREE.PlaneGeometry(bridgeSpan.roadWidth + 5.4, 1.8);
    const shadowBandMat = new THREE.MeshBasicMaterial({
      color: 0x0d1d2a,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    for (let i = 0; i < 11; i += 1) {
      const band = new THREE.Mesh(shadowBandGeo, shadowBandMat);
      band.rotation.x = -Math.PI / 2;
      band.position.y = 0.055;
      (band.userData as { baseOffset?: number }).baseOffset = i * (flowData.spacing ?? 7);
      shadowFlow.add(band);
    }
    bridge.add(shadowFlow);

    return root;
  }

  private createDesertMegaObjects(track: TrackDefinition): THREE.Group {
    const root = new THREE.Group();
    root.name = 'desert-mega';

    const mesaAnchor = this.getTracksideAnchor(track, 12, 1, 31);
    const mesa = new THREE.Group();
    mesa.position.set(mesaAnchor.x, 0.08, mesaAnchor.z);
    mesa.rotation.y = mesaAnchor.yaw + 0.35;

    const mesaBase = new THREE.Mesh(
      new THREE.CylinderGeometry(9.8, 12.4, 6.8, 8),
      new THREE.MeshStandardMaterial({ color: 0xb88953, flatShading: true, roughness: 1 }),
    );
    mesaBase.position.y = 3.4;
    mesa.add(mesaBase);

    const mesaTop = new THREE.Mesh(
      new THREE.CylinderGeometry(6.9, 8.8, 4.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xcfa26a, flatShading: true, roughness: 0.98 }),
    );
    mesaTop.position.y = 8.1;
    mesa.add(mesaTop);

    for (let i = 0; i < 6; i += 1) {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.7, 6.5, 6),
        new THREE.MeshStandardMaterial({ color: 0xa97746, flatShading: true, roughness: 1 }),
      );
      const angle = (i / 6) * Math.PI * 2;
      pillar.position.set(Math.cos(angle) * 7.8, 3.2, Math.sin(angle) * 5.8);
      mesa.add(pillar);
    }
    root.add(mesa);

    const statueAnchor = this.getTracksideAnchor(track, 33, -1, 28);
    const statue = new THREE.Group();
    statue.position.set(statueAnchor.x, 0.08, statueAnchor.z);
    statue.rotation.y = statueAnchor.yaw - 0.2;

    const pedestal = new THREE.Mesh(
      new THREE.BoxGeometry(8.2, 1.1, 8.2),
      new THREE.MeshStandardMaterial({ color: 0x8f673f, flatShading: true, roughness: 0.98 }),
    );
    pedestal.position.y = 0.55;
    statue.add(pedestal);

    const giantCactus = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 2.2, 12.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x4f9758, flatShading: true, roughness: 0.95 }),
    );
    giantCactus.position.y = 7.2;
    statue.add(giantCactus);

    for (const side of [-1, 1] as const) {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.78, 0.9, 5.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x4c8c52, flatShading: true, roughness: 0.95 }),
      );
      arm.position.set(side * 2.6, 8.1, 0.2);
      arm.rotation.z = side * 1.1;
      statue.add(arm);
    }
    root.add(statue);

    return root;
  }

  private createForestMegaObjects(track: TrackDefinition): THREE.Group {
    const root = new THREE.Group();
    root.name = 'forest-mega';

    const treeAnchor = this.getTracksideAnchor(track, 14, -1, 30);
    const giantTree = new THREE.Group();
    giantTree.position.set(treeAnchor.x, 0.08, treeAnchor.z);
    giantTree.rotation.y = treeAnchor.yaw + 0.22;

    const stump = new THREE.Mesh(
      new THREE.CylinderGeometry(2.9, 3.8, 12.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x6f4f35, flatShading: true, roughness: 1 }),
    );
    stump.position.y = 6.25;
    giantTree.add(stump);

    for (let i = 0; i < 4; i += 1) {
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(6.6 - i * 1.1, 5.2, 8),
        new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0x2d8741 : 0x3e9a4f, flatShading: true, roughness: 1 }),
      );
      canopy.position.y = 12.2 + i * 2.8;
      giantTree.add(canopy);
    }
    root.add(giantTree);

    const waterfallAnchor = this.getTracksideAnchor(track, 36, 1, 28);
    const cliff = new THREE.Group();
    cliff.position.set(waterfallAnchor.x, 0.08, waterfallAnchor.z);
    cliff.rotation.y = waterfallAnchor.yaw - 0.3;

    const rock = new THREE.Mesh(
      new THREE.BoxGeometry(14.5, 9.2, 8.6),
      new THREE.MeshStandardMaterial({ color: 0x4d564f, flatShading: true, roughness: 1 }),
    );
    rock.position.y = 4.6;
    cliff.add(rock);

    const water = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 7.6, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x78d8f5, emissive: 0x12343f, flatShading: true, roughness: 0.65 }),
    );
    water.position.set(0.4, 4.8, 4.35);
    cliff.add(water);
    root.add(cliff);

    return root;
  }

  private createStudioMegaObjects(track: TrackDefinition): THREE.Group {
    const root = new THREE.Group();
    root.name = 'studio-mega';

    const gateAnchor = this.getTracksideAnchor(track, 8, 1, 29);
    const gate = new THREE.Group();
    gate.position.set(gateAnchor.x, 0.08, gateAnchor.z);
    gate.rotation.y = gateAnchor.yaw + 0.4;

    const gateBase = new THREE.Mesh(
      new THREE.BoxGeometry(11.8, 0.6, 8.4),
      new THREE.MeshStandardMaterial({ color: 0x646d7d, flatShading: true, roughness: 0.95 }),
    );
    gateBase.position.y = 0.3;
    gate.add(gateBase);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(12.6, 7.8, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x1f2b3f, flatShading: true, roughness: 0.88 }),
    );
    board.position.set(0, 4.5, -1.9);
    gate.add(board);

    for (let i = 0; i < 5; i += 1) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(12.2, 0.7, 0.2),
        new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0xffffff : 0x73d2de, flatShading: true, roughness: 0.72 }),
      );
      stripe.position.set(0, 1.9 + i * 1.35, -1.25);
      stripe.rotation.z = i % 2 === 0 ? 0.04 : -0.04;
      gate.add(stripe);
    }
    root.add(gate);

    const reelAnchor = this.getTracksideAnchor(track, 28, -1, 30);
    const reel = new THREE.Group();
    reel.position.set(reelAnchor.x, 0.08, reelAnchor.z);
    reel.rotation.y = reelAnchor.yaw - 0.2;

    const reelBase = new THREE.Mesh(
      new THREE.CylinderGeometry(5.4, 5.4, 1.2, 20),
      new THREE.MeshStandardMaterial({ color: 0x5d6675, flatShading: true, roughness: 0.9 }),
    );
    reelBase.position.y = 0.6;
    reel.add(reelBase);

    const reelDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(4.6, 4.6, 1.0, 20),
      new THREE.MeshStandardMaterial({ color: 0x2f3745, flatShading: true, roughness: 0.85 }),
    );
    reelDisc.position.y = 4.1;
    reel.add(reelDisc);

    for (let i = 0; i < 6; i += 1) {
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.68, 0.68, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x93a4bd, flatShading: true, roughness: 0.8 }),
      );
      const angle = (i / 6) * Math.PI * 2;
      hub.position.set(Math.cos(angle) * 2.4, 4.1, Math.sin(angle) * 2.4);
      hub.rotation.x = Math.PI / 2;
      reel.add(hub);
    }
    root.add(reel);

    return root;
  }

  private populateRacewayDeco(group: THREE.Group, track: TrackDefinition): void {
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1f252c, flatShading: true, roughness: 0.98 });
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff8c42, flatShading: true, roughness: 0.86 });
    const tireGeo = new THREE.TorusGeometry(0.45, 0.12, 8, 12);
    const coneGeo = new THREE.ConeGeometry(0.22, 0.55, 5);

    for (let i = 0; i < track.waypoints.length; i += 3) {
      const side = i % 2 === 0 ? 1 : -1;
      const anchor = this.getTracksideAnchor(track, i, side, 8.8);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.position.set(anchor.x, 0.48, anchor.z);
      tire.rotation.x = Math.PI / 2;
      group.add(tire);

      if (i % 6 === 0) {
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.set(anchor.x + side * 0.9, 0.3, anchor.z - side * 0.8);
        group.add(cone);
      }
    }
  }

  private populateDesertDeco(group: THREE.Group, track: TrackDefinition): void {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x9b7447, flatShading: true, roughness: 1 });
    const cactusMat = new THREE.MeshStandardMaterial({ color: 0x4f8a55, flatShading: true, roughness: 0.95 });
    for (let i = 0; i < track.waypoints.length; i += 2) {
      const side = i % 4 < 2 ? 1 : -1;
      const anchor = this.getTracksideAnchor(track, i, side, 16 + (i % 3) * 2);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3 + (i % 3) * 0.4, 0), rockMat);
      rock.position.set(anchor.x, 0.9, anchor.z);
      rock.rotation.y = i * 0.3;
      group.add(rock);

      if (i % 4 === 0) {
        const cactus = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.2, 6), cactusMat);
        trunk.position.y = 1.1;
        cactus.add(trunk);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6), cactusMat);
        arm.position.set(0.42, 1.28, 0);
        arm.rotation.z = -1.1;
        cactus.add(arm);
        cactus.position.set(anchor.x + side * 1.1, 0, anchor.z - side * 1.2);
        group.add(cactus);
      }
    }
  }

  private populateForestDeco(group: THREE.Group, track: TrackDefinition): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6c4a33, flatShading: true, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7d3e, flatShading: true, roughness: 1 });
    for (let i = 0; i < track.waypoints.length; i += 2) {
      const side = i % 2 === 0 ? 1 : -1;
      const anchor = this.getTracksideAnchor(track, i, side, 15 + (i % 4) * 1.2);
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.8, 6), trunkMat);
      trunk.position.y = 0.9;
      tree.add(trunk);
      for (let l = 0; l < 3; l += 1) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9 - l * 0.14, 1.2, 6), leafMat);
        leaf.position.y = 1.75 + l * 0.45;
        tree.add(leaf);
      }
      tree.position.set(anchor.x, 0, anchor.z);
      group.add(tree);
    }
  }

  private populateStudioDeco(group: THREE.Group, track: TrackDefinition): void {
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4d, flatShading: true, roughness: 0.96 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x343c4a, flatShading: true, roughness: 0.88 });
    for (let i = 0; i < track.waypoints.length; i += 3) {
      const side = i % 2 === 0 ? 1 : -1;
      const anchor = this.getTracksideAnchor(track, i, side, 13.5 + (i % 5));
      const crateHeight = 1.1 + (i % 3) * 0.3;
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(1.3 + (i % 2) * 0.6, crateHeight, 1.2),
        crateMat,
      );
      crate.position.set(anchor.x, crateHeight * 0.5, anchor.z);
      group.add(crate);

      if (i % 6 === 0) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.8, 0.18), frameMat);
        frame.position.set(anchor.x + side * 1.1, 1.9, anchor.z - side * 0.6);
        group.add(frame);
      }
    }
  }

  private createLapZoneGuides(track: TrackDefinition): THREE.Group {
    const group = new THREE.Group();
    group.name = 'lap-zone-guides';
    const count = track.waypoints.length;
    if (count === 0) return group;

    const edgeGeo = new THREE.BoxGeometry(0.26, 0.05, 2.3);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 });
    const edges = new THREE.InstancedMesh(edgeGeo, edgeMat, count * 2);

    const poleGeo = new THREE.BoxGeometry(0.24, 1, 0.24);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.88 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, count * 2);

    const dummy = new THREE.Object3D();
    let edgeIndex = 0;
    let poleIndex = 0;
    for (let i = 0; i < count; i += 1) {
      const prev = track.waypoints[(i - 1 + count) % count];
      const curr = track.waypoints[i];
      const next = track.waypoints[(i + 1) % count];
      const tangent = normalize2({ x: next.x - prev.x, z: next.z - prev.z });
      const left = perpLeft2(tangent);
      const yaw = Math.atan2(tangent.x, tangent.z);
      const zone = this.getZoneIndex(i, count);
      const zoneColor = new THREE.Color(this.getZoneColor(track.theme, zone));
      const poleColor = zoneColor.clone().lerp(new THREE.Color(0xffffff), 0.16);
      const halfWidth = curr.width * 0.5;

      for (const side of [-1, 1] as const) {
        const edgeOffset = halfWidth + 0.64;
        const ex = curr.x + left.x * edgeOffset * side;
        const ez = curr.z + left.z * edgeOffset * side;
        dummy.position.set(ex, 0.055, ez);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 0.82 + ((i + (side > 0 ? 1 : 0)) % 3) * 0.2);
        dummy.updateMatrix();
        edges.setMatrixAt(edgeIndex, dummy.matrix);
        edges.setColorAt(edgeIndex, zoneColor);
        edgeIndex += 1;

        if (i % 2 === 0) {
          const poleOffset = halfWidth + 1.48;
          const px = curr.x + left.x * poleOffset * side;
          const pz = curr.z + left.z * poleOffset * side;
          const poleHeight =
            zone === 1
              ? 1.9 + (i % 3) * 0.62
              : zone === 0
                ? 1.2 + (i % 2) * 0.4
                : 1.45 + (i % 2) * 0.5;
          dummy.position.set(px, poleHeight * 0.5, pz);
          dummy.rotation.set(0, yaw, 0);
          dummy.scale.set(1, poleHeight, 1);
          dummy.updateMatrix();
          poles.setMatrixAt(poleIndex, dummy.matrix);
          poles.setColorAt(poleIndex, poleColor);
          poleIndex += 1;
        }
      }
    }

    edges.count = edgeIndex;
    poles.count = poleIndex;
    edges.instanceMatrix.needsUpdate = true;
    poles.instanceMatrix.needsUpdate = true;
    if (edges.instanceColor) edges.instanceColor.needsUpdate = true;
    if (poles.instanceColor) poles.instanceColor.needsUpdate = true;

    group.add(edges);
    group.add(poles);
    return group;
  }

  private createCornerWarningSignals(track: TrackDefinition): THREE.Group {
    const group = new THREE.Group();
    group.name = 'corner-warning-signals';
    const count = track.waypoints.length;
    if (count < 4) return group;

    const warnRoadMat = new THREE.MeshStandardMaterial({ color: 0xffc06b, flatShading: true, roughness: 0.9 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x193039, flatShading: true, roughness: 0.9 });
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xff8f52, flatShading: true, roughness: 0.84 });
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0xfff0c7, flatShading: true, roughness: 0.8 });

    const postGeo = new THREE.BoxGeometry(0.12, 0.96, 0.12);
    const boardGeo = new THREE.BoxGeometry(1.26, 0.76, 0.12);
    const stripeGeo = new THREE.BoxGeometry(0.34, 0.11, 0.02);

    for (let i = 0; i < count; i += 1) {
      const turnAngle = this.getTurnAngleAt(track, i);
      if (turnAngle < 0.34) continue;
      const turnSign = this.getTurnDirectionAt(track, i);
      if (turnSign === 0) continue;

      const warnIndex = (i - 1 + count) % count;
      const prev = track.waypoints[(warnIndex - 1 + count) % count];
      const curr = track.waypoints[warnIndex];
      const next = track.waypoints[(warnIndex + 1) % count];
      const tangent = normalize2({ x: next.x - prev.x, z: next.z - prev.z });
      const left = perpLeft2(tangent);
      const yaw = Math.atan2(tangent.x, tangent.z);
      const outsideSide: 1 | -1 = turnSign > 0 ? -1 : 1;

      const patch = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(curr.width * 1.6, 9.2), 0.024, 2.2 + turnAngle * 2.4),
        warnRoadMat,
      );
      patch.position.set(curr.x, 0.048, curr.z);
      patch.rotation.y = yaw;
      group.add(patch);

      for (let b = 0; b < 2; b += 1) {
        const boardOffset = curr.width * 0.5 + 1.3 + b * 0.85;
        const bx = curr.x + left.x * boardOffset * outsideSide + tangent.x * (-1.1 - b * 1.3);
        const bz = curr.z + left.z * boardOffset * outsideSide + tangent.z * (-1.1 - b * 1.3);

        const sign = new THREE.Group();
        sign.position.set(bx, 0.08, bz);
        sign.rotation.y = yaw + outsideSide * 0.12;

        const post = new THREE.Mesh(postGeo, postMat);
        post.position.y = 0.5;
        sign.add(post);

        const board = new THREE.Mesh(boardGeo, boardMat);
        board.position.y = 1.02;
        sign.add(board);

        for (let k = -1; k <= 1; k += 1) {
          const stripe = new THREE.Mesh(stripeGeo, arrowMat);
          stripe.position.set(k * 0.34, 1.02, 0.08);
          stripe.rotation.z = outsideSide * -0.45;
          sign.add(stripe);
        }

        group.add(sign);
      }
    }

    return group;
  }

  private createSpeedShadowFrames(track: TrackDefinition): THREE.Group {
    const group = new THREE.Group();
    group.name = 'speed-shadow-frames';
    const count = track.waypoints.length;
    if (count < 6) return group;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x314656, flatShading: true, roughness: 0.9 });
    const stride = Math.max(5, Math.floor(count / 7));

    for (let i = 0; i < count; i += stride) {
      const prev = track.waypoints[(i - 1 + count) % count];
      const curr = track.waypoints[i];
      const next = track.waypoints[(i + 1) % count];
      const tangent = normalize2({ x: next.x - prev.x, z: next.z - prev.z });
      const left = perpLeft2(tangent);
      const yaw = Math.atan2(tangent.x, tangent.z);
      const halfSpan = curr.width * 0.5 + 2.1;

      const frame = new THREE.Group();
      frame.position.set(curr.x, 0.08, curr.z);
      frame.rotation.y = yaw;

      const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.6, 0.42), frameMat);
      leftPost.position.set(-halfSpan, 2.3, 0);
      frame.add(leftPost);

      const rightPost = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.6, 0.42), frameMat);
      rightPost.position.set(halfSpan, 2.3, 0);
      frame.add(rightPost);

      const top = new THREE.Mesh(new THREE.BoxGeometry(halfSpan * 2 + 0.52, 0.26, 0.34), frameMat);
      top.position.set(0, 4.48, 0);
      frame.add(top);

      const flow = new THREE.Group();
      flow.position.y = 0;
      const flowData = flow.userData as { shadowFlow?: boolean; span?: number; speed?: number; spacing?: number };
      flowData.shadowFlow = true;
      flowData.span = 16;
      flowData.speed = 24;
      flowData.spacing = 2.9;

      const bandMat = new THREE.MeshBasicMaterial({
        color: 0x102232,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
      });
      const bandGeo = new THREE.PlaneGeometry(curr.width + 3.2, 0.92);
      for (let b = 0; b < 6; b += 1) {
        const band = new THREE.Mesh(bandGeo, bandMat);
        band.rotation.x = -Math.PI / 2;
        band.position.y = 0.052;
        (band.userData as { baseOffset?: number }).baseOffset = b * 2.9;
        flow.add(band);
      }
      frame.add(flow);
      group.add(frame);
    }

    return group;
  }

  private createZoneLandmarkSet(track: TrackDefinition): THREE.Group {
    const group = new THREE.Group();
    group.name = 'zone-landmark-set';
    const count = track.waypoints.length;
    if (count < 3) return group;

    const startAnchor = this.getTracksideAnchor(track, Math.floor(count * 0.1), 1, 24);
    const midAnchor = this.getTracksideAnchor(track, Math.floor(count * 0.48), -1, 25);
    const finishAnchor = this.getTracksideAnchor(track, Math.floor(count * 0.84), 1, 24);

    const startColor = new THREE.MeshStandardMaterial({ color: this.getZoneColor(track.theme, 0), flatShading: true, roughness: 0.86 });
    const midColor = new THREE.MeshStandardMaterial({ color: this.getZoneColor(track.theme, 1), flatShading: true, roughness: 0.88 });
    const finishColor = new THREE.MeshStandardMaterial({ color: this.getZoneColor(track.theme, 2), flatShading: true, roughness: 0.86 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1d2a31, flatShading: true, roughness: 0.92 });

    const start = new THREE.Group();
    start.position.set(startAnchor.x, 0.08, startAnchor.z);
    start.rotation.y = startAnchor.yaw;
    const startLeft = new THREE.Mesh(new THREE.BoxGeometry(1.0, 6.8, 1.0), darkMat);
    startLeft.position.set(-4.2, 3.4, 0);
    start.add(startLeft);
    const startRight = new THREE.Mesh(new THREE.BoxGeometry(1.0, 6.8, 1.0), darkMat);
    startRight.position.set(4.2, 3.4, 0);
    start.add(startRight);
    const startArch = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.56, 8, 24, Math.PI), startColor);
    startArch.position.y = 3.4;
    startArch.scale.y = 0.84;
    start.add(startArch);
    group.add(start);

    const mid = new THREE.Group();
    mid.position.set(midAnchor.x, 0.08, midAnchor.z);
    mid.rotation.y = midAnchor.yaw + 0.28;
    for (let i = 0; i < 4; i += 1) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 4.2 + i * 1.4, 2.2), midColor);
      const angle = (i / 4) * Math.PI * 2;
      tower.position.set(Math.cos(angle) * 3.8, (4.2 + i * 1.4) * 0.5, Math.sin(angle) * 3.2);
      mid.add(tower);
    }
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.8, 10.2, 7), darkMat);
    core.position.y = 5.1;
    mid.add(core);
    group.add(mid);

    const finish = new THREE.Group();
    finish.position.set(finishAnchor.x, 0.08, finishAnchor.z);
    finish.rotation.y = finishAnchor.yaw - 0.16;
    const finLeft = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8.2, 1.4), darkMat);
    finLeft.position.set(-4.8, 4.1, 0);
    finish.add(finLeft);
    const finRight = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8.2, 1.4), darkMat);
    finRight.position.set(4.8, 4.1, 0);
    finish.add(finRight);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.72, 1.1), finishColor);
    beam.position.y = 7.4;
    finish.add(beam);
    const crown = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), finishColor);
    crown.position.set(0, 8.35, 0);
    finish.add(crown);
    group.add(finish);

    return group;
  }

  private createTracksideObjectField(track: TrackDefinition): THREE.Group {
    const group = new THREE.Group();
    group.name = 'trackside-object-field';
    const count = track.waypoints.length;
    if (count === 0) return group;

    const palette = this.getThemeObjectPalette(track.theme);
    const houseBodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.93 });
    const houseRoofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 });
    const smallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.95 });
    const bigMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.94 });

    const houses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), houseBodyMat, count * 3);
    const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.62, 0.5, 4), houseRoofMat, count * 3);
    const smallProps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), smallMat, count * 4);
    const bigProps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bigMat, count);

    const dummy = new THREE.Object3D();
    let houseIndex = 0;
    let roofIndex = 0;
    let smallIndex = 0;
    let bigIndex = 0;

    for (let i = 0; i < count; i += 1) {
      const prev = track.waypoints[(i - 1 + count) % count];
      const curr = track.waypoints[i];
      const next = track.waypoints[(i + 1) % count];
      const tangent = normalize2({ x: next.x - prev.x, z: next.z - prev.z });
      const left = perpLeft2(tangent);
      const yaw = Math.atan2(tangent.x, tangent.z);

      for (let lane = 0; lane < 3; lane += 1) {
        const side: 1 | -1 = ((i + lane) & 1) === 0 ? 1 : -1;
        const nearOffset = curr.width * 0.5 + 5.8 + lane * 1.9 + (i % 3) * 0.36;
        const jitter = ((i * 7 + lane * 5) % 7 - 3) * 0.42;
        const x = curr.x + left.x * nearOffset * side + tangent.x * jitter;
        const z = curr.z + left.z * nearOffset * side + tangent.z * jitter;
        const selector = (i + lane * 2) % 9;

        if (selector <= 3) {
          const w = 0.9 + ((i + lane) % 3) * 0.36;
          const h = 1.55 + ((i + lane) % 4) * 0.48;
          const d = 0.88 + ((i + lane) % 2) * 0.52;

          dummy.position.set(x, h * 0.5, z);
          dummy.rotation.set(0, yaw + side * 0.26, 0);
          dummy.scale.set(w, h, d);
          dummy.updateMatrix();
          houses.setMatrixAt(houseIndex, dummy.matrix);
          houses.setColorAt(houseIndex, new THREE.Color(palette.house[(i + lane) % palette.house.length]));
          houseIndex += 1;

          const roofScale = Math.max(w, d) * 0.95;
          const roofHeight = 0.9 + ((i + lane) % 2) * 0.32;
          dummy.position.set(x, h + roofHeight * 0.5 + 0.06, z);
          dummy.rotation.set(0, yaw + side * 0.26 + 0.76, 0);
          dummy.scale.set(roofScale, roofHeight, roofScale);
          dummy.updateMatrix();
          roofs.setMatrixAt(roofIndex, dummy.matrix);
          roofs.setColorAt(roofIndex, new THREE.Color(palette.roof[(i + lane) % palette.roof.length]));
          roofIndex += 1;
          continue;
        }

        if (selector <= 6) {
          const size = 0.46 + ((i + lane) % 4) * 0.26;
          dummy.position.set(x, size * 0.5, z);
          dummy.rotation.set(0, yaw + side * 0.42, 0);
          dummy.scale.set(size * 0.9, size, size * 1.15);
          dummy.updateMatrix();
          smallProps.setMatrixAt(smallIndex, dummy.matrix);
          smallProps.setColorAt(smallIndex, new THREE.Color(palette.small[(i + lane) % palette.small.length]));
          smallIndex += 1;
          continue;
        }

        if (bigIndex < bigProps.count) {
          const farOffset = nearOffset + 4.2 + ((i + lane) % 3) * 1.35;
          const bx = curr.x + left.x * farOffset * side + tangent.x * jitter * 1.4;
          const bz = curr.z + left.z * farOffset * side + tangent.z * jitter * 1.4;
          const bw = 1.7 + ((i + lane) % 3) * 0.56;
          const bh = 3.8 + ((i + lane) % 4) * 1.35;
          const bd = 1.5 + ((i + lane) % 2) * 0.8;
          dummy.position.set(bx, bh * 0.5, bz);
          dummy.rotation.set(0, yaw + side * 0.18, 0);
          dummy.scale.set(bw, bh, bd);
          dummy.updateMatrix();
          bigProps.setMatrixAt(bigIndex, dummy.matrix);
          bigProps.setColorAt(bigIndex, new THREE.Color(palette.big[(i + lane) % palette.big.length]));
          bigIndex += 1;
        }
      }
    }

    houses.count = houseIndex;
    roofs.count = roofIndex;
    smallProps.count = smallIndex;
    bigProps.count = bigIndex;
    houses.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    smallProps.instanceMatrix.needsUpdate = true;
    bigProps.instanceMatrix.needsUpdate = true;
    if (houses.instanceColor) houses.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
    if (smallProps.instanceColor) smallProps.instanceColor.needsUpdate = true;
    if (bigProps.instanceColor) bigProps.instanceColor.needsUpdate = true;

    group.add(houses, roofs, smallProps, bigProps);
    return group;
  }

  private getZoneIndex(index: number, total: number): 0 | 1 | 2 {
    if (total <= 0) return 0;
    const zone = Math.floor((index / total) * 3);
    if (zone <= 0) return 0;
    if (zone >= 2) return 2;
    return 1;
  }

  private getZoneColor(theme: TrackDefinition['theme'], zone: 0 | 1 | 2): number {
    switch (theme) {
      case 'raceway':
        return [0x89dbff, 0xffa167, 0xa4ff8a][zone];
      case 'desert':
        return [0xffe0a0, 0xffae68, 0xd4ff92][zone];
      case 'forest':
        return [0xbbe8be, 0x6adf97, 0xb5f2ff][zone];
      case 'studio':
        return [0xc8d2ff, 0xff9ed2, 0x9ff4ff][zone];
      case 'coastal':
      default:
        return [0x9defff, 0xffb979, 0x9bffcc][zone];
    }
  }

  private getThemeObjectPalette(theme: TrackDefinition['theme']): {
    house: number[];
    roof: number[];
    small: number[];
    big: number[];
  } {
    switch (theme) {
      case 'raceway':
        return {
          house: [0xd8e2dc, 0xffcad4, 0xcdb4db, 0xbde0fe],
          roof: [0x415a77, 0x1b263b, 0x7f5539],
          small: [0x2d6a4f, 0xf4a261, 0x457b9d],
          big: [0x6c757d, 0xadb5bd, 0x495057],
        };
      case 'desert':
        return {
          house: [0xe9c46a, 0xf4a261, 0xe76f51, 0xd4a373],
          roof: [0x7f5539, 0x6f4e37, 0x9c6644],
          small: [0x6a994e, 0xbc6c25, 0xdda15e],
          big: [0xb08968, 0x9c6644, 0xa68a64],
        };
      case 'forest':
        return {
          house: [0xcdeac0, 0x95d5b2, 0xb7e4c7, 0xd8f3dc],
          roof: [0x386641, 0x2d6a4f, 0x4f772d],
          small: [0x6b705c, 0xa3b18a, 0x588157],
          big: [0x4f5d2f, 0x656d4a, 0x7f8f59],
        };
      case 'studio':
        return {
          house: [0xd8dbe2, 0xcddafd, 0xffd6ff, 0xbde0fe],
          roof: [0x33415c, 0x3d405b, 0x2b2d42],
          small: [0x8d99ae, 0xf4a261, 0x5c677d],
          big: [0x495057, 0x6c757d, 0xadb5bd],
        };
      case 'coastal':
      default:
        return {
          house: [0xffd6a5, 0xfdffb6, 0xcaffbf, 0xa0c4ff],
          roof: [0x355070, 0x6d597a, 0xb56576],
          small: [0x2a9d8f, 0xf4a261, 0xe76f51],
          big: [0x6b7280, 0x9ca3af, 0x4b5563],
        };
    }
  }

  private getTurnAngleAt(track: TrackDefinition, index: number): number {
    const count = track.waypoints.length;
    const prev = track.waypoints[(index - 1 + count) % count];
    const curr = track.waypoints[index % count];
    const next = track.waypoints[(index + 1) % count];
    const a = normalize2({ x: curr.x - prev.x, z: curr.z - prev.z });
    const b = normalize2({ x: next.x - curr.x, z: next.z - curr.z });
    const dot = Math.min(1, Math.max(-1, a.x * b.x + a.z * b.z));
    return Math.acos(dot);
  }

  private getTurnDirectionAt(track: TrackDefinition, index: number): -1 | 0 | 1 {
    const count = track.waypoints.length;
    const prev = track.waypoints[(index - 1 + count) % count];
    const curr = track.waypoints[index % count];
    const next = track.waypoints[(index + 1) % count];
    const a = normalize2({ x: curr.x - prev.x, z: curr.z - prev.z });
    const b = normalize2({ x: next.x - curr.x, z: next.z - curr.z });
    const cross = a.x * b.z - a.z * b.x;
    if (cross > 0.03) return 1;
    if (cross < -0.03) return -1;
    return 0;
  }

  private findRacewayBridgeSpan(track: TrackDefinition): {
    center: { x: number; z: number };
    yaw: number;
    length: number;
    roadWidth: number;
  } {
    const waypoints = track.waypoints;
    if (waypoints.length < 8) {
      const a = waypoints[0];
      const b = waypoints[1] ?? waypoints[0];
      const tangent = normalize2({ x: b.x - a.x, z: b.z - a.z });
      return {
        center: { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 },
        yaw: Math.atan2(tangent.x, tangent.z),
        length: Math.hypot(b.x - a.x, b.z - a.z) + 26,
        roadWidth: Math.max(10, a.width),
      };
    }

    let bestIndex = 3;
    let bestScore = Number.NEGATIVE_INFINITY;
    const dotToAngle = (dot: number): number => Math.acos(Math.min(1, Math.max(-1, dot)));

    for (let i = 2; i <= waypoints.length - 4; i += 1) {
      const prev = waypoints[i - 1];
      const a = waypoints[i];
      const b = waypoints[i + 1];
      const next = waypoints[i + 2];
      const vPrev = normalize2({ x: a.x - prev.x, z: a.z - prev.z });
      const vSeg = normalize2({ x: b.x - a.x, z: b.z - a.z });
      const vNext = normalize2({ x: next.x - b.x, z: next.z - b.z });
      const segmentLen = Math.hypot(b.x - a.x, b.z - a.z);
      const curvature = dotToAngle(vPrev.x * vSeg.x + vPrev.z * vSeg.z) + dotToAngle(vSeg.x * vNext.x + vSeg.z * vNext.z);
      const score = segmentLen * 2.1 - curvature * 14;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    const start = waypoints[Math.max(0, bestIndex - 2)];
    const end = waypoints[Math.min(waypoints.length - 1, bestIndex + 3)];
    const tangent = normalize2({ x: end.x - start.x, z: end.z - start.z });
    const widthSample = [
      waypoints[Math.max(0, bestIndex - 1)].width,
      waypoints[bestIndex].width,
      waypoints[Math.min(waypoints.length - 1, bestIndex + 1)].width,
    ];
    const roadWidth = widthSample.reduce((sum, value) => sum + value, 0) / widthSample.length;

    return {
      center: { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 },
      yaw: Math.atan2(tangent.x, tangent.z),
      length: Math.hypot(end.x - start.x, end.z - start.z) + 34,
      roadWidth: Math.max(10, roadWidth),
    };
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
