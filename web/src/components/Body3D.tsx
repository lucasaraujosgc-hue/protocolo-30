import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { lerpMeasures, RING_KEYS, type BodyMeasures, type RingKey } from '../lib/body';

/* ======================================================================
 * Modelo 3D: um manequim simples cujas proporções vêm das suas medidas
 * (circunferências → elipses). Não é um escaneamento: é um modelo para
 * enxergar a evolução entre datas.
 * ==================================================================== */

interface Level {
  y: number;
  a: number;
  b: number;
  z: number;
}

const SEG = 36;

/** Semi-eixos (m) de uma elipse com circunferência C (cm) e razão largura/profundidade k (Ramanujan). */
function axes(Ccm: number, k: number) {
  const C = Ccm / 100;
  const f = Math.PI * (3 * (k + 1) - Math.sqrt((3 * k + 1) * (k + 3)));
  const b = C / f;
  return { a: k * b, b };
}

const cr = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

function smooth(keys: Level[], per: number): Level[] {
  const out: Level[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[Math.max(0, i - 1)];
    const k1 = keys[i];
    const k2 = keys[i + 1];
    const k3 = keys[Math.min(keys.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per;
      out.push({
        y: cr(k0.y, k1.y, k2.y, k3.y, t),
        a: Math.max(0.004, cr(k0.a, k1.a, k2.a, k3.a, t)),
        b: Math.max(0.004, cr(k0.b, k1.b, k2.b, k3.b, t)),
        z: cr(k0.z, k1.z, k2.z, k3.z, t),
      });
    }
  }
  out.push(keys[keys.length - 1]);
  return out;
}

interface PartSpec {
  levels: Level[];
  matrix: THREE.Matrix4;
  caps: [boolean, boolean];
}

interface RingSpec {
  a: number;
  b: number;
  matrix: THREE.Matrix4;
}

interface BallSpec {
  matrix: THREE.Matrix4;
}

const DOWN = new THREE.Vector3(0, -1, 0);

function limbMatrix(origin: THREE.Vector3, dir: THREE.Vector3) {
  const q = new THREE.Quaternion().setFromUnitVectors(DOWN, dir.clone().normalize());
  return { q, m: new THREE.Matrix4().compose(origin, q, new THREE.Vector3(1, 1, 1)) };
}

function buildSpecs(m: BodyMeasures) {
  const H = m.height / 100;
  const s = H / 1.86;
  const bRef = axes(m.waistNarrow, 1.22).b;
  const lvl = (yf: number, C: number, k: number, front: number, extraZ = 0): Level => {
    const { a, b } = axes(C, k);
    return { y: yf * H, a, b, z: front * (b - bRef) + extraZ };
  };
  const neckAx = axes(m.neck, 1.08);
  const chestAx = axes(m.chest, 1.38);
  const hipAx = axes(m.hip, 1.28);
  const shoulderHalf = Math.max(chestAx.a * 1.04, 0.112 * H);
  const lowAbs = Math.max(m.waistNavel * 0.985, m.hip * 0.94);
  // Gordura abdominal: quanto maior a relação cintura/altura, mais redonda e projetada para a frente fica a barriga.
  const belly = Math.max(0, m.waistNavel / m.height - 0.45);
  const navelK = Math.min(1.3, Math.max(0.92, 1.3 - 2.2 * belly));
  const bellyShift = belly * 0.12;

  const torsoKeys: Level[] = [
    { y: 0.452 * H, a: hipAx.a * 0.42, b: hipAx.b * 0.55, z: -0.01 },
    lvl(0.475, m.hip * 0.86, 1.4, -0.3),
    lvl(0.5, m.hip * 0.97, 1.3, -0.35),
    lvl(0.525, m.hip, 1.28, -0.35),
    lvl(0.565, lowAbs, navelK + 0.03, 1.5, bellyShift * 0.9),
    lvl(0.6, m.waistNavel, navelK, 1.6, bellyShift),
    lvl(0.635, m.waistNarrow, 1.22, 0.7, bellyShift * 0.4),
    lvl(0.68, (m.waistNarrow + m.chest) / 2, 1.3, 0.35),
    lvl(0.72, m.chest, 1.38, 0.2),
    lvl(0.765, m.chest * 0.97, 1.55, 0.05),
    { y: 0.8 * H, a: shoulderHalf * 0.93, b: neckAx.b * 1.85, z: -0.004 },
    { y: 0.823 * H, a: neckAx.a * 1.55, b: neckAx.b * 1.25, z: -0.004 },
    { y: 0.842 * H, a: neckAx.a, b: neckAx.b, z: 0.002 },
    { y: 0.872 * H, a: neckAx.a * 0.96, b: neckAx.b * 0.96, z: 0.01 },
  ];
  const parts: Record<string, PartSpec> = {
    torso: { levels: smooth(torsoKeys, 4), matrix: new THREE.Matrix4(), caps: [true, true] },
  };
  const balls: Record<string, BallSpec> = {};
  const rings: Partial<Record<RingKey, RingSpec>> = {};

  const ringAt = (key: RingKey, L: Level) => {
    rings[key] = { a: L.a + 0.006, b: L.b + 0.006, matrix: new THREE.Matrix4().makeTranslation(0, L.y, L.z) };
  };
  ringAt('hip', torsoKeys[3]);
  ringAt('waistNavel', torsoKeys[5]);
  ringAt('waistNarrow', torsoKeys[6]);
  ringAt('chest', torsoKeys[8]);
  ringAt('neck', { ...torsoKeys[12], y: (torsoKeys[12].y + torsoKeys[13].y) / 2 });

  // Cabeça
  balls.head = {
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.935 * H, 0.014 * s),
      new THREE.Quaternion(),
      new THREE.Vector3(0.082 * s, 0.112 * s, 0.098 * s),
    ),
  };

  const rArm = m.arm / (2 * Math.PI) / 100;
  const rThigh = m.thigh / (2 * Math.PI) / 100;
  const rCalf = m.calf / (2 * Math.PI) / 100;
  const Lu = 0.186 * H;
  const Lf = 0.15 * H;
  const Lt = 0.215 * H;
  const Ls = 0.24 * H;

  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'R' : 'L'; // lado direito do corpo fica em x negativo (de frente para a câmera)
    // Braço
    const shoulder = new THREE.Vector3(side * (shoulderHalf - rArm * 0.3), 0.81 * H, -0.006);
    balls[`delt${tag}`] = {
      matrix: new THREE.Matrix4().compose(
        shoulder.clone().add(new THREE.Vector3(-side * rArm * 0.12, -rArm * 0.35, 0)),
        new THREE.Quaternion(),
        new THREE.Vector3(rArm * 1.12, rArm * 1.08, rArm * 1.12),
      ),
    };
    const upDir = new THREE.Vector3(side * Math.sin(0.21), -Math.cos(0.21), 0.03).normalize();
    const up = limbMatrix(shoulder, upDir);
    parts[`arm${tag}`] = {
      levels: smooth(
        [
          { y: 0, a: rArm * 1.08, b: rArm * 1.12, z: 0 },
          { y: -0.12 * Lu, a: rArm * 1.2, b: rArm * 1.12, z: 0 },
          { y: -0.45 * Lu, a: rArm, b: rArm, z: 0 },
          { y: -0.85 * Lu, a: rArm * 0.86, b: rArm * 0.82, z: 0 },
          { y: -Lu, a: rArm * 0.74, b: rArm * 0.7, z: 0 },
        ],
        4,
      ),
      matrix: up.m,
      caps: [true, false],
    };
    const elbow = shoulder.clone().add(upDir.clone().multiplyScalar(Lu));
    const foDir = new THREE.Vector3(side * Math.sin(0.12), -Math.cos(0.12), 0.14).normalize();
    const fo = limbMatrix(elbow, foDir);
    parts[`fore${tag}`] = {
      levels: smooth(
        [
          { y: 0.01, a: rArm * 0.76, b: rArm * 0.72, z: 0 },
          { y: -0.25 * Lf, a: rArm * 0.82, b: rArm * 0.74, z: 0 },
          { y: -0.8 * Lf, a: rArm * 0.56, b: rArm * 0.47, z: 0 },
          { y: -Lf, a: rArm * 0.48, b: rArm * 0.4, z: 0 },
        ],
        4,
      ),
      matrix: fo.m,
      caps: [false, true],
    };
    const wrist = elbow.clone().add(foDir.clone().multiplyScalar(Lf + 0.045 * s));
    balls[`hand${tag}`] = { matrix: new THREE.Matrix4().compose(wrist, fo.q, new THREE.Vector3(0.024 * s, 0.05 * s, 0.045 * s)) };
    if (side < 0) {
      rings.arm = {
        a: rArm + 0.006,
        b: rArm + 0.006,
        matrix: new THREE.Matrix4().compose(shoulder.clone().add(upDir.clone().multiplyScalar(0.45 * Lu)), up.q, new THREE.Vector3(1, 1, 1)),
      };
    }

    // Perna
    const hipJ = new THREE.Vector3(side * hipAx.a * 0.5, 0.5 * H, 0);
    const thDir = new THREE.Vector3(side * Math.sin(0.045), -Math.cos(0.045), 0).normalize();
    const th = limbMatrix(hipJ, thDir);
    parts[`thigh${tag}`] = {
      levels: smooth(
        [
          { y: 0, a: rThigh * 1.06, b: rThigh * 1.12, z: -0.004 },
          { y: -0.15 * Lt, a: rThigh * 1.04, b: rThigh * 1.06, z: -0.004 },
          { y: -0.55 * Lt, a: rThigh, b: rThigh, z: 0 },
          { y: -0.88 * Lt, a: rThigh * 0.7, b: rThigh * 0.68, z: 0.004 },
          { y: -Lt, a: rThigh * 0.6, b: rThigh * 0.6, z: 0.004 },
        ],
        4,
      ),
      matrix: th.m,
      caps: [true, false],
    };
    const knee = hipJ.clone().add(thDir.clone().multiplyScalar(Lt));
    const shDir = new THREE.Vector3(side * 0.01, -1, -0.015).normalize();
    const sh = limbMatrix(knee, shDir);
    parts[`shank${tag}`] = {
      levels: smooth(
        [
          { y: 0.01, a: rThigh * 0.6, b: rThigh * 0.6, z: 0.004 },
          { y: -0.3 * Ls, a: rCalf, b: rCalf * 1.04, z: -0.01 },
          { y: -0.75 * Ls, a: rCalf * 0.66, b: rCalf * 0.64, z: -0.003 },
          { y: -Ls, a: rCalf * 0.5, b: rCalf * 0.5, z: 0 },
        ],
        4,
      ),
      matrix: sh.m,
      caps: [false, true],
    };
    const ankle = knee.clone().add(shDir.clone().multiplyScalar(Ls));
    balls[`foot${tag}`] = {
      matrix: new THREE.Matrix4().compose(
        ankle.clone().add(new THREE.Vector3(0, -0.032 * s, 0.05 * s)),
        new THREE.Quaternion(),
        new THREE.Vector3(0.046 * s, 0.032 * s, 0.125 * s),
      ),
    };
    if (side < 0) {
      rings.thigh = {
        a: rThigh + 0.006,
        b: rThigh + 0.006,
        matrix: new THREE.Matrix4().compose(hipJ.clone().add(thDir.clone().multiplyScalar(0.55 * Lt)), th.q, new THREE.Vector3(1, 1, 1)),
      };
      rings.calf = {
        a: rCalf + 0.006,
        b: rCalf * 1.04 + 0.006,
        matrix: new THREE.Matrix4().compose(knee.clone().add(shDir.clone().multiplyScalar(0.3 * Ls)), sh.q, new THREE.Vector3(1, 1, 1)),
      };
    }
  }
  return { parts, balls, rings: rings as Record<RingKey, RingSpec> };
}

