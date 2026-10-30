import * as THREE from 'three';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { OneEuro } from './oneEuro';
import type { Stage } from './stage';
import { CONFIG } from './config';

export type Mode = 'none' | 'open' | 'fist' | 'point' | 'other';

interface PathPt {
  x: number;
  y: number;
  t: number;
}

interface Feat {
  cx: number;
  cy: number;
  size: number;
  tx: number;
  ty: number;
  n: THREE.Vector3;
  a: THREE.Vector3;
  mode: Mode;
}

export interface HandCallbacks {
  onOpen(h: Hand): void;
  onFist(h: Hand): void;
  onLoop(x: number, y: number, r: number): void;
}

const Z = new THREE.Vector3(0, 0, 1);

export class Hand {
  present = false;
  lastSeen = -100;
  mode: Mode = 'none';
  cand: Mode = 'none';
  candN = 0;
  
  target = 0;

  center = new THREE.Vector2();
  size = 100;
  tip = new THREE.Vector2();
  normal = new THREE.Vector3(0, 0, 1);
  xAxis = new THREE.Vector3(1, 0, 0);

  rCenter = new THREE.Vector2();
  rSize = 100;
  rTip = new THREE.Vector2();
  prevTip = new THREE.Vector2();
  quat = new THREE.Quaternion();
  tipSpeed = 0;
  snap = false;

  path: PathPt[] = [];
  loopCooldown = 0;

  private f = {
    cx: new OneEuro(1.2, 0.012),
    cy: new OneEuro(1.2, 0.012),
    s: new OneEuro(0.8, 0.01),
    nx: new OneEuro(1.5, 2.5),
    ny: new OneEuro(1.5, 2.5),
    nz: new OneEuro(1.5, 2.5),
    ax: new OneEuro(1.5, 2.5),
    ay: new OneEuro(1.5, 2.5),
    az: new OneEuro(1.5, 2.5),
    tx: new OneEuro(2.5, 0.06),
    ty: new OneEuro(2.5, 0.06),
  };

  constructor(readonly slot: number) {}

  feed(ft: Feat, t: number) {
    if (t - this.lastSeen > 0.5) {
      Object.values(this.f).forEach((f) => f.reset());
      this.snap = true;
    }
    this.lastSeen = t;
    const f = this.f;
    this.center.set(f.cx.filter(ft.cx, t), f.cy.filter(ft.cy, t));
    this.size = f.s.filter(ft.size, t);
    this.tip.set(f.tx.filter(ft.tx, t), f.ty.filter(ft.ty, t));
    this.normal.set(f.nx.filter(ft.n.x, t), f.ny.filter(ft.n.y, t), f.nz.filter(ft.n.z, t)).normalize();
    this.xAxis.set(f.ax.filter(ft.a.x, t), f.ay.filter(ft.a.y, t), f.az.filter(ft.a.z, t)).normalize();
  }
}

export class HandSystem {
  readonly hands = [new Hand(0), new Hand(1)];
  cb!: HandCallbacks;
  private P = Array.from({ length: 21 }, () => new THREE.Vector3());
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpX = new THREE.Vector3();
  private tmpY = new THREE.Vector3();
  private tmpN = new THREE.Vector3();

  constructor(private stage: Stage) {}

  
  ingest(res: HandLandmarkerResult, now: number) {
    const feats: Feat[] = [];
    for (const lm of res.landmarks) feats.push(this.features(lm));
    if (!feats.length) return;
    feats.sort((a, b) => a.cx - b.cx);

    const pairs: [Feat, Hand][] = [];
    if (feats.length >= 2) {
      pairs.push([feats[0], this.hands[0]], [feats[1], this.hands[1]]);
    } else {
      const f = feats[0];
      const recent = this.hands.filter((h) => now - h.lastSeen < 0.6);
      let pick: Hand | undefined;
      let best = Infinity;
      for (const h of recent) {
        const d = Math.hypot(h.center.x - f.cx, h.center.y - f.cy);
        if (d < best) {
          best = d;
          pick = h;
        }
      }
      if (!pick || best > Math.max(this.stage.W, this.stage.H) * 0.45) {
        const pref = this.hands[f.cx < 0 ? 0 : 1];
        const other = this.hands[f.cx < 0 ? 1 : 0];
        pick = now - pref.lastSeen >= 0.6 ? pref : other;
      }
      pairs.push([f, pick]);
    }
    for (const [f, h] of pairs) {
      h.feed(f, now);
      this.setMode(h, f.mode);
    }
  }

  private features(lm: { x: number; y: number; z: number }[]): Feat {
    const P = this.P;
    for (let i = 0; i < 21; i++) this.stage.lmToWorld(lm[i], P[i]);
    const palmLen = P[0].distanceTo(P[9]);
    const palmW = P[5].distanceTo(P[17]);
    const size = 0.6 * palmLen + 0.4 * palmW * 1.15;
    const cx = (P[0].x + P[5].x + P[9].x + P[13].x + P[17].x) / 5;
    const cy = (P[0].y + P[5].y + P[9].y + P[13].y + P[17].y) / 5;

    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];
    const ext = tips.map((t, i) => P[t].distanceTo(P[0]) > P[pips[i]].distanceTo(P[0]) * 1.15);
    const n = ext.filter(Boolean).length;
    let mode: Mode;
    if (n >= 3) mode = 'open';
    else if (n === 0) mode = 'fist';
    else if (ext[0] && n === 1) mode = 'point';
    else mode = 'other';

