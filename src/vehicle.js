// Vehicle local frame: X is the axle, Y points up, and positive Z is forward.
const frontAxle = 1.47;
const rearAxle = -1.52;
const axleHeight = .46;
const halfTrack = .99;

export function createVehicle(T) {
  const group = new T.Group();
  group.name = '透视教学车';
  const hull = new T.Group(), cabin = new T.Group(), chassis = new T.Group();
  group.add(hull, cabin, chassis);
  const adjustable = [];
  const metal = (color, metalness=.76, roughness=.29) =>
    new T.MeshStandardMaterial({color, metalness, roughness});
  function fade(material, ghostAlpha, solidAlpha=1) {
    material.side = T.DoubleSide;
    adjustable.push({material, ghostAlpha, solidAlpha});
    return material;
  }
  const paint = fade(new T.MeshPhysicalMaterial({
    color:0x365e57, metalness:.61, roughness:.26, clearcoat:.9, clearcoatRoughness:.17
  }),.070);
  const lowerPaint = fade(metal(0x344f49,.6,.33),.060);
  const coachline = fade(metal(0x98b8ac,.82,.24),.42);
  const bright = fade(metal(0xcad4d2,.93,.19),.40);
  const rubberTrim = fade(metal(0x25302e,.22,.44),.30);
  const darkGlass = fade(new T.MeshPhysicalMaterial({
    color:0x688581,metalness:.23,roughness:.1,clearcoat:.9
  }),.028,.50);
  const interior = fade(metal(0x554d43,.02,.82),.105);
  const dash = fade(metal(0x2d3735,.12,.66),.10);
  const red = fade(metal(0x962e22,.26,.23),.48);
  const amber = fade(metal(0xc9803e,.25,.30),.48);
  const lens = fade(new T.MeshPhysicalMaterial({
    color:0xe9dec0,metalness:.20,roughness:.2,clearcoat:.9
  }),.42);
  const frameMat = fade(metal(0x41504f,.82,.37),.38);
  const damperMat = fade(metal(0x778282,.79,.31),.56);
  const tireMat = metal(0x222829,.035,.72);
  const sidewall = metal(0x353b3a,.06,.63);
  const tread = metal(0x323738,.08,.70);
  const alloy = metal(0xa8b1ac,.90,.24);
  const rimDark = metal(0x4c5452,.79,.32);
  const brake = metal(0x8a8e87,.84,.35);
  const caliper = metal(0x835342,.58,.36);
  const vec = (x,y,z)=>new T.Vector3(x,y,z);
  function mesh(parent,geo,mat,x=0,y=0,z=0) {
    const obj = new T.Mesh(geo,mat);
    obj.position.set(x,y,z);
    obj.castShadow=true;obj.receiveShadow=true;
    parent.add(obj);return obj;
  }
  function box(p,mat,x,y,z,w,h,d) {
    return mesh(p,new T.BoxGeometry(w,h,d),mat,x,y,z);
  }
  function bar(p,mat,a,b,r,sides=10) {
    const av=vec(...a),bv=vec(...b),d=bv.clone().sub(av);
    const obj=mesh(p,new T.CylinderGeometry(r,r,d.length(),sides),mat);
    obj.position.copy(av.add(bv).multiplyScalar(.5));
    obj.quaternion.setFromUnitVectors(vec(0,1,0),d.normalize());
    return obj;
  }
  function path(p,mat,points,r,sides=6) {
    const curve=new T.CatmullRomCurve3(points.map(v=>vec(...v)),false,'centripetal');
    return mesh(p,new T.TubeGeometry(curve,Math.max(12,points.length*2),r,sides),mat);
  }
  function sheet(p,mat,rows) {
    const cols=rows[0].length, position=[],index=[];
    for(const row of rows) for(const point of row) position.push(...point);
    for(let j=0;j<rows.length-1;j++) for(let i=0;i<cols-1;i++) {
      const n=j*cols+i;
      index.push(n,n+1,n+cols,n+1,n+cols+1,n+cols);
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(position,3));
    geo.setIndex(index);geo.computeVertexNormals();return mesh(p,geo,mat);
  }
  function revolved(p,mat,profile,axis,x,y,z,seg=64) {
    const geometry=new T.LatheGeometry(profile.map(([r,a])=>new T.Vector2(r,a)),seg);
    const obj=mesh(p,geometry,mat,x,y,z);
    if(axis==='x')obj.rotation.z=-Math.PI/2;
    if(axis==='z')obj.rotation.x=Math.PI/2;
    return obj;
  }
  function smooth(a,b,x) {
    const u=Math.max(0,Math.min(1,(x-a)/(b-a)));
    return u*u*(3-2*u);
  }
  // z, half-width, belt-line y, crown y, ends of rising bonnet power bulge.
  const stations=[
    [-2.43,.69,.86,.94],[-2.35,.89,.94,1.04],[-2.12,.99,1.04,1.13],
    [-1.52,1.015,1.10,1.18],[-.93,.985,1.07,1.19],[-.35,.967,1.08,1.23],
    [.24,.973,1.11,1.31],[.64,.98,1.115,1.39],[1.1,1.015,1.115,1.415],
    [1.47,1.025,1.13,1.42],[1.85,1.00,1.10,1.36],[2.20,.944,1.01,1.20],
    [2.39,.83,.96,1.10],[2.47,.65,.91,1.005]
  ];
  function section(z) {
    let k=0;
    while(k<stations.length-2 && stations[k+1][0]<z)k++;
    const [az,aw,ab,ac]=stations[k],[bz,bw,bb,bc]=stations[k+1];
    const t=T.MathUtils.clamp((z-az)/(bz-az),0,1);
    return [T.MathUtils.lerp(aw,bw,t),T.MathUtils.lerp(ab,bb,t),T.MathUtils.lerp(ac,bc,t)];
  }
  function hood(z,u) {
    const [w,belt,crown]=section(z), abs=Math.abs(u);
    const bulge=smooth(.67,1.06,z)*(1-smooth(1.7,2.20,z))*.245;
    return [w*u, belt+(crown-belt)*(1-u*u)+bulge*(1-smooth(.13,.48,abs)), z];
  }
  function lowerEdge(z) {
    const near=Math.min(Math.abs(z-frontAxle),Math.abs(z-rearAxle));
    const radius=.515;
    if(near<=radius)return axleHeight+Math.sqrt(Math.max(0,radius*radius-near*near));
    return .265+(.46-.265)*(1-smooth(radius,radius+.030,near));
  }
  const samples = new Set(stations.map(v=>v[0]));
  for(let i=0;i<=84;i++)samples.add(-2.43+4.9*i/84);
  for(const axle of [frontAxle,rearAxle]) for(let i=0;i<=42;i++) {
    samples.add(axle+.515*Math.cos(i*Math.PI/42));
  }
  const zz=[...samples].sort((a,b)=>a-b);
  // The centre is open below the cabin. The real floor and two seats are cut-aware.
  const roofRows=zz.map(z=>Array.from({length:21},(_,i)=>hood(z,(i-10)/10)));
  for(const [lo,hi] of [[-2.44,-1.47],[.24,2.48]])
    sheet(hull,paint,roofRows.filter(row=>row[0][2]>=lo&&row[0][2]<=hi));
  for(const sign of [-1,1]){
    sheet(hull,paint,zz.map(z=>{
      const [w,b]=section(z),low=lowerEdge(z),h=b-low;
      return [[sign*w,b,z],[sign*(w+.012),b-h*.19,z],[sign*(w-.006),b-h*.53,z],
        [sign*(w-.055),low+h*.08,z],[sign*(w-.073),low,z]];
    }));
    const cabinSpan=zz.filter(z=>z>=-1.55 && z<=.28);
    sheet(hull,paint,cabinSpan.map(z=>[hood(z,sign),hood(z,sign*.75)]));
    path(hull,coachline,stations.slice(1,-1).map(([z,w,b])=>[sign*(w+.004),b-.026,z]),.010);
    for(const axle of [frontAxle,rearAxle]){
      const lip=[];
      for(let i=0;i<=42;i++){
        const a=Math.PI*i/42;
        const z=axle+.515*Math.cos(a);
        lip.push([sign*(section(z)[0]-.066),axleHeight+.515*Math.sin(a)+.006,z]);
      }
      path(hull,bright,lip,.012);
    }
    path(hull,bright,[[sign*.937,.304,-.973],[sign*.922,.296,-.50],[sign*.922,.295,.35],[sign*.929,.307,.929]],.018);
    // Door shut line, pull handle and rear-view mirror.
    const door=[[-.85,1.037],[-.87,.90],[-.82,.48],[-.72,.39],[.39,.395],[.48,.46],[.51,.96],[.5,1.057]];
    path(hull,rubberTrim,door.map(([z,y])=>[sign*(section(z)[0]-.012),y,z]),.0045);
    bar(hull,bright,[sign*.985,1.005,-.717],[sign*.985,1.005,-.555],.018);
    bar(hull,bright,[sign*.919,1.25,.36],[sign*1.05,1.32,.35],.017);
    const mirror=mesh(hull,new T.SphereGeometry(1,16,10),paint,sign*1.075,1.335,.35);
    mirror.scale.set(.091,.058,.084);
    path(hull,coachline,[.47,.68,1.10,1.47,1.84,2.21].map(z=>hood(z,sign*.58)),.007);
  }
  // Glasshouse sections: bottom z, bottom half-width, bottom height,
  // roof z, roof half-width, roof height. The curved windscreen wraps the cowl.
  const sillFront=[.88,1.196,.37],sillBack=[.86,1.143,-1.52];
  const pillarFront=[.68,1.822,-.132],pillarBack=[.69,1.827,-.947];
  function glazing(front) {
    const sill=front?sillFront:sillBack,top=front?pillarFront:pillarBack;
    const rows=[];
    for(let j=0;j<=8;j++){
      const t=j/8,row=[];
      for(let i=0;i<=18;i++){
        const u=(i-9)/9,hump=1-u*u;
        row.push([u*T.MathUtils.lerp(sill[0],top[0],t),
          T.MathUtils.lerp(sill[1]+.107*hump,top[1]+.066*hump,t),
          T.MathUtils.lerp(sill[2],top[2],t)+(front?1:-1)*.078*hump]);
      }
      rows.push(row);
    }
    sheet(hull,darkGlass,rows);
    path(hull,rubberTrim,rows[0],.020);
    path(hull,bright,rows.at(-1),.014);
  }
  glazing(true);glazing(false);
  const roof=[];
  for(let j=0;j<=12;j++) {
    const t=j/12,row=[];
    for(let i=0;i<=18;i++){
      const u=(i-9)/9,hump=1-u*u;
      row.push([u*T.MathUtils.lerp(.69,.68,t),
        T.MathUtils.lerp(1.827,1.822,t)+.066*hump+.039*Math.sin(t*Math.PI),
        T.MathUtils.lerp(-.947-.078*hump,-.132+.078*hump,t)]);
    }roof.push(row);
  }
  sheet(hull,paint,roof);
  for(const sign of [-1,1]){
    const edge=([x,y,z])=>[sign*x,y,z];
    const rear = edge(sillBack), front=edge(sillFront), upperRear=edge(pillarBack), upperFront=edge(pillarFront);
    sheet(hull,darkGlass,[[rear,front],[upperRear,upperFront]]);
    bar(hull,paint,front,upperFront,.030);
    bar(hull,paint,rear,upperRear,.044);
    bar(hull,rubberTrim,edge([.869,1.164,-.725]),edge([.687,1.835,-.712]),.022);
    bar(hull,bright,rear,front,.019);
    path(hull,bright,[upperRear,edge([.687,1.863,-.56]),upperFront],.015);
  }
  // Cabin fittings. Raised tunnel leaves clearance for the shaft.
  for(const sign of [-1,1]){
    box(cabin,dash,sign*.57,.45,-.385,.64,.075,1.50);
    box(cabin,interior,sign*.48,.611,-.35,.58,.16,.64);
    const back=box(cabin,interior,sign*.48,.95,-.66,.53,.63,.13);back.rotation.x=-.16;
    const headrest=box(cabin,interior,sign*.48,1.31,-.725,.31,.16,.12);headrest.rotation.x=-.16;
  }
  box(cabin,dash,0,1.14,.279,1.52,.156,.22);
  const steering=mesh(cabin,new T.TorusGeometry(.169,.014,8,44),rubberTrim,-.46,1.127,.030);
  steering.rotation.x=-.33;
  for(let i=0;i<3;i++) {
    const a=i*2*Math.PI/3;
    bar(cabin,bright,[-.46,1.127,.030],[-.46+.156*Math.cos(a),1.127+.151*Math.sin(a),.030-.052*Math.sin(a)],.009);
  }
  bar(cabin,frameMat,[-.46,1.127,.05],[-.46,1.04,.26],.020);
  // Nose: inset grille, separate horizontal blades, glass headlamps, bumper.
  function endPanel(front) {
    const z=front?2.405:-2.392,sign=front?1:-1;
    const [w,b]=section(z),rows=[];
    for(let j=0;j<=6;j++){
      const t=j/6,row=[];
      for(let i=0;i<=24;i++){
        const u=(i-12)/12;
        row.push([u*w, T.MathUtils.lerp(.41+.06*u*u,hood(z,u)[1],t),
          z+sign*.067*(1-u*u)*Math.sin(t*Math.PI/2)]);
      }rows.push(row);
    }
    sheet(hull,lowerPaint,rows);
    path(hull,bright,[[-w-.02,.448,z-sign*.10],[-w+.015,.429,z+sign*.034],
      [-w*.61,.421,z+sign*.093],[0,.414,z+sign*.102],[w*.61,.421,z+sign*.093],
      [w-.015,.429,z+sign*.034],[w+.02,.448,z-sign*.10]],.033);
  }
  endPanel(true);endPanel(false);
  box(hull,rubberTrim,0,.737,2.464,1.14,.244,.047);
  for(let i=0;i<7;i++){
    const y=.642+i*.030;
    box(hull,bright,0,y,2.493,1.105-.045*Math.abs(i-3),.011,.010);
  }
  for(const sign of [-1,1]){
    revolved(hull,bright,[[.077,-.019],[.095,-.014],[.100,0],[.086,.024],[.077,.024]],'z',sign*.701,.844,2.423,40);
    const headlamp=mesh(hull,new T.SphereGeometry(1,24,12),lens,sign*.701,.844,2.455);
    headlamp.scale.set(.081,.081,.023);
    box(hull,amber,sign*.687,.670,2.445,.117,.040,.022);
    box(hull,bright,sign*.626,.816,-2.417,.245,.106,.025);
    box(hull,red,sign*.626,.816,-2.434,.225,.083,.021);
  }
  box(hull,rubberTrim,0,.723,-2.471,.350,.105,.02);
  for(const sign of [-1,1]){
    // Two perimeter rails and suspension triangulation preserve the open centre.
    box(chassis,frameMat,sign*.643,.331,-.08,.074,.098,3.93);
    for(const z of [frontAxle,rearAxle]){
      for(const d of [-.216,.216])
        bar(chassis,damperMat,[sign*.646,.337,z+d],[sign*.938,.379,z],.020);
      bar(chassis,frameMat,[sign*.643,.664,z+.078],[sign*.925,.462,z+.086],.030);
      const spring=[];
      for(let k=0;k<=40;k++){
        const t=k/40,a=t*10*Math.PI;
        spring.push([sign*(.814-.094*t)+.046*Math.cos(a),.411+.280*t,z+.11+.046*Math.sin(a)]);
      }
      path(chassis,damperMat,spring,.008,5);
    }
  }
  // Wheel rotation is applied only to rotating tyre/rim/disc geometry.
  // Brake calipers and the suspension stay attached to the chassis.
  const wheels=[];
  for(const z of [frontAxle,rearAxle])for(const sign of [-1,1]){
    const wheel=new T.Group();wheel.name=(z===frontAxle?'前':'后')+(sign<0?'左轮':'右轮');
    wheel.position.set(sign*halfTrack,axleHeight,z);group.add(wheel);wheels.push(wheel);
    const shaped=(mat,points)=>revolved(wheel,mat,points.map(([r,a])=>[r,a*sign]).sort(()=>0), 'x',0,0,0);
    // Lathe normals depend on path winding. Mirror the completed profile for the opposite wheel instead.
    const metalWheel=new T.Group();metalWheel.scale.x=sign;wheel.add(metalWheel);
    const profile=(mat,points)=>revolved(metalWheel,mat,points,'x',0,0,0);
    profile(tireMat,[[.301,-.094],[.36,-.117],[.399,-.118],[.441,-.10],[.457,-.073],
      [.46,-.051],[.46,.056],[.455,.084],[.435,.109],[.392,.124],[.341,.118],[.301,.103],[.294,.089],[.296,-.082],[.301,-.094]]);
    for(const [r,a] of [[.321,.111],[.368,.12],[.406,.119],[.430,.11]])
      profile(sidewall,[[r-.001,a],[r,a+.0018],[r+.002,a]]);
    for(let i=0;i<52;i++){
      const a=i*2*Math.PI/52;
      for(const side of [-1,1]){
        const z0=.457*Math.sin(a),y0=.457*Math.cos(a);
        const z1=.454*Math.sin(a+side*.035),y1=.454*Math.cos(a+side*.035);
        bar(metalWheel,tread,[side*.008,y0,z0],[side*.068,y1,z1],.0032,4);
      }
    }
    profile(alloy,[[.246,-.090],[.278,-.101],[.300,-.095],[.306,-.082],[.307,.085],[.312,.099],
      [.308,.114],[.295,.114],[.281,.106],[.262,.078],[.249,.068],[.246,-.09]]);
    profile(rimDark,[[.257,-.083],[.276,-.074],[.276,.058],[.26,.075]]);
    profile(brake,[[.080,.002],[.195,.002],[.218,.011],[.220,.023],[.213,.033],[.081,.033]]);
    profile(alloy,[[.056,.031],[.075,.051],[.080,.087],[.067,.108],[.042,.112],[0,.112]]);
    for(let i=0;i<10;i++){
      const a=i*2*Math.PI/10,spoke=new T.Shape();
      const spokePoint=(r,a)=>new T.Vector2(r*Math.cos(a),r*Math.sin(a));
      const pts=[spokePoint(.062,a-.19),spokePoint(.253,a-.035),spokePoint(.278,a+.040),
        spokePoint(.256,a+.11),spokePoint(.154,a+.12),spokePoint(.068,a+.22)];
      spoke.setFromPoints(pts);
      const geo=new T.ExtrudeGeometry(spoke,{depth:.023,bevelEnabled:true,bevelThickness:.003,bevelSize:.004,bevelSegments:1});
      const m=mesh(metalWheel,geo,alloy,.055,0,0);
      m.rotation.y=Math.PI/2;
    }
    for(let i=0;i<5;i++){
      const a=i*2*Math.PI/5;
      bar(metalWheel,rimDark,[.100,.056*Math.cos(a),.056*Math.sin(a)],[.113,.056*Math.cos(a),.056*Math.sin(a)],.010,6);
    }
    for(let i=0;i<30;i++){
      const a=i*2*Math.PI/30,r=.185+(i%2)*.018;
      bar(metalWheel,rimDark,[.033,r*Math.cos(a),r*Math.sin(a)],[.034,r*Math.cos(a),r*Math.sin(a)],.005,6);
    }
    box(chassis,caliper,sign*(halfTrack-.006),axleHeight+.052,z-.177,.089,.141,.072);
    batch(T,metalWheel);
  }
  for(const p of [hull,cabin,chassis])batch(T,p);
  // Contact forces are anchored in the car frame, on opposite sides of the
  // tyre/road interface; the ground reaction points forward for a driven tire.
  const forceArrows=new T.Group();group.add(forceArrows);
  for(const [dir,y,color] of [[1,.125,0x14876c],[-1,.020,0xcb663a]]){
    const mat=new T.MeshBasicMaterial({color,depthTest:false,toneMapped:false});
    const arrow=bar(forceArrows,mat,[0,y,0],[0,y,dir*.352],.018);
    const head=mesh(forceArrows,new T.ConeGeometry(.056,.143,14),mat,0,y,dir*.397);
    head.rotation.x=dir*Math.PI/2;head.renderOrder=arrow.renderOrder=11;
    head.castShadow=arrow.castShadow=false;
  }
  forceArrows.position.set(1.136,0,rearAxle);
  let previous=-2;
  function update(s, transparency=1){
    const t=T.MathUtils.clamp(transparency,0,1);
    for(const wheel of wheels)wheel.rotation.x=s.wheel;
    if(Math.abs(t-previous)>.001 || (t!==previous && (t===0||t===1))){
      previous=t;
      for(const {material,solidAlpha,ghostAlpha} of adjustable){
        const opacity=T.MathUtils.lerp(solidAlpha,ghostAlpha,t);
        const trans=opacity<.995;
        if(material.transparent!==trans){material.transparent=trans;material.needsUpdate=true;}
        material.opacity=opacity;material.depthWrite=!trans;
      }
      for(const p of [hull,cabin,chassis])p.traverse(m=>{if(m.isMesh)m.castShadow=m.material.opacity>.77;});
    }
    forceArrows.visible=s.traction>.008;
    forceArrows.position.x=s.forceSide<0?-1.136:1.136;
    forceArrows.scale.z=.48+.52*Math.min(1,s.traction||0);
  }
  update({wheel:0,traction:0},1);
  return {group,wheels,update,forceArrows};
}

