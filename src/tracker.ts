import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';

const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const abs = (p: string) => new URL(p, document.baseURI).href;

export class Tracker {
  private lm?: HandLandmarker;
  private lastTs = 0;
  delegate: 'GPU' | 'CPU' = 'GPU';
  source = 'local';

  get ready() {
    return !!this.lm;
  }

  async init() {
    const base = import.meta.env.BASE_URL;
    const wasms = [abs(base + 'wasm'), CDN_WASM];
    const models = [abs(base + 'models/hand_landmarker.task'), CDN_MODEL];
    let lastErr: unknown;
    for (const w of wasms) {
      const fileset = await FilesetResolver.forVisionTasks(w);
      for (const m of models) {
        for (const d of ['GPU', 'CPU'] as const) {
          try {
            this.lm = await HandLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: m, delegate: d },
              runningMode: 'VIDEO',
              numHands: 2,
              minHandDetectionConfidence: 0.5,
              minHandPresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });
            this.delegate = d;
            this.source = w === wasms[0] && m === models[0] ? 'local' : 'cdn';
            return;
          } catch (e) {
            lastErr = e;
          }
        }
      }
    }
    throw lastErr ?? new Error('Hand tracker init failed');
  }

  detect(video: HTMLVideoElement): HandLandmarkerResult | null {
    if (!this.lm) return null;
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;
    try {
      return this.lm.detectForVideo(video, ts);
    } catch {
      return null;
    }
  }
}
