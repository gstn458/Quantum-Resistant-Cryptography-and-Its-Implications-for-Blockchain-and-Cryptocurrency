/* =====================================================================
   CryptoMath — shared 3D "storm" background
   Adapted from storm.html and recolored to match the home page palette
   (bronze #c9a24b / dark bronze #5a3a12 / cream #fff0c8 / gold #e3c77a
   on a warm near-black). Injects a fixed full-screen canvas behind page
   content on every interior page so they share the home page's look.
   Honors the site's reduce-motion preference and falls back gracefully
   to a CSS gradient if WebGL is unavailable.
   ===================================================================== */
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { GammaCorrectionShader } from 'three/addons/shaders/GammaCorrectionShader.js'
import { CopyShader } from 'three/addons/shaders/CopyShader.js'

// ---------------------------------------------------------------------------
// Reduce-motion preference (CryptoMath setting + OS preference)
// ---------------------------------------------------------------------------
function reduceMotionOn() {
  try {
    const v = (localStorage.getItem('cryptomath_reduce_motion') || '').toLowerCase()
    if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true
  } catch (e) {}
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true
  } catch (e) {}
  return false
}
const REDUCE = reduceMotionOn()

// ---------------------------------------------------------------------------
// Create the background canvas (fixed, behind all content)
// ---------------------------------------------------------------------------
let canvas = document.getElementById('storm-bg-canvas')
if (!canvas) {
  canvas = document.createElement('canvas')
  canvas.id = 'storm-bg-canvas'
  document.body.appendChild(canvas)
}
Object.assign(canvas.style, {
  position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
  zIndex: '-1', pointerEvents: 'none', display: 'block',
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hexToVec3(hex) {
  const n = parseInt(hex.slice(1), 16)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}
const Lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ---------------------------------------------------------------------------
// Fixed parameters — recolored to the home page's bronze / gold palette
// ---------------------------------------------------------------------------
const CONFIG = {
  bgColor: '#0a0806',      // warm near-black (home radial inner #1a0f06 -> #000)
  flameColor: '#c9a24b',   // bronze (home icosahedron)
  flameColor2: '#e3c77a',  // light gold (home wireframe)
  flameAmt: 0.16,
  atmoColor: '#e3c77a',    // gold motes
  atmoCount: 300,
  atmoSize: 24,
  atmoSpeed: REDUCE ? 0 : 1.0,
  coreColor: '#5a3a12',    // dark bronze (home dark face)
  midColor: '#c9a24b',     // bronze
  rimColor: '#fff0c8',     // cream highlight (home nodes)
  opacity: 1.5,
  pointSize: 72,
  brightness: 1.3,
  spin: REDUCE ? 0 : 0.03,
  blowUp: 0,
  repelRadius: 1.4,
  repelStrength: REDUCE ? 0 : 4,
  scrollDive: REDUCE ? 0 : 3,
  scrollGrow: REDUCE ? 0 : 0.5,
  scrollSpin: REDUCE ? 0 : 0.6,
  parallax: REDUCE ? 0 : 0.7,
}

const LAYERS = { NONE: 0, TORUS_SCENE: 1, BLOOM_SCENE: 2, ENTIRE_SCENE: 3 }

function boot() {
// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGL1Renderer({ canvas, antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.VSMShadowMap

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x000000)
scene.fog = new THREE.Fog(0x000000, 0, 15)

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 80)
camera.position.set(0, 0, 7)
camera.layers.enable(LAYERS.TORUS_SCENE)
camera.layers.enable(LAYERS.BLOOM_SCENE)
camera.layers.enable(LAYERS.ENTIRE_SCENE)
scene.add(camera)

// ---------------------------------------------------------------------------
// Storm: ~50,000 additive points in a Group
// ---------------------------------------------------------------------------
const stormVertexShader = `
uniform float uTime;
uniform float uSize;
uniform float uBlowUp;
uniform vec3 uCursor;
uniform float uRepelRadius;
uniform float uRepelStrength;
uniform float uActivity;
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uRim;
attribute float aScale;
attribute float aNoise;
attribute float aRadialPush;
attribute float aMix;
varying vec3 vColor;
varying float vBlowUp;
void main() {
  vec3 pos = position;
  float t = uTime * 1.4 + aNoise * 6.2831;
  float wobble = sin(t) * 0.1 * aRadialPush;
  pos *= 1.0 + wobble;
  float swirlAngle = uTime * 0.05 + aNoise * 6.2831;
  mat2 swirl = mat2(cos(swirlAngle), -sin(swirlAngle), sin(swirlAngle), cos(swirlAngle));
  pos.xz = swirl * pos.xz;
  vec3 outward = normalize(pos + vec3(0.0001));
  float blow = uBlowUp * uBlowUp;
  pos += outward * blow * (10.0 + aNoise * 18.0) * aRadialPush;
  vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
  vec3 toParticle = modelPosition.xyz - uCursor;
  float dist = length(toParticle);
  float falloff = smoothstep(uRepelRadius, 0.0, dist);
  modelPosition.xyz += normalize(toParticle + vec3(0.0001)) * falloff * uRepelStrength * uActivity;
  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = uSize * aScale;
  gl_PointSize *= (1.0 / -viewPosition.z);
  float t1 = smoothstep(0.25, 0.85, aMix);
  vec3 mix1 = mix(uCore, uMid, t1);
  float t2 = clamp((aMix - 0.7) * 3.0, 0.0, 1.0);
  vColor = mix(mix1, uRim, t2);
  vBlowUp = uBlowUp;
}
`

const stormFragmentShader = `
uniform float uOpacity;
uniform float uBrightness;
varying vec3 vColor;
varying float vBlowUp;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float strength = pow(1.0 - d * 2.0, 4.5);
  vec3 color = mix(vec3(0.0), vColor, strength);
  float blowFade = 1.0 - smoothstep(0.15, 1.0, vBlowUp);
  gl_FragColor = vec4(color * uBrightness, strength * uOpacity * blowFade);
}
`

function buildStorm() {
  // CryptoMath: scale particle density to device capability (set by cm-enhance.js)
  const __cmLow = (typeof window !== "undefined" && window.__CM_PERF_LOW) === true
  const count = __cmLow ? 14000 : 50000, radius = 2.5
  const positions = new Float32Array(count * 3)
  const scales = new Float32Array(count)
  const noises = new Float32Array(count)
  const radialPush = new Float32Array(count)
  const mixv = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    let u, v, s
    do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v } while (s >= 1 || s === 0)
    const factor = 2 * Math.sqrt(1 - s)
    const dx = u * factor, dy = v * factor, dz = 1 - 2 * s
    const rN = Math.pow(Math.random(), 0.4)
    const r = radius * (0.55 + rN * 0.45)
    positions[i3] = dx * r; positions[i3 + 1] = dy * r; positions[i3 + 2] = dz * r
    mixv[i] = rN
    scales[i] = 0.45 + Math.random() * 0.8
    noises[i] = Math.random()
    radialPush[i] = 0.4 + rN * 1.1
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aScale', new THREE.Float32BufferAttribute(scales, 1))
  geometry.setAttribute('aNoise', new THREE.Float32BufferAttribute(noises, 1))
  geometry.setAttribute('aRadialPush', new THREE.Float32BufferAttribute(radialPush, 1))
  geometry.setAttribute('aMix', new THREE.Float32BufferAttribute(mixv, 1))
  const uniforms = {
    uTime:          { value: 0 },
    uSize:          { value: CONFIG.pointSize },
    uOpacity:       { value: 0 },
    uBlowUp:        { value: CONFIG.blowUp },
    uCursor:        { value: new THREE.Vector3() },
    uRepelRadius:   { value: CONFIG.repelRadius },
    uRepelStrength: { value: CONFIG.repelStrength },
    uActivity:      { value: 0 },
    uCore:          { value: hexToVec3(CONFIG.coreColor) },
    uMid:           { value: hexToVec3(CONFIG.midColor) },
    uRim:           { value: hexToVec3(CONFIG.rimColor) },
    uBrightness:    { value: CONFIG.brightness },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: stormVertexShader,
    fragmentShader: stormFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geometry, material)
  points.layers.enable(LAYERS.ENTIRE_SCENE)
  points.frustumCulled = false
  const group = new THREE.Group()
  group.add(points)
  scene.add(group)
  const now = performance.now()
  return {
    uniforms, group, points, appearStart: now, t0: now / 1000,
    render(scroll, m) {
      const t = performance.now() / 1000
      const dt = Math.min(0.05, t - this.t0); this.t0 = t
      this.uniforms.uTime.value = t
      camera.position.set(m.x * CONFIG.parallax, m.y * CONFIG.parallax, 7 - scroll * CONFIG.scrollDive)
      camera.lookAt(0, 0, 0)
      this.group.scale.setScalar(1 + scroll * CONFIG.scrollGrow)
      const elapsed = performance.now() - this.appearStart
      const fade = Math.max(0, Math.min(1, (elapsed - 300) / 1400))
      this.uniforms.uOpacity.value = fade * CONFIG.opacity
      this.uniforms.uBlowUp.value = CONFIG.blowUp
      this.uniforms.uCursor.value.copy(POINTER.world)
      this.uniforms.uActivity.value = POINTER.activity
      this.group.rotation.y += dt * (CONFIG.spin + scroll * CONFIG.scrollSpin)
      this.group.rotation.x += dt * CONFIG.spin * 0.33
    }
  }
}

