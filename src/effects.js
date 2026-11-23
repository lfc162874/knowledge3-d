// All effects are sampled from the crank angle. Seeking, pausing and reversing
// the timeline therefore produce the same chamber and the same flow field.
export function createEffects(THREE) {
  const group = new THREE.Group();
  group.name = '缸内工质与气流';
  const pi = Math.PI;
  const tau = 2 * pi;
  const head = 4.625;
  const radius = 1.119;
  const clamp = THREE.MathUtils.clamp;
  const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
  const lerp = THREE.MathUtils.lerp;
  const frac = (x) => x - Math.floor(x);

  // Integrate optical depth through a bounded cylinder. The coordinates are
  // normalized for the intersection, while ds and the flame radius use model
  // units. This preserves the narrowing head clearance during compression.
  const volumeUniforms = {
    uEye: { value: new THREE.Vector3() },
    uHeight: { value: 1 },
    uAngle: { value: 0 },
    uDensity: { value: 0.18 },
    uTint: { value: new THREE.Color() },
    uFlame: { value: 0 },
    uFront: { value: 0 },
    uOpacity: { value: 1 },
  };
  const volumeMaterial = new THREE.ShaderMaterial({
    uniforms: volumeUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vEntry;
      void main() {
        vEntry = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      uniform vec3 uEye, uTint;
      uniform float uHeight, uAngle, uDensity, uFlame, uFront, uOpacity;
      varying vec3 vEntry;
      float hash(vec3 p) {
        p = fract(p * .3183099 + vec3(.11,.29,.67));
        p *= 17.;
        return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
      }
      float noise3(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f*f*(3.-2.*f);
        return mix(
          mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
              mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
              mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 metric = vec3(1.119, uHeight, 1.119);
        vec3 ray = vEntry-uEye;
        ray /= max(length(ray*metric), .00001);
        float a = dot(ray.xz,ray.xz);
        float b = dot(vEntry.xz,ray.xz);
        float c = dot(vEntry.xz,vEntry.xz)-1.;
        float wall = (-b+sqrt(max(b*b-a*c, 0.)))/max(a,.00001);
        if (a < .00001) wall = 100.;
        float cap = abs(ray.y) < .00001 ? 100. :
          ((ray.y > 0. ? .5 : -.5)-vEntry.y)/ray.y;
        float ds = max(0.,min(cap,wall))/10.;
        vec3 sum = vec3(0.);
        float transmittance = 1.;
        for (int i=0; i<10; i++) {
          vec3 p = vEntry + (float(i)+.5)*ds*ray;
          vec3 q = (p-vec3(0.,.5,0.))*metric;
          float n = noise3(q*3.4+vec3(.35*sin(uAngle), .5*cos(uAngle), 0.));
          float fire = 0.;
          float wake = 0.;
          if (uFlame > .001) {
            float ripple = .18*(n-.5) + .07*sin(q.x*13.+q.z*7.+uAngle*8.);
            float distanceToFront = length(q*vec3(.96,.90,.96))+ripple-uFront;
            fire = uFlame*exp(-13.*abs(distanceToFront));
            wake = uFlame*(1.-smoothstep(-.2,.09,distanceToFront));
          }
          float density = uDensity*(.68+.64*n)+2.1*fire+.32*wake;
          float alpha = 1.-exp(-ds*density);
          vec3 chroma = mix(uTint,vec3(1.55,.23,.018),clamp(wake*.72,0.,1.));
          chroma += fire*vec3(3.7,1.18,.13);
          sum += transmittance*alpha*chroma;
          transmittance *= 1.-alpha;
        }
        float alpha = 1.-transmittance;
        gl_FragColor = vec4(sum/max(alpha,.0001), alpha*uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const volume = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 56), volumeMaterial);
  volume.name = '气缸内的混合气';
  volume.renderOrder = 2;
  volume.onBeforeRender = (_renderer, _scene, camera) => {
    const eye = volumeUniforms.uEye.value.setFromMatrixPosition(camera.matrixWorld);
    volume.worldToLocal(eye);
  };
  group.add(volume);

  const cold = new THREE.Color(0x509fe5);
  const compressed = new THREE.Color(0x57b9ee);
  const hot = new THREE.Color(0xff9149);
  const exhaust = new THREE.Color(0x9b9eab);
  const particleColor = new THREE.Color();
  const white = new THREE.Color(0xffffff);

  // Tracers quicken with valve lift, follow a curved manifold and spread into
  // the cylinder. Their ends taper into the flow to keep direction visible.
  const seed = (i, j) => frac(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
  const forward = new THREE.Vector3();
  const tail = new THREE.Vector3();
  const nose = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const transform = new THREE.Object3D();
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(2.94, 5.18, 0),
    new THREE.Vector3(2.32, 5.18, 0),
    new THREE.Vector3(1.37, 5.18, 0),
    new THREE.Vector3(.78, 4.97, 0),
    new THREE.Vector3(.56, head, 0),
  ]);
  function flowPoint(distance, side, depth, seedX, seedZ, aimY, out) {
    const junction = .62;
    if (distance < junction) {
      path.getPointAt(distance / junction, out);
      const taper = lerp(.14, .105, distance / junction);
      out.x *= side;
      out.y += Math.sin((distance / junction) * pi) * seedX * taper;
      out.z += seedZ * taper;
      return;
    }
    const t = (distance - junction) / (1 - junction);
    const blend = t * t * (3 - 2 * t);
    out.set(
      side * (.56 - .2 * t - .67 * blend) + seedX * .47 * blend,
      head - t * depth * aimY,
      seedZ * (.105 + .55 * blend) + .11 * Math.sin(t * pi),
    );
  }
  const traceMaterial = new THREE.MeshBasicMaterial({
    color: 0x97deff, transparent: true, depthWrite: false, opacity: .7,
  });
  const traceCount = 42;
  const traces = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 7, 4), traceMaterial, traceCount,
  );
  traces.name = '进排气流线';
  traces.renderOrder = 4;
  traces.frustumCulled = false;
  traces.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(traces);
  const traceSeeds = Array.from({ length: traceCount }, (_, i) => ({
    t: (i + seed(i, 1) * .77) / traceCount,
    x: seed(i, 2) * 2 - 1, z: seed(i, 3) * 2 - 1,
    length: .018 + seed(i, 4) * .023, depth: .42 + seed(i, 5) * .51,
    width: .011 + seed(i, 6) * .009,
  }));

  // Small suspended markers stay inside the moving gas envelope, which makes
  // compression visible even in a still frame on the teaching timeline.
  const moteCount = 95;
  const motePositions = new Float32Array(moteCount * 3);
  const moteScale = new Float32Array(moteCount);
  const moteSeeds = Array.from({ length: moteCount }, (_, i) => {
    moteScale[i] = .65 + seed(i, 8) * .65;
    return {
      angle: tau * seed(i, 9), radial: .94 * Math.sqrt(seed(i, 10)),
      fraction: .046 + .90 * seed(i, 11), phase: tau * seed(i, 12),
    };
  });
  const moteGeometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(motePositions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  moteGeometry.setAttribute('position', positionAttribute);
  moteGeometry.setAttribute('aScale', new THREE.BufferAttribute(moteScale, 1));
  const moteMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      tint: { value: particleColor },
      opacity: { value: .4 }, size: { value: 2.4 },
    },
    vertexShader: `
      attribute float aScale;
      uniform float size;
      void main(){
        vec4 p = modelViewMatrix * vec4(position, 1.);
        gl_PointSize = clamp(aScale*size*projectionMatrix[1][1]/max(.1,-p.z), 1., 10.);
        gl_Position = projectionMatrix*p;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      uniform vec3 tint;
      void main(){
        vec2 d = gl_PointCoord-.5;
        float d2 = dot(d,d);
        if(d2 >= .25) discard;
        gl_FragColor=vec4(tint,opacity*(1.-smoothstep(.012,.25,d2)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const motes = new THREE.Points(moteGeometry, moteMaterial);
  motes.name = '缸内气体示踪点';
  motes.frustumCulled = false;
  motes.renderOrder = 3;
  const viewport = new THREE.Vector2();
  motes.onBeforeRender = (renderer) => {
    moteMaterial.uniforms.size.value = renderer.getDrawingBufferSize(viewport).y * .014;
  };
  group.add(motes);

  // A locally generated radial texture avoids extra image requests.
  const texSize = 48;
  const pixels = new Uint8Array(texSize * texSize * 4);
  for (let y = 0; y < texSize; y++) {
    for (let x = 0; x < texSize; x++) {
      const r = Math.hypot(2 * (x + .5) / texSize - 1, 2 * (y + .5) / texSize - 1);
      const a = Math.pow(Math.max(0, 1 - r), 2.5);
      const offset = 4 * (y * texSize + x);
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
      pixels[offset + 3] = 255 * a;
    }
  }
  const glowTexture = new THREE.DataTexture(pixels, texSize, texSize, THREE.RGBAFormat);
  glowTexture.magFilter = glowTexture.minFilter = THREE.LinearFilter;
  glowTexture.needsUpdate = true;
  const flashMaterial = new THREE.SpriteMaterial({
    map: glowTexture, color: 0xe3efff, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const flash = new THREE.Sprite(flashMaterial);
  flash.position.set(0, 4.55, .035);
  flash.renderOrder = 5;
  group.add(flash);
  const arcPositions = [];
  const arcPath = [[0,4.59,.025],[.033,4.564,.03],[.007,4.548,.034],
    [.079,4.531,.036],[.058,4.517,.042],[.092,4.518,.045]];
  for (let i = 0; i < arcPath.length - 1; i++) arcPositions.push(...arcPath[i], ...arcPath[i+1]);
  const arcGeometry = new THREE.BufferGeometry();
  arcGeometry.setAttribute('position', new THREE.Float32BufferAttribute(arcPositions, 3));
  const arc = new THREE.LineSegments(arcGeometry, new THREE.LineBasicMaterial({
    color: 0xf5f8ff, transparent: true, depthWrite: false,
  }));
  arc.renderOrder = 5;
  group.add(arc);
  const ignitionLight = new THREE.PointLight(0xffb46a, 0, 3.0, 2);
  ignitionLight.position.set(0, 4.40, .15);
  group.add(ignitionLight);

  function update(theta, cut = 1) {
    group.visible = cut > .003;
    if (!group.visible) return;
    const angle = THREE.MathUtils.euclideanModulo(theta, 4 * pi);
    const phase = Math.floor(angle / pi);
    const p = angle / pi - phase;
    const sin = Math.sin(angle);
    const crown = .9 * Math.cos(angle) + Math.sqrt(9 - (.9 * sin) ** 2) + .42;
    const depth = head - crown;
    const revealed = smooth(.015, .73, clamp(cut, 0, 1));
    volume.position.y = head - depth / 2;
    volume.scale.set(radius, depth, radius);
    volumeUniforms.uHeight.value = depth;
    volumeUniforms.uAngle.value = angle;
    volumeUniforms.uOpacity.value = revealed;
    const fire = phase === 2 ? (1 - smooth(.18,.68,p)) : 0;
    volumeUniforms.uFlame.value = fire;
    volumeUniforms.uFront.value = phase === 2 ? .04 + 3.6 * (1 - (1 - p) ** 1.8) : 0;
    const tint = volumeUniforms.uTint.value;
    // Mass grows during intake, then remains trapped through compression.
    if (phase === 0) {
      tint.copy(exhaust).lerp(cold, smooth(0,.22,p));
      volumeUniforms.uDensity.value = lerp(.28, .24, p);
    } else if (phase === 1) {
      tint.copy(cold).lerp(compressed, smooth(0,1,p));
      volumeUniforms.uDensity.value = Math.min(.91, .24 * 2.11 / depth);
    } else if (phase === 2) {
      tint.copy(compressed).lerp(hot, smooth(0,.12,p)).lerp(exhaust,smooth(.45,1,p));
      volumeUniforms.uDensity.value = .26 + .65 * (1 - smooth(0,.72,p));
    } else {
      tint.copy(exhaust);
      volumeUniforms.uDensity.value = lerp(.26,.28,p);
    }

    const valveLift = Math.sin(pi * p) ** 1.15;
    traces.visible = (phase === 0 || phase === 3) && valveLift > .003;
    if (traces.visible) {
      const side = phase === 0 ? -1 : 1;
      traceMaterial.color.setHex(phase === 0 ? 0x83d4ff : 0xbac2cd);
      traceMaterial.opacity = revealed * Math.min(1, valveLift * 3.5) * .88;
      // Integral of sinusoidal valve lift. The particles start and end gently.
      const travel = (1 - Math.cos(pi * p)) * 1.22;
      traceSeeds.forEach((s, i) => {
        const t = frac(s.t + (phase === 0 ? travel : -travel));
        flowPoint(t, side, depth, s.x, s.z, s.depth, nose);
        flowPoint(Math.max(0, t - s.length), side, depth, s.x, s.z, s.depth, tail);
        forward.subVectors(nose, tail);
        const length = forward.length();
        transform.position.copy(nose).lerp(tail,.5);
        if (length > .00001) transform.quaternion.setFromUnitVectors(up,forward.divideScalar(length));
        const taper = Math.min(smooth(0,.045,t), 1 - smooth(.94,1,t));
        transform.scale.set(s.width*taper, Math.max(.0001,length*.5*taper), s.width*taper);
        transform.updateMatrix();
        traces.setMatrixAt(i,transform.matrix);
      });
      traces.instanceMatrix.needsUpdate = true;
    }

    particleColor.copy(tint).multiplyScalar(1.65).lerp(white, .17);
    moteMaterial.uniforms.opacity.value = revealed * (phase === 2 ? .43 : .64);
    moteSeeds.forEach((s, i) => {
      const swirl = s.angle + angle * .5 + .18 * Math.sin(angle + s.phase);
      const y = crown + depth * (s.fraction + .035 * Math.sin(angle+s.phase));
      positionAttribute.setXYZ(i,s.radial*Math.cos(swirl),y,s.radial*Math.sin(swirl));
    });
    positionAttribute.needsUpdate = true;

    const spark = phase === 2 ? (1 - smooth(.025, .092, p)) : 0;
    const flicker = .8 + .2 * Math.cos(p * 390);
    flash.visible = arc.visible = spark > .002;
    flashMaterial.opacity = spark * revealed * flicker;
    flash.scale.setScalar(.56 + .17 * flicker);
    arc.material.opacity = spark * revealed;
    ignitionLight.intensity = revealed * (spark * 2.4 + fire * smooth(0,.11,p) * 3.1);
  }
  update(0, 1);
  return { group, update };
}