/* --------------------------------------------------------- geometrias */

function loftVertexCount(n: number, caps: [boolean, boolean]) {
  return n * SEG + (caps[0] ? 1 : 0) + (caps[1] ? 1 : 0);
}

function writeLoft(geo: THREE.BufferGeometry, levels: Level[], caps: [boolean, boolean]) {
  const pos = geo.getAttribute('position').array as Float32Array;
  let o = 0;
  for (const L of levels) {
    for (let j = 0; j < SEG; j++) {
      const t = (j / SEG) * Math.PI * 2;
      pos[o++] = L.a * Math.cos(t);
      pos[o++] = L.y;
      pos[o++] = L.z + L.b * Math.sin(t);
    }
  }
  if (caps[0]) {
    const L = levels[0];
    pos[o++] = 0;
    pos[o++] = L.y;
    pos[o++] = L.z;
  }
  if (caps[1]) {
    const L = levels[levels.length - 1];
    pos[o++] = 0;
    pos[o++] = L.y;
    pos[o++] = L.z;
  }
  geo.getAttribute('position').needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}

function makeLoft(levels: Level[], caps: [boolean, boolean]) {
  const n = levels.length;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(loftVertexCount(n, caps) * 3), 3));
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * SEG + j;
      const b = i * SEG + ((j + 1) % SEG);
      const c = (i + 1) * SEG + j;
      const d = (i + 1) * SEG + ((j + 1) % SEG);
      idx.push(a, c, b, b, c, d);
    }
  }
  let v = n * SEG;
  if (caps[0]) {
    for (let j = 0; j < SEG; j++) idx.push(v, j, (j + 1) % SEG);
    v++;
  }
  if (caps[1]) {
    const base = (n - 1) * SEG;
    for (let j = 0; j < SEG; j++) idx.push(v, base + ((j + 1) % SEG), base + j);
  }
  geo.setIndex(idx);
  writeLoft(geo, levels, caps);
  return geo;
}

