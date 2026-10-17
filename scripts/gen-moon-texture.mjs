#!/usr/bin/env node
/**
 * Bake the near side of the real moon into the texture the large moons are drawn from.
 *
 * Source: NASA's CGI Moon Kit (Scientific Visualization Studio, public domain), built from the
 * Lunar Reconnaissance Orbiter: the LROC colour mosaic for the surface and the LOLA altimeter's
 * elevation for its relief. Both are equirectangular maps of the whole globe; this projects the
 * hemisphere that faces the Earth onto a disc, as it is seen from here (north up, lunar east on
 * the right), so the app samples it 1:1 and does no map projection at run time.
 *
 * One PNG, three channels, each 0–255:
 *   R  the surface's brightness (sRGB-encoded luminance of the colour map), unlit
 *   G  the relief: how far the terrain tips the surface normal sideways (x), +0.5-centred
 *   B  the same toward the viewer (z)
 * Only x and z, because the sun the shader lights the moon with always lies in that plane (the
 * phase is a rotation about the vertical). The smooth sphere is not baked in: the shader computes
 * it exactly, so the disc's edge stays a true circle at any size, and the texture carries only the
 * craters and mountains that roughen the terminator.
 *
 * Just outside the disc the pixels repeat the limb, so filtering at the edge never pulls in black;
 * further out, where nothing samples, they are flat, which keeps the file small.
 *
 * Requires ImageMagick 7 (`magick`). The two maps (~90 MB) are downloaded once into
 * node_modules/.cache. Run from the repo root:
 *   node scripts/gen-moon-texture.mjs
 * (Not an npm script: package.json's scripts are part of the native fingerprint, so adding one
 * would cut the next update off from every build already installed.)
 */
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets/images/moon/near-side.png');
const CACHE = join(ROOT, 'node_modules/.cache/gen-moon-texture');

const KIT = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720';
/** The 2025 colour map: 16-bit sRGB, 4096×2048, centred on 0° longitude. */
const COLOR = { file: 'lroc_color_16bit_srgb_4k.tif', width: 4096, height: 2048 };
/** Elevation at 16 px/degree: unsigned half-metres, offset +20 000, on a 1737.4 km sphere. */
const DEM = { file: 'ldem_16_uint.tif', width: 5760, height: 2880 };
const MOON_RADIUS_M = 1737400;

/** The baked disc, in pixels: 3× the Progress moon (184 pt), so a 3× screen samples it ~1:1. */
const SIZE = 576;
/** Samples per pixel along each axis. The limb packs many map texels into one pixel. */
const SUPERSAMPLE = 3;
/**
 * How much the relief is exaggerated. A real terminator is ragged because crater rims and peaks
 * throw shadows across it; the texture holds no shadows, only slopes, and at this scale the slopes
 * alone read too smooth. 2.4× gives the dusk band the texture a photograph of a quarter moon has;
 * at 3× the far side of the terminator fills with stray lit pixels.
 */
const RELIEF = 2.4;
/** The relief channels hold ±this, centred on 128. */
const RELIEF_RANGE = 0.5;

function fetchOnce({ file }) {
  const path = join(CACHE, file);
  if (!existsSync(path)) {
    console.log(`downloading ${file}…`);
    execFileSync('curl', ['-sSfL', '-o', path, `${KIT}/${file}`], { stdio: 'inherit' });
  }
  return path;
}

