import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';

const WASM_SRC = 'node_modules/@mediapipe/tasks-vision/wasm';
const WASM_DST = 'public/wasm';
const MODEL = 'public/models/hand_landmarker.task';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

if (existsSync(WASM_SRC)) {
  mkdirSync(WASM_DST, { recursive: true });
  cpSync(WASM_SRC, WASM_DST, { recursive: true });
  console.log('[assets] wasm copied → public/wasm');
} else {
  console.warn('[assets] wasm not found, run npm install first');
}

const ok = existsSync(MODEL) && statSync(MODEL).size > 1_000_000;
if (!ok) {
  try {
    mkdirSync('public/models', { recursive: true });
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    writeFileSync(MODEL, Buffer.from(await res.arrayBuffer()));
    console.log('[assets] hand model downloaded → ' + MODEL);
  } catch (e) {
    console.warn('[assets] model download failed (' + e.message + '), will load from CDN at runtime');
  }
} else {
  console.log('[assets] hand model already present');
}
