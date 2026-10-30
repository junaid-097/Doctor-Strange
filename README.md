# mystic-hand-magic

Hand tracking in the browser with fire and spell effects drawn over the camera feed. Open palm gives a circle, one finger draws a trail (draw a loop to make a new circle), a fist breaks it apart.

Vite, TypeScript, three.js, MediaPipe Hands.

## Run

```
npm install
npm run dev
```

The camera only works on https. `npm run dev` serves a self-signed certificate, so open the https address it prints.

## Build

```
npm run build
```

Output goes to `dist/`. The build script downloads the MediaPipe wasm files and the hand model. If the model can't be downloaded the app loads it from a CDN instead.

## Deploy

GitHub Pages: push to `main`, then Settings → Pages → Source → GitHub Actions. The workflow in `.github/workflows` does the rest.

Vercel or Netlify: build command `npm run build`, output directory `dist`.

## Notes

Sizes, bloom and grain are in `src/config.ts`. The circle itself is a fragment shader in `src/shaders/mandala.frag.glsl`.
