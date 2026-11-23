import assert from 'node:assert/strict';
import {
  ASSEMBLY,
  DEMO_DURATION,
  STAGES,
  VOLTAGE_MIN,
  VOLTAGE_MAX,
  RESISTANCE_MIN,
  RESISTANCE_MAX,
  currentFrom,
  voltageFrom,
  resistanceFrom,
  sampleDemo,
  stageIndexAt,
  characteristicLine,
} from '../js/physics.js';

let checks = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}
function close(a, b, epsilon = 1e-9) {
  ok(Math.abs(a - b) <= epsilon, `${a} ≈ ${b}`);
}

console.log('\n[1] 理想欧姆模型 I = U / R');
close(currentFrom(3, 3), 1, 1e-12);
close(currentFrom(12, 3), 4, 1e-12);
close(currentFrom(12, 12), 1, 1e-12);
close(currentFrom(6, 4), 1.5, 1e-12);
close(voltageFrom(2.5, 4), 10, 1e-12);
close(resistanceFrom(12, 4), 3, 1e-12);
assert.throws(() => currentFrom(12, 0), RangeError);
assert.throws(() => currentFrom(Number.NaN, 3), RangeError);
checks += 2;

console.log('[2] 实验舞台时间轴');
ok(STAGES.length === 4, '演示应包含四个阶段');
ok(STAGES[0].start === 0, '从 0 秒开始');
ok(STAGES.at(-1).end === DEMO_DURATION, '终点与演示总时长一致');
for (let index = 1; index < STAGES.length; index += 1) {
  ok(STAGES[index].start === STAGES[index - 1].end, '阶段首尾相接');
}
for (const stage of STAGES) {
  ok(stage.end > stage.start, `${stage.id} 阶段持续时间为正`);
  ok(stage.title.length > 0 && stage.desc.length > 0, `${stage.id} 有完整文案`);
}

console.log('[3] 电路组装与开关状态');
const initial = sampleDemo(0);
ok(initial.stage === 0, '0 s 位于组装阶段');
ok(initial.current === 0, '开关断开时电流为零');
close(initial.voltage, 3, 1e-12);
close(initial.resistance, 3, 1e-12);
ok(!initial.switchClosed, '组装初期开关断开');
ok(sampleDemo(ASSEMBLY.closeSwitch - 0.01).switchClosed === false, '闭合前开关保持断开');
ok(sampleDemo(ASSEMBLY.closeSwitch + 0.01).switchClosed === true, '闭合后开关导通');
close(sampleDemo(ASSEMBLY.closeSwitch + 0.01).current, 1, 1e-9);
ok(sampleDemo(13.9).stage === 0, '14 s 前仍属于第一阶段');

console.log('[4] 电压扫描：R 恒为 3 Ω，U 从 3 V 升到 12 V');
let previousCurrent = -Infinity;
for (let time = 16; time <= 30.4; time += 0.1) {
  const frame = sampleDemo(time);
  ok(frame.stage === 1, `${time.toFixed(1)} s 位于电压阶段`);
  close(frame.resistance, 3, 1e-9);
  ok(frame.current >= previousCurrent - 1e-12, '电压升高时电流单调增加');
  previousCurrent = frame.current;
}
close(sampleDemo(16).voltage, VOLTAGE_MIN, 1e-9);
close(sampleDemo(30.4).voltage, VOLTAGE_MAX, 1e-9);
close(sampleDemo(30.4).current, 4, 1e-9);
close(sampleDemo(33).current, 4, 1e-9);
ok(sampleDemo(30.4).current > sampleDemo(16).current * 3.9, '电流从 1 A 增至约 4 A');

console.log('[5] 电阻扫描：U 恒为 12 V，R 从 3 Ω 增到 12 Ω');
previousCurrent = Infinity;
for (let time = 36.2; time <= 50.6; time += 0.1) {
  const frame = sampleDemo(time);
  ok(frame.stage === 2, `${time.toFixed(1)} s 位于电阻阶段`);
  close(frame.voltage, 12, 1e-9);
  ok(frame.current <= previousCurrent + 1e-12, '电阻增大时电流单调减小');
  previousCurrent = frame.current;
}
close(sampleDemo(36.2).resistance, RESISTANCE_MIN, 1e-9);
close(sampleDemo(50.6).resistance, RESISTANCE_MAX, 1e-9);
close(sampleDemo(36.2).current, 4, 1e-9);
close(sampleDemo(50.6).current, 1, 1e-9);
close(sampleDemo(53.9).current, 1, 1e-9);

console.log('[6] 结论阶段');
const law = sampleDemo(60);
ok(law.stage === 3, '60 s 位于欧姆定律阶段');
close(law.voltage, 12, 1e-9);
close(law.resistance, 12, 1e-9);
close(law.current, 1, 1e-9);
ok(Math.abs(DEMO_DURATION - 72) < 1e-9, '完整演示时长 72 s');
ok(stageIndexAt(DEMO_DURATION) === 3, '终点仍属于结论阶段');

console.log('[7] 特性曲线');
for (const resistance of [3, 6, 9, 12]) {
  const line = characteristicLine(resistance);
  ok(line.length >= 2, 'R 曲线至少有两个采样点');
  for (const point of line) {
    close(point.i, point.u / resistance, 1e-9);
  }
}
const line1 = characteristicLine(3);
const line2 = characteristicLine(12);
ok(line1.at(-1).i > line2.at(-1).i, '小电阻曲线的电流更大');

console.log(`\n✅ 欧姆定律物理模型通过全部 ${checks} 项断言\n`);
