import * as THREE from 'three';
import { Mandala } from './mandala';
import { Particles } from './particles';
import { Ribbon } from './ribbon';
import type { Stage } from './stage';
import type { Hand, HandCallbacks, HandSystem } from './hands';
import type { Sfx } from './audio';
import { CONFIG } from './config';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Director implements HandCallbacks {
  readonly mandalas: Mandala[];
  readonly particles: Particles;
  private ribbons: Ribbon[];
  private rimAcc = [0, 0, 0];
  private conjT = 0;
  quality = 1;

  private v = new THREE.Vector3();
  private t = new THREE.Vector3();
  private ident = new THREE.Quaternion();

  constructor(
    private stage: Stage,
    private hands: HandSystem,
    private sfx: Sfx,
  ) {
    this.mandalas = [0, 1, 2].map((i) => new Mandala(stage.scene, stage.shared, 0.13 + i * 0.31));
    this.particles = new Particles(stage.scene, CONFIG.particles.max);
    this.ribbons = [new Ribbon(stage.scene), new Ribbon(stage.scene)];
    hands.cb = this;
  }

  private radiusFor(h: Hand) {
    return Math.min(h.rSize * CONFIG.mandalaRadiusPerPalm, Math.min(this.stage.W, this.stage.H) * CONFIG.maxRadiusFrac);
  }

  onOpen(h: Hand) {
    const m = this.mandalas[h.slot];
    this.sfx.whoosh(1);
    navigator.vibrate?.(14);
    this.stage.shake = Math.max(this.stage.shake, 0.25);
    const R = this.radiusFor(h);
    this.ringBurst(h.rCenter.x, h.rCenter.y, 0, R, Math.round(110 * this.quality), m.quat);
  }

  onFist(h: Hand) {
    const m = this.mandalas[h.slot];
    if (m.power < 0.3) return;
    this.sfx.boom();
    navigator.vibrate?.([20, 30, 40]);
    this.stage.shake = Math.max(this.stage.shake, 0.8);
    const s = Math.max(0.6, Math.min(h.rSize / 90, 2.2));
    const n = Math.round(150 * this.quality);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(120, 900) * s;
      this.particles.emit(
        h.rCenter.x + Math.cos(a) * 10 * s,
        h.rCenter.y + Math.sin(a) * 10 * s,
        2,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        rnd(0.45, 1.2),
        rnd(1.6, 4.2) * s,
        rnd(0.8, 1.6),
        -520 * s,
        1.7,
      );
    }
  }

  onLoop(x: number, y: number, r: number) {
    const m = this.mandalas[2];
    const rr = Math.min(r * 1.12, Math.min(this.stage.W, this.stage.H) * CONFIG.maxRadiusFrac);
    m.set(x, y, 0, rr, this.ident);
    m.target = 1;
    this.conjT = CONFIG.loop.life;
    this.sfx.whoosh(1.3);
    navigator.vibrate?.(22);
    this.stage.shake = Math.max(this.stage.shake, 0.55);
    this.ringBurst(x, y, 0, rr, Math.round(180 * this.quality), this.ident);
  }

  private ringBurst(cx: number, cy: number, cz: number, R: number, n: number, q: THREE.Quaternion) {
    const s = Math.max(0.6, Math.min(R / 160, 2.2));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.v.set(Math.cos(a) * R, Math.sin(a) * R, 0).applyQuaternion(q);
      const sp = R * rnd(1.0, 3.2);
      this.particles.emit(
        cx + this.v.x,
        cy + this.v.y,
        cz + 2,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        rnd(0.5, 1.15),
        rnd(1.6, 4.4) * s,
        rnd(0.8, 1.5),
        -R * 1.4,
        1.8,
      );
    }
  }

  private rim(idx: number, m: Mandala, rate: number, dt: number) {
    this.rimAcc[idx] += rate * dt;
    const n = Math.floor(this.rimAcc[idx]);
    this.rimAcc[idx] -= n;
    const R = m.R;
    const s = Math.max(0.6, Math.min(R / 160, 2.2));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      this.v.set(c * R, sn * R, 0).applyQuaternion(m.quat).add(m.center);
      this.t.set(-sn, c, 0).applyQuaternion(m.quat);
      const sp = R * rnd(0.15, 0.7);
      const tang = rnd(-0.5, 0.5) * sp;
      const spark = Math.random() < 0.3;
      this.particles.emit(
        this.v.x,
        this.v.y,
        m.center.z + 2,
        c * sp * 0.5 + this.t.x * tang + rnd(-20, 20),
        sn * sp * 0.5 + this.t.y * tang + R * 0.25,
        spark ? rnd(0.45, 0.9) : rnd(0.7, 1.5),
        (spark ? rnd(1.4, 3.0) : rnd(1.8, 4.2)) * s,
        spark ? rnd(1.0, 1.6) : 0.2,
        spark ? -R * 1.1 : R * 0.45,
        spark ? 1.4 : 1.1,
      );
    }
  }

  private tipFx(h: Hand, dt: number) {
    const s = Math.max(0.6, Math.min(h.rSize / 90, 2.2));
    const x = h.rTip.x;
    const y = h.rTip.y;
    this.particles.emit(x, y, 3, 0, 0, 0.06, 15 * s, 0, 0, 0);
    const nEmb = Math.max(1, Math.round(dt * 420 * this.quality));
    for (let i = 0; i < nEmb; i++) {
      this.particles.emit(
        x + rnd(-3, 3),
        y + rnd(-3, 3),
        2,
        rnd(-35, 35),
        rnd(10, 70),
        rnd(0.35, 0.85),
        rnd(1.4, 3.4) * s,
        0.2,
        90,
        1.4,
      );
    }
    const nSp = Math.round(dt * 110 * this.quality + Math.random());
    for (let i = 0; i < nSp; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(120, 420) * s;
      this.particles.emit(x, y, 2, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.4, 0.95), rnd(1.4, 3.0) * s, 1.3, -480 * s, 1.9);
    }
  }

  update(dt: number, now: number) {
    let heat = 0;
    let draw = 0;

    for (const h of this.hands.hands) {
      const m = this.mandalas[h.slot];
      m.target = h.target;
      if (h.target > 0 || m.visible) {
        const R = this.radiusFor(h);
        const off = h.rSize * 0.35;
        m.set(h.rCenter.x + h.normal.x * off, h.rCenter.y + h.normal.y * off, h.normal.z * off, R, h.quat);
      }
      m.update(dt, now);
      if (m.power > 0.05) {
        this.rim(h.slot, m, 125 * Math.min(m.power, 1) * this.quality, dt);
        heat = Math.max(heat, Math.min(m.power, 1));
      }

      const rb = this.ribbons[h.slot];
      if (h.present && h.mode === 'point') {
        rb.add(h.rTip.x, h.rTip.y, now, Math.max(3.5, h.rSize * 0.055));
        this.tipFx(h, dt);
        draw = Math.max(draw, h.tipSpeed);
        heat = Math.max(heat, 0.35);
          }
      rb.update(now);
    }

    const c = this.mandalas[2];
    if (this.conjT > 0) {
      this.conjT -= dt;
      if (this.conjT < 0.9) c.target = 0;
    }
    c.update(dt, now);
    if (c.power > 0.05) {
      this.rim(2, c, 125 * Math.min(c.power, 1) * this.quality, dt);
      heat = Math.max(heat, Math.min(c.power, 1));
    }

    this.particles.update(dt, now);
    this.stage.heat += (heat - this.stage.heat) * Math.min(1, dt * 6);
    const maxP = Math.max(...this.mandalas.map((m) => m.power));
    this.sfx.update(dt, maxP, draw);
  }
}