/* ------------------------------------------------------------------ rig */

type RigStyle = 'solid' | 'ghost';

/** Corpo montado a partir das medidas: sólido fosco (atual) ou silhueta translúcida (comparação). */
class Rig {
  group = new THREE.Group();
  private parts = new Map<string, { obj: THREE.Group; mesh: THREE.Mesh; caps: [boolean, boolean] }>();
  private balls = new Map<string, THREE.Group>();
  private rings = new Map<RingKey, { obj: THREE.Group; mesh: THREE.Mesh }>();
  private sphere = new THREE.SphereGeometry(1, 32, 20);
  private material: THREE.Material;
  private ringMaterial = new THREE.MeshBasicMaterial({ color: '#7aa2f7' });
  ringFront = new Map<RingKey, THREE.Vector3>();

  constructor(m: BodyMeasures, style: RigStyle) {
    this.material =
      style === 'solid'
        ? new THREE.MeshStandardMaterial({ color: '#c9cdd4', roughness: 0.78, metalness: 0.02 })
        : new THREE.MeshBasicMaterial({ color: '#7aa2f7', transparent: true, opacity: 0.16, depthWrite: false });
    const spec = buildSpecs(m);
    for (const [name, p] of Object.entries(spec.parts)) {
      const obj = new THREE.Group();
      obj.matrixAutoUpdate = false;
      obj.matrix.copy(p.matrix);
      const mesh = new THREE.Mesh(makeLoft(p.levels, p.caps), this.material);
      obj.add(mesh);
      this.group.add(obj);
      this.parts.set(name, { obj, mesh, caps: p.caps });
    }
    for (const [name, b] of Object.entries(spec.balls)) {
      const obj = new THREE.Group();
      obj.matrixAutoUpdate = false;
      obj.matrix.copy(b.matrix);
      obj.add(new THREE.Mesh(this.sphere, this.material));
      this.group.add(obj);
      this.balls.set(name, obj);
    }
    if (style === 'solid') {
      for (const key of RING_KEYS) {
        const r = spec.rings[key];
        const obj = new THREE.Group();
        obj.matrixAutoUpdate = false;
        obj.matrix.copy(r.matrix);
        obj.visible = false;
        // Espessura constante de ~4 mm, qualquer que seja o tamanho do anel.
        const geo = new THREE.TorusGeometry(1, 0.0045 / Math.max(r.a, 0.02), 8, 120).rotateX(Math.PI / 2);
        const mesh = new THREE.Mesh(geo, this.ringMaterial);
        mesh.scale.set(r.a, (r.a + r.b) / 2, r.b);
        obj.add(mesh);
        this.group.add(obj);
        this.rings.set(key, { obj, mesh });
        this.ringFront.set(key, new THREE.Vector3(0, 0, r.b).applyMatrix4(r.matrix));
      }
    }
  }

