// Illustrated time is ten times slower than physical time. Angles are absolute,
// so seeking backwards restores every shaft and the vehicle to the same pose.
export const duration = 40;
export const firstRatio = 30/18 * 32/16;
export const finalRatio = 36/12;
export const tireRadius = .46;
const secondsScale=.1;
const toAngularSpeed=rpm=>rpm*Math.PI/30*secondsScale;
const idle=toAngularSpeed(900), cruise=toAngularSpeed(1440);
export const stages=[
  {start:0,title:'发动机运转',part:'piston',text:'混合气燃烧膨胀，推下活塞。连杆推动曲轴，飞轮随曲轴转动。离合器分离，车辆停在原地。'},
  {start:7,title:'挂入一挡',part:'gearbox',text:'离合器仍分离。换挡拨叉推动接合套，把一挡齿轮锁到输出轴上，准备起步。'},
  {start:11,title:'离合器接合',part:'clutch',text:'压盘逐渐夹紧摩擦片。摩擦带动输入轴加速，后轮开始滚动。两侧转速相等后，离合器完全接合。'},
  {start:17,title:'纵向传动',part:'shaft',text:'一挡的两对齿轮减速增扭。输出轴带动传动轴，把动力从车头送往后桥。'},
  {start:22,title:'后桥分流',part:'differential',text:'主动锥齿轮驱动齿圈，旋转方向转过直角。直行时左右轮等速，行星齿轮随差速器壳公转。'},
  {start:27,title:'后轮驱动车身',part:'wheels',text:'半轴驱动后轮，胎面向后推地。地面对轮胎的静摩擦力向前，推动车身前进，前轮随车滚动。'},
  {start:33,title:'整车行驶',part:null,text:'动力系统持续联动。观察路面标记与轮缘，每转一圈，车辆前进一个轮胎周长。'}
];
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const u=clamp(v);return u*u*(3-2*u);};
// Integral of smoothstep from zero to elapsed time, continuing at unit slope.
function rampArea(elapsed,length){
  const u=clamp(elapsed/length);
  return length*(u**3-.5*u**4)+Math.max(0,elapsed-length);
}
export function sampleDrive(t){
  const stage=stages.findLastIndex(p=>t>=p.start);
  const gear=smooth((t-7.6)/2.2);
  const engagement=smooth((t-11)/6);
  const throttle=smooth((t-17)/9);
  const gain=(cruise-idle)*rampArea(t-17,9);
  const engine=t*idle+gain;
  const input=idle*rampArea(t-11,6)+gain;
  const output=input/firstRatio, wheel=output/finalRatio;
  const rpm=900+540*throttle, inputRpm=rpm*engagement;
  const wheelRpm=inputRpm/firstRatio/finalRatio;
  const speed=wheelRpm*Math.PI/30*tireRadius*3.6;
  return {time:t,stage,engine,input,output,wheel,rpm,inputRpm,wheelRpm,speed,
    distance:wheel*tireRadius,gear,engagement,traction:engagement};
}
