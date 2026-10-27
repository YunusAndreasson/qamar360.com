import { useEffect, useRef } from 'react'

import { nightLight } from '#/lib/play'
import { buildStars, TILE } from '#/lib/stars'

/**
 * The night behind every page: a faint field of stars on one fixed canvas, under all the content.
 * It is there to say the page is in space, never to be looked at, so it stays dim and slow.
 *
 * Three motions, all translations, so the repeating tile never shows a seam:
 * - Depth with the scroll. Far stars move 2% of the page, near ones 8%, through a short ease, so
 *   the field glides and settles a beat after the page stops.
 * - A drift at rest, a pixel a second at most, so the sky is never frozen.
 * - A slow breath in the mid and faint stars. The bright anchors hold still.
 *
 * The home page is one night, Maghrib at the top and Fajr at the foot (`nightLight`): the field fades a
 * little over the last screens, as stars do before dawn, and it sets `--dusk` and `--dawn` on the
 * horizon's glow (`.horizon`, beside the canvas in `__root.tsx`). On that layer only, never the root:
 * a custom property set on the root is inherited by every element, so each change would restyle
 * the whole page on every frame of a scroll.
 *
 * One draw call a frame: every frame while the field is easing, about 15 a second at rest, none
 * while the tab is hidden. Under reduced motion it draws one still frame. Without WebGL2 there is
 * no canvas at all and the page is plain night, as it was.
 */

const COLD = '#DFE6F2'
const WARM = '#F4EACB'

/** How far each depth moves with the page, and how fast it drifts on its own (CSS px/s). */
const PARALLAX = [0.02, 0.045, 0.08]
const DRIFT = [0.3, 0.6, 1]
/** How much a breathing star's opacity swings either side of its rest. */
const TWINKLE = 0.35
/** The scroll ease's time constant in seconds. */
const EASE = 0.14
/** The wait between frames at rest. */
const IDLE_MS = 66
/** The night with neither dusk nor dawn in it, for every page but the home page. */
const PLAIN = { dusk: 0, dawn: 0, stars: 1 }

const VERTEX = `#version 300 es
in vec4 star;    // x, y (CSS px on the tile), size (CSS px), alpha
in vec4 motion;  // parallax, drift, breaths per second, phase
in float warm;
uniform vec2 viewport; // CSS px
uniform float dpr;
uniform float scroll;
uniform float time;
uniform float night; // the night's share of the stars' light, 1 until the dawn
uniform float tile;
uniform int across;
uniform vec3 cold;
uniform vec3 warmth;
out vec4 tint;
out float diameter;
void main() {
  vec2 copy = vec2(float(gl_InstanceID % across), float(gl_InstanceID / across));
  vec2 p = vec2(star.x + motion.y * time, star.y - motion.x * scroll);
  p = mod(p, tile) + copy * tile;
  vec2 clip = p / viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  diameter = star.z * dpr;
  // A star smaller than a pixel is drawn as a pixel with its light spread thinner.
  float light = star.w * min(diameter, 1.0) * night;
  if (motion.z > 0.0) light *= 1.0 + ${TWINKLE.toFixed(2)} * sin(6.2831853 * motion.z * time + motion.w);
  vec3 c = mix(cold, warmth, warm);
  tint = vec4(c * light, light);
  gl_PointSize = max(diameter, 1.0) + 2.0;
}`

const FRAGMENT = `#version 300 es
precision mediump float;
in vec4 tint;
in float diameter;
out vec4 color;
void main() {
  float size = max(diameter, 1.0) + 2.0;
  float d = length(gl_PointCoord - 0.5) * size;
  // A round disc with a pixel of soft edge.
  float cover = clamp(max(diameter, 1.0) * 0.5 + 0.5 - d, 0.0, 1.0);
  color = tint * cover;
}`

/** A hex colour as three 0–1 channels. The canvas is sRGB, so no conversion. */
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as [number, number, number]
}

type Renderer = {
  draw: (scroll: number, time: number, light: number) => void
  dispose: () => void
}

