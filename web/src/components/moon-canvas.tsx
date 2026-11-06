import { useEffect, useRef } from 'react'

import { sunDirection } from '#/lib/moon'

/**
 * The real moon, drawn on the GPU exactly as the app draws its large moons: the app's Skia
 * shader (`src/components/moon-body.tsx` at the repo root) ported to WebGL2, over the same NASA
 * texture (`public/moon/near-side.png`, baked by the app's `scripts/gen-moon-texture.mjs`).
 *
 * The texture holds the surface's brightness in red and the relief's tilt in green and blue. The
 * light is Lommel–Seeliger, the law the moon's dust follows, so the full moon reads as an evenly
 * bright disc and a quarter moon shows a ragged terminator where crater walls catch the low sun.
 * The night side is the backing colour plus earthshine. The constants are the app's; see its file
 * for why each has its value.
 */
const TEXTURE = '/moon/near-side.png'

/**
 * The texture, decoded once for every moon on the page and off the main thread. It is data, not
 * colour, so it is decoded with no colour-space conversion and no premultiplying; asking the same of
 * an <img> at upload time (the UNPACK_* flags) makes the browser decode it again, synchronously,
 * for every canvas.
 */
let surface: Promise<ImageBitmap> | null = null
function loadSurface() {
  surface ??= fetch(TEXTURE)
    .then((response) => response.blob())
    .then((blob) =>
      // Orientation keeps its default: the PNG carries no orientation data, and 'none' is deprecated.
      createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }),
    )
  surface.catch(() => {
    surface = null // a failed fetch is tried again by the next moon
  })
  return surface
}

const RELIEF_RANGE = 0.5
const EXPOSURE_KNEE = 2
const ALBEDO_CONTRAST = 1.35
const SUNLIGHT = 1.5
const EARTHSHINE = 0.045
const DAWN = 0.012

/** Sunlight on the surface (the app's `moonlight`, moon 12) and the unlit backing (`moonNight`). */
const MOONLIGHT = '#FFF6E1'
const MOON_NIGHT = '#12161D'

const VERTEX = `#version 300 es
in vec2 corner;
out vec2 uv;
void main() {
  uv = corner * 0.5 + 0.5;
  gl_Position = vec4(corner, 0.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D surface;
uniform vec3 sun;
uniform vec3 moonlight;
uniform vec3 shade;
uniform float earthshine;
uniform float exposure;
uniform float pixel;

float lin(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float enc(float c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }

void main() {
  vec2 d = uv * 2.0 - 1.0;
  float r = length(d);
  float edge = 1.0 - smoothstep(1.0 - 1.5 * pixel, 1.0, r);
  if (edge <= 0.0) { color = vec4(0.0); return; }
  float z = sqrt(max(1.0 - r * r, 0.0));
  vec4 t = texture(surface, vec2(uv.x, 1.0 - uv.y));
  float albedo = pow(lin(t.r), ${ALBEDO_CONTRAST.toFixed(2)});
  vec2 tilt = (t.gb - 0.5) * ${(2 * RELIEF_RANGE).toFixed(2)};
  float nx = d.x + tilt.x;
  float nz = z + tilt.y;
  float mu0 = nx * sun.x + nz * sun.z;
  float mu = max(nz, 0.02);
  float lit = max(mu0, 0.0) + ${DAWN} * log(1.0 + exp(-abs(mu0) / ${DAWN}));
  // The relief may roughen the terminator but never light ground deep in the night: on the smooth
  // sphere a point well past the terminator has no slope steep enough to face the sun. (On the web
  // the moon is drawn larger than in the app, where a few such pixels at the limb read as specks.)
  lit *= smoothstep(-0.12, 0.02, d.x * sun.x + z * sun.z);
  float law = 2.0 * lit / (lit + mu);
  float day = (1.0 - exp(-${EXPOSURE_KNEE.toFixed(1)} * law)) / ${(1 - Math.exp(-EXPOSURE_KNEE)).toFixed(5)};
  vec3 ashen = moonlight * vec3(0.72, 0.86, 1.0) * earthshine;
  vec3 c = shade + albedo * (ashen + moonlight * day * exposure * ${SUNLIGHT.toFixed(2)});
  color = vec4(vec3(enc(c.r), enc(c.g), enc(c.b)) * edge, edge);
}`

