import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createEngine } from './engine.js';
import { createEffects } from './effects.js';
import { createTransmission } from './transmission.js';
import { createVehicle,createRoad } from './vehicle.js';

const V=(x,y,z)=>new T.Vector3(x,y,z);
// Local aim point and viewing offset; each bearing leaves the section face visible.
const shots={
  all:[[0,.79,0],[5.4,3.45,4.6]],
  piston:[[0,1.12,1.38],[.97,.53,1.55]],
  crank:[[0,.57,1.40],[.82,.37,.95]],
  flywheel:[[0,.54,1.095],[.91,.54,-1.12]],
  clutch:[[0,.55,.99],[.94,.71,-.85]],
  gearbox:[[0,.54,.52],[1.16,1.01,.82]],
  shaft:[[0,.50,-.54],[1.92,1.61,.49]],
  differential:[[0,.46,-1.52],[1.02,1.03,.96]],
  axles:[[0,.46,-1.52],[1.03,1.70,2.25]],
  wheels:[[.99,.46,-1.52],[1.29,.61,1.26]]
};
const indexParts=(root,id)=>{root.userData.partId=id;};
export function createCarStudio(host,onPick,onOrbit){
  const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.domElement.setAttribute('aria-label','可拖动旋转、点击部件的整车三维模型');
  host.prepend(renderer.domElement);
  const scene=new T.Scene();
  scene.background=new T.Color(0x1c2934);scene.fog=new T.FogExp2(0x1c2934,.044);
  const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);
  scene.environment=pmrem.fromScene(room,.026).texture;scene.environmentIntensity=1.03;
  pmrem.dispose();room.dispose();
  const root=new T.Group();scene.add(root);
  const daylight=new T.DirectionalLight(0xffe8cc,2.55);daylight.position.set(-3,7,4);
  const fill=new T.DirectionalLight(0xa1daff,2.25);fill.position.set(4,3,-3);
  root.add(daylight,daylight.target,fill,fill.target);
  scene.add(new T.HemisphereLight(0xcdeaff,0x627576,1.16));
  const vehicle=createVehicle(T), road=createRoad(T), train=createTransmission(T);
  const engine=createEngine(T),effects=createEffects(T),block=new T.Group();
  block.add(engine.group,effects.group);block.scale.setScalar(.165);block.position.set(0,.54,1.38);
  root.add(block,vehicle.group,train.group);scene.add(road.group);
  const sparks=[];effects.group.traverse(o=>{if(o.isPointLight)sparks.push(o);});
  const motor=engine.parts;
  const parts={piston:motor.piston,crank:motor.crank,flywheel:motor.flywheel,...train.parts};
  Object.entries(parts).forEach(([id,part])=>indexParts(part,id));
  indexParts(motor.rod,'piston');indexParts(engine.group,'piston');
  vehicle.wheels.forEach(w=>indexParts(w,'wheels'));
  function partOf(o){for(let p=o;p;p=p.parent){if(p.userData.partId)return p.userData.partId;}return null;}
  // Preserve each finish and give active/selected mechanical surfaces a restrained tint.
  const cloned=new Map(),tints=new Map(),baseGlow=new Map();
  for(const model of [block,train.group,...vehicle.wheels]){
    model.traverse(mesh=>{
      if(!mesh.isMesh || !mesh.material || Array.isArray(mesh.material))return;
      const id=partOf(mesh),src=mesh.material;
      if(!id||!src.emissive||src.transparent||src.opacity<1)return;
      const key=id+src.uuid;
      if(!cloned.has(key)){
        const mat=src.clone();cloned.set(key,mat);baseGlow.set(mat,mat.emissive.clone());
        if(!tints.has(id))tints.set(id,[]);tints.get(id).push(mat);
      }
      mesh.material=cloned.get(key);
    });
  }
  const amber=new T.Color(0xf58c30),teal=new T.Color(0x15a99e);
  const path=new T.CatmullRomCurve3([
    V(0,1.19,1.38),V(0,.54,1.38),V(0,.54,1.09),V(0,.54,.97),
    V(0,.54,.42),V(0,.50,-.45),V(0,.46,-1.52)
  ]);
  const points=Array.from({length:27},()=>new T.Mesh(
    undefined,new T.MeshBasicMaterial({color:0x76ffe2,transparent:true,opacity:.86,depthWrite:false})
  ));
  const bead=new T.SphereGeometry(.018,9,7);
  const flow=new T.Group();
  for(const p of points){p.geometry.dispose();p.geometry=bead;flow.add(p);}root.add(flow);
  const tmp=V(0,0,0);
  function updateFlow(s,visible){
    flow.visible=visible;if(!visible)return;
    // Beads depict the route. Every engaged shaft moves at the same instant.
    const motorLength=.24;
    for(let i=0;i<points.length;i++){
      const phase=(s.time*.18+i/points.length)%1;
      const p=points[i];p.visible=phase<motorLength||s.engagement>.02;
      if(!p.visible)continue;
      const branch=.76;
      if(phase<branch)path.getPointAt(phase/branch,tmp);
      else tmp.set(((i%2)*2-1)*(.99*(phase-branch)/(1-branch)),.46,-1.52);
      p.position.copy(tmp);p.position.y+=.065;
    }
  }
  const camera=new T.PerspectiveCamera(32,1,.012,150);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
  controls.dampingFactor=.15;controls.enablePan=false;controls.minDistance=.16;controls.maxDistance=16;
  controls.maxPolarAngle=Math.PI*.486;
  const pointer=new T.Vector2(),ray=new T.Raycaster();
  let down=null;
  const canvas=renderer.domElement;
  canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
  canvas.addEventListener('pointermove',e=>{
    if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>5){down=null;onOrbit();}
  });
  canvas.addEventListener('pointercancel',()=>{down=null;});
  canvas.addEventListener('wheel',()=>onOrbit(),{passive:true});
  canvas.addEventListener('pointerup',e=>{
    if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5){down=null;return;}
    down=null;
    const rect=canvas.getBoundingClientRect();
    pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);
    ray.setFromCamera(pointer,camera);
    const hits=ray.intersectObjects([engine.group,train.group,...vehicle.wheels],true);
    for(const hit of hits){
      let visible=true;for(let o=hit.object;o;o=o.parent){if(!o.visible){visible=false;break;}}
      if(visible){const id=partOf(hit.object);if(id){onPick(id);break;}}
    }
  });
  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  resize();new ResizeObserver(resize).observe(host);
  let lastZ=0,first=true,previousInspect;
  const aim=V(0,0,0),eye=V(0,0,0);
  function isolate(id){
    if(previousInspect===id)return;
    previousInspect=id;
    vehicle.group.visible=!id||id==='wheels';train.group.visible=!id||id in train.parts;
    for(const [key,part] of Object.entries(train.parts))part.visible=!id||id===key;
    block.visible=!id||['piston','crank','flywheel'].includes(id);
    engine.group.children.forEach(g=>{g.visible=!id||g===motor.piston||g===motor.rod||g===motor.crank;});
    if(id&&block.visible){
      motor.piston.visible=id==='piston';motor.rod.visible=id==='piston'||id==='crank';
      motor.crank.visible=true;motor.flywheel.visible=id==='flywheel';
      for(const g of motor.crank.children)if(g!==motor.flywheel)g.visible=id!=='flywheel';
    }else {motor.flywheel.visible=true;for(const g of motor.crank.children)g.visible=true;}
  }
  return {render(s,opt,dt){
    root.position.z=s.distance;road.update(s.distance);
    const dz=s.distance-lastZ;camera.position.z+=dz;controls.target.z+=dz;lastZ=s.distance;
    vehicle.update(s,opt.cut);train.update(s);engine.update(s.engine,opt.cut);effects.update(s.engine,opt.cut);
    for(const lamp of sparks)lamp.intensity*=.165**2;
    // Section/covers are managed by the reused engine on each frame.
    isolate(opt.inspected);
    if(opt.inspected&&block.visible){
      for(const g of engine.group.children)if(g!==motor.piston&&g!==motor.rod&&g!==motor.crank)g.visible=false;
    }
    effects.group.visible=!opt.inspected&&opt.cut>.05;
    updateFlow(s,opt.cut>.75&&!opt.inspected);
    for(const [id,mats] of tints){
      const level=id===opt.active?.30:(opt.powered.includes(id)?.055:0);
      for(const m of mats)m.emissive.copy(baseGlow.get(m)).addScaledVector(id===opt.active?amber:teal,level);
    }
    if(opt.shot || first){
      const id=opt.shot||'all',[point,offset]=shots[id];
      aim.fromArray(point);aim.z+=s.distance;eye.fromArray(offset);
      const frameFactor=id==='all'?Math.max(.87,1.58/camera.aspect):Math.max(1,.91/camera.aspect);
      eye.multiplyScalar(frameFactor).add(aim);
      const k=first?1:1-Math.exp(-dt*4.1);
      controls.target.lerp(aim,k);camera.position.lerp(eye,k);
    }
    first=false;controls.update();renderer.render(scene,camera);
  }};
}
