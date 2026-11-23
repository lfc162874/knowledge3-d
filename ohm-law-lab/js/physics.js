/**
 * Ohm's law — ideal resistor model.
 *
 * All demonstrations keep temperature and material properties constant.
 * U is in volts, R in ohms, I in amperes.
 */

export const VOLTAGE_MIN = 3;
export const VOLTAGE_MAX = 12;
export const RESISTANCE_MIN = 3;
export const RESISTANCE_MAX = 12;
export const CHART_CURRENT_MAX = 4.5;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeOutBack = (t) => {
  const x = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Ideal ohmic relation I = U / R. */
export function currentFrom(voltage, resistance) {
  if (!Number.isFinite(voltage) || !Number.isFinite(resistance) || resistance <= 0) {
    throw new RangeError('Voltage must be finite and resistance must be positive.');
  }
  return voltage / resistance;
}

export function voltageFrom(current, resistance) {
  return current * resistance;
}

export function resistanceFrom(voltage, current) {
  if (current === 0) return Infinity;
  return voltage / current;
}

/** Current expressed as a percentage of the 4 A demonstration maximum. */
export function currentRatio(current) {
  return clamp(current / 4, 0, 1.4);
}

export const ASSEMBLY = {
  battery: 0.2,
  wires: 0.5,
  switch: 1.35,
  resistor: 2.05,
  ammeter: 2.75,
  voltmeter: 3.45,
  senseWires: 3.9,
  closeSwitch: 5.65,
  allDone: 5.9,
};

export const STAGES = [
  {
    id: 'assembly',
    index: 0,
    start: 0,
    end: 14,
    chapter: '01',
    title: '接通电路',
    en: 'CLOSE THE LOOP',
    kicker: '实验搭建',
    desc: '电源、导线、开关、电阻与两只仪表依次就位。开关合拢，回路闭合，电流开始流动。',
    insightLabel: '观察',
    insight: '蓝色粒子沿传统电流方向运动，回路中形成电流。',
    note: '开关断开时 I = 0；闭合后形成闭合回路。',
  },
  {
    id: 'voltage',
    index: 1,
    start: 14,
    end: 34,
    chapter: '02',
    title: '电压是推动力',
    en: 'VOLTAGE DRIVES CURRENT',
    kicker: '控制变量 · R 恒定',
    desc: '保持电阻 R = 3 Ω 不变，将电压从 3 V 逐渐提升到 12 V，观察电流表的变化。',
    insightLabel: '规律',
    insight: '电压越大，电流越大；U 变为 4 倍，I 也变为 4 倍。',
    note: 'R 不变时，I 与 U 成正比。',
  },
  {
    id: 'resistance',
    index: 2,
    start: 34,
    end: 54,
    chapter: '03',
    title: '电阻会限制电流',
    en: 'RESISTANCE RESISTS',
    kicker: '控制变量 · U 恒定',
    desc: '保持电压 U = 12 V 不变，将电阻从 3 Ω 增大到 12 Ω，进入电阻内部观察阻碍作用。',
    insightLabel: '规律',
    insight: '电阻越大，电流越小；R 变为 4 倍，I 变为四分之一。',
    note: 'U 不变时，I 与 R 成反比。',
  },
  {
    id: 'law',
    index: 3,
    start: 54,
    end: 72,
    chapter: '04',
    title: '欧姆定律',
    en: 'THE RELATIONSHIP',
    kicker: '结论 · IDEAL RESISTOR',
    desc: '当温度等条件不变时，导体中的电流与两端电压成正比，与导体的电阻成反比。',
    insightLabel: '公式',
    insight: 'I = U / R',
    note: 'I（A）· U（V）· R（Ω）',
  },
];

export const DEMO_DURATION = STAGES.at(-1).end;

export function stageIndexAt(time) {
  if (time <= 0) return 0;
  for (let index = STAGES.length - 1; index >= 0; index -= 1) {
    if (time >= STAGES[index].start) return index;
  }
  return 0;
}

export function stageStart(index) {
  return STAGES[clamp(Math.round(index), 0, STAGES.length - 1)].start;
}

/**
 * Sample the scripted demonstration.
 * Two controlled sweeps make the two proportional relationships visible.
 */
export function sampleDemo(time) {
  const t = clamp(time, 0, DEMO_DURATION);
  const stage = stageIndexAt(t);
  let voltage = 3;
  let resistance = 3;
  let switchClosed = t >= ASSEMBLY.closeSwitch;
  let sweep = 0;

  if (stage === 1) {
    // 3 V → 12 V while R stays at 3 Ω (I: 1 A → 4 A).
    sweep = smoothstep(16, 30.4, t);
    voltage = lerp(VOLTAGE_MIN, VOLTAGE_MAX, sweep);
    resistance = 3;
    switchClosed = true;
  } else if (stage === 2) {
    // 3 Ω → 12 Ω while U stays at 12 V (I: 4 A → 1 A).
    sweep = smoothstep(36.2, 50.6, t);
    voltage = 12;
    resistance = lerp(RESISTANCE_MIN, RESISTANCE_MAX, sweep);
    switchClosed = true;
  } else if (stage === 3) {
    voltage = 12;
    resistance = 12;
    switchClosed = true;
    sweep = smoothstep(55, 58, t);
  } else {
    voltage = 3;
    resistance = 3;
    switchClosed = t >= ASSEMBLY.closeSwitch;
    sweep = clamp(t / ASSEMBLY.allDone, 0, 1);
  }

  return {
    time: t,
    stage,
    stageId: STAGES[stage].id,
    voltage,
    resistance,
    current: switchClosed ? currentFrom(voltage, resistance) : 0,
    switchClosed,
    sweep,
    progress: t / DEMO_DURATION,
  };
}

/** A fixed-resistance I–U line for the characteristic chart. */
export function characteristicLine(resistance, steps = 36, maxVoltage = VOLTAGE_MAX) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const u = (i / steps) * maxVoltage;
    points.push({ u, i: currentFrom(u, resistance) });
  }
  return points;
}

export function stageProgress(time) {
  const stage = STAGES[stageIndexAt(time)];
  return clamp((time - stage.start) / (stage.end - stage.start), 0, 1);
}