// Consolidate individual bolts, ribs and tread details by material in local
// coordinates, keeping each independently rotating wheel as its own group.
function batch(T,parent) {
  const chunks=new Map();
  for(const m of [...parent.children]){
    if(!m.isMesh)continue;
    m.updateMatrix();
    const source=m.geometry,g=source.index?source.toNonIndexed():source;
    g.applyMatrix4(m.matrix);
    const pos=g.getAttribute('position').array,norm=g.getAttribute('normal').array;
    let arrays=chunks.get(m.material);
    if(!arrays){arrays={pos:[],norm:[]};chunks.set(m.material,arrays);}
    arrays.pos.push(pos);arrays.norm.push(norm);
    parent.remove(m);if(g!==source)source.dispose();g.dispose();
  }
  function join(chunks){
    const out=new Float32Array(chunks.reduce((n,part)=>n+part.length,0));
    let offset=0;for(const part of chunks){out.set(part,offset);offset+=part.length;}return out;
  }
  for(const [mat,arrays] of chunks){
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.BufferAttribute(join(arrays.pos),3));
    g.setAttribute('normal',new T.BufferAttribute(join(arrays.norm),3));g.computeBoundingSphere();
    const m=new T.Mesh(g,mat);m.castShadow=m.receiveShadow=true;parent.add(m);
  }
}

