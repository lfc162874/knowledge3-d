const NS = 'http://www.w3.org/2000/svg';
function node(type, attrs) {
  const el = document.createElementNS(NS,type);
  for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,String(value));
  return el;
}

export function createAnnotations(THREE, viewport) {
  const overlay=node('svg',{'aria-hidden':true});
  Object.assign(overlay.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'2',overflow:'hidden'});
  viewport.append(overlay);
  const infos=Array.from({length:3},()=>{
    const group=node('g',{});
    const leader=node('path',{fill:'none',stroke:'#748f84','stroke-width':1});
    const ring=node('circle',{r:3.2,fill:'#edf4ed',stroke:'#537a6b','stroke-width':1.3});
    const text=node('text',{fill:'#29473d','font-size':13,'font-weight':650,'letter-spacing':'.03em'});
    const sub=node('text',{fill:'#5d756a','font-family':'monospace','font-size':9,'letter-spacing':'.08em'});
    group.append(leader,ring,text,sub);overlay.append(group);return {group,leader,ring,text,sub};
  });
  const vec=new THREE.Vector3();
  const entries=[
    ['进气门','INTAKE VALVE',-.59,4.58,.08,-1],
    ['排气门','EXHAUST VALVE',.59,4.58,.08,1],
    ['火花塞','SPARK PLUG',0,5.85,.11,-1],
    ['活塞','PISTON',.72,0,.72,1],
    ['曲轴','CRANKSHAFT',.07,.06,.70,-1],
    ['连杆','CONNECTING ROD',0,0,.16,-1],
    ['气缸','CYLINDER',-1.22,3.96,.09,-1],
    ['飞轮','FLYWHEEL',1.50,.80,-1.87,-1],
  ];
  return function update(camera,degree,phase,reveal){
    const w=viewport.clientWidth,h=viewport.clientHeight;
    // Labels identify the exposed section only while the camera faces it.
    const rear=camera.position.z<1;
    overlay.style.opacity=rear || (reveal>.91 && camera.position.z>3)?'1':'0';
    if(overlay.style.opacity==='0') return;
    const theta=degree*Math.PI/180;
    entries[3][3]=.9*Math.cos(theta)+Math.sqrt(9-(.9*Math.sin(theta))**2)+.13;
    entries[5][2]=.47*.9*Math.sin(theta);
    entries[5][3]=.9*Math.cos(theta)+.53*Math.sqrt(9-(.9*Math.sin(theta))**2);
    const current=rear?[7]:[phase===3?1:phase===2?2:phase===1?6:0,3,phase===1||phase===2?5:4];
    infos.forEach((el,i)=>{if(i>=current.length)el.group.style.display='none';});
    current.forEach((entry,i)=>{
      const [name,en,x,y,z,side]=entries[entry],el=infos[i];
      vec.set(x,y,z).project(camera);
      const px=(vec.x+1)*w/2,py=(1-vec.y)*h/2;
      const mobile=w<510, room=Math.max(52,Math.min(w*.21,(h*.29)));
      const tx=side<0?Math.max(11,Math.min(w/2-room-40,px-55)):Math.min(w-11,Math.max(w/2+room+40,px+55));
      const ty=Math.min(h-60,Math.max(60,py+(i===0?-16:i===1?-2:18)));
      const a=side<0?'end':'start';
      const edge=side<0?Math.max(tx,mobile?50:87):Math.min(tx,w-(mobile?50:87));
      const elbow=edge-side*18;
      const visible=px>9&&px<w-9&&py>40&&py<h-35 && Math.abs(px-edge)>26 && !(mobile&&i===2);
      el.group.style.display=visible?'':'none';
      if(!visible)return;
      el.leader.setAttribute('d','M'+px+' '+py+' L'+elbow+' '+ty+' H'+edge);
      el.ring.setAttribute('cx',px);el.ring.setAttribute('cy',py);
      for(const t of [el.text,el.sub]){t.setAttribute('x',edge); t.setAttribute('text-anchor',a);}
      el.text.setAttribute('y',ty-6);el.sub.setAttribute('y',ty+13);
      el.text.textContent=name;el.sub.textContent=mobile?'':en;
    });
  };
}
