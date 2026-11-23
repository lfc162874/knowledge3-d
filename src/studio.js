import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createEngine } from './engine.js';
import { createEffects } from './effects.js';
import { createAnnotations } from './annotations.js';

export function createStudio(host,onOrbit){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setClearColor(0,0);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.04;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));
  host.append(renderer.domElement);
  const scene=new THREE.Scene();
  const envMaker=new THREE.PMREMGenerator(renderer);
  const room=new RoomEnvironment();
  scene.environment=envMaker.fromScene(room,.025).texture;
  scene.environmentIntensity=.83;
  room.dispose();envMaker.dispose();
  const sunlight=new THREE.DirectionalLight(0xfff2d9,2.35);
  sunlight.position.set(-4,10,6);
  sunlight.target.position.set(0,2,0);scene.add(sunlight.target);
  sunlight.castShadow=true;sunlight.shadow.mapSize.set(1024,1024);
  Object.assign(sunlight.shadow.camera,{left:-4.8,right:4.8,top:5.8,bottom:-5.4,near:.1,far:24});
  sunlight.shadow.camera.updateProjectionMatrix();sunlight.shadow.normalBias=.016;
  sunlight.shadow.bias=-.0002;
  const rim=new THREE.DirectionalLight(0xd1e6ff,1.85);
  rim.position.set(5,6,-4);
  scene.add(sunlight,rim,new THREE.HemisphereLight(0xf3f9ff,0x717b70,.88));
  const engine=createEngine(THREE), effects=createEffects(THREE);
  scene.add(engine.group,effects.group);

  // A soft contact shadow and a fading, real perspective measurement grid.
  const floorCanvas=document.createElement('canvas');
  floorCanvas.width=floorCanvas.height=512;
  const ctx=floorCanvas.getContext('2d');
  const grad=ctx.createRadialGradient(256,256,6,256,256,248);
  grad.addColorStop(0,'rgba(43,59,53,.43)');grad.addColorStop(.32,'rgba(51,66,55,.30)');grad.addColorStop(.73,'rgba(55,75,65,.08)');grad.addColorStop(1,'rgba(55,75,65,0)');
  ctx.fillStyle=grad;ctx.fillRect(0,0,512,512);
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(6.4,4.5),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(floorCanvas),transparent:true,depthWrite:false,toneMapped:false}));
  contact.rotation.x=-Math.PI/2;contact.position.y=-2.113;scene.add(contact);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(32,32),new THREE.ShadowMaterial({opacity:.105,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-2.116;shadow.receiveShadow=true;scene.add(shadow);
  const positions=[];
  for(let i=-20;i<=20;i++){
    const d=i*.73;
    positions.push(d,0,-14.6,d,0,14.6,-14.6,0,d,14.6,0,d);
  }
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const grid=new THREE.LineSegments(geom,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    vertexShader:'varying vec2 xy; void main(){xy=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 xy;void main(){float a=1.-smoothstep(1.,12.,length(xy));gl_FragColor=vec4(.35,.47,.40,a*.15);}'
  }));
  grid.position.y=-2.12;scene.add(grid);
  const camera=new THREE.PerspectiveCamera(30,1,.1,110);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.12;
  controls.enablePan=false;controls.minDistance=5;controls.maxDistance=35;
  controls.maxPolarAngle=Math.PI*.81;
  controls.rotateSpeed=.76;controls.zoomSpeed=.85;
  controls.addEventListener('start',onOrbit);
  let w=1,h=1,auto=true,dirty=true;
  let previousDegree=-1,previousCut=-1;
  const lastCamera=new THREE.Matrix4();
  let slowFrames=0;
  function cameraPose(progress,close=0,wheel=0){
    const distance=Math.max(10.35,6.65*h/w)/(2*Math.tan(Math.PI/12));
    const yaw=THREE.MathUtils.lerp(2.37,.32,progress)+wheel*1.92, elevation=THREE.MathUtils.lerp(.235,.115,progress);
    const d=distance*(1.03-.055*progress-.13*close);
    controls.target.set(0,2.15+close*.30,0);
    camera.position.set(Math.sin(yaw)*Math.cos(elevation)*d,controls.target.y+Math.sin(elevation)*d,Math.cos(yaw)*Math.cos(elevation)*d);
    controls.update();
  }
  function resize(){
    w=host.clientWidth;h=host.clientHeight;dirty=true;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    if(auto)cameraPose(1);
  }
  resize();new ResizeObserver(resize).observe(host);
  const labels=createAnnotations(THREE,host);
  return {
    render(deg,cut,stage,pose){
      auto=pose!==null;
      if(auto)cameraPose(pose.progress,pose.close,pose.wheel);
      controls.update();camera.updateMatrixWorld();
      if(Math.abs(cut-1)<.0001)cut=1;
      if(cut<.0001)cut=0;
      if(!dirty && deg===previousDegree && cut===previousCut && lastCamera.equals(camera.matrixWorld))return;
      dirty=false;previousDegree=deg;previousCut=cut;lastCamera.copy(camera.matrixWorld);
      const rad=deg*Math.PI/180;
      engine.update(rad,cut);effects.update(rad,cut);
      renderer.render(scene,camera);labels(camera,deg,stage,cut);
    },
    adapt(delta){
      if(delta<=0)return;
      slowFrames=delta>.065?slowFrames+1:Math.max(0,slowFrames-1);
      if(slowFrames<16)return;
      slowFrames=0;
      const ratio=renderer.getPixelRatio();
      if(ratio>.8){renderer.setPixelRatio(Math.max(.8,ratio*.8));dirty=true;}
    },
    reset(){cameraPose(1);},
  };
}