    const v1 = this.tmpX.copy(P[5]).sub(P[0]);
    const v2 = this.tmpY.copy(P[17]).sub(P[0]);
    const nrm = new THREE.Vector3().crossVectors(v1, v2).normalize();
    if (nrm.z < 0) nrm.negate();
    nrm.lerp(Z, 0.5).normalize();
    const ax = new THREE.Vector3().copy(P[17]).sub(P[5]).normalize();

    return { cx, cy, size, tx: P[8].x, ty: P[8].y, n: nrm, a: ax, mode };
  }

  
  private setMode(h: Hand, raw: Mode) {
    if (raw === h.cand) h.candN++;
    else {
      h.cand = raw;
      h.candN = 1;
    }
    if (h.candN < 3 || raw === h.mode) return;
    const prev = h.mode;
    h.mode = raw;
    if (raw === 'open') {
      h.target = 1;
      if (prev !== 'open') this.cb.onOpen(h);
    } else if (raw === 'fist') {
      h.target = 0;
      this.cb.onFist(h);
    } else if (raw === 'point') {
      h.target = 0;
      h.path.length = 0;
    }
  }

  
  update(dt: number, now: number) {
    const k = 1 - Math.exp(-dt * 22);
    const kt = 1 - Math.exp(-dt * 38);
    const kq = 1 - Math.exp(-dt * 16);
    for (const h of this.hands) {
      const was = h.present;
      h.present = now - h.lastSeen < 0.28;
      if (was && !h.present) {
        h.mode = 'none';
        h.cand = 'none';
        h.candN = 0;
        h.target = 0;
        h.path.length = 0;
      }
      if (h.snap) {
        h.rCenter.copy(h.center);
        h.rSize = h.size;
        h.rTip.copy(h.tip);
        h.prevTip.copy(h.tip);
        this.basis(h, h.quat);
        h.snap = false;
      }
      h.rCenter.lerp(h.center, k);
      h.rSize += (h.size - h.rSize) * k;
      h.prevTip.copy(h.rTip);
      h.rTip.lerp(h.tip, kt);
      const sp = h.rTip.distanceTo(h.prevTip) / Math.max(dt, 1e-3);
      h.tipSpeed += (sp - h.tipSpeed) * 0.3;
      this.basis(h, this.tmpQ);
      h.quat.slerp(this.tmpQ, kq);

      h.loopCooldown -= dt;
      if (h.present && h.mode === 'point') this.trackLoop(h, now);
    }
  }

  private basis(h: Hand, out: THREE.Quaternion) {
    const n = this.tmpN.copy(h.normal).normalize();
    const x = this.tmpX.copy(h.xAxis);
    x.addScaledVector(n, -x.dot(n));
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
    x.normalize();
    const y = this.tmpY.crossVectors(n, x);
    this.tmpM.makeBasis(x, y, n);
    out.setFromRotationMatrix(this.tmpM);
  }

  
  private trackLoop(h: Hand, now: number) {
    const L = CONFIG.loop;
    const last = h.path[h.path.length - 1];
    if (!last || Math.hypot(h.rTip.x - last.x, h.rTip.y - last.y) >= 4) {
      h.path.push({ x: h.rTip.x, y: h.rTip.y, t: now });
    }
    while (h.path.length && now - h.path[0].t > L.window) h.path.shift();
    if (h.loopCooldown > 0 || h.path.length < 14) return;

    const path = h.path;
    for (let s = 0; s <= path.length - 14; s += 3) {
      const res = this.testLoop(path, s);
      if (res) {
        h.loopCooldown = 1.2;
        h.path.length = 0;
        this.cb.onLoop(res.x, res.y, res.r);
        return;
      }
    }
  }

  private testLoop(path: PathPt[], start: number) {
    const L = CONFIG.loop;
    const n = path.length - start;
    let cx = 0;
    let cy = 0;
    for (let i = start; i < path.length; i++) {
      cx += path[i].x;
      cy += path[i].y;
    }
    cx /= n;
    cy /= n;
    let sum = 0;
    let sweep = 0;
    let prevA = 0;
    const radii: number[] = [];
    for (let i = start; i < path.length; i++) {
      const dx = path[i].x - cx;
      const dy = path[i].y - cy;
      const r = Math.hypot(dx, dy);
      radii.push(r);
      sum += r;
      const a = Math.atan2(dy, dx);
      if (i > start) {
        let d = a - prevA;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        sweep += d;
      }
      prevA = a;
    }
    const mean = sum / n;
    if (mean < L.minRadius) return null;
    let v = 0;
    for (const r of radii) v += (r - mean) * (r - mean);
    const cv = Math.sqrt(v / n) / mean;
    if (Math.abs(sweep) < Math.PI * 2 * L.minSweep || cv > L.maxCv) return null;
    return { x: cx, y: cy, r: mean };
  }
}
