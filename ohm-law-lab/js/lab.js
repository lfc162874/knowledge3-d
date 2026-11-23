import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  clamp, lerp, smoothstep, easeOutBack, easeOutCubic,
  VOLTAGE_MAX, RESISTANCE_MAX,
} from './physics.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const WIRE_Y = 0.24;

const COLORS = {
  cyan: 0x5be8ff,
  cyanDeep: 0x1d8dff,
  amber: 0xffc46b,
  copper: 0xff8f5f,
  steel: 0x8aa7b8,
  dark: 0x050b13,
  panel: 0x07121d,
  rose: 0xff7d72,
};

/* ------------------------------------------------------------------ */
/* Canvas texture helpers                                              */
/* ------------------------------------------------------------------ */

function makeCanvas(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function canvasTexture(canvas, { srgb = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function makeGlowTexture() {
  const canvas = makeCanvas(128);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.16, 'rgba(190,248,255,0.98)');
  gradient.addColorStop(0.45, 'rgba(70,205,255,0.46)');
  gradient.addColorStop(1, 'rgba(30,120,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(canvas);
}

function makeGridTexture(theme = 'dark') {
  const canvas = makeCanvas(1024);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 1024, 1024);
  const light = theme === 'light';

  ctx.lineWidth = 1;
  for (let i = 0; i <= 1024; i += 32) {
    const major = i % 256 === 0;
    ctx.strokeStyle = light
      ? (major ? 'rgba(23,87,104,0.28)' : 'rgba(40,105,122,0.14)')
      : (major ? 'rgba(80,174,218,0.3)' : 'rgba(48,114,152,0.14)');
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }

  const vignette = ctx.createRadialGradient(512, 512, 80, 512, 512, 512);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.5, 'rgba(0,0,0,0.1)');
  vignette.addColorStop(0.82, 'rgba(0,0,0,0.72)');
  vignette.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.globalCompositeOperation = 'source-over';

  return canvasTexture(canvas);
}

function makeDecalTexture(text, color = '#69eaff') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '600 54px "SF Pro Display", "Avenir Next", "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = color;
  ctx.fillText(text, 512, 96);
  return canvasTexture(canvas);
}