const sceneObj = buildStorm()

// ---------------------------------------------------------------------------
// Ambient atmosphere motes (camera-attached drifting points)
// ---------------------------------------------------------------------------
const atmoVertexShader = `
attribute float size;
attribute float seed;
uniform float uTime;
uniform vec2 uRes;
varying float vA;
vec3 warp(vec3 p, float t){ float c=0.9,a=1.9,b=0.02,s=0.05; p*=2.;
  p.x+=c*sin(s*t+a*p.y)+t*b; p.y+=c*cos(s*t+a*p.x); p.y+=c*sin(s*t+a*p.z)+t*b;
  p.z+=c*cos(s*t+a*p.y); p.z+=c*sin(s*t+a*p.x)+t*b; p.x+=c*cos(s*t+a*p.z);
  return cos(p+vec3(1,2,4)); }
void main(){
  vec3 v = position*4.0 + warp(position, uTime)*1.2;
  vec4 mv = modelViewMatrix * vec4(v, 1.0);
  float r = length(v); float farF = 1.0 - smoothstep(5.0, 6.5, r); float nearF = smoothstep(0.0, 0.5, -mv.z);
  vA = farF * nearF;
  gl_PointSize = size * uRes.y / 900.0 / -mv.z; gl_PointSize = max(gl_PointSize, 1.0);
  gl_Position = projectionMatrix * mv;
}
`
const atmoFragmentShader = `
uniform vec3 uColor;
varying float vA;
void main(){ vec2 p = gl_PointCoord - 0.5; float l = length(p); if (l > 0.5) discard;
  float tex = smoothstep(0.5, 0.0, l); gl_FragColor = vec4(uColor * tex, tex * vA * 0.6); }
`
let atmoMat
function buildAtmosphere() {
  const N = Math.round(CONFIG.atmoCount)
  const positions = new Float32Array(N * 3), sizes = new Float32Array(N), seeds = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    positions[i*3] = 2*Math.random()-1; positions[i*3+1] = 2*Math.random()-1; positions[i*3+2] = 2*Math.random()-1
    sizes[i] = CONFIG.atmoSize * (0.4 + Math.random()); seeds[i] = Math.random()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1))
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1))
  atmoMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: hexToVec3(CONFIG.atmoColor) },
      uRes: { value: new THREE.Vector2(innerWidth * devicePixelRatio, innerHeight * devicePixelRatio) }
    },
    vertexShader: atmoVertexShader,
    fragmentShader: atmoFragmentShader,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  })
  const pts = new THREE.Points(geometry, atmoMat)
  pts.frustumCulled = false
  pts.layers.enable(LAYERS.ENTIRE_SCENE)
  pts.onBeforeRender = () => {
    const t = performance.now() / 1000
    atmoMat.uniforms.uTime.value = t * CONFIG.atmoSpeed * 8.0
    pts.position.copy(camera.position)
    finalPass.uniforms.iTime.value = REDUCE ? 0 : t
  }
  scene.add(pts)
  return pts
}