function linear(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  const ch = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return [ch((n >> 16) & 255), ch((n >> 8) & 255), ch(n & 255)]
}

type Renderer = {
  draw: (illumination: number, waxing: boolean, brightness: number) => void
  dispose: () => void
}

function createRenderer(canvas: HTMLCanvasElement, onReady: () => void): Renderer | null {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true })
  if (!gl) return null

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    return shader
  }
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const corner = gl.getAttribLocation(program, 'corner')
  gl.enableVertexAttribArray(corner)
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0)

  const u = (name: string) => gl.getUniformLocation(program, name)
  gl.uniform3fv(u('moonlight'), linear(MOONLIGHT))
  gl.uniform3fv(u('shade'), linear(MOON_NIGHT))

  let ready = false
  let pending: [number, boolean, number] | null = null
  let disposed = false
  const texture = gl.createTexture()
  loadSurface().then((bitmap) => {
    if (disposed) return
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    ready = true
    if (pending) draw(...pending)
    onReady()
  }, () => {})

  function draw(illumination: number, waxing: boolean, brightness: number) {
    if (!ready) {
      pending = [illumination, waxing, brightness]
      return
    }
    const size = canvas.width
    gl!.viewport(0, 0, size, size)
    gl!.clearColor(0, 0, 0, 0)
    gl!.clear(gl!.COLOR_BUFFER_BIT)
    gl!.uniform3fv(u('sun'), sunDirection(illumination, waxing))
    gl!.uniform1f(u('earthshine'), EARTHSHINE * (1 - illumination) ** 2)
    gl!.uniform1f(u('exposure'), brightness)
    gl!.uniform1f(u('pixel'), 2 / size)
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4)
  }

  return {
    draw,
    // Frees what this renderer made but leaves the context alive: a canvas hands out one context
    // for life, so a lost one could never be had back if React runs the effect again.
    dispose() {
      disposed = true
      gl.deleteTexture(texture)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    },
  }
}

/**
 * The moon in a given phase, filling its box. Until WebGL and the texture are ready (or where
 * WebGL2 is missing) the box shows the plain unlit disc, so the layout never jumps.
 */
export function MoonCanvas({
  illumination,
  waxing,
  brightness = 0.8,
  className,
}: {
  illumination: number
  waxing: boolean
  /** How brightly the moonlight reads, 0–1. The app rests at 0.8 and lights to 1 at a closed month. */
  brightness?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  // The phase last drawn, for a redraw the props didn't ask for: a resize, or the renderer arriving.
  const latest = useRef({ illumination, waxing, brightness })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const redraw = () => {
      const { illumination: i, waxing: w, brightness: b } = latest.current
      rendererRef.current?.draw(i, w, b)
    }
    const resize = () => {
      const px = Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2))
      if (px > 0 && canvas.width !== px) {
        canvas.width = px
        canvas.height = px
        redraw()
      }
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    // The GPU and the texture are taken only once the moon comes within a screen of view. The first
    // moon is far down the page, and a visitor who reads only its opening never fetches the texture,
    // about half of everything the page would otherwise load.
    let renderer: Renderer | null = null
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        near.disconnect()
        renderer = createRenderer(canvas, () => canvas.setAttribute('data-ready', ''))
        rendererRef.current = renderer
        redraw()
      },
      { rootMargin: '100% 0px' },
    )
    near.observe(canvas)
    return () => {
      near.disconnect()
      observer.disconnect()
      renderer?.dispose()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    latest.current = { illumination, waxing, brightness }
    rendererRef.current?.draw(illumination, waxing, brightness)
  }, [illumination, waxing, brightness])

  return <canvas ref={canvasRef} className={className ? `moon-canvas ${className}` : 'moon-canvas'} aria-hidden />
}
