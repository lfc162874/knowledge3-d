// Model coordinates are in crankshaft units. Y is the cylinder axis, Z the shaft axis.
// All animation is an absolute function of crank angle, including reverse scrubbing.
export function createEngine(T) {
  const group = new T.Group();
  const PI = Math.PI, TAU = 2 * PI;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const sub = (parent = group) => {
    const g = new T.Group();
    parent.add(g);
    return g;
  };
  const fixed = sub(), covers = sub(), section = sub();
  const piston = sub(), rod = sub(), crank = sub(), timing = sub();
  const steel = (color, metalness, roughness, extra = {}) =>
    new T.MeshStandardMaterial({ color, metalness, roughness, ...extra });
  const cast = steel(0x75838a, .77, .39);
  const housing = steel(0x586568, .70, .45);
  const alum = steel(0xc3cdd2, .77, .29);
  const polished = steel(0xe3e7e6, .92, .19);
  const silver = steel(0xb2bec4, .88, .26);
  const gunmetal = steel(0x505e67, .85, .28);
  const dark = steel(0x2e3b45, .77, .31);
  const graphite = steel(0x22282b, .51, .45);
  const bronze = steel(0xb99769, .79, .33);
  const blue = steel(0x57798a, .78, .31);
  const exhaustMetal = steel(0xa48c77, .83, .32);
  const porcelain = steel(0xede7d3, .08, .21);
  const cutMetal = steel(0xc7c6ba, .71, .36, { side:T.DoubleSide });
  const frontMats = new Map();
  function mesh(parent, geom, material, x=0, y=0, z=0) {
    if (parent === covers) {
      if (!frontMats.has(material)) frontMats.set(material, material.clone());
      material = frontMats.get(material);
    }
    const m = new T.Mesh(geom, material);
    m.position.set(x,y,z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function cyl(p, r, h, x,y,z, mat, n=64, top=r) {
    return mesh(p,new T.CylinderGeometry(top,r,h,n),mat,x,y,z);
  }
  function disk(p, r, depth, x,y,z, mat, n=80, top=r) {
    const m = cyl(p,r,depth,x,y,z,mat,n,top);
    m.rotation.x = PI/2;
    return m;
  }
  function shaftBetween(p,a,b,r,mat,n=16) {
    const a3=V(...a), b3=V(...b), d=b3.clone().sub(a3);
    const m=mesh(p,new T.CylinderGeometry(r,r,d.length(),n),mat);
    m.position.copy(a3.add(b3).multiplyScalar(.5));
    m.quaternion.setFromUnitVectors(V(0,1,0), d.normalize());
    return m;
  }
  function torus(p, major,tube,x,y,z,mat,seg=80) {
    return mesh(p,new T.TorusGeometry(major,tube,8,seg),mat,x,y,z);
  }
  function lathe(p, points, x,y,z, mat, start=0, len=TAU, seg=80) {
    return mesh(p,new T.LatheGeometry(points.map(([r,h]) => new T.Vector2(r,h)),seg,start,len),mat,x,y,z);
  }
  function extrude(p,shape,depth,mat,x=0,y=0,z=0,bevel=.033) {
    const geom=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:32});
    return mesh(p,geom,mat,x,y,z);
  }
  function rectPath(w,h,r) {
    const s=new T.Shape(), l=-w/2,b=-h/2,t=h/2,a=w/2;
    s.moveTo(l+r,b); s.lineTo(a-r,b); s.quadraticCurveTo(a,b,a,b+r);
    s.lineTo(a,t-r); s.quadraticCurveTo(a,t,a-r,t); s.lineTo(l+r,t);
    s.quadraticCurveTo(l,t,l,t-r); s.lineTo(l,b+r); s.quadraticCurveTo(l,b,l+r,b);
    return s;
  }
  function footPlate(w,d,h,x,y,z,mat) {
    const m=extrude(fixed,rectPath(w,d,.13),h,mat,x,y,z,.035);
    m.rotation.x=-PI/2;
  }
  const start=-1.20, end=2.02;
  function splitProfile(x,y,z,points,mat) {
    lathe(fixed,points,x,y,z,mat,end,TAU-(end-start),50);
    lathe(covers,points,x,y,z,mat,start,end-start,50);
    const profile = new T.Shape(points.slice(0,-1).map(([r,h])=>new T.Vector2(r,h)));
    for (const a of [start,end]) {
      const geom=new T.ShapeGeometry(profile);
      geom.rotateY(a-PI/2);
      mesh(section,geom,cutMetal,x,y,z);
    }
  }
  function washerZ(p,x,y,z,r=.095) {
    disk(p,r,.023,x,y,z,gunmetal,24);
    disk(p,r*.80,.059,x,y,z+.035,silver,6);
    disk(p,r*.27,.006,x,y,z+.067,dark,6);
  }
  // Longitudinally sectioned cylinder liner and cast aluminium cooling fins.
  splitProfile(0,0,0,[[1.22,1.38],[1.25,1.44],[1.25,4.63],[1.13,4.63],[1.13,1.38],[1.22,1.38]],housing);
  splitProfile(0,0,0,[[1.134,1.41],[1.134,4.625],[1.115,4.625],[1.115,1.41],[1.134,1.41]],silver);
  for(let i=0;i<10;i++) {
    const y=1.61+i*.309, r=1.48+Math.sin((i+1)/11*PI)*.085;
    splitProfile(0,y,0,[[1.233,-.10],[r-.045,-.055],[r,-.03],[r,.014],[r-.035,.039],[1.233,.075],[1.233,-.10]],alum);
  }
  splitProfile(0,4.585,0,[[1.47,0],[1.50,.02],[1.50,.055],[1.12,.055],[1.12,0],[1.47,0]],graphite);
  // Cylinder head, recessed combustion chamber roof and the finned cast head.
  splitProfile(0,4.65,0,[[1.27,-.02],[1.31,.02],[1.34,.56],[1.24,.66],[.16,.66],[.16,.045],[.70,.038],[1.12,-.02],[1.27,-.02]],housing);
  for(let i=0;i<3;i++) {
    const r=1.55-.035*i;
    splitProfile(0,4.70+i*.235,0,[[1.29,-.045],[r,-.035],[r+.018,.0],[r,.052],[1.29,.062],[1.29,-.045]],alum);
  }
  // Through studs tie the block and head to the crankcase.
  for (const [x,z] of [[-1.15,-.64],[1.15,-.64],[-1.25,.39],[1.25,.39]]) {
    shaftBetween(fixed,[x,1.35,z],[x,5.45,z],.046,dark,14);
    for (const y of [1.52,5.35]) {
      cyl(fixed,.115,.032,x,y,z,silver,28);
      cyl(fixed,.095,.11,x,y+.063,z,gunmetal,6);
      cyl(fixed,.042,.024,x,y+.128,z,silver,14);
    }
  }
  // Cast crankcase. The front bearing cover opens to expose the crank throws.
  const crankCaseShape = new T.Shape();
  crankCaseShape.moveTo(-1.12,1.45);crankCaseShape.lineTo(-1.14,1.1);
  crankCaseShape.bezierCurveTo(-1.86,.82,-1.94,-.50,-1.36,-1.07);
  crankCaseShape.lineTo(-1.15,-1.40);crankCaseShape.lineTo(1.15,-1.40);
  crankCaseShape.lineTo(1.36,-1.07);crankCaseShape.bezierCurveTo(1.94,-.50,1.86,.82,1.14,1.1);
  crankCaseShape.lineTo(1.12,1.45);crankCaseShape.closePath();
  extrude(fixed,crankCaseShape,.19,housing,0,0,-.88);
  const rim = new T.Shape();
  rim.moveTo(-1.12,1.45);rim.lineTo(-1.14,1.1);
  rim.bezierCurveTo(-1.86,.82,-1.94,-.50,-1.36,-1.07);
  rim.lineTo(-1.15,-1.40);rim.lineTo(1.15,-1.40);
  rim.lineTo(1.36,-1.07);rim.bezierCurveTo(1.94,-.50,1.86,.82,1.14,1.1);
  rim.lineTo(1.12,1.45);rim.lineTo(.98,1.45);rim.lineTo(1.00,1.00);
  rim.bezierCurveTo(1.70,.60,1.70,-.44,1.24,-.97);
  rim.lineTo(1.05,-1.23);rim.lineTo(-1.05,-1.23);
  rim.lineTo(-1.24,-.97);rim.bezierCurveTo(-1.70,-.44,-1.70,.60,-1.0,1.00);
  rim.lineTo(-.98,1.45);rim.closePath();
  extrude(fixed,rim,1.31,housing,0,0,-.69,.032);
  extrude(fixed,rim,.07,silver,0,0,.63,.018);
  extrude(covers,crankCaseShape,.10,housing,0,0,.71,.042);
  disk(covers,.52,.18,0,0,.89,housing);
  disk(covers,.36,.07,0,0,1.0,silver);
  for(const [x,y] of [[-1.15,.96],[1.15,.96],[-1.63,.16],[1.63,.16],[-1.49,-.69],[1.49,-.69],[-1.08,-1.30],[1.08,-1.30],[0,-1.31]]) washerZ(fixed,x,y,.73,.081);
  footPlate(3.55,1.97,.16,0,-1.68,0,housing);
  footPlate(2.55,1.53,.12,0,-1.51,-.02,gunmetal);
  for(const x of [-1.57,1.57]) for(const z of [-.73,.73]){
    cyl(fixed,.107,.026,x,-1.48,z,dark,32);
    cyl(fixed,.078,.056,x,-1.444,z,silver,6);
  }
  // Two cast mounting rails provide clearance under the outboard flywheel.
  for(const x of [-1.32,1.32]){
    footPlate(.52,1.75,.39,x,-2.08,0,housing);
    footPlate(.65,1.89,.073,x,-2.08,0,gunmetal);
  }
  // The large outboard flywheel has a heavy steel rim and a scalloped lightened web.
  const flywheel = sub(crank);
  const wheelZ=-1.72, web=new T.Shape();
  web.absarc(0,0,1.82,0,TAU,false);
  for(let j=0;j<7;j++){
    const a=j*TAU/7, hole=new T.Path();
    hole.absarc(1.17*Math.sin(a),1.17*Math.cos(a),.416,0,TAU,true);
    web.holes.push(hole);
  }
  extrude(flywheel,web,.17,gunmetal,0,0,wheelZ-.085,.032);
  const rimProfile=[[1.64,-.22],[1.91,-.22],[1.98,-.15],[1.98,.15],
    [1.91,.22],[1.64,.22],[1.64,-.22]];
  const flyRim=lathe(flywheel,rimProfile,0,0,wheelZ,silver);
  flyRim.rotation.x=PI/2;
  for(const z of [-.135,-.065,.065,.135])torus(flywheel,1.979,.008,0,0,wheelZ+z,gunmetal);
  for(const z of [-.22,.22]){
    torus(flywheel,1.70,.009,0,0,wheelZ+z,gunmetal);
    torus(flywheel,1.86,.007,0,0,wheelZ+z,gunmetal);
  }
  // Paint continues across both faces and the outside diameter, readable from
  // either side. This single mark lets students count the two full turns.
  const paint=steel(0xe6a044,.16,.45);
  const marker=lathe(flywheel,[[1.72,-.223],[1.912,-.223],[1.984,-.152],
    [1.984,.152],[1.912,.223],[1.72,.223]],0,0,wheelZ,paint,PI*.465,.18,12);
  marker.rotation.x=PI/2;
  disk(flywheel,.51,.47,0,0,wheelZ,alum);
  torus(flywheel,.43,.012,0,0,wheelZ-.236,gunmetal);
  disk(flywheel,.245,.075,0,0,wheelZ-.262,gunmetal,6);
  disk(crank,.243,1.51,0,0,-1.115,silver);
  disk(crank,.34,.14,0,0,-.81,bronze);
  // Counterweights and offset crank journal. The forward web is scalloped to
  // keep the big-end bearing visible from the cutaway camera.
  const cheek=new T.Shape();
  cheek.moveTo(-.22,.90);
  cheek.bezierCurveTo(-.22,1.22,.22,1.22,.22,.90);
  cheek.lineTo(.29,.30);cheek.bezierCurveTo(.40,.15,.69,.04,.79,-.15);
  cheek.bezierCurveTo(.94,-.45,.70,-1.00,.24,-1.10);
  cheek.bezierCurveTo(-.30,-1.23,-.75,-.89,-.82,-.55);
  cheek.bezierCurveTo(-.91,-.17,-.62,.00,-.40,.15);
  cheek.lineTo(-.27,.35);cheek.closePath();
  extrude(crank,cheek,.20,silver,0,0,-.38,.048);
  // The crank pin is fully supported by a second web at the front.
  extrude(crank,cheek,.095,gunmetal,0,0,.214,.037);
  disk(crank,.214,.60,0,.9,-.01,polished);
  disk(crank,.206,.030,0,.9,.347,silver);
  torus(crank,.168,.012,0,.90,.366,gunmetal,40);
  disk(crank,.076,.035,0,.90,.367,gunmetal,6);
  disk(crank,.281,.36,0,0,.48,polished);
  disk(crank,.225,.077,0,0,.694,gunmetal);
  disk(crank,.135,.067,0,0,.747,silver,6);
  for (const x of [-.35,.35]) disk(crank,.085,.009,x,-.64,.35,polished,20);
  // Slipper piston, three compression/oil-control rings and exposed wrist-pin end.
  lathe(piston,[[.78,-.52],[.989,-.52],[1.063,-.47],[1.082,-.24],[1.085,.305],[1.082,.38],[1.048,.42],[0,.42]],0,0,0,alum);
  // Shallow turning marks on the skirt catch the light as the camera orbits.
  for(let i=0;i<6;i++){
    const y=-.226+i*.035, r=1.084+(y+.226)*.005;
    lathe(piston,[[r,y],[r+.0025,y+.0015],[r+.0025,y+.005],[r,y+.007]],
      0,0,0,silver,0,TAU,56);
  }
  for (const [y,h] of [[.287,.041],[.183,.042],[.04,.073]]) {
    lathe(piston,[[1.081,y-h/2],[1.091,y-h/2],[1.094,y+h/2-.006],[1.085,y+h/2]],0,0,0,graphite);
    lathe(piston,[[1.091,y-h/2+.004],[1.095,y-h/2+.01],[1.095,y-h/2+.017]],0,0,0,polished);
  }
  for (let i=0;i<14;i++) {
    const a=i*TAU/14;
    mesh(piston,new T.SphereGeometry(.023,8,6),dark,1.087*Math.sin(a),.043,1.087*Math.cos(a));
  }
  disk(piston,.174,.020,0,0,1.08,gunmetal);
  disk(piston,.143,.023,0,0,1.094,silver);
  torus(piston,.128,.009,0,0,1.111,dark,32);
  disk(piston,.084,.01,0,0,1.108,gunmetal,32);
  // Forged connecting rod, with genuine hollow ends and raised I-section flanges.
  const beam=new T.Shape();
  beam.moveTo(-.244,.17); beam.quadraticCurveTo(-.145,.34,-.132,.58);
  beam.lineTo(-.099,2.72); beam.quadraticCurveTo(-.116,2.83,-.143,2.86);
  beam.lineTo(.143,2.86); beam.quadraticCurveTo(.116,2.83,.099,2.72);
  beam.lineTo(.132,.58); beam.quadraticCurveTo(.145,.34,.244,.17); beam.closePath();
  extrude(rod,beam,.156,alum,0,0,-.085,.032);
  const inset=new T.Shape();
  inset.moveTo(-.064,.37);inset.quadraticCurveTo(-.083,.42,-.072,.54);
  inset.lineTo(-.044,2.66);inset.quadraticCurveTo(0,2.76,.044,2.66);
  inset.lineTo(.072,.54);inset.quadraticCurveTo(.095,.32,0,.35);
  inset.closePath(); extrude(rod,inset,.01,cast,0,0,.102,.009);
  function ringShape(outer,inner) {
    const s = new T.Shape(), h = new T.Path();
    s.absarc(0,0,outer,0,TAU,false);h.absarc(0,0,inner,0,TAU,true);
    s.holes.push(h);return s;
  }
  extrude(rod,ringShape(.328,.218),.265,alum,0,0,-.132,.019);
  extrude(rod,ringShape(.181,.111),.25,alum,0,3,-.125,.012);
  extrude(rod,ringShape(.229,.213),.27,bronze,0,0,-.135,.006);
  for(const x of [-.255,.255]){
    cyl(rod,.064,.19,x,-.02,0,dark,16);
    cyl(rod,.08,.084,x,-.145,0,silver,6);
  }
  // The split ports follow the same curved centerlines as the gas tracers.
  function port(side, material) {
    const path = new T.CatmullRomCurve3([
      V(side*2.42,5.18,0),V(side*1.77,5.18,0),V(side*1.37,5.16,0),
      V(side*.91,5.02,0),V(side*.68,4.90,0),V(side*.56,4.64,0)
    ]);
    function surface(p,r,from,to,mat) {
      const vert=[], idx=[], count=24, sides=22;
      for(let i=0;i<=count;i++) {
        const v=i/count, pos=path.getPoint(v), d=path.getTangent(v);
        const perp=V(-d.y,d.x,0).multiplyScalar(-side);
        for(let k=0;k<=sides;k++){
          const a=from+(to-from)*k/sides;
          const w=pos.clone().addScaledVector(perp,r*Math.sin(a));
          vert.push(w.x,w.y,r*Math.cos(a));
          if(i<count && k<sides){
            const n=i*(sides+1)+k;
            idx.push(n,n+sides+1,n+1,n+1,n+sides+1,n+sides+2);
          }
        }
      }
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(vert,3));g.setIndex(idx);g.computeVertexNormals();
      mesh(p,g,mat);
    }
    const skin=material.clone(), inside=gunmetal.clone();
    skin.side=inside.side=T.DoubleSide;
    surface(fixed,.325,PI*.53,PI*1.47,skin);
    surface(fixed,.255,PI*.53,PI*1.47,inside);
    surface(covers,.325,-PI*.53,PI*.53,skin);
    surface(covers,.255,-PI*.53,PI*.53,inside);
    for(const a of [PI*.53,PI*1.47]){
      const pts=[];
      for(let i=0;i<=24;i++){
        const v=i/24,p=path.getPoint(v), d=path.getTangent(v);
        const off=V(-d.y,d.x,0).multiplyScalar(-side*.291*Math.sin(a));
        pts.push(p.add(off).add(V(0,0,.291*Math.cos(a))));
      }
      mesh(section,new T.TubeGeometry(new T.CatmullRomCurve3(pts),24,.026,6,false),cutMetal);
    }
    // Turned lip and ferrule at the manifold mouth.
    for(const [x,w,r] of [[2.41,.088,.380],[2.22,.045,.340],[1.76,.095,.385],[1.66,.034,.353]]){
      const s=lathe(fixed,[[.253,-w/2],[r-.018,-w/2],[r,-w*.26],[r,w*.26],[r-.018,w/2],[.253,w/2],[.253,-w/2]],side*x,5.18,0,material);
      s.rotation.z=side*PI/2;
    }
  }
  port(-1,blue);port(1,exhaustMetal);
  // Spring-return inclined poppet valves. The analytically generated cam
  // envelopes follow the roller centers over one complete 720-degree cycle.
  const valveTrain=[];
  function liftAt(t,offset) {
    const a=((t-offset)%(TAU*2)+TAU*2)%(TAU*2);
    return a<PI ? .255*Math.sin(a)**2 : 0;
  }
  const gearCenters=[];
  for (const sign of [-1,1]) {
    const rest=sub();
    rest.position.set(sign*.56,4.63,0);rest.rotation.z=-sign*.20;
    const valve=sub(rest);
    lathe(valve,[[0,-.048],[.292,-.048],[.31,-.023],[.30,.001],[.203,.035],[.11,.089],[.059,.15],[.048,.22],[.048,1.23],[0,1.23]],0,0,0,sign<0?silver:exhaustMetal,0,TAU,48);
    cyl(rest,.094,.46,0,.53,0,bronze,28);
    cyl(rest,.164,.050,0,.716,0,gunmetal,36);
    cyl(valve,.17,.048,0,1.132,0,silver,36);
    cyl(valve,.125,.058,0,1.177,0,dark,32);
    const spring=sub(rest);spring.position.y=.734;
    const pts=[];
    for(let q=0;q<=100;q++){
      const t=q/100,a=t*TAU*5.1;
      pts.push(V(.115*Math.cos(a),.38*t,.115*Math.sin(a)));
    }
    mesh(spring,new T.TubeGeometry(new T.CatmullRomCurve3(pts),100,.019,6,false),polished);
    const rollerY=1.238, centerY=1.59, rr=.070;
    disk(valve,rr,.170,0,rollerY,0,polished,32);
    for(const z of [-.115,.099]) {
      extrude(valve,rectPath(.135,.119,.034),.016,gunmetal,0,1.206,z,.008);
      disk(valve,.032,.023,0,rollerY,z+.015,silver,12);
    }
    const cam=sub(rest);cam.position.y=centerY;
    const camShape=new T.Shape();
    const off=sign<0?0:3*PI;
    for(let k=0;k<=168;k++){
      const w=k/168*TAU, t=w*2;
      const pitch=centerY-rollerY+liftAt(t,off);
      const dp=(liftAt(t+.001,off)-liftAt(t-.001,off))/.001;
      const nx=Math.sin(w),ny=-Math.cos(w),tx=Math.cos(w),ty=Math.sin(w);
      const den=Math.hypot(dp,pitch);
      const x=pitch*nx-rr*(pitch*nx-dp*tx)/den;
      const y=pitch*ny-rr*(pitch*ny-dp*ty)/den;
      if(k===0)camShape.moveTo(x,y);else camShape.lineTo(x,y);
    }
    camShape.closePath();extrude(cam,camShape,.138,gunmetal,0,0,-.069,.015);
    disk(cam,.104,1.38,0,0,-.46,polished);
    disk(cam,.108,.048,0,0,.252,gunmetal);
    disk(cam,.073,.046,0,0,.289,silver,6);
    disk(rest,.196,.24,0,centerY,-.52,cast);
    extrude(rest,rectPath(.31,.70,.08),.20,cast,0,centerY-.28,-.63,.018);
    for(const x of [-.146,.146]) cyl(rest,.061,.066,x,centerY+.12,-.52,gunmetal,6);
    const gear=new T.Shape(), radius=.377;
    for(let k=0;k<=112;k++){
      const a=k*TAU/112, r=k%4===0||k%4===3?radius:radius+.023;
      const x=Math.cos(a)*r,y=Math.sin(a)*r;
      if(k===0)gear.moveTo(x,y);else gear.lineTo(x,y);
    }
    gear.closePath();
    for(let k=0;k<5;k++){
      const a=k*TAU/5, hole=new T.Path();
      hole.absarc(.22*Math.cos(a),.22*Math.sin(a),.075,0,TAU,true);
      gear.holes.push(hole);
    }
    extrude(cam,gear,.105,gunmetal,0,0,-1.107,.007);
    disk(cam,.119,.136,0,0,-1.045,silver);
    valveTrain.push({valve,spring,cam,off});
    gearCenters.push([sign*(.56+centerY*Math.sin(.20)),4.63+centerY*Math.cos(.20),.401]);
  }
  // Rear timing belt drives both OHC sprockets at half crankshaft speed.
  disk(crank,.199,.123,0,0,-1.05,gunmetal,48);
  const beltPoints=[];
  for(const [x,y,r] of [[0,0,.202],...gearCenters]){
    for(let i=0;i<64;i++){
      const a=i*TAU/64;
      beltPoints.push([x+(r+.025)*Math.cos(a),y+(r+.025)*Math.sin(a)]);
    }
  }
  beltPoints.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  function hullHalf(pts) {
    const out=[];
    for(const c of pts) {
      while(out.length>1) {
        const a=out[out.length-2],b=out[out.length-1];
        if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0)break;
        out.pop();
      }
      out.push(c);
    }
    return out.slice(0,-1);
  }
  const hull=[...hullHalf(beltPoints),...hullHalf([...beltPoints].reverse())];
  for(let i=0;i<hull.length;i++){
    const a=hull[i],b=hull[(i+1)%hull.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const m=mesh(timing,new T.BoxGeometry(len+.006,.050,.130),graphite,(a[0]+b[0])/2,(a[1]+b[1])/2,-1.054);
    m.rotation.z=Math.atan2(b[1]-a[1],b[0]-a[0]);
  }
  // Center-mounted threaded spark plug with an insulator, hex and ground strap.
  cyl(fixed,.044,.10,0,4.627,0,porcelain);
  cyl(fixed,.020,.061,0,4.572,0,polished,16);
  shaftBetween(fixed,[.080,4.672,0],[.080,4.537,0],.021,gunmetal);
  shaftBetween(fixed,[.080,4.537,0],[.005,4.537,0],.020,gunmetal);
  cyl(fixed,.095,.61,0,4.966,0,silver,40);
  for(let i=0;i<10;i++)cyl(fixed,.107,.019,0,4.72+i*.049,0,gunmetal,28);
  cyl(fixed,.185,.052,0,5.32,0,polished,36);
  cyl(fixed,.171,.187,0,5.434,0,silver,6);
  lathe(fixed,[[.104,0],[.116,.050],[.114,.39],[.089,.47],[.077,.57],[0,.57]],0,5.52,0,porcelain,0,TAU,32);
  for(let i=0;i<5;i++)cyl(fixed,.137-i*.005,.044,0,5.64+i*.074,0,porcelain,32);
  cyl(fixed,.066,.19,0,6.14,0,silver,32);
  cyl(fixed,.083,.09,0,6.21,0,polished,24);

  // Batch rigid pieces by material. Each articulated member remains a distinct
  // transform, so the number of draw calls is independent of bolt/fin count.
  function batch(p) {
    const bins=new Map();
    for(const m of [...p.children]){
      if(!m.isMesh){batch(m);continue;}
      const mat=m.material;
      if(!bins.has(mat)) bins.set(mat,[]);
      bins.get(mat).push(m);
    }
    for(const [mat,list] of bins){
      if(list.length<2)continue;
      const pos=[],norm=[];
      for(const m of list){
        m.updateMatrix();
        const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry;
        g.applyMatrix4(m.matrix);
        const pp=g.attributes.position.array,nn=g.attributes.normal.array;
        for(let k=0;k<pp.length;k++){pos.push(pp[k]);norm.push(nn[k]);}
        if(g!==m.geometry)g.dispose();
        m.geometry.dispose();p.remove(m);
      }
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
      g.setAttribute('normal',new T.Float32BufferAttribute(norm,3));g.computeBoundingSphere();
      const m=new T.Mesh(g,mat);m.castShadow=m.receiveShadow=true;p.add(m);
    }
  }
  batch(group);
  group.name='四冲程单缸汽油发动机';
  function update(theta,cut=1){
    const x=.9*Math.sin(theta),y=.9*Math.cos(theta),dy=Math.sqrt(9-x*x);
    crank.rotation.z=-theta;
    piston.position.y=y+dy;
    rod.position.set(x,y,0);
    rod.rotation.z=Math.atan2(x,dy);
    for(const {valve,spring,cam,off} of valveTrain) {
      const lift=liftAt(theta,off);
      valve.position.y=-lift;
      spring.scale.y=(.38-lift)/.38;
      cam.rotation.z=-theta/2;
    }
    const opacity=1-T.MathUtils.clamp(cut,0,1);
    covers.visible=opacity>.004;section.visible=cut>.10;
    if(covers.visible){
      for(const m of frontMats.values()){
        const transparent=opacity<.998;
        if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}
        m.opacity=opacity;m.depthWrite=!transparent;
      }
    }
  }
  update(0,1);
  return {group,update,parts:{piston,rod,crank,flywheel},anchors:{spark:V(0,4.56,0),intake:V(-.56,4.63,0),exhaust:V(.56,4.63,0)}};
}