  update(m: BodyMeasures) {
    const spec = buildSpecs(m);
    for (const [name, p] of Object.entries(spec.parts)) {
      const part = this.parts.get(name)!;
      writeLoft(part.mesh.geometry, p.levels, part.caps);
      part.obj.matrix.copy(p.matrix);
      part.obj.matrixWorldNeedsUpdate = true;
    }
    for (const [name, b] of Object.entries(spec.balls)) {
      const obj = this.balls.get(name)!;
      obj.matrix.copy(b.matrix);
      obj.matrixWorldNeedsUpdate = true;
    }
    for (const [key, ring] of this.rings) {
      const r = spec.rings[key];
      ring.mesh.scale.set(r.a, (r.a + r.b) / 2, r.b);
      ring.obj.matrix.copy(r.matrix);
      ring.obj.matrixWorldNeedsUpdate = true;
      this.ringFront.set(key, new THREE.Vector3(0, 0, r.b).applyMatrix4(r.matrix));
    }
  }

  highlight(key: RingKey | null) {
    for (const [k, ring] of this.rings) ring.obj.visible = key === k;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== this.sphere) o.geometry.dispose();
    });
    this.sphere.dispose();
    this.material.dispose();
    this.ringMaterial.dispose();
  }
}

/* ------------------------------------------------------------- cenário */

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.6, 'rgba(0,0,0,0.18)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export type BodyView = 'auto' | 'front' | 'side' | 'back';