/** A TIFF as raw 16-bit samples (ImageMagick writes them little-endian on every host we use). */
function readRaw(path, map) {
  const raw = join(CACHE, `${map}.raw`);
  execFileSync('magick', [path, '-depth', '16', '-endian', 'LSB', `${map}:${raw}`]);
  const bytes = readFileSync(raw);
  rmSync(raw);
  return new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

mkdirSync(CACHE, { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });

// The colour map, reduced to linear luminance (Rec. 709 weights) so it can be filtered.
const rgb = readRaw(fetchOnce(COLOR), 'rgb');
const albedo = new Float32Array(COLOR.width * COLOR.height);
for (let i = 0; i < albedo.length; i++) {
  const r = toLinear(rgb[i * 3] / 65535);
  const g = toLinear(rgb[i * 3 + 1] / 65535);
  const b = toLinear(rgb[i * 3 + 2] / 65535);
  albedo[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// The elevation, in metres.
const dem16 = readRaw(fetchOnce(DEM), 'gray');
const height = new Float32Array(DEM.width * DEM.height);
for (let i = 0; i < height.length; i++) height[i] = (dem16[i] - 20000) / 2;

/** Bilinear sample of an equirectangular map at a longitude/latitude in radians. */
function sample(map, width, rows, lon, lat) {
  const x = ((lon / (2 * Math.PI) + 0.5) * width - 0.5 + width) % width;
  const y = Math.min(Math.max((0.5 - lat / Math.PI) * rows - 0.5, 0), rows - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = (x0 + 1) % width;
  const y1 = Math.min(y0 + 1, rows - 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = map[y0 * width + x0] * (1 - fx) + map[y0 * width + x1] * fx;
  const bottom = map[y1 * width + x0] * (1 - fx) + map[y1 * width + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

// One DEM texel, in radians: the step for the slope's central differences.
const STEP = Math.PI / DEM.height;

/**
 * The terrain's normal at a point, in view space (x right, y down, z toward the viewer), minus the
 * smooth sphere's: the relief alone.
 */
function relief(lon, lat) {
  const h = (dLon, dLat) => sample(height, DEM.width, DEM.height, lon + dLon, lat + dLat);
  const ground = STEP * MOON_RADIUS_M;
  const east = (h(STEP, 0) - h(-STEP, 0)) / (2 * ground * Math.max(Math.cos(lat), 0.05));
  const north = (h(0, STEP) - h(0, -STEP)) / (2 * ground);
  // Tipped away from the uphill directions, in the local east/north/up frame.
  const e = -east * RELIEF;
  const n = -north * RELIEF;
  const len = Math.hypot(e, n, 1);
  const [ue, un, uu] = [e / len, n / len, 1 / len];
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  // up = the sphere's normal; east = d/dlon; north = d/dlat (y points down the screen).
  const up = [cosLat * sinLon, -sinLat, cosLat * cosLon];
  const eastV = [cosLon, 0, -sinLon];
  const northV = [-sinLat * sinLon, -cosLat, -sinLat * cosLon];
  const nx = uu * up[0] + ue * eastV[0] + un * northV[0];
  const nz = uu * up[2] + ue * eastV[2] + un * northV[2];
  return [nx - up[0], nz - up[2]];
}

/** How far past the limb (in pixels) the limb is repeated: enough for any filter's footprint. */
const BLEED = 4;

const out = Buffer.alloc(SIZE * SIZE * 3);
const clampByte = (v) => Math.min(255, Math.max(0, Math.round(v * 255)));
for (let row = 0; row < SIZE; row++) {
  for (let col = 0; col < SIZE; col++) {
    const i = (row * SIZE + col) * 3;
    if (Math.hypot(col + 0.5 - SIZE / 2, row + 0.5 - SIZE / 2) > SIZE / 2 + BLEED) {
      out[i + 1] = out[i + 2] = 128;
      continue;
    }
    let lum = 0;
    let rx = 0;
    let rz = 0;
    for (let sy = 0; sy < SUPERSAMPLE; sy++) {
      for (let sx = 0; sx < SUPERSAMPLE; sx++) {
        let x = ((col + (sx + 0.5) / SUPERSAMPLE) / SIZE) * 2 - 1;
        let y = ((row + (sy + 0.5) / SUPERSAMPLE) / SIZE) * 2 - 1;
        // Past the limb, repeat the limb (pulled a hair inside it, where the map is defined).
        const r = Math.hypot(x, y);
        if (r > 0.9999) {
          x *= 0.9999 / r;
          y *= 0.9999 / r;
        }
        const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
        const lat = Math.asin(-y);
        const lon = Math.atan2(x, z);
        lum += sample(albedo, COLOR.width, COLOR.height, lon, lat);
        const [dx, dz] = relief(lon, lat);
        rx += dx;
        rz += dz;
      }
    }
    const n = SUPERSAMPLE * SUPERSAMPLE;
    out[i] = clampByte(toSrgb(lum / n));
    out[i + 1] = clampByte(0.5 + rx / n / (2 * RELIEF_RANGE));
    out[i + 2] = clampByte(0.5 + rz / n / (2 * RELIEF_RANGE));
  }
}

const raw = join(CACHE, 'near-side.rgb');
writeFileSync(raw, out);
execFileSync('magick', ['-size', `${SIZE}x${SIZE}`, '-depth', '8', `rgb:${raw}`, '-strip', '-define', 'png:compression-level=9', OUT]);
rmSync(raw);
console.log(`wrote ${OUT.replace(`${ROOT}/`, '')}`);