function makeSpriteText(text, color = '#8feaff', px = 150) {
  const canvas = makeCanvas(256);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.font = `600 ${px}px "SF Pro Display", "Avenir Next", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 128);
  const texture = canvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.9,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.36, 0.36, 0.36);
  return sprite;
}

function createGaugeTexture({ unit, max, major, color, name, subtitle }) {
  const size = 1024;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const center = size / 2;
  const radius = size * 0.455;

  ctx.clearRect(0, 0, size, size);

  const bg = ctx.createRadialGradient(center * 0.82, center * 0.62, 30, center, center, radius);
  bg.addColorStop(0, '#0a1a25');
  bg.addColorStop(0.52, '#061019');
  bg.addColorStop(0.9, '#030a10');
  bg.addColorStop(1, '#02060a');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, TAU);
  ctx.fill();

  // Fine inner graticule
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, radius * 0.9, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = 'rgba(100,170,200,0.055)';
  ctx.lineWidth = 1;
  for (let x = 0; x < size; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y < size; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.restore();

  // Rim
  ctx.strokeStyle = 'rgba(195,241,255,0.28)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(center, center, radius * 0.94, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(center, center, radius * 0.9, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const start = 135 * DEG;
  const sweep = 270 * DEG;
  const subDivisions = 5;
  const total = max * subDivisions;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineCap = 'round';

  for (let i = 0; i <= total; i += 1) {
    const ratio = i / total;
    const angle = start + ratio * sweep;
    const isMajor = i % subDivisions === 0;
    const isMid = i % subDivisions === 0 || i % 5 === 0;
    const inner = radius * (isMajor ? 0.68 : isMid ? 0.735 : 0.765);
    const outer = radius * 0.835;
    ctx.strokeStyle = isMajor ? 'rgba(219,250,255,0.9)' : 'rgba(154,210,231,0.46)';
    ctx.lineWidth = isMajor ? 5 : isMid ? 3 : 1.4;
    ctx.globalAlpha = isMajor ? 1 : 0.8;
    ctx.beginPath();
    ctx.moveTo(center + Math.cos(angle) * inner, center + Math.sin(angle) * inner);
    ctx.lineTo(center + Math.cos(angle) * outer, center + Math.sin(angle) * outer);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.font = '700 108px "SF Mono", "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= max; i += major) {
    const ratio = i / max;
    const angle = start + ratio * sweep;
    const rad = radius * 0.565;
    const x = center + Math.cos(angle) * rad;
    const y = center + Math.sin(angle) * rad + 2;
    ctx.lineWidth = 16;
    ctx.strokeStyle = 'rgba(0, 5, 9, 0.98)';
    ctx.strokeText(String(i), x, y);
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(245, 254, 255, 0.99)';
    ctx.fillText(String(i), x, y);
    ctx.shadowBlur = 0;
  }

  // Unit and identity
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = color;
  ctx.font = '600 70px "SF Pro Display", "Avenir Next", sans-serif';
  ctx.globalAlpha = 0.42;
  ctx.fillText(unit, center, center + radius * 0.5);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.font = '500 27px "SF Mono", "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(155,205,226,0.66)';
  ctx.fillText(name, center, center + radius * 0.64);

  ctx.font = '500 22px "SF Mono", "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(100,166,192,0.58)';
  ctx.fillText(subtitle, center, center - radius * 0.63);

  // Small glowing marker near zero
  const zeroAngle = start;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(center + Math.cos(zeroAngle) * radius * 0.87, center + Math.sin(zeroAngle) * radius * 0.87, 6, 0, TAU);
  ctx.fill();

  return canvasTexture(canvas);
}

function createMeterDisplay(unit, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const texture = canvasTexture(canvas);
  return { canvas, ctx, texture, unit, color, last: '' };
}

function drawMeterDisplay(display, value) {
  const { ctx, canvas, color, unit } = display;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const radius = 18;
  ctx.beginPath();
  ctx.moveTo(radius, 3);
  ctx.lineTo(w - radius, 3);
  ctx.quadraticCurveTo(w - 3, 3, w - 3, radius);
  ctx.lineTo(w - 3, h - radius);
  ctx.quadraticCurveTo(w - 3, h - 3, w - radius, h - 3);
  ctx.lineTo(radius, h - 3);
  ctx.quadraticCurveTo(3, h - 3, 3, h - radius);
  ctx.lineTo(3, radius);
  ctx.quadraticCurveTo(3, 3, radius, 3);
  ctx.closePath();
  ctx.fillStyle = 'rgba(2, 9, 14, 0.9)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(155, 222, 240, 0.7)';
  ctx.font = '500 19px "SF Mono", "JetBrains Mono", monospace';
  ctx.fillText('LIVE', 22, 26);

  ctx.textAlign = 'right';
  ctx.font = '600 100px "SF Mono", "JetBrains Mono", monospace';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillText(value, w - 88, h * 0.62);
  ctx.shadowBlur = 0;

  ctx.textAlign = 'left';
  ctx.font = '600 42px "SF Mono", "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(226, 250, 255, 0.9)';
  ctx.fillText(unit, w - 70, h * 0.65);

  ctx.fillStyle = 'rgba(100, 173, 196, 0.6)';
  ctx.fillRect(22, 47, 46, 2);
  display.texture.needsUpdate = true;
}

function createStudioEnvironment(renderer, theme = 'dark') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const light = theme === 'light';

  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  if (light) {
    sky.addColorStop(0, '#f7fbfc');
    sky.addColorStop(0.4, '#eaf3f5');
    sky.addColorStop(0.52, '#cfe2e7');
    sky.addColorStop(0.68, '#e7f0f2');
    sky.addColorStop(1, '#ffffff');
  } else {
    sky.addColorStop(0, '#010308');
    sky.addColorStop(0.4, '#071825');
    sky.addColorStop(0.52, '#10334a');
    sky.addColorStop(0.66, '#06121c');
    sky.addColorStop(1, '#010204');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);

  const glow = ctx.createRadialGradient(500, 245, 10, 500, 245, 320);
  if (light) {
    glow.addColorStop(0, 'rgba(255,255,255,0.8)');
    glow.addColorStop(0.45, 'rgba(160,211,222,0.2)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    glow.addColorStop(0, 'rgba(83,187,235,0.5)');
    glow.addColorStop(0.45, 'rgba(38,104,145,0.13)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
  }
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 512);

  ctx.save();
  ctx.filter = 'blur(24px)';
  if (light) {
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fillRect(236, 96, 188, 30);
    ctx.fillStyle = 'rgba(188,228,238,0.8)';
    ctx.fillRect(640, 140, 136, 20);
    ctx.fillStyle = 'rgba(255,231,197,0.55)';
    ctx.fillRect(70, 190, 112, 16);
  } else {
    ctx.fillStyle = 'rgba(218,246,255,0.9)';
    ctx.fillRect(236, 96, 188, 30);
    ctx.fillStyle = 'rgba(90,184,255,0.5)';
    ctx.fillRect(640, 140, 136, 20);
    ctx.fillStyle = 'rgba(255,193,115,0.38)';
    ctx.fillRect(70, 190, 112, 16);
  }
  ctx.restore();

  const texture = canvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(texture).texture;
  texture.dispose();
  pmrem.dispose();
  return envMap;
}

/* ------------------------------------------------------------------ */
/* Small geometry helpers                                             */
/* ------------------------------------------------------------------ */

function cylinder(radius, height, material, segments = 32) {
  return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
}

function torus(radius, tube, material, arc = TAU, radialSegments = 10, tubularSegments = 64) {
  return new THREE.Mesh(new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments, arc), material);
}

class HelixCurve extends THREE.Curve {
  constructor(length, radius, turns) {
    super();
    this.length = length;
    this.radius = radius;
    this.turns = turns;
  }

  getPoint(t, target = new THREE.Vector3()) {
    const angle = t * TAU * this.turns;
    return target.set(
      -this.length / 2 + this.length * t,
      Math.sin(angle) * this.radius,
      Math.cos(angle) * this.radius,
    );
  }
}

function buildCable(points, material, radius = 0.06, segments = 96) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    false,
    'centripetal',
  );
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 8, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  geometry.userData = { fullIndexCount: geometry.index.count };
  return { mesh, curve, geometry };
}

/* ------------------------------------------------------------------ */
/* The lab scene                                                      */
/* ------------------------------------------------------------------ */

export class OhmLab {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = options;
    this.onAutoCameraChange = options.onAutoCameraChange ?? (() => {});
    this.onUserInteract = options.onUserInteract ?? (() => {});
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.composer = null;
    this.bloomPass = null;
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.autoCamera = true;
    this.stage = 0;
    this.current = 0;
    this.voltage = 3;
    this.resistance = 3;
    this.assemblyTime = 0;
    this.switchClosed = false;
    this.wasSwitchClosed = false;
    this.flowOffset = 0;
    this.currentSmooth = 0;
    this.meterNeedle = { amp: 2.35, volt: 1.414, ampV: 0, voltV: 0 };
    this.barrierCount = 3;
    this.pointerPos = new THREE.Vector2();
    this.cameraShots = [
      { pos: new THREE.Vector3(10.15, 8.05, 16.1), target: new THREE.Vector3(-0.35, 1.05, -0.05), drift: 0.1 },
      { pos: new THREE.Vector3(9.25, 6.85, 14.8), target: new THREE.Vector3(-0.1, 1.1, -0.15), drift: 0.075 },
      { pos: new THREE.Vector3(9.3, 7.0, 3.2), target: new THREE.Vector3(2.9, 1.0, -2.7), drift: 0.025 },
      { pos: new THREE.Vector3(12.15, 8.65, 18.4), target: new THREE.Vector3(-0.2, 1.05, 0), drift: 0.12 },
    ];

    this._initRenderer();
    this._initScene();
    this._initLights();
    this._buildMaterials();
    this._buildBackdrop();
    this._buildPlatform();
    this._buildCircuit();
    this._buildFlowParticles();
    this._buildInternalParticles();
    this._initPostprocessing();
    this._initCamera();
    this._bindResize();

    this._animate = this._animate.bind(this);
    this.renderer.setAnimationLoop(this._animate);
  }

  /* ---------------------------------------------------------------- */
  /* Setup                                                            */
  /* ---------------------------------------------------------------- */

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.85));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03070d);
    this.scene.fog = new THREE.FogExp2(0x03070d, 0.026);
    this.envDark = createStudioEnvironment(this.renderer, 'dark');
    this.envLight = createStudioEnvironment(this.renderer, 'light');
    this.scene.environment = this.envDark;
    this.theme = 'dark';

    this.camera = new THREE.PerspectiveCamera(
      35,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
  }

  _initLights() {
    const hemi = new THREE.HemisphereLight(0x376987, 0x02050a, 0.72);
    this.scene.add(hemi);
    this.hemiLight = hemi;

    const key = new THREE.DirectionalLight(0xd9f4ff, 3.2);
    key.position.set(6.5, 11, 7.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 32;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.018;
    this.scene.add(key);
    this.keyLight = key;

    const rim = new THREE.DirectionalLight(0x27bfff, 2.45);
    rim.position.set(-8, 5.2, -8.5);
    this.scene.add(rim);
    this.rimLight = rim;

    const warm = new THREE.PointLight(0xffa75a, 34, 17, 2);
    warm.position.set(-3.5, 3.1, 5.5);
    this.scene.add(warm);
    this.warmLight = warm;

    const cool = new THREE.PointLight(0x55dfff, 42, 16, 2);
    cool.position.set(4.2, 2.8, 3.3);
    this.scene.add(cool);
    this.coolLight = cool;

    const spot = new THREE.SpotLight(0x7cecff, 40, 24, 0.48, 0.7, 2);
    spot.position.set(0.5, 10.5, 3.5);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = false;
    this.scene.add(spot, spot.target);
    this.spotLight = spot;
  }

  _buildMaterials() {
    this.materials = {
      cable: new THREE.MeshStandardMaterial({
        color: 0x0e2938,
        roughness: 0.3,
        metalness: 0.7,
        emissive: 0x0d4b63,
        emissiveIntensity: 0.92,
        envMapIntensity: 1.25,
      }),
      senseWire: new THREE.MeshStandardMaterial({
        color: 0x5a3c21,
        roughness: 0.35,
        metalness: 0.68,
        emissive: 0x9b5d20,
        emissiveIntensity: 0.55,
        envMapIntensity: 1.2,
      }),
      copper: new THREE.MeshStandardMaterial({
        color: 0xd08a50,
        roughness: 0.23,
        metalness: 0.96,
        emissive: 0x7a3514,
        emissiveIntensity: 0.3,
        envMapIntensity: 1.7,
      }),
      brightCopper: new THREE.MeshStandardMaterial({
        color: 0xffa363,
        roughness: 0.18,
        metalness: 0.9,
        emissive: 0xff743c,
        emissiveIntensity: 0.7,
        envMapIntensity: 1.8,
      }),
      switchBlade: new THREE.MeshStandardMaterial({
        color: 0xbc713d,
        roughness: 0.34,
        metalness: 0.76,
        emissive: 0x7a2b0d,
        emissiveIntensity: 0.34,
        envMapIntensity: 1.15,
      }),
      steel: new THREE.MeshStandardMaterial({
        color: 0x849ba9,
        roughness: 0.22,
        metalness: 0.96,
        envMapIntensity: 1.6,
      }),
      darkSteel: new THREE.MeshStandardMaterial({
        color: 0x0b1721,
        roughness: 0.28,
        metalness: 0.84,
        envMapIntensity: 1.35,
      }),
      ceramic: new THREE.MeshStandardMaterial({
        color: 0x07131c,
        roughness: 0.42,
        metalness: 0.48,
        emissive: 0x071e2a,
        emissiveIntensity: 0.3,
        envMapIntensity: 1.1,
      }),
      offWhite: new THREE.MeshStandardMaterial({
        color: 0xbfc9c7,
        roughness: 0.4,
        metalness: 0.2,
        envMapIntensity: 0.9,
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0xa9ddf6,
        roughness: 0.055,
        metalness: 0.06,
        transmission: 0.72,
        thickness: 0.45,
        ior: 1.46,
        transparent: true,
        opacity: 0.52,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 2.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      batteryBody: new THREE.MeshStandardMaterial({
        color: 0x0b2232,
        roughness: 0.3,
        metalness: 0.72,
        emissive: 0x061a28,
        emissiveIntensity: 0.5,
        envMapIntensity: 1.5,
      }),
      glassDark: new THREE.MeshPhysicalMaterial({
        color: 0x06111a,
        roughness: 0.08,
        metalness: 0.3,
        transmission: 0.16,
        transparent: true,
        opacity: 0.82,
        clearcoat: 1,
        envMapIntensity: 1.7,
        depthWrite: false,
      }),
    };
  }

  _buildBackdrop() {
    this.gridMaps = {
      dark: makeGridTexture('dark'),
      light: makeGridTexture('light'),
    };
    const gridMaterial = new THREE.MeshBasicMaterial({
      map: this.gridMaps.dark,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.gridMaterial = gridMaterial;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(52, 52), gridMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.62;
    this.scene.add(floor);

    this.floorDiscMaterial = new THREE.MeshStandardMaterial({
      color: 0x010307,
      roughness: 0.78,
      metalness: 0.25,
      transparent: true,
      opacity: 0.88,
    });
    const floorDisc = new THREE.Mesh(
      new THREE.CircleGeometry(22, 96),
      this.floorDiscMaterial,
    );
    floorDisc.rotation.x = -Math.PI / 2;
    floorDisc.position.y = -0.64;
    this.scene.add(floorDisc);

    this.haloGroup = new THREE.Group();
    this.haloRingMaterials = [];
    const ringConfigs = [
      { radius: 7.6, y: 1.2, opacity: 0.16, tilt: 0.03, color: 0x2b9dd6 },
      { radius: 8.9, y: 2.5, opacity: 0.1, tilt: 0.11, color: 0x1b6fa6 },
      { radius: 10.5, y: 0.42, opacity: 0.065, tilt: -0.03, color: 0x2c7ca3 },
    ];
    for (const config of ringConfigs) {
      const material = new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: config.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(config.radius, 0.015, 6, 180),
        material,
      );
      ring.rotation.x = Math.PI / 2 + config.tilt;
      ring.position.y = config.y;
      ring.userData.themeColor = config.color;
      ring.userData.themeOpacity = config.opacity;
      this.haloRingMaterials.push(material);
      this.haloGroup.add(ring);
    }

    this.streakMaterial = new THREE.MeshBasicMaterial({
      color: 0x53d9ff,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const streakMaterial = this.streakMaterial;
    for (let i = 0; i < 3; i += 1) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(8.2 + i * 0.8, 0.012, 4, 140, 1.1),
        streakMaterial,
      );
      arc.rotation.set(Math.PI / 2 + 0.08 * i, 0.2 * i, 0.16 * i);
      arc.position.y = 2.7 + i * 0.35;
      this.haloGroup.add(arc);
    }
    this.scene.add(this.haloGroup);

    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x2b8ebf,
      transparent: true,
      opacity: 0.022,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.beamMaterial = beamMaterial;
    const beam = new THREE.Mesh(new THREE.ConeGeometry(3.9, 9.8, 40, 1, true), beamMaterial);
    beam.position.set(-2.9, 4.5, -5.8);
    this.scene.add(beam);
    const beam2 = beam.clone();
    beam2.material = beamMaterial.clone();
    beam2.material.opacity = 0.015;
    beam2.position.set(4.4, 4.1, -5.1);
    beam2.scale.set(0.8, 0.8, 0.8);
    this.scene.add(beam2);
    this.beams = [beam, beam2];
    this.beamMaterials = [beamMaterial, beam2.material];

    this._buildDust();
  }

  _buildDust() {
    const count = 260;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 1] = Math.random() * 9 - 0.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 24;
      sizes[i] = 0.4 + Math.random() * 1.2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uColor: { value: new THREE.Color(0x68d8ff) },
      },
      vertexShader: /* glsl */`
        attribute float aScale;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (2.2 * aScale) * uPixelRatio * (7.0 / max(1.0, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
          vAlpha = 0.18 + aScale * 0.22;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float core = smoothstep(0.11, 0.0, d);
          float halo = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(uColor, (core + halo * 0.24) * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(geometry, material);
    this.scene.add(this.dust);
  }

  _buildPlatform() {
    const platform = new THREE.Group();
    platform.position.y = 0;

    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x061018,
      roughness: 0.3,
      metalness: 0.82,
      envMapIntensity: 1.4,
    });
    this.baseMaterial = baseMaterial;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(6.35, 6.58, 0.36, 96), baseMaterial);
    base.position.y = 0.18;
    base.receiveShadow = true;
    base.castShadow = true;
    platform.add(base);

    const topMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x050e17,
      roughness: 0.72,
      metalness: 0.38,
      clearcoat: 0.22,
      clearcoatRoughness: 0.55,
      envMapIntensity: 0.72,
    });
    this.topMaterial = topMaterial;
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(6.25, 6.3, 0.1, 96),
      topMaterial,
    );
    top.position.y = 0.41;
    top.receiveShadow = true;
    platform.add(top);

    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(6.34, 0.045, 8, 180),
      new THREE.MeshBasicMaterial({
        color: 0x62e5ff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 0.46;
    platform.add(edge);
    this.platformEdge = edge;
    this.edgeMaterial = edge.material;

    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(5.55, 0.018, 6, 180),
      new THREE.MeshBasicMaterial({
        color: 0x4da3ca,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.47;
    platform.add(innerRing);
    this.innerRingMaterial = innerRing.material;

    // Radial rim ticks
    const tickGeo = new THREE.BoxGeometry(0.08, 0.012, 0.22);
    const tickMat = new THREE.MeshBasicMaterial({
      color: 0x8cecff,
      transparent: true,
      opacity: 0.44,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.tickMaterial = tickMat;
    const tickCount = 56;
    const ticks = new THREE.InstancedMesh(tickGeo, tickMat, tickCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < tickCount; i += 1) {
      const a = (i / tickCount) * TAU;
      dummy.position.set(Math.sin(a) * 5.94, 0.475, Math.cos(a) * 5.94);
      dummy.rotation.y = a;
      dummy.scale.set(1, 1, i % 7 === 0 ? 1.9 : 1);
      dummy.updateMatrix();
      ticks.setMatrixAt(i, dummy.matrix);
    }
    platform.add(ticks);

    const surfaceRingMaterial = new THREE.MeshBasicMaterial({
      color: 0x5edcf5,
      transparent: true,
      opacity: 0.085,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.surfaceRingMaterial = surfaceRingMaterial;
    for (const radius of [2.1, 3.35, 4.55, 5.32]) {
      const surfaceRing = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.008, 4, 160),
        surfaceRingMaterial,
      );
      surfaceRing.rotation.x = Math.PI / 2;
      surfaceRing.position.y = 0.468;
      platform.add(surfaceRing);
    }

    const seamMaterial = new THREE.MeshBasicMaterial({
      color: 0x4eb4d4,
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.seamMaterial = seamMaterial;
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * TAU + 0.12;
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 2.25), seamMaterial);
      seam.position.set(Math.sin(angle) * 4.55, 0.469, Math.cos(angle) * 4.55);
      seam.rotation.y = angle;
      platform.add(seam);
    }

    const decalMaterial = new THREE.MeshBasicMaterial({
      map: makeDecalTexture('OHM LAB  /  CIRCUIT BAY 01'),
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.decalMaterial = decalMaterial;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.675), decalMaterial);
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = Math.PI;
    decal.position.set(0, 0.478, 4.7);
    platform.add(decal);

    const underglow = new THREE.PointLight(0x1a9dff, 6, 7.5, 2);
    underglow.position.set(0, -0.3, 0.4);
    platform.add(underglow);
    this.platformUnderglow = underglow;

    this.scene.add(platform);
    this.platform = platform;
  }

  _buildCircuit() {
    this.circuit = new THREE.Group();
    this.circuit.position.y = 0.43;
    this.scene.add(this.circuit);

    this.components = {
      battery: this._buildBattery(),
      switch: this._buildSwitch(),
      resistor: this._buildResistor(),
      ammeter: this._buildMeter({
        x: 0.45, z: 3.68, rotation: -0.045, unit: 'A', name: 'AMMETER',
        subtitle: 'DC CURRENT', max: 5, major: 1, color: '#5fe8ff', kind: 'amp',
      }),
      voltmeter: this._buildMeter({
        x: 3.35, z: 3.02, rotation: -0.18, unit: 'V', name: 'VOLTMETER',
        subtitle: 'DC VOLTAGE', max: 15, major: 3, color: '#ffc46b', kind: 'volt',
      }),
    };

    for (const [key, group] of Object.entries(this.components)) {
      group.userData.component = key;
      group.userData.reveal = 0;
      this.circuit.add(group);
    }

    this._buildCables();
    this._buildCurrentArrows();
    this._buildSpark();
  }

  _buildBattery() {
    const group = new THREE.Group();
    group.position.set(-3.1, 0, -2.65);

    const base = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.13, 1.18), this.materials.ceramic);
    base.position.y = 0.065;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const footMaterial = this.materials.darkSteel;
    for (const x of [-1.35, 1.35]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.9), footMaterial);
      foot.position.set(x, 0.04, 0);
      group.add(foot);
    }

    const cellGroup = new THREE.Group();
    const cellGeom = new THREE.CylinderGeometry(0.205, 0.205, 2.22, 28, 1, false);
    const capGeom = new THREE.CylinderGeometry(0.215, 0.215, 0.075, 28);
    for (let i = 0; i < 3; i += 1) {
      const z = (i - 1) * 0.31;
      const cell = new THREE.Mesh(cellGeom, this.materials.batteryBody);
      cell.rotation.z = Math.PI / 2;
      cell.position.set(0, 0.38, z);
      cell.castShadow = true;
      cellGroup.add(cell);

      for (const side of [-1, 1]) {
        const cap = new THREE.Mesh(capGeom, this.materials.copper);
        cap.rotation.z = Math.PI / 2;
        cap.position.set(side * 1.12, 0.38, z);
        cellGroup.add(cap);
      }

      const band = torus(0.212, 0.012, this.materials.steel, TAU, 6, 32);
      band.rotation.y = Math.PI / 2;
      band.position.set(0, 0.38, z);
      cellGroup.add(band);
    }
    group.add(cellGroup);

    this.batteryBars = [];
    const barMaterial = new THREE.MeshBasicMaterial({
      color: 0x72e9ff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    for (let i = 0; i < 3; i += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.018, 0.018), barMaterial.clone());
      bar.position.set(0, 0.61, (i - 1) * 0.31);
      group.add(bar);
      this.batteryBars.push(bar);
    }

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.34, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0x08141d,
        roughness: 0.3,
        metalness: 0.65,
        emissive: 0x08232e,
        emissiveIntensity: 0.4,
      }),
    );
    panel.position.set(0, 0.63, 0.67);
    group.add(panel);

    for (const side of [-1, 1]) {
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.38, 0.98), this.materials.darkSteel);
      clamp.position.set(side * 1.33, 0.36, 0);
      group.add(clamp);
      const post = cylinder(0.08, 0.38, this.materials.copper, 20);
      post.position.set(side * 1.35, 0.45, 0);
      group.add(post);
      const terminal = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.075, 20), this.materials.copper);
      terminal.position.set(side * 1.35, 0.67, 0);
      group.add(terminal);
    }

    const plus = makeSpriteText('+', '#ffce7a', 160);
    plus.position.set(1.35, 0.88, 0.12);
    group.add(plus);
    const minus = makeSpriteText('−', '#8feaff', 160);
    minus.position.set(-1.35, 0.88, 0.12);
    group.add(minus);

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.025, 0.035),
      new THREE.MeshBasicMaterial({ color: 0xffbc6a, transparent: true, opacity: 0.8 }),
    );
    strip.position.set(0, 0.145, 0.58);
    group.add(strip);
    this.batteryStrip = strip;

    const status = new THREE.Mesh(
      new THREE.CircleGeometry(0.047, 20),
      new THREE.MeshBasicMaterial({ color: 0x69e9ff, transparent: true, opacity: 0.9 }),
    );
    status.position.set(0.88, 0.5, 0.6);
    group.add(status);
    this.batteryStatus = status;

    return group;
  }

  _buildResistor() {
    const group = new THREE.Group();
    group.position.set(2.95, 0, -2.65);

    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.11, 0.5), this.materials.ceramic);
      foot.position.set(side * 1.26, 0.055, 0);
      foot.castShadow = true;
      group.add(foot);

      const insulator = cylinder(0.13, 0.54, this.materials.offWhite, 20);
      insulator.position.set(side * 1.26, 0.37, 0);
      insulator.castShadow = true;
      group.add(insulator);

      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.35), this.materials.steel);
      clamp.position.set(side * 1.26, 0.7, 0);
      group.add(clamp);

      const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.12, 20), this.materials.copper);
      socket.position.set(side * 1.26, 0.11, 0);
      group.add(socket);

      const lead = cylinder(0.028, 0.38, this.materials.copper, 10);
      lead.rotation.z = Math.PI / 2;
      lead.position.set(side * 1.12, 0.86, 0);
      group.add(lead);
    }

    const axisY = 0.92;
    const core = cylinder(0.06, 1.86, this.materials.darkSteel, 20);
    core.rotation.z = Math.PI / 2;
    core.position.y = axisY;
    group.add(core);

    const coilCurve = new HelixCurve(1.58, 0.205, 8);
    const coil = new THREE.Mesh(
      new THREE.TubeGeometry(coilCurve, 300, 0.017, 6, false),
      this.materials.brightCopper,
    );
    coil.position.y = axisY;
    coil.castShadow = true;
    group.add(coil);
    this.resistorCoil = coil;
    this.resistorCoilMaterial = coil.material;

    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.405, 0.405, 2.0, 48, 1, false),
      this.materials.glass,
    );
    shell.rotation.z = Math.PI / 2;
    shell.position.y = axisY;
    shell.renderOrder = 2;
    group.add(shell);
    this.resistorShell = shell;

    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.43, 0.43, 0.16, 36),
        this.materials.darkSteel,
      );
      cap.rotation.z = Math.PI / 2;
      cap.position.set(side * 1.01, axisY, 0);
      cap.castShadow = true;
      group.add(cap);

      const rim = torus(0.425, 0.022, this.materials.copper, TAU, 8, 44);
      rim.rotation.y = Math.PI / 2;
      rim.position.set(side * 1.09, axisY, 0);
      group.add(rim);
    }

    const innerRing = torus(0.425, 0.014, new THREE.MeshBasicMaterial({
      color: 0x7ee6ff,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }), TAU, 6, 48);
    innerRing.rotation.y = Math.PI / 2;
    innerRing.position.set(0, axisY, 0);
    group.add(innerRing);

    this.barrierRings = [];
    const barrierMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb85e,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < 12; i += 1) {
      const ring = torus(0.27, 0.012, barrierMaterial.clone(), TAU, 5, 30);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(-0.64 + (i / 11) * 1.28, axisY, 0);
      ring.visible = i < 3;
      ring.userData.index = i;
      group.add(ring);
      this.barrierRings.push(ring);
    }

    this.barrierDiscs = [];
    for (let i = 0; i < 12; i += 1) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.285, 32),
        new THREE.MeshBasicMaterial({
          color: 0xff9a63,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      disc.rotation.y = Math.PI / 2;
      disc.position.set(-0.64 + (i / 11) * 1.28, axisY, 0);
      disc.visible = i < 3;
      disc.userData.index = i;
      group.add(disc);
      this.barrierDiscs.push(disc);
    }

    const omega = makeSpriteText('Ω', '#ffb166', 145);
    omega.position.set(0, axisY + 0.75, 0);
    omega.scale.set(0.26, 0.26, 0.26);
    group.add(omega);

    return group;
  }

  _buildSwitch() {
    const group = new THREE.Group();
    group.position.set(-2.55, 0, 3.86);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.16, 0.62), this.materials.ceramic);
    base.position.y = 0.09;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.045, 0.46), this.materials.darkSteel);
    plate.position.y = 0.195;
    group.add(plate);

    for (const side of [-1, 1]) {
      const post = cylinder(0.072, 0.34, this.materials.copper, 20);
      post.position.set(side * 0.48, 0.37, 0);
      post.castShadow = true;
      group.add(post);
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 12), this.materials.steel);
      pad.position.set(side * 0.48, 0.54, 0);
      group.add(pad);
    }

    const bladePivot = new THREE.Group();
    bladePivot.position.set(-0.48, 0.58, 0);
    group.add(bladePivot);

    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.99, 0.065, 0.13),
      this.materials.switchBlade,
    );
    blade.position.x = 0.48;
    blade.castShadow = true;
    bladePivot.add(blade);

    const handle = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.2, 4, 12),
      new THREE.MeshStandardMaterial({
        color: 0x0d2a3a,
        roughness: 0.32,
        metalness: 0.45,
        emissive: 0x0f6d88,
        emissiveIntensity: 0.5,
      }),
    );
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0.94, 0.05, 0);
    bladePivot.add(handle);

    const label = makeSpriteText('S', '#88e8ff', 145);
    label.position.set(0, 0.98, 0.05);
    label.scale.set(0.27, 0.27, 0.27);
    group.add(label);

    this.switchBlade = bladePivot;
    this.switchBase = group;
    return group;
  }

  _buildMeter({ x, z, rotation, unit, name, subtitle, max, major, color, kind }) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotation;

    const centerY = 1.5;
    const bodyRadius = 0.68;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.13, 40), this.materials.ceramic);
    base.position.y = 0.075;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.9, 0.22), this.materials.darkSteel);
    neck.position.y = 0.54;
    group.add(neck);

    const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 28, Math.PI), this.materials.steel);
    yoke.rotation.z = Math.PI;
    yoke.position.y = 0.98;
    group.add(yoke);

    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(bodyRadius + 0.07, bodyRadius + 0.09, 0.28, 72),
      this.materials.darkSteel,
    );
    housing.rotation.x = Math.PI / 2;
    housing.position.y = centerY;
    housing.castShadow = true;
    group.add(housing);

    const bezel = torus(bodyRadius + 0.075, 0.034, this.materials.steel, TAU, 10, 80);
    bezel.position.set(0, centerY, 0.145);
    group.add(bezel);

    const accent = torus(bodyRadius + 0.11, 0.012, new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }), TAU, 6, 90);
    accent.position.set(0, centerY, 0.145);
    group.add(accent);

    const faceTexture = createGaugeTexture({ unit, max, major, color, name, subtitle });
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(bodyRadius - 0.02, 72),
      new THREE.MeshBasicMaterial({ map: faceTexture, toneMapped: false }),
    );
    face.position.set(0, centerY, 0.152);
    group.add(face);

    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(bodyRadius + 0.02, 72),
      new THREE.MeshPhysicalMaterial({
        color: 0x99e0ff,
        roughness: 0.04,
        metalness: 0,
        transparent: true,
        opacity: 0.08,
        clearcoat: 1,
        depthWrite: false,
      }),
    );
    glass.position.set(0, centerY, 0.18);
    glass.renderOrder = 3;
    group.add(glass);

    const display = createMeterDisplay(unit, color);
    drawMeterDisplay(display, kind === 'amp' ? '0.00' : '0.0');
    const displayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 0.206),
      new THREE.MeshBasicMaterial({
        map: display.texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    displayMesh.position.set(0, centerY - 0.45, 0.19);
    displayMesh.renderOrder = 4;
    group.add(displayMesh);

    if (kind === 'amp') this.ampDisplay = display;
    else this.voltDisplay = display;

    const needlePivot = new THREE.Group();
    needlePivot.position.set(0, centerY, 0.205);
    group.add(needlePivot);

    const needle = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.51, 0.012),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), toneMapped: false }),
    );
    needle.position.y = 0.255;
    needlePivot.add(needle);

    const needleTail = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.12, 0.012),
      new THREE.MeshBasicMaterial({ color: 0x6f8898, toneMapped: false }),
    );
    needleTail.position.y = -0.06;
    needlePivot.add(needleTail);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 0.022, 24),
      this.materials.steel,
    );
    cap.rotation.x = Math.PI / 2;
    cap.position.set(0, centerY, 0.235);
    group.add(cap);

    for (const side of [-1, 1]) {
      const terminal = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.15, 16), this.materials.copper);
      terminal.position.set(side * 0.64, 0.25, 0.04);
      group.add(terminal);
      const ring = torus(0.075, 0.018, this.materials.steel, TAU, 6, 18);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(side * 0.64, 0.33, 0.04);
      group.add(ring);
    }

    if (kind === 'amp') {
      this.ampNeedle = needlePivot;
      this.ampAccentMat = accent.material;
    } else {
      this.voltNeedle = needlePivot;
      this.voltAccentMat = accent.material;
    }

    const amber = kind === 'volt';
    const underglow = new THREE.PointLight(
      amber ? 0xffb55b : 0x45dcff,
      3.2,
      2.6,
      2,
    );
    underglow.position.set(0, centerY - 0.15, 0.5);
    group.add(underglow);
    if (kind === 'amp') this.ampLight = underglow;
    else this.voltLight = underglow;

    return group;
  }

  _buildCables() {
    this.wireMeshes = [];

    const cableSpecs = [
      {
        start: 0.55,
        duration: 1.25,
        points: [
          [-1.76, 0.68, -2.65], [-1.48, 0.32, -2.65], [-1.15, 0.24, -2.65],
          [-0.6, 0.24, -2.65], [0.2, 0.24, -2.65], [1.0, 0.24, -2.65], [1.5, 0.24, -2.65],
        ],
      },
      {
        start: 1.25,
        duration: 1.3,
        points: [
          [4.4, 0.24, -2.65], [4.7, 0.24, -2.65], [4.95, 0.24, -2.28],
          [4.95, 0.24, -0.4], [4.95, 0.24, 2.35], [4.82, 0.24, 3.55],
          [4.46, 0.24, 3.9], [3.75, 0.24, 3.9], [2.7, 0.24, 3.9], [1.55, 0.24, 3.9],
          [1.2, 0.24, 3.9], [1.09, 0.27, 3.79],
        ],
      },
      {
        start: 2.05,
        duration: 0.85,
        points: [
          [-0.19, 0.27, 3.79], [-0.6, 0.24, 3.9], [-1.1, 0.24, 3.9],
          [-1.58, 0.24, 3.9], [-2.02, 0.27, 3.79],
        ],
      },
      {
        start: 2.4,
        duration: 1.2,
        points: [
          [-3.08, 0.27, 3.79], [-3.55, 0.24, 3.9], [-4.1, 0.24, 3.9],
          [-4.65, 0.24, 3.72], [-4.94, 0.24, 3.3], [-4.94, 0.24, 1.0],
          [-4.94, 0.24, -1.5], [-4.86, 0.24, -2.35], [-4.58, 0.24, -2.65],
          [-4.4, 0.34, -2.65],
        ],
      },
    ];

    for (const spec of cableSpecs) {
      const { mesh, curve, geometry } = buildCable(spec.points, this.materials.cable, 0.068);
      mesh.userData.revealStart = spec.start;
      mesh.userData.revealDuration = spec.duration;
      this.wireMeshes.push(mesh);
      this.circuit.add(mesh);
      if (!this.mainCableCurves) this.mainCableCurves = [];
      this.mainCableCurves.push(curve);
    }

    // Thin amber sense wires: voltmeter in parallel with the resistor.
    const senseSpecs = [
      {
        start: 3.95,
        duration: 0.9,
        points: [[1.64, 0.18, -2.65], [1.7, 0.3, -2.2], [1.9, 0.34, -1.2], [2.25, 0.34, 0.4], [2.75, 0.34, 1.9], [3.03, 0.3, 2.78]],
      },
      {
        start: 4.05,
        duration: 0.9,
        points: [[4.26, 0.18, -2.65], [4.55, 0.28, -2.2], [4.7, 0.34, -1.1], [4.7, 0.34, 0.9], [4.45, 0.34, 2.2], [3.72, 0.3, 2.78]],
      },
    ];

    for (const spec of senseSpecs) {
      const { mesh } = buildCable(spec.points, this.materials.senseWire, 0.022, 72);
      mesh.userData.revealStart = spec.start;
      mesh.userData.revealDuration = spec.duration;
      this.wireMeshes.push(mesh);
      this.circuit.add(mesh);
    }

    const sensorGlow = new THREE.MeshBasicMaterial({
      color: 0xffc36c,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (const [x, z] of [[2.94, 2.78], [3.78, 2.78]]) {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), sensorGlow);
      bead.position.set(x, 0.31, z);
      this.circuit.add(bead);
    }

    // Gold collars at cable/component junctions.
    const collar = new THREE.MeshBasicMaterial({
      color: 0xffba70,
      transparent: true,
      opacity: 0.5,
    });
    for (const [x, y, z] of [
      [-1.78, 0.31, -2.65], [1.55, 0.24, -2.65], [4.38, 0.24, -2.65],
      [1.08, 0.27, 3.78], [-0.2, 0.27, 3.78], [-2.04, 0.27, 3.78],
      [-3.06, 0.27, 3.78], [-4.38, 0.32, -2.65],
    ]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.014, 6, 20), collar);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y, z);
      this.circuit.add(ring);
    }
  }

  _buildCurrentArrows() {
    this.currentArrows = new THREE.Group();
    const arrowMaterial = new THREE.MeshBasicMaterial({
      color: 0xa9f8ff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.arrowMaterial = arrowMaterial;

    const makeArrow = () => {
      const arrow = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.34, 10), arrowMaterial);
      shaft.rotation.z = Math.PI / 2;
      shaft.position.x = 0.17;
      arrow.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.19, 14), arrowMaterial);
      head.rotation.z = -Math.PI / 2;
      head.position.x = 0.42;
      arrow.add(head);

      return arrow;
    };

    const leftArrow = makeArrow();
    leftArrow.scale.setScalar(2.15);
    leftArrow.position.set(-0.9, 0.72, 4.0);
    leftArrow.rotation.y = Math.PI;
    this.currentArrows.add(leftArrow);

    const rightArrow = makeArrow();
    rightArrow.scale.setScalar(2.15);
    rightArrow.position.set(2.55, 0.72, 4.0);
    rightArrow.rotation.y = Math.PI;
    this.currentArrows.add(rightArrow);

    this.circuit.add(this.currentArrows);
  }

  _buildSpark() {
    const sparkMaterial = new THREE.MeshBasicMaterial({
      color: 0xa8f4ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.sparkGroup = new THREE.Group();
    this.sparkGroup.position.set(-2.07, 0.64, 3.86);
    this.sparkBits = [];
    for (let i = 0; i < 13; i += 1) {
      const bit = new THREE.Mesh(new THREE.SphereGeometry(0.015 + Math.random() * 0.014, 6, 5), sparkMaterial.clone());
      bit.userData.angle = Math.random() * TAU;
      bit.userData.speed = 0.35 + Math.random() * 1.1;
      bit.userData.life = Math.random();
      this.sparkGroup.add(bit);
      this.sparkBits.push(bit);
    }
    this.sparkLight = new THREE.PointLight(0x7feaff, 0, 3.2, 2);
    this.sparkGroup.add(this.sparkLight);
    this.circuit.add(this.sparkGroup);
    this.sparkClock = 10;
  }

  _buildFlowParticles() {
    const flowPoints = [
      [-1.76, 0.5, -2.65], [-1.4, 0.26, -2.65], [-0.7, 0.24, -2.65], [0.3, 0.24, -2.65], [1.4, 0.24, -2.65],
      [1.58, 0.45, -2.65], [1.6, 0.9, -2.65], [2.2, 0.92, -2.65], [3.0, 0.92, -2.65], [3.8, 0.92, -2.65], [4.28, 0.9, -2.65], [4.4, 0.42, -2.65], [4.52, 0.24, -2.65],
      [4.95, 0.24, -2.1], [4.95, 0.24, -0.6], [4.95, 0.24, 2.2], [4.7, 0.24, 3.7], [4.2, 0.24, 3.9], [3.2, 0.24, 3.9], [2.2, 0.24, 3.9], [1.1, 0.24, 3.9],
      [0.45, 0.26, 3.9], [-0.2, 0.24, 3.9], [-1.2, 0.24, 3.9], [-2.1, 0.24, 3.9], [-2.55, 0.28, 3.9], [-3.0, 0.24, 3.9], [-3.7, 0.24, 3.9], [-4.45, 0.24, 3.82], [-4.94, 0.24, 3.2],
      [-4.94, 0.24, 1.0], [-4.94, 0.24, -1.4], [-4.8, 0.24, -2.4], [-4.45, 0.35, -2.65], [-4.08, 0.42, -2.65], [-3.5, 0.4, -2.65], [-2.9, 0.38, -2.65], [-2.35, 0.42, -2.65],
    ];
    this.flowCurve = new THREE.CatmullRomCurve3(
      flowPoints.map(([x, y, z]) => new THREE.Vector3(x, y + 0.2, z)),
      true,
      'centripetal',
    );
    this.flowSamples = this.flowCurve.getSpacedPoints(1400);
    this.flowTangents = [];
    for (let i = 0; i < this.flowSamples.length; i += 1) {
      const prev = this.flowSamples[(i - 1 + this.flowSamples.length) % this.flowSamples.length];
      const next = this.flowSamples[(i + 1) % this.flowSamples.length];
      this.flowTangents.push(new THREE.Vector3().subVectors(next, prev).normalize());
    }

    const count = 260;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const offsets = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      offsets[i] = i / count;
      scales[i] = 0.6 + Math.random() * 0.9;
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -10;
      positions[i * 3 + 2] = 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geometry.userData.offsets = offsets;

    this.flowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uSize: { value: 2.8 },
        uColor: { value: new THREE.Color(0xb6faff) },
      },
      vertexShader: /* glsl */`
        attribute float aScale;
        uniform float uPixelRatio;
        uniform float uSize;
        varying float vScale;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * aScale * uPixelRatio * (26.0 / max(1.0, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
          vScale = aScale;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uOpacity;
        uniform vec3 uColor;
        varying float vScale;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          float core = smoothstep(0.1, 0.0, d);
          float glow = smoothstep(0.5, 0.0, d);
          float alpha = (core + glow * 0.6) * uOpacity;
          vec3 color = mix(uColor, vec3(1.0), core * 0.8);
          gl_FragColor = vec4(color * 1.55, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    this.flowParticles = new THREE.Points(geometry, this.flowMaterial);
    this.flowParticles.frustumCulled = false;
    this.flowParticles.renderOrder = 8;
    this.circuit.add(this.flowParticles);

    this.flowGlowMaterial = this.flowMaterial.clone();
    this.flowGlowMaterial.uniforms.uSize.value = 8.2;
    this.flowGlowMaterial.uniforms.uOpacity.value = 0;
    this.flowGlowMaterial.uniforms.uColor.value.copy(this.flowMaterial.uniforms.uColor.value);
    this.flowGlowMaterial.depthTest = false;
    this.flowGlowPoints = new THREE.Points(geometry, this.flowGlowMaterial);
    this.flowGlowPoints.frustumCulled = false;
    this.flowGlowPoints.renderOrder = 6;
    this.circuit.add(this.flowGlowPoints);

    // Short luminous dashes trailing the points give the current a readable
    // direction and texture, even on a still frame.
    this.flowStreakCount = 140;
    const streakGeometry = new THREE.BoxGeometry(1, 0.04, 0.04);
    this.flowStreakMaterial = new THREE.MeshBasicMaterial({
      color: 0x69eaff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    this.flowStreaks = new THREE.InstancedMesh(streakGeometry, this.flowStreakMaterial, this.flowStreakCount);
    this.flowStreaks.frustumCulled = false;
    this.flowStreaks.renderOrder = 7;
    this.flowStreakOffsets = new Float32Array(this.flowStreakCount);
    this.flowStreakLengths = new Float32Array(this.flowStreakCount);
    for (let i = 0; i < this.flowStreakCount; i += 1) {
      this.flowStreakOffsets[i] = i / this.flowStreakCount;
      this.flowStreakLengths[i] = 0.08 + Math.random() * 0.1;
    }
    this.flowStreakDummy = new THREE.Object3D();
    this.flowAxisX = new THREE.Vector3(1, 0, 0);
    this.flowStreakQuat = new THREE.Quaternion();
    this.flowStreaks.visible = false;
    this.circuit.add(this.flowStreaks);
  }

  _buildInternalParticles() {
    const count = 30;
    const geom = new THREE.SphereGeometry(0.022, 6, 5);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xa5f4ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.internalParticleMaterial = mat;
    this.internalParticles = new THREE.InstancedMesh(geom, mat, count);
    this.internalParticles.frustumCulled = false;
    this.internalParticleData = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      this.internalParticleData.push({
        t: i / count,
        speed: 0.7 + Math.random() * 0.6,
        radius: 0.13 + Math.random() * 0.12,
        phase: Math.random() * TAU,
      });
      dummy.position.set(0, -10, 0);
      dummy.updateMatrix();
      this.internalParticles.setMatrixAt(i, dummy.matrix);
    }
    this.components.resistor.add(this.internalParticles);
  }

  _initPostprocessing() {
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(size, 0.28, 0.38, 1.38);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  _initCamera() {
    const shot = this.cameraShots[0];
    this.camera.position.copy(shot.pos);
    this.camera.lookAt(shot.target);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.copy(shot.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minDistance = 4.2;
    this.controls.maxDistance = 27;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.72;
    this.controls.autoRotate = false;
    this.controls.update();

    this.controls.addEventListener('start', () => {
      this.onUserInteract();
      if (this.autoCamera) {
        this.autoCamera = false;
        this.onAutoCameraChange(false);
      }
    });
  }

  _bindResize() {
    this._onResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const aspect = width / height;
      this.camera.aspect = aspect;
      this.camera.fov = aspect < 1.05 ? 48 : aspect < 1.45 ? 40 : 35;
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.85));
      this.renderer.setSize(width, height, false);
      this.composer.setSize(width, height);
      if (this.bloomPass) this.bloomPass.setSize(width, height);
      if (this.dust) this.dust.material.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
      if (this.flowMaterial) this.flowMaterial.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
      if (this.flowGlowMaterial) this.flowGlowMaterial.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
    };
    window.addEventListener('resize', this._onResize);
  }

  /* ---------------------------------------------------------------- */
  /* Public controls                                                  */
  /* ---------------------------------------------------------------- */

  setTheme(theme) {
    const light = theme === 'light';
    this.theme = light ? 'light' : 'dark';
    const setBlend = (material, blending) => {
      if (!material) return;
      material.blending = blending;
      material.needsUpdate = true;
    };

    this.scene.background.setHex(light ? 0xe3edf0 : 0x03070d);
    this.scene.fog.color.setHex(light ? 0xe3edf0 : 0x03070d);
    this.scene.fog.density = light ? 0.014 : 0.026;
    this.scene.environment = light ? this.envLight : this.envDark;
    this.renderer.toneMappingExposure = light ? 1.02 : 1.0;

    this.hemiLight.color.setHex(light ? 0xffffff : 0x376987);
    this.hemiLight.groundColor.setHex(light ? 0x9ab2b8 : 0x02050a);
    this.hemiLight.intensity = light ? 1.35 : 0.72;
    this.keyLight.color.setHex(light ? 0xffffff : 0xd9f4ff);
    this.keyLight.intensity = light ? 2.05 : 3.2;
    this.rimLight.color.setHex(light ? 0x4ca3b4 : 0x27bfff);
    this.rimLight.intensity = light ? 1.2 : 2.45;
    this.warmLight.intensity = light ? 12 : 34;
    this.coolLight.intensity = light ? 14 : 42;
    this.spotLight.intensity = light ? 18 : 40;
    this.platformUnderglow.intensity = light ? 4 : 6;

    this.baseMaterial.color.setHex(light ? 0x8ca4ab : 0x061018);
    this.baseMaterial.roughness = light ? 0.43 : 0.3;
    this.baseMaterial.metalness = light ? 0.48 : 0.82;
    this.baseMaterial.envMapIntensity = light ? 0.9 : 1.4;
    this.topMaterial.color.setHex(light ? 0xbcd0d4 : 0x050e17);
    this.topMaterial.roughness = light ? 0.5 : 0.72;
    this.topMaterial.metalness = light ? 0.28 : 0.38;
    this.topMaterial.clearcoat = light ? 0.45 : 0.22;
    this.topMaterial.clearcoatRoughness = light ? 0.4 : 0.55;
    this.topMaterial.envMapIntensity = light ? 0.82 : 0.72;

    this.floorDiscMaterial.color.setHex(light ? 0xd3e1e4 : 0x010307);
    this.floorDiscMaterial.roughness = light ? 0.74 : 0.78;
    this.floorDiscMaterial.metalness = light ? 0.1 : 0.25;
    this.floorDiscMaterial.opacity = light ? 0.96 : 0.88;

    this.gridMaterial.map = light ? this.gridMaps.light : this.gridMaps.dark;
    this.gridMaterial.opacity = light ? 0.9 : 0.58;
    setBlend(this.gridMaterial, light ? THREE.NormalBlending : THREE.AdditiveBlending);

    const edgeColor = light ? 0x007d93 : 0x62e5ff;
    if (this.edgeMaterial) {
      this.edgeMaterial.color.setHex(edgeColor);
      this.edgeMaterial.opacity = light ? 0.88 : 0.85;
      setBlend(this.edgeMaterial, light ? THREE.NormalBlending : THREE.AdditiveBlending);
    }
    if (this.innerRingMaterial) {
      this.innerRingMaterial.color.setHex(light ? 0x2a7d8e : 0x4da3ca);
      this.innerRingMaterial.opacity = light ? 0.22 : 0.25;
      setBlend(this.innerRingMaterial, light ? THREE.NormalBlending : THREE.AdditiveBlending);
    }
    if (this.tickMaterial) {
      this.tickMaterial.color.setHex(light ? 0x0c6e82 : 0x8cecff);
      this.tickMaterial.opacity = light ? 0.46 : 0.44;
      setBlend(this.tickMaterial, light ? THREE.NormalBlending : THREE.AdditiveBlending);
    }
    if (this.surfaceRingMaterial) {
      this.surfaceRingMaterial.color.setHex(light ? 0x0b7185 : 0x5edcf5);
      this.surfaceRingMaterial.opacity = light ? 0.18 : 0.085;
      setBlend(this.surfaceRingMaterial, light ? THREE.NormalBlending : THREE.AdditiveBlending);
    }
    if (this.seamMaterial) {
      this.seamMaterial.color.setHex(light ? 0x2b8b9e : 0x4eb4d4);
      this.seamMaterial.opacity = light ? 0.1 : 0.04;
      setBlend(this.seamMaterial, light ? THREE.NormalBlending : THREE.AdditiveBlending);
    }
    if (this.decalMaterial) {
      this.decalMaterial.color.setHex(light ? 0x0a6074 : 0xffffff);
      this.decalMaterial.opacity = light ? 0.58 : 0.3;
      setBlend(this.decalMaterial, light ? THREE.NormalBlending : THREE.AdditiveBlending);
    }

    for (const material of this.haloRingMaterials) {
      if (!material.userData.themeColor) material.userData.themeColor = material.color.getHex();
      if (material.userData.themeOpacity === undefined) material.userData.themeOpacity = material.opacity;
      material.color.setHex(light ? 0x0b687c : material.userData.themeColor);
      material.opacity = light ? 0.09 : material.userData.themeOpacity;
      setBlend(material, light ? THREE.NormalBlending : THREE.AdditiveBlending);
    }
    if (this.streakMaterial) {
      if (!this.streakMaterial.userData.themeColor) this.streakMaterial.userData.themeColor = this.streakMaterial.color.getHex();
      if (this.streakMaterial.userData.themeOpacity === undefined) this.streakMaterial.userData.themeOpacity = this.streakMaterial.opacity;
      this.streakMaterial.color.setHex(light ? 0x0a6a7e : this.streakMaterial.userData.themeColor);
      this.streakMaterial.opacity = light ? 0.055 : this.streakMaterial.userData.themeOpacity;
      setBlend(this.streakMaterial, light ? THREE.NormalBlending : THREE.AdditiveBlending);
    }
    for (const beam of this.beams) beam.visible = !light;
    if (this.dust) this.dust.visible = !light;

    if (this.flowMaterial) {
      this.flowMaterial.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      this.flowMaterial.uniforms.uColor.value.setHex(light ? 0x006fe8 : 0xb6faff);
      this.flowMaterial.uniforms.uSize.value = light ? 2.65 : 2.05;
      this.flowMaterial.needsUpdate = true;
    }
    if (this.flowStreakMaterial) {
      this.flowStreakMaterial.color.setHex(light ? 0x006fe8 : 0x9ff7ff);
      setBlend(this.flowStreakMaterial, THREE.NormalBlending);
    }
    if (this.arrowMaterial) {
      this.arrowMaterial.color.setHex(light ? 0x0068d8 : 0xaefaff);
      setBlend(this.arrowMaterial, THREE.NormalBlending);
    }
    if (this.flowGlowMaterial) {
      this.flowGlowMaterial.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      this.flowGlowMaterial.uniforms.uColor.value.setHex(light ? 0x007fb8 : 0xb6faff);
      this.flowGlowMaterial.uniforms.uSize.value = light ? 8.2 : 5.0;
      this.flowGlowMaterial.needsUpdate = true;
    }
    if (this.internalParticleMaterial) {
      this.internalParticleMaterial.color.setHex(light ? 0x00768f : 0xa5f4ff);
      setBlend(this.internalParticleMaterial, light ? THREE.NormalBlending : THREE.AdditiveBlending);
    }
    if (this.barrierRings) {
      for (const ring of this.barrierRings) {
        ring.material.color.setHex(light ? 0xb8610e : 0xffb85e);
        setBlend(ring.material, light ? THREE.NormalBlending : THREE.AdditiveBlending);
      }
    }
    if (this.barrierDiscs) {
      for (const disc of this.barrierDiscs) {
        disc.material.color.setHex(light ? 0xbc5a25 : 0xff9a63);
        setBlend(disc.material, light ? THREE.NormalBlending : THREE.AdditiveBlending);
      }
    }
    if (this.ampAccentMat) {
      this.ampAccentMat.color.setHex(light ? 0x007f96 : 0x5be8ff);
      setBlend(this.ampAccentMat, light ? THREE.NormalBlending : THREE.AdditiveBlending);
    }
    if (this.voltAccentMat) {
      this.voltAccentMat.color.setHex(light ? 0x9f6207 : 0xffc46b);
      setBlend(this.voltAccentMat, light ? THREE.NormalBlending : THREE.AdditiveBlending);
    }

    this.bloomPass.strength = light ? 0.1 : 0.28;
    this.bloomPass.radius = light ? 0.25 : 0.38;
    this.bloomPass.threshold = light ? 1.3 : 1.38;
  }

  resetCaptureState() {
    this.elapsed = 0;
    this.flowOffset = 0;
    this.currentSmooth = 0;
    this.wasSwitchClosed = false;
    this.switchClosedNow = false;
    this.sparkClock = 10;
    this.meterNeedle = { amp: 2.35, volt: 1.414, ampV: 0, voltV: 0 };
    if (this.switchBlade) this.switchBlade.rotation.z = 0.58;
    if (this.flowMaterial) this.flowMaterial.uniforms.uOpacity.value = 0;
    if (this.flowGlowMaterial) this.flowGlowMaterial.uniforms.uOpacity.value = 0;
    if (this.flowStreakMaterial) this.flowStreakMaterial.opacity = 0;
    if (this.flowStreaks) this.flowStreaks.visible = false;
    if (this.currentArrows) this.currentArrows.visible = false;
    this.resetCamera();
  }

  setAutoCamera(enabled) {
    this.autoCamera = enabled;
    this.onAutoCameraChange(enabled);
  }

  resetCamera() {
    this.setAutoCamera(true);
    this._applyCameraShot(0, true);
  }

  setStage(stage) {
    this.stage = stage;
  }

  update(dt, state) {
    const safeDt = Math.min(dt, 0.05);
    const animDt = state.running ? safeDt : 0;
    this.elapsed += animDt;
    this.stage = state.stage;
    this.voltage = state.voltage;
    this.resistance = state.resistance;
    this.current = state.current;
    this.assemblyTime = state.assemblyTime;
    this.switchClosed = state.switchClosed;
    this.lawFocus = state.lawFocus ?? null;
    this.currentSmooth = lerp(this.currentSmooth, state.current, 1 - Math.exp(-safeDt * 7));

    this._updateAssembly(this.assemblyTime, this.switchClosed, animDt, state.running);
    this._updateFlow(animDt, state.current, state.switchClosed, state.running);
    this._updateMeters(animDt, state.voltage, state.current, state.running);
    this._updateResistor(animDt, state.resistance, state.current, state.stage);
    this._updateSpark(animDt);
    this._updateArrows(animDt, state.current, state.switchClosed);
    this._updateAmbient(animDt, state.running);
    this._updateCamera(animDt, state.stage, this.autoCamera && state.running);

    this.controls.update();
    this.composer.render();
  }

  /* ---------------------------------------------------------------- */
  /* Animation internals                                              */
  /* ---------------------------------------------------------------- */

  _revealComponent(group, start, t, drop = 0.48) {
    const p = clamp((t - start) / 0.82, 0, 1);
    const eased = easeOutBack(p);
    group.visible = p > 0.001;
    group.scale.setScalar(Math.max(0.001, 0.64 + eased * 0.36));
    group.position.y = (1 - easeOutCubic(p)) * drop;
    group.userData.reveal = p;
    for (const child of group.children) {
      if (child.material && 'opacity' in child.material) {
        if (child.userData.baseOpacity === undefined) child.userData.baseOpacity = child.material.opacity;
      }
    }
    return p;
  }

  _updateAssembly(t, closed, dt = 0, running = true) {
    const components = this.components;
    this._revealComponent(components.battery, 0.2, t, 0.55);
    this._revealComponent(components.switch, 1.25, t, 0.4);
    this._revealComponent(components.resistor, 2.0, t, 0.62);
    this._revealComponent(components.ammeter, 2.72, t, 0.55);
    this._revealComponent(components.voltmeter, 3.42, t, 0.55);

    const revealEnd = 8;
    for (const mesh of this.wireMeshes) {
      const p = clamp((t - mesh.userData.revealStart) / mesh.userData.revealDuration, 0, 1);
      const amount = t >= revealEnd ? 1 : p;
      mesh.geometry.setDrawRange(0, Math.floor(mesh.geometry.index.count * amount));
      mesh.visible = amount > 0.002;
    }

    const closedAngle = 0;
    const openAngle = 0.58;
    const switchReveal = components.switch.userData.reveal;
    if (!this.switchBlade) return;
    const target = closed ? closedAngle : openAngle;
    if (switchReveal < 0.01) {
      this.switchBlade.rotation.z = openAngle;
    } else if (running) {
      const factor = 1 - Math.exp(-dt * 9);
      this.switchBlade.rotation.z = lerp(this.switchBlade.rotation.z, target, factor);
    }
    if (closed && !this.wasSwitchClosed) this.sparkClock = 0;
    this.wasSwitchClosed = closed;

    if (this.currentArrows) {
      this.currentArrows.visible = closed && t > 5.5;
    }

    this.switchClosedNow = closed;
  }

  _updateFlow(dt, current, closed, running) {
    const active = closed && current > 0.02;
    const focusBoost = this.stage === 3 && this.lawFocus === 'i' ? 0.08 : 0;
    const targetOpacity = active ? 0.76 + clamp(current / 4, 0, 1) * 0.24 + focusBoost : 0;
    const currentOpacity = this.flowMaterial.uniforms.uOpacity.value;
    this.flowMaterial.uniforms.uOpacity.value = lerp(
      currentOpacity,
      targetOpacity,
      1 - Math.exp(-dt * 5.5),
    );
    const opacity = this.flowMaterial.uniforms.uOpacity.value;
    const flowVisible = opacity > 0.015;
    const lightTheme = this.theme === 'light';
    this.flowStreaks.visible = flowVisible;
    this.flowGlowMaterial.uniforms.uOpacity.value = flowVisible
      ? opacity * (lightTheme ? 0.17 : 0.014)
      : 0;
    this.flowStreakMaterial.opacity = flowVisible
      ? (0.46 + clamp(current / 4, 0, 1) * 0.2 + focusBoost * 0.4) * Math.min(1, opacity * 1.4)
      : 0;
    if (!flowVisible) return;

    if (running && active) {
      const speed = 0.035 + clamp(current, 0, 4.5) * 0.027;
      this.flowOffset = (this.flowOffset + dt * speed) % 1;
    }

    const positions = this.flowParticles.geometry.attributes.position.array;
    const offsets = this.flowParticles.geometry.userData.offsets;
    const samples = this.flowSamples;
    const sampleCount = samples.length;
    for (let i = 0; i < offsets.length; i += 1) {
      let s = (offsets[i] + this.flowOffset) % 1;
      if (s < 0) s += 1;
      const sampleIndex = s * (sampleCount - 1);
      const lo = Math.floor(sampleIndex);
      const hi = Math.min(sampleCount - 1, lo + 1);
      const mix = sampleIndex - lo;
      const a = samples[lo];
      const b = samples[hi];
      positions[i * 3] = a.x + (b.x - a.x) * mix;
      positions[i * 3 + 1] = a.y + (b.y - a.y) * mix;
      positions[i * 3 + 2] = a.z + (b.z - a.z) * mix;
    }
    this.flowParticles.geometry.attributes.position.needsUpdate = true;

    const streakDummy = this.flowStreakDummy;
    for (let i = 0; i < this.flowStreakCount; i += 1) {
      let s = (this.flowStreakOffsets[i] + this.flowOffset - 0.0022) % 1;
      if (s < 0) s += 1;
      const sampleIndex = s * (sampleCount - 1);
      const lo = Math.floor(sampleIndex);
      const hi = Math.min(sampleCount - 1, lo + 1);
      const mix = sampleIndex - lo;
      const a = samples[lo];
      const b = samples[hi];
      const tangent = this.flowTangents[lo];
      streakDummy.position.set(
        a.x + (b.x - a.x) * mix,
        a.y + (b.y - a.y) * mix,
        a.z + (b.z - a.z) * mix,
      );
      this.flowStreakQuat.setFromUnitVectors(this.flowAxisX, tangent);
      streakDummy.quaternion.copy(this.flowStreakQuat);
      const length = this.flowStreakLengths[i] * (0.8 + clamp(current / 4, 0, 1) * 0.35);
      streakDummy.scale.set(length, 0.8, 0.8);
      streakDummy.updateMatrix();
      this.flowStreaks.setMatrixAt(i, streakDummy.matrix);
    }
    this.flowStreaks.instanceMatrix.needsUpdate = true;
  }

  _updateMeters(dt, voltage, current, running) {
    const ampRatio = clamp(current / 5, 0, 1);
    const voltRatio = clamp(voltage / 15, 0, 1);
    const targetAmp = (135 - ampRatio * 270) * DEG;
    const targetVolt = (135 - voltRatio * 270) * DEG;

    if (this.ampDisplay) {
      const ampText = current.toFixed(2);
      if (this.ampDisplay.last !== ampText) {
        this.ampDisplay.last = ampText;
        drawMeterDisplay(this.ampDisplay, ampText);
      }
    }
    if (this.voltDisplay) {
      const voltText = voltage.toFixed(1);
      if (this.voltDisplay.last !== voltText) {
        this.voltDisplay.last = voltText;
        drawMeterDisplay(this.voltDisplay, voltText);
      }
    }

    if (!running) return;

    const stiffness = 48;
    const damping = 12;
    this.meterNeedle.ampV += (targetAmp - this.meterNeedle.amp) * stiffness * dt - this.meterNeedle.ampV * damping * dt;
    this.meterNeedle.amp += this.meterNeedle.ampV * dt;
    this.meterNeedle.voltV += (targetVolt - this.meterNeedle.volt) * stiffness * dt - this.meterNeedle.voltV * damping * dt;
    this.meterNeedle.volt += this.meterNeedle.voltV * dt;

    this.meterNeedle.amp = clamp(this.meterNeedle.amp, -2.5, 2.5);
    this.meterNeedle.volt = clamp(this.meterNeedle.volt, -2.5, 2.5);

    if (this.ampNeedle) this.ampNeedle.rotation.z = this.meterNeedle.amp;
    if (this.voltNeedle) this.voltNeedle.rotation.z = this.meterNeedle.volt;
  }

  _updateResistor(dt, resistance, current, stage) {
    if (this.resistorCoilMaterial) {
      const focusPulse = this.stage === 3 && this.lawFocus === 'r' ? (0.55 + Math.sin(this.elapsed * 4.4) * 0.35) : 0;
      this.resistorCoilMaterial.emissiveIntensity = 0.8 + clamp(current / 4, 0, 1.2) * 1.5 + focusPulse;
      this.resistorCoilMaterial.emissive.setHex(current > 0.05 ? 0xff6e35 : 0x421d0a);
    }

    const count = clamp(Math.round(resistance), 3, 12);
    this.barrierCount = count;
    for (const ring of this.barrierRings) {
      const active = ring.userData.index < count;
      ring.visible = active;
      if (active) {
        const pulse = 0.3 + Math.sin(this.elapsed * 2.4 + ring.userData.index * 0.8) * 0.1;
        ring.material.opacity = stage === 2 ? 0.52 + pulse : 0.18 + pulse * 0.3;
        ring.scale.setScalar(stage === 2 ? 1 + Math.sin(this.elapsed * 2 + ring.userData.index) * 0.035 : 1);
      }
    }

    if (this.barrierDiscs) {
      for (const disc of this.barrierDiscs) {
        const active = disc.userData.index < count;
        disc.visible = active;
        if (active) {
          const wave = 0.5 + Math.sin(this.elapsed * 2.2 + disc.userData.index * 0.9) * 0.5;
          const focus = this.stage === 3 && this.lawFocus === 'r' ? 0.055 : 0;
          disc.material.opacity = stage === 2 ? 0.08 + wave * 0.13 : 0.025 + wave * 0.035 + focus;
          disc.scale.setScalar(stage === 2 ? 1.1 + wave * 0.08 : 1);
        }
      }
    }

    if (this.internalParticles) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < this.internalParticleData.length; i += 1) {
        const data = this.internalParticleData[i];
        data.t = (data.t + dt * (0.035 + current * 0.019) * data.speed) % 1;
        const angle = data.t * TAU * 8 + data.phase;
        const x = -0.79 + data.t * 1.58;
        dummy.position.set(
          x,
          0.92 + Math.sin(angle) * data.radius,
          Math.cos(angle) * data.radius,
        );
        dummy.scale.setScalar(0.75 + Math.sin(this.elapsed * 2 + i) * 0.15);
        dummy.updateMatrix();
        this.internalParticles.setMatrixAt(i, dummy.matrix);
      }
      this.internalParticles.instanceMatrix.needsUpdate = true;
      this.internalParticles.material.opacity = 0.36 + clamp(current / 4, 0, 1) * 0.58;
    }

    if (this.resistorShell) {
      this.resistorShell.material.opacity = 0.48 + Math.sin(this.elapsed * 1.2) * 0.03;
    }
  }

  _updateSpark(dt) {
    if (!this.sparkGroup) return;
    this.sparkClock += dt;
    const age = this.sparkClock;
    const active = age < 0.5;
    this.sparkLight.intensity = active ? (1 - age / 0.5) * 12 : 0;
    for (const bit of this.sparkBits) {
      const life = (age * bit.userData.speed + bit.userData.life) % 1;
      const radius = active ? 0.05 + Math.sin(life * Math.PI) * 0.25 : 0;
      bit.position.set(
        Math.cos(bit.userData.angle) * radius,
        0.02 + Math.sin(bit.userData.angle) * radius * 0.65,
        Math.sin(bit.userData.angle) * radius * 0.45,
      );
      bit.material.opacity = active ? (1 - age / 0.5) * 0.9 : 0;
      bit.visible = active;
    }
  }

  _updateArrows(dt, current, closed) {
    if (!this.currentArrows) return;
    const active = closed && current > 0.05;
    this.currentArrows.visible = active;
    if (!active) return;
    const opacity = 0.42 + clamp(current / 4, 0, 1) * 0.45;
    this.currentArrows.children.forEach((arrow, index) => {
      if (arrow.userData.baseY === undefined) arrow.userData.baseY = arrow.position.y;
      arrow.children.forEach((child) => {
        child.material.opacity = opacity;
      });
      arrow.position.y = arrow.userData.baseY + Math.sin(this.elapsed * 2.5 + index * 1.6) * 0.025;
    });
  }

  _updateAmbient(dt, running) {
    if (this.haloGroup) {
      this.haloGroup.rotation.y += dt * (running ? 0.035 : 0.008);
    }
    if (this.dust) {
      this.dust.rotation.y += dt * 0.004;
      this.dust.position.y = Math.sin(this.elapsed * 0.14) * 0.18;
    }
    if (this.platformEdge) {
      this.platformEdge.material.opacity = 0.66 + Math.sin(this.elapsed * 1.4) * 0.12;
    }
    if (this.batteryStrip) {
      this.batteryStrip.material.opacity = 0.5 + Math.sin(this.elapsed * 2.2) * 0.2;
    }
    if (this.batteryStatus) {
      const s = 0.8 + Math.sin(this.elapsed * 3.4) * 0.2;
      this.batteryStatus.scale.setScalar(s);
    }
    if (this.batteryBars) {
      const level = 0.32 + (this.voltage / 12) * 0.55;
      const focus = this.stage === 3 && this.lawFocus === 'u' ? 0.18 + Math.sin(this.elapsed * 4.6) * 0.08 : 0;
      this.batteryBars.forEach((bar, index) => {
        bar.material.opacity = level + focus + Math.sin(this.elapsed * 2.4 + index * 0.8) * 0.06;
      });
    }
    const pulse = 0.5 + Math.sin(this.elapsed * 4.2) * 0.5;
    if (this.ampAccentMat) {
      this.ampAccentMat.opacity = this.stage === 3 && this.lawFocus === 'i' ? 0.72 + pulse * 0.28 : 0.8;
    }
    if (this.voltAccentMat) {
      this.voltAccentMat.opacity = this.stage === 3 && this.lawFocus === 'u' ? 0.72 + pulse * 0.28 : 0.8;
    }
    if (this.ampLight) {
      this.ampLight.intensity = this.stage === 3 && this.lawFocus === 'i' ? 4.2 + pulse * 5.4 : 3.2;
    }
    if (this.voltLight) {
      this.voltLight.intensity = this.stage === 3 && this.lawFocus === 'u' ? 4.2 + pulse * 5.4 : 3.2;
    }
    if (this.coolLight) {
      this.coolLight.intensity = 38 + Math.sin(this.elapsed * 1.3) * 4;
    }
  }

  _updateCamera(dt, stage, autoCamera) {
    if (!autoCamera) return;
    this._applyCameraShot(stage, false, dt);
  }

  _applyCameraShot(stage, immediate = false, dt = 0.016) {
    const shot = this.cameraShots[clamp(stage, 0, this.cameraShots.length - 1)];
    if (!shot) return;
    const portrait = this.camera.aspect < 0.75;
    const portraitScale = portrait ? 1.86 : this.camera.aspect < 1.05 ? 1.24 : 1;
    const target = shot.target.clone();
    if (portrait) target.x += 0.62;
    if (immediate) {
      const offset = shot.pos.clone().sub(shot.target).multiplyScalar(portraitScale);
      this.camera.position.copy(target).add(offset);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }
    const drift = Math.sin(this.elapsed * 0.22 + stage * 2.1) * shot.drift;
    const offset = shot.pos.clone().sub(shot.target).multiplyScalar(portraitScale);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), drift);
    const targetPos = target.clone().add(offset);
    const blend = 1 - Math.exp(-dt * 1.45);
    this.camera.position.lerp(targetPos, blend);
    this.controls.target.lerp(target, blend);
  }

  getAnchors() {
    return [
      { id: 'battery', position: new THREE.Vector3(-3.1, 1.22, -2.65), hidden: this.components.battery.userData.reveal < 0.55 },
      { id: 'switch', position: new THREE.Vector3(-2.55, 1.05, 3.86), hidden: this.components.switch.userData.reveal < 0.55 },
      { id: 'resistor', position: new THREE.Vector3(2.95, 2.05, -2.65), hidden: this.components.resistor.userData.reveal < 0.55 },
      { id: 'ammeter', position: new THREE.Vector3(0.45, 2.45, 3.75), hidden: this.components.ammeter.userData.reveal < 0.55 },
      { id: 'voltmeter', position: new THREE.Vector3(3.35, 2.4, 3.12), hidden: this.components.voltmeter.userData.reveal < 0.55 },
    ];
  }

  _animate() {
    // A single animation clock owns the frame. The page-level controller
    // receives dt, advances the experiment, then calls lab.update() to draw.
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.options.onFrame) this.options.onFrame(dt);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