export function createRoad(T) {
  const group=new T.Group(),tiles=[],length=24;
  const asphalt=new T.MeshStandardMaterial({color:0x858d8a,roughness:.99});
  const verge=new T.MeshStandardMaterial({color:0xc1c9bd,roughness:1});
  const line=new T.MeshStandardMaterial({color:0xe7e8dd,roughness:.96});
  const amber=new T.MeshStandardMaterial({color:0xba9e66,roughness:.96});
  const post=new T.MeshStandardMaterial({color:0xd7dcd4,roughness:.75});
  const cap=new T.MeshStandardMaterial({color:0x61726b,roughness:.69});
  const rubber=new T.MeshStandardMaterial({color:0x737d79,roughness:1});
  function block(parent,x,y,z,w,h,d,mat){
    const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);parent.add(m);return m;
  }
  for(let i=0;i<7;i++){
    const tile=new T.Group();tiles.push(tile);group.add(tile);
    block(tile,0,-.055,0,7,.10,length,asphalt);
    for(const x of [-1.02,.99])block(tile,x,-.005,0,.21,.001,length,rubber);
    for(const sign of [-1,1]){
      block(tile,sign*5.51,-.084,0,4.02,.13,length,verge);
      block(tile,sign*3.24,-.003,0,.060,.003,length,line);
      for(let j=0;j<4;j++){
        const z=-10.1+6*j;
        block(tile,sign*2.34,-.003,z,.056,.003,2.45,line);
        block(tile,sign*3.86,.215,z+.8,.065,.485,.072,post);
        block(tile,sign*3.86,.373,z+.8,.069,.072,.076,cap);
        block(tile,sign*3.86,.379,z+.843,.041,.038,.007,amber);
      }
    }
    batch(T,tile);
    for(const mesh of tile.children){mesh.castShadow=false;mesh.receiveShadow=true;}
  }
  const update=distance=>{
    const chunk=Math.floor(distance/length);
    tiles.forEach((tile,i)=>{tile.position.z=(chunk+i-3)*length;});
  };
  update(0);return {group,update};
}