const VIEW_ANGLE: Record<Exclude<BodyView, 'auto'>, number> = { front: 0, side: Math.PI / 2, back: Math.PI };

export default function Body3D({
  measures,
  ghost,
  highlight,
  view,
  label,
}: {
  measures: BodyMeasures;
  ghost?: BodyMeasures | null;
  highlight: RingKey | null;
  view: BodyView;
  label?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const api = useRef<{
    setTarget: (m: BodyMeasures) => void;
    setGhost: (m: BodyMeasures | null) => void;
    setHighlight: (k: RingKey | null) => void;
    setView: (v: BodyView) => void;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    wrap.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    const H = measures.height / 100;
    camera.position.set(0, H * 0.55, H * 2.45);
    camera.lookAt(0, H * 0.5, 0);

    scene.add(new THREE.HemisphereLight('#ffffff', '#5b606a', 1.15));
    const key = new THREE.DirectionalLight('#ffffff', 1.7);
    key.position.set(1.4, 2.6, 2.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#b9c8ff', 0.6);
    rim.position.set(-2, 1.6, -1.8);
    scene.add(rim);

    const world = new THREE.Group();
    scene.add(world);

    let current = { ...measures };
    let from = { ...measures };
    let target = { ...measures };
    let morphT = 1;

    const rig = new Rig(current, 'solid');
    world.add(rig.group);
    let ghostRig: Rig | null = null;

    const shadowTex = shadowTexture();
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.3 * H, 48),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.045 * H;
    scene.add(shadow);

    // Rotação: arrasto horizontal; rolagem vertical continua com a página.
    let viewMode: BodyView = 'front';
    let angle = 0;
    let targetAngle = 0;
    let dragging = false;
    let lastX = 0;
    let idle = 0;
    const el = renderer.domElement;
    el.style.touchAction = 'pan-y';
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      idle = 0;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      angle += dx * 0.012;
      targetAngle = angle;
      idle = 0;
    };
    const onUp = () => {
      dragging = false;
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(wrap);

    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      const dt = Math.min(0.05, clock.getDelta());

      if (morphT < 1) {
        morphT = Math.min(1, morphT + dt / 0.6);
        const e = morphT < 0.5 ? 2 * morphT * morphT : 1 - (-2 * morphT + 2) ** 2 / 2;
        current = lerpMeasures(from, target, e);
        rig.update(current);
      }

      idle += dt;
      if (viewMode === 'auto') {
        if (!dragging && idle > 1.2) angle += dt * 0.35;
      } else if (!dragging) {
        angle += (targetAngle - angle) * Math.min(1, dt * 6);
      }
      world.rotation.y = angle;

      renderer.render(scene, camera);

    };
    loop();

    api.current = {
      setTarget: (m) => {
        from = { ...current };
        target = { ...m };
        morphT = 0;
      },
      setGhost: (m) => {
        if (ghostRig) {
          world.remove(ghostRig.group);
          ghostRig.dispose();
          ghostRig = null;
        }
        if (m) {
          ghostRig = new Rig(m, 'ghost');
          world.add(ghostRig.group);
        }
      },
      setHighlight: (k) => rig.highlight(k),
      setView: (v) => {
        viewMode = v;
        if (v !== 'auto') {
          const base = VIEW_ANGLE[v];
          const turns = Math.round((angle - base) / (Math.PI * 2));
          targetAngle = base + turns * Math.PI * 2;
        }
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      rig.dispose();
      ghostRig?.dispose();
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
      shadowTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
    // O cenário é criado uma vez; mudanças de medidas passam pela api abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.setTarget(measures);
  }, [measures]);

  useEffect(() => {
    api.current?.setGhost(ghost ?? null);
  }, [ghost]);

  useEffect(() => {
    api.current?.setHighlight(highlight);
  }, [highlight]);

  useEffect(() => {
    api.current?.setView(view);
  }, [view]);

  if (failed) {
    return <div className="hint warn">Seu navegador não liberou WebGL, então o modelo 3D não pode ser desenhado aqui.</div>;
  }

  return (
    <div ref={wrapRef} className="holo">
      {highlight && label && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            top: 12,
            pointerEvents: 'none',
            padding: '5px 10px',
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 500,
            background: 'rgba(15,16,18,.85)',
            border: '1px solid rgba(255,255,255,.12)',
            color: '#ededee',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: '#7aa2f7', marginRight: 7 }} />
          {label}
        </div>
      )}
    </div>
  );
}