// ---------------------------------------------------------------------------
// Composite / corner-flame FinalPass
// ---------------------------------------------------------------------------
const blackHalo = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat)
blackHalo.needsUpdate = true
const FinalPass = {
  uniforms: {
    iTime: { value: 0 },
    tDiffuse: { value: null }, torusTexture: { value: null }, bloomTexture: { value: null }, haloTexture: { value: blackHalo },
    uBg: { value: hexToVec3(CONFIG.bgColor) },
    uFlameA: { value: hexToVec3(CONFIG.flameColor) },
    uFlameB: { value: hexToVec3(CONFIG.flameColor2) },
    uFlameAmt: { value: CONFIG.flameAmt }
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`,
  fragmentShader: `
uniform float iTime;
uniform sampler2D tDiffuse;
uniform sampler2D bloomTexture;
uniform sampler2D torusTexture;
uniform sampler2D haloTexture;
uniform vec3 uBg;
uniform vec3 uFlameA;
uniform vec3 uFlameB;
uniform float uFlameAmt;
varying vec2 vUv;
vec3 warp3d(vec3 pos, float t){ float curv=.8,a=1.9,b=0.7; pos*=2.;
  pos.x+=curv*sin(t+a*pos.y)+t*b; pos.y+=curv*cos(t+a*pos.x);
  pos.y+=curv*sin(t+a*pos.z)+t*b; pos.z+=curv*cos(t+a*pos.y);
  pos.z+=curv*sin(t+a*pos.x)+t*b; pos.x+=curv*cos(t+a*pos.z);
  return 0.5+0.5*cos(pos.xyz+vec3(1,2,4)); }
void main(){
  vec2 uv = 2.*vUv - 1.;
  vec3 w = pow(warp3d(vec3(uv.x, sin(uv.y), uv.y), iTime*1.5), vec3(1.5));
  vec3 flame = 1.5*uFlameA*w.x; flame*=w.y; flame += uFlameB*w.z;
  flame *= smoothstep(0.25, 1., abs(uv.y));
  float md = smoothstep(-0.7, 1., -uv.y*uv.x); flame *= md*md;
  vec3 bg = uBg * (1.0 - 0.4 * length(uv));
  vec3 halo = texture2D(haloTexture, vUv).xyz;
  gl_FragColor = vec4(bg + flame*uFlameAmt + texture2D(bloomTexture, vUv).xyz + texture2D(torusTexture, vUv).xyz + texture2D(tDiffuse, vUv).xyz + halo, 1.);
}
`
}

// ---------------------------------------------------------------------------
// Postprocessing composers
// ---------------------------------------------------------------------------
const renderScene = new RenderPass(scene, camera)
const torusComposer = new EffectComposer(renderer)
torusComposer.renderToScreen = false
torusComposer.addPass(renderScene)
torusComposer.addPass(new ShaderPass(GammaCorrectionShader))
torusComposer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.2, 0))
torusComposer.addPass(new ShaderPass(CopyShader))
const bloomComposer = new EffectComposer(renderer)
bloomComposer.renderToScreen = false
bloomComposer.addPass(renderScene)
bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.55, 0))
bloomComposer.addPass(new ShaderPass(GammaCorrectionShader))
const finalComposer = new EffectComposer(renderer)
finalComposer.addPass(renderScene)
const finalPass = new ShaderPass(FinalPass)
finalComposer.addPass(finalPass)
finalPass.uniforms.bloomTexture.value = bloomComposer.renderTarget1.texture
finalPass.uniforms.torusTexture.value = torusComposer.renderTarget1.texture
buildAtmosphere()

// ---------------------------------------------------------------------------
// Pointer / cursor void (world-space)
// ---------------------------------------------------------------------------
const POINTER = { ndc: new THREE.Vector2(0, 0), world: new THREE.Vector3(), activity: 0, active: false, lastMove: performance.now() }
window.addEventListener('mousemove', e => {
  POINTER.ndc.x = (e.clientX / window.innerWidth) * 2 - 1
  POINTER.ndc.y = -((e.clientY / window.innerHeight) * 2 - 1)
  POINTER.active = true; POINTER.lastMove = performance.now()
}, { passive: true })
window.addEventListener('mouseout', () => { POINTER.active = false }, { passive: true })
const _ndc = new THREE.Vector3(), _dir = new THREE.Vector3(), _target = new THREE.Vector3()
function updatePointer() {
  _target.set(0, 0, 0)
  if (POINTER.active && !REDUCE) {
    _ndc.set(POINTER.ndc.x, POINTER.ndc.y, 0.5).unproject(camera)
    _dir.copy(_ndc).sub(camera.position).normalize()
    const denom = _dir.z
    if (Math.abs(denom) > 1e-4) {
      const t = -camera.position.z / denom
      if (t > 0 && Number.isFinite(t)) _target.copy(camera.position).addScaledVector(_dir, t)
    }
  }
  POINTER.world.lerp(_target, 0.12)
  const idle = (performance.now() - POINTER.lastMove) / 1000
  const want = (POINTER.active && idle < 3) ? 1 : 0
  POINTER.activity += (want - POINTER.activity) * 0.06
}

// ---------------------------------------------------------------------------
// Scroll mapping — uses the real page scroll height
// ---------------------------------------------------------------------------
let scrollTarget = 0, scrollSmooth = 0, scrollCurrent = 0
const mouseSmooth = { x: 0, y: 0 }
function updateScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  scrollTarget = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0
}
window.addEventListener('scroll', updateScroll, { passive: true }); updateScroll()

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  for (const c of [torusComposer, bloomComposer, finalComposer]) {
    c.setPixelRatio(Math.min(devicePixelRatio, 2))
    c.setSize(innerWidth, innerHeight)
  }
  if (atmoMat) atmoMat.uniforms.uRes.value.set(innerWidth * devicePixelRatio, innerHeight * devicePixelRatio)
  updateScroll()
})

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
function render() {
  requestAnimationFrame(render)
  // CryptoMath: skip GPU work while tab hidden / globally paused (saves battery, INP)
  if (document.hidden || window.__CM_PAUSE_3D) { return }
  scrollSmooth  = Lerp(scrollSmooth, scrollTarget, 0.10)
  scrollCurrent = Lerp(scrollCurrent, scrollSmooth, 0.06)
  mouseSmooth.x = Lerp(mouseSmooth.x, POINTER.ndc.x, 0.06)
  mouseSmooth.y = Lerp(mouseSmooth.y, POINTER.ndc.y, 0.06)
  updatePointer()
  sceneObj.render(scrollCurrent, mouseSmooth)
  camera.layers.set(LAYERS.TORUS_SCENE);  torusComposer.render()
  camera.layers.set(LAYERS.BLOOM_SCENE);  bloomComposer.render()
  camera.layers.set(LAYERS.ENTIRE_SCENE); finalComposer.render()
}
render()
}

// Initialize; if WebGL is unavailable, leave the CSS gradient fallback in place.
try {
  boot()
} catch (err) {
  console.warn('[storm-bg] WebGL background unavailable, using CSS fallback.', err)
  if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
}