function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true, depth: false })
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

  const stars = buildStars()
  const data = new Float32Array(stars.length * 9)
  stars.forEach((s, i) => {
    data.set(
      [s.x, s.y, s.size, s.alpha, PARALLAX[s.depth], DRIFT[s.depth], s.period ? 1 / s.period : 0, s.phase, s.warm ? 1 : 0],
      i * 9,
    )
  })
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
  const attribute = (name: string, size: number, offset: number) => {
    const at = gl.getAttribLocation(program, name)
    gl.enableVertexAttribArray(at)
    gl.vertexAttribPointer(at, size, gl.FLOAT, false, 9 * 4, offset * 4)
  }
  attribute('star', 4, 0)
  attribute('motion', 4, 4)
  attribute('warm', 1, 8)

  const u = (name: string) => gl.getUniformLocation(program, name)
  gl.uniform1f(u('tile'), TILE)
  gl.uniform3fv(u('cold'), rgb(COLD))
  gl.uniform3fv(u('warmth'), rgb(WARM))
  const uViewport = u('viewport')
  const uDpr = u('dpr')
  const uScroll = u('scroll')
  const uTime = u('time')
  const uAcross = u('across')
  const uNight = u('night')

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.clearColor(0, 0, 0, 0)

  return {
    draw(scroll, time, light) {
      const w = canvas.width
      const h = canvas.height
      const dpr = w / Math.max(canvas.clientWidth, 1)
      const cssW = w / dpr
      const cssH = h / dpr
      const across = Math.ceil(cssW / TILE)
      const down = Math.ceil(cssH / TILE)
      gl.viewport(0, 0, w, h)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(uViewport, cssW, cssH)
      gl.uniform1f(uDpr, dpr)
      gl.uniform1f(uScroll, scroll)
      gl.uniform1f(uTime, time)
      gl.uniform1i(uAcross, across)
      gl.uniform1f(uNight, light)
      gl.drawArraysInstanced(gl.POINTS, 0, stars.length, across * down)
    },
    // Frees what this renderer made but leaves the context alive, as the moon's renderer does.
    dispose() {
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    },
  }
}

export function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = createRenderer(canvas)
    if (!renderer) {
      canvas.hidden = true
      return
    }

    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    let eased = window.scrollY
    let last = performance.now()
    const start = last
    let frame = 0
    let timer = 0

    // How far down the page the visitor is, through the same ease as the stars, and the light of
    // the night there. The horizon's glow is written only when it moves enough to show.
    const root = document.documentElement
    const horizon = document.querySelector<HTMLElement>('.horizon')
    let shown = { dusk: -1, dawn: -1 }
    const lightAt = (scroll: number) => {
      // Only the home page tells the night; the documents stay in plain night.
      const max = root.scrollHeight - window.innerHeight
      const night = document.querySelector('.landing') ? nightLight(max > 0 ? scroll / max : 0) : PLAIN
      if (Math.abs(night.dusk - shown.dusk) > 0.005 || Math.abs(night.dawn - shown.dawn) > 0.005) {
        horizon?.style.setProperty('--dusk', night.dusk.toFixed(3))
        horizon?.style.setProperty('--dawn', night.dawn.toFixed(3))
        shown = night
      }
      return night.stars
    }

    // Under reduced motion the field stands still, but the night's light still follows the page.
    const draw = () => {
      if (still.matches) renderer.draw(0, 0, lightAt(window.scrollY))
      else renderer.draw(eased, (performance.now() - start) / 1000, lightAt(eased))
      canvas.classList.add('is-lit')
    }

    const stop = () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      frame = 0
      timer = 0
    }

    const tick = (now: number) => {
      frame = 0
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const target = window.scrollY
      eased += (target - eased) * (1 - Math.exp(-dt / EASE))
      if (Math.abs(target - eased) < 0.05) eased = target
      draw()
      if (eased !== target) frame = requestAnimationFrame(tick)
      else timer = window.setTimeout(() => {
        timer = 0
        frame = requestAnimationFrame(tick)
      }, IDLE_MS)
    }

    const run = () => {
      stop()
      if (still.matches || document.hidden) {
        draw()
        return
      }
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }

    // A scroll wakes the field from its rest rate at once.
    const onScroll = () => {
      if (timer) run()
      else if (still.matches && !frame) frame = requestAnimationFrame(() => {
        frame = 0
        draw()
      })
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(canvas.clientWidth * dpr)
      const h = Math.round(canvas.clientHeight * dpr)
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w
        canvas.height = h
        draw()
      }
    }

    resize()
    run()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', run)
    still.addEventListener('change', run)
    const onLost = (event: Event) => {
      event.preventDefault()
      stop()
    }
    canvas.addEventListener('webglcontextlost', onLost)
    return () => {
      stop()
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', run)
      still.removeEventListener('change', run)
      canvas.removeEventListener('webglcontextlost', onLost)
      renderer.dispose()
    }
  }, [])

  return <canvas ref={canvasRef} className="starfield" aria-hidden />
}
