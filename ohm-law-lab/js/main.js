import {
  STAGES, DEMO_DURATION, ASSEMBLY, VOLTAGE_MIN, VOLTAGE_MAX,
  RESISTANCE_MIN, RESISTANCE_MAX, CHART_CURRENT_MAX,
  sampleDemo, currentFrom, clamp, stageStart,
} from './physics.js';
import { OhmLab } from './lab.js';

const CAPTURE_MODE = new URLSearchParams(location.search).get('capture') === '1';
const CAPTURE_THEME = new URLSearchParams(location.search).get('theme');

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const ui = {
  scene: $('#scene'),
  loader: $('#loader'),
  stageNumber: $('#stageNumber'),
  stageTitle: $('#stageTitle'),
  stageEn: $('#stageEn'),
  stageDesc: $('#stageDesc'),
  insightLabel: $('#insightLabel'),
  insightText: $('#insightText'),
  stageItems: $$('.stage-item'),
  timelineSegments: $$('.timeline-seg'),
  timelineProgress: $('#timelineProgress'),
  timecode: $('#timecode'),
  currentValue: $('#currentValue'),
  voltageValue: $('#voltageValue'),
  resistanceValue: $('#resistanceValue'),
  formulaNote: $('#formulaNote'),
  lawReveal: $('#lawReveal'),
  lawI: $('#lawI'),
  lawU: $('#lawU'),
  lawR: $('#lawR'),
  lawTerms: $$('.law-term'),
  chartCard: $('#chartCard'),
  chartTag: $('#chartTag'),
  chartMode: $('#chartMode'),
  activeCurve: $('#activeCurve'),
  curveArea: $('#curveArea'),
  guideX: $('#guideX'),
  guideY: $('#guideY'),
  chartPoint: $('#chartPoint'),
  chartPointHalo: $('#chartPointHalo'),
  chartPointLabel: $('#chartPointLabel'),
  family12: $('#family12'),
  family6: $('#family6'),
  family9: $('#family9'),
  voltageRange: $('#voltageRange'),
  resistanceRange: $('#resistanceRange'),
  voltageOutput: $('#voltageOutput'),
  resistanceOutput: $('#resistanceOutput'),
  playBtn: $('#playBtn'),
  playLabel: $('#playLabel'),
  playState: $('#playState'),
  autoBtn: $('#autoBtn'),
  resetBtn: $('#resetBtn'),
  cameraBtn: $('#cameraBtn'),
  themeBtn: $('#themeBtn'),
  helpBtn: $('#helpBtn'),
  helpClose: $('#helpClose'),
  helpModal: $('#helpModal'),
  fullscreenBtn: $('#fullscreenBtn'),
  sceneStatusText: $('#sceneStatusText'),
  sceneStatusTag: $('#sceneStatusTag'),
  topStage: $('#topStage'),
  labelBattery: $('#labelBattery'),
  labelSwitch: $('#labelSwitch'),
  labelResistor: $('#labelResistor'),
  labelAmmeter: $('#labelAmmeter'),
  labelVoltmeter: $('#labelVoltmeter'),
  annotations: $$('.annotation'),
  toast: $('#toast'),
};

const state = {
  time: 0,
  stage: 0,
  voltage: VOLTAGE_MIN,
  resistance: RESISTANCE_MIN,
  current: 0,
  switchClosed: false,
  assemblyTime: 0,
  auto: true,
  playing: true,
  introReadyAt: performance.now() + 720,
  lastStage: -1,
  completed: false,
  freeExplore: false,
  lawFocus: null,
};

let toastTimer = 0;
let stageCopyTimer = 0;
let lastLawFocus;
let lab = null;

const chart = {
  x0: 38,
  x1: 308,
  y0: 160,
  y1: 15.6,
  uMax: VOLTAGE_MAX,
  iMax: CHART_CURRENT_MAX,
};

function formatTime(seconds) {
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60).toString().padStart(2, '0');
  const secs = (total % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function currentIsLive() {
  return state.switchClosed && state.current > 0.001;
}

function updateSceneStatus() {
  if (!state.playing) {
    ui.sceneStatusText.textContent = '演示已暂停 · 所有物理量保持同步';
    ui.sceneStatusTag.textContent = 'PAUSED';
    return;
  }
  if (state.completed) {
    ui.sceneStatusText.textContent = '演示完成 · 拖动滑杆继续探索';
    ui.sceneStatusTag.textContent = 'COMPLETE';
    return;
  }
  if (state.freeExplore && !state.auto) {
    ui.sceneStatusText.textContent = '自由探索 · 实时计算 I = U / R';
    ui.sceneStatusTag.textContent = 'FREE MODE';
    return;
  }
  if (state.stage === 0) {
    if (!state.switchClosed) {
      ui.sceneStatusText.textContent = '正在搭建实验电路';
      ui.sceneStatusTag.textContent = 'ASSEMBLY';
    } else {
      ui.sceneStatusText.textContent = '回路已闭合 · 蓝色粒子表示电流方向';
      ui.sceneStatusTag.textContent = 'CLOSED LOOP';
    }
    return;
  }
  if (state.stage === 1) {
    ui.sceneStatusText.textContent = '电阻恒定 3 Ω · 电压正在升高';
    ui.sceneStatusTag.textContent = 'VOLTAGE SWEEP';
    return;
  }
  if (state.stage === 2) {
    ui.sceneStatusText.textContent = '电压恒定 12 V · 电阻正在增大';
    ui.sceneStatusTag.textContent = 'RESISTANCE SWEEP';
    return;
  }
  ui.sceneStatusText.textContent = '欧姆定律已揭示 · 三个物理量实时联动';
  ui.sceneStatusTag.textContent = "OHM'S LAW";
}

function updateStageCopy(stageIndex, immediate = false) {
  const stage = STAGES[stageIndex];
  if (!stage) return;
  const apply = () => {
    ui.stageNumber.textContent = stage.chapter;
    ui.stageTitle.textContent = stage.title;
    ui.stageEn.textContent = stage.en;
    ui.stageDesc.textContent = stage.desc;
    ui.insightLabel.textContent = stage.insightLabel;
    ui.insightText.textContent = stage.insight;
    ui.stageTitle.classList.remove('is-changing');
    ui.stageDesc.classList.remove('is-changing');
    ui.topStage.textContent = `${stage.chapter} · ${stage.title}`;
  };
  if (immediate) {
    apply();
    return;
  }
  clearTimeout(stageCopyTimer);
  ui.stageTitle.classList.add('is-changing');
  ui.stageDesc.classList.add('is-changing');
  stageCopyTimer = window.setTimeout(apply, 190);
}

function setActiveStageUI(stageIndex) {
  ui.stageItems.forEach((item, index) => {
    const active = index === stageIndex;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', String(active));
  });
  ui.timelineSegments.forEach((item, index) => {
    item.classList.toggle('is-active', index === stageIndex);
  });
}

function updateTransportUI() {
  const isPlaying = state.playing;
  document.body.classList.toggle('is-playing', isPlaying);
  document.body.classList.toggle('is-paused', !isPlaying);
  if (!isPlaying) {
    ui.playLabel.textContent = '继续演示';
    ui.playState.textContent = 'SIMULATION PAUSED';
  } else if (state.completed) {
    ui.playLabel.textContent = '暂停实验';
    ui.playState.textContent = 'FREE EXPLORE';
  } else if (state.freeExplore && !state.auto) {
    ui.playLabel.textContent = '暂停实验';
    ui.playState.textContent = 'FREE EXPLORE';
  } else {
    ui.playLabel.textContent = '暂停演示';
    ui.playState.textContent = 'AUTO RUNNING';
  }
  ui.playBtn.setAttribute('aria-label', isPlaying ? '暂停演示' : '继续演示');
}

function updateRangeFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  input.style.setProperty('--fill', `${((value - min) / (max - min)) * 100}%`);
}

function updateControls() {
  const voltageValue = state.voltage.toFixed(1);
  const resistanceValue = state.resistance.toFixed(1);
  ui.voltageRange.value = String(state.voltage);
  ui.resistanceRange.value = String(state.resistance);
  ui.voltageOutput.textContent = `${voltageValue} V`;
  ui.resistanceOutput.textContent = `${resistanceValue} Ω`;
  updateRangeFill(ui.voltageRange);
  updateRangeFill(ui.resistanceRange);
  ui.voltageRange.setAttribute('aria-valuetext', `${voltageValue} 伏特`);
  ui.resistanceRange.setAttribute('aria-valuetext', `${resistanceValue} 欧姆`);
}

function updateReadouts() {
  const current = state.current;
  const voltage = state.voltage;
  const resistance = state.resistance;
  ui.currentValue.textContent = current.toFixed(2);
  ui.voltageValue.textContent = voltage.toFixed(1);
  ui.resistanceValue.textContent = resistance.toFixed(1);
  ui.formulaNote.textContent = state.switchClosed
    ? `闭合回路 · ${current.toFixed(2)} A`
    : '开关断开 · I = 0.00 A';
  ui.labelBattery.textContent = `U = ${voltage.toFixed(1)} V`;
  ui.labelSwitch.textContent = state.switchClosed ? '闭合 · 正在导通' : '断开';
  ui.labelResistor.textContent = `${resistance.toFixed(1)} Ω`;
  ui.labelAmmeter.textContent = `${current.toFixed(2)} A`;
  ui.labelVoltmeter.textContent = `${voltage.toFixed(1)} V`;
  ui.lawI.textContent = `${current.toFixed(2)} A`;
  ui.lawU.textContent = `${voltage.toFixed(1)} V`;
  ui.lawR.textContent = `${resistance.toFixed(1)} Ω`;
}

function chartX(u) {
  return chart.x0 + (u / chart.uMax) * (chart.x1 - chart.x0);
}

function chartY(i) {
  return chart.y0 - (i / chart.iMax) * (chart.y0 - chart.y1);
}

function lineForResistance(resistance) {
  const endCurrent = Math.min(CHART_CURRENT_MAX, VOLTAGE_MAX / resistance);
  return `M${chart.x0} ${chart.y0} L${chart.x1} ${chartY(endCurrent)}`;
}

function updateChart() {
  const activeResistance = Math.max(state.resistance, 0.1);
  ui.family12.setAttribute('d', lineForResistance(12));
  ui.family9.setAttribute('d', lineForResistance(9));
  ui.family6.setAttribute('d', lineForResistance(6));

  const activePath = lineForResistance(activeResistance);
  ui.activeCurve.setAttribute('d', activePath);
  const areaPath = `${activePath} L${chart.x1} ${chart.y0} Z`;
  ui.curveArea.setAttribute('d', areaPath);

  const px = chartX(clamp(state.voltage, 0, chart.uMax));
  const py = chartY(clamp(state.current, 0, chart.iMax));

  ui.guideX.setAttribute('x1', px);
  ui.guideX.setAttribute('x2', px);
  ui.guideX.setAttribute('y1', py);
  ui.guideX.setAttribute('y2', chart.y0);
  ui.guideY.setAttribute('x1', chart.x0);
  ui.guideY.setAttribute('x2', px);
  ui.guideY.setAttribute('y1', py);
  ui.guideY.setAttribute('y2', py);

  ui.chartPoint.setAttribute('cx', px);
  ui.chartPoint.setAttribute('cy', py);
  ui.chartPointHalo.setAttribute('cx', px);
  ui.chartPointHalo.setAttribute('cy', py);

  ui.chartPointLabel.textContent = `${state.current.toFixed(2)} A`;
  if (px > 240) {
    ui.chartPointLabel.setAttribute('x', px - 10);
    ui.chartPointLabel.setAttribute('text-anchor', 'end');
  } else {
    ui.chartPointLabel.setAttribute('x', px + 10);
    ui.chartPointLabel.setAttribute('text-anchor', 'start');
  }
  ui.chartPointLabel.setAttribute('y', Math.max(24, py - 9));

  ui.chartTag.textContent = `R = ${state.resistance.toFixed(1)} Ω`;
  if (state.stage === 2) {
    ui.chartMode.textContent = 'U 恒定 · R ↑ 电流 ↓';
  } else if (state.stage === 3) {
    ui.chartMode.textContent = 'I 与 U 成正比';
  } else {
    ui.chartMode.textContent = 'R 恒定 · U ↑ 电流 ↑';
  }
}

function updateLawStage() {
  const visible = state.stage === 3;
  ui.lawReveal.classList.toggle('is-visible', visible);
  ui.lawReveal.setAttribute('aria-hidden', String(!visible));
  ui.chartCard.classList.toggle('is-highlight', visible);
}

function updateLawHighlights() {
  const focus = state.lawFocus;
  if (focus === lastLawFocus) return;
  lastLawFocus = focus;
  if (!focus) {
    ui.lawTerms.forEach((term) => term.classList.remove('is-lit'));
    ui.annotations.forEach((el) => el.classList.remove('is-law-focus'));
    return;
  }
  ui.lawTerms.forEach((term) => {
    term.classList.toggle('is-lit', term.dataset.term === focus);
  });
  const mapping = {
    i: ['ammeter'],
    u: ['battery', 'voltmeter'],
    r: ['resistor'],
  };
  ui.annotations.forEach((el) => {
    el.classList.toggle('is-law-focus', mapping[focus].includes(el.dataset.annotation));
  });
}

function updateTimeline() {
  const progress = clamp(state.time / DEMO_DURATION, 0, 1);
  ui.timelineProgress.style.width = `${progress * 100}%`;
  ui.timecode.textContent = `${formatTime(state.time)} / ${formatTime(DEMO_DURATION)}`;
  setActiveStageUI(state.stage);
}

function updateUI(now) {
  updateControls();
  updateReadouts();
  updateChart();
  updateLawStage();
  updateLawHighlights();
  updateTimeline();
  updateSceneStatus();
  updateTransportUI();
}

function applyTheme(theme, { persist = true, announce = false } = {}) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  ui.themeBtn.setAttribute('aria-pressed', String(next === 'light'));
  ui.themeBtn.setAttribute('aria-label', next === 'light' ? '切换深色主题' : '切换浅色主题');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#e3edf0' : '#03070d');
  if (persist) {
    try {
      localStorage.setItem('ohm-theme', next);
    } catch {
      // The visual theme still applies when storage is unavailable.
    }
  }
  if (lab) lab.setTheme(next);
  if (announce) showToast(next === 'light' ? '已切换到浅色实验室' : '已切换到深色实验室');
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next, { announce: true });
}

function showToast(message, duration = 2600) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('is-visible'), duration);
}

function syncFromDemo(frame) {
  state.stage = frame.stage;
  state.voltage = frame.voltage;
  state.resistance = frame.resistance;
  state.current = frame.current;
  state.switchClosed = frame.switchClosed;
  state.assemblyTime = frame.time;
}

function onStageChanged(stage) {
  if (stage === state.lastStage) return;
  state.lastStage = stage;
  updateStageCopy(stage, CAPTURE_MODE);
  setActiveStageUI(stage);
  lab.setStage(stage);
}

function updateAnnotations() {
  if (!lab || window.innerWidth <= 760) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const anchors = lab.getAnchors();
  const leftSafe = width > 1600 ? 396 : width > 1180 ? 326 : 30;
  const rightSafe = width > 1600 ? width - 404 : width > 1180 ? width - 328 : width - 24;
  const topSafe = 116;
  const bottomSafe = height - 172;

  for (const anchor of anchors) {
    const el = ui.annotations.find((item) => item.dataset.annotation === anchor.id);
    if (!el) continue;
    const p = anchor.position.clone().project(lab.camera);
    const x = (p.x * 0.5 + 0.5) * width;
    const y = (-p.y * 0.5 + 0.5) * height;
    const inView = p.z < 1 && x > leftSafe && x < rightSafe && y > topSafe && y < bottomSafe && !anchor.hidden;
    el.classList.toggle('is-visible', inView);
    if (inView) {
      el.style.left = `${x.toFixed(1)}px`;
      el.style.top = `${y.toFixed(1)}px`;
    }
  }
}

function tick(dt) {
  if (CAPTURE_MODE) return;
  const now = performance.now();
  if (now < state.introReadyAt) {
    if (lab) {
      lab.update(dt, {
        stage: state.stage,
        voltage: state.voltage,
        resistance: state.resistance,
        current: state.current,
        switchClosed: state.switchClosed,
        assemblyTime: state.assemblyTime,
        running: false,
        auto: state.auto,
      });
    }
    updateAnnotations();
    return;
  }

  if (state.playing && state.auto) {
    state.time = Math.min(DEMO_DURATION, state.time + dt);
    const frame = sampleDemo(state.time);
    syncFromDemo(frame);
    if (state.time >= DEMO_DURATION) {
      state.auto = false;
      state.completed = true;
      state.freeExplore = false;
      showToast('演示完成 · 拖动电压或电阻滑杆自由探索');
    }
  } else if (state.freeExplore) {
    state.assemblyTime = 8;
    state.switchClosed = true;
    state.current = currentFrom(state.voltage, state.resistance);
  } else if (state.stage > 0 && !state.auto) {
    state.assemblyTime = 8;
    state.switchClosed = true;
    state.current = currentFrom(state.voltage, state.resistance);
  }

  onStageChanged(state.stage);
  const sequence = ['i', 'u', 'r'];
  if (state.stage !== 3) state.lawFocus = null;
  else if (state.playing) state.lawFocus = sequence[Math.floor((now / 2400) % sequence.length)];

  if (lab) {
    lab.update(dt, {
      stage: state.stage,
      voltage: state.voltage,
      resistance: state.resistance,
      current: state.current,
      switchClosed: state.switchClosed,
      assemblyTime: state.assemblyTime,
      lawFocus: state.lawFocus,
      running: state.playing,
      auto: state.auto,
    });
  }

  updateAnnotations();
  updateUI(now);
}

function startAutoDemo({ resetTime = true } = {}) {
  if (resetTime) {
    state.time = 0;
    state.assemblyTime = 0;
    const frame = sampleDemo(0);
    syncFromDemo(frame);
  }
  state.auto = true;
  state.playing = true;
  state.completed = false;
  state.freeExplore = false;
  state.introReadyAt = 0;
  lab.setAutoCamera(true);
  updateUI(performance.now());
  updateTransportUI();
}

function resetDemo() {
  startAutoDemo({ resetTime: true });
  showToast('实验已重置 · 正在重新组装电路');
}

function pickStage(stageIndex) {
  const stage = STAGES[clamp(stageIndex, 0, STAGES.length - 1)];
  state.time = stage.start + 0.08;
  state.auto = true;
  state.playing = true;
  state.completed = false;
  state.freeExplore = false;
  state.introReadyAt = 0;
  const frame = sampleDemo(state.time);
  syncFromDemo(frame);
  state.stage = stage.index;
  state.lastStage = -1;
  onStageChanged(stage.index);
  lab.setAutoCamera(true);
  lab.setStage(stage.index);
  updateUI(performance.now());
  updateTransportUI();
  showToast(`已跳转到 ${stage.chapter} · ${stage.title}`);
}

function beginFreeExplore(changed) {
  if (state.auto) {
    showToast('已进入自由探索模式 · 实时计算 I = U / R');
  } else if (!state.freeExplore && !state.completed) {
    showToast('自由探索模式');
  }
  state.auto = false;
  state.playing = true;
  state.completed = false;
  state.freeExplore = true;
  state.switchClosed = true;
  state.assemblyTime = 8;
  state.current = currentFrom(state.voltage, state.resistance);
  updateUI(performance.now());
  updateTransportUI();
  void changed;
}

function bindEvents() {
  ui.playBtn.addEventListener('click', () => {
    state.playing = !state.playing;
    if (state.playing && nowReady()) {
      state.introReadyAt = 0;
    }
    updateTransportUI();
    updateSceneStatus();
    if (!state.playing) showToast('演示已暂停');
  });

  ui.autoBtn.addEventListener('click', () => {
    startAutoDemo({ resetTime: true });
    showToast('自动演示开始 · 四阶段连续实验');
  });

  ui.resetBtn.addEventListener('click', resetDemo);

  ui.stageItems.forEach((item) => {
    item.addEventListener('click', () => pickStage(Number(item.dataset.stage)));
  });

  ui.timelineSegments.forEach((item) => {
    item.addEventListener('click', () => pickStage(Number(item.dataset.segment)));
  });

  const onVoltageInput = () => {
    state.voltage = Number(ui.voltageRange.value);
    beginFreeExplore('voltage');
  };
  const onResistanceInput = () => {
    state.resistance = Number(ui.resistanceRange.value);
    beginFreeExplore('resistance');
  };
  ui.voltageRange.addEventListener('input', onVoltageInput);
  ui.resistanceRange.addEventListener('input', onResistanceInput);

  ui.cameraBtn.addEventListener('click', () => {
    const enabled = !lab.autoCamera;
    lab.setAutoCamera(enabled);
    showToast(enabled ? '自动运镜已开启' : '自动运镜已关闭 · 可自由旋转');
  });

  ui.themeBtn.addEventListener('click', toggleTheme);

  ui.helpBtn.addEventListener('click', () => {
    ui.helpModal.hidden = false;
    ui.helpClose.focus();
  });
  ui.helpClose.addEventListener('click', () => {
    ui.helpModal.hidden = true;
    ui.helpBtn.focus();
  });
  ui.helpModal.addEventListener('click', (event) => {
    if (event.target === ui.helpModal) {
      ui.helpModal.hidden = true;
      ui.helpBtn.focus();
    }
  });

  ui.fullscreenBtn.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      showToast('当前浏览器不允许全屏');
    }
  });

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLElement
      && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (event.key === 'Escape' && !ui.helpModal.hidden) {
      ui.helpModal.hidden = true;
      ui.helpBtn.focus();
      return;
    }
    if (typing) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Space') {
      event.preventDefault();
      ui.playBtn.click();
      return;
    }
    if (event.key === '1' || event.key === '2' || event.key === '3' || event.key === '4') {
      pickStage(Number(event.key) - 1);
      return;
    }
    if (event.key.toLowerCase() === 'a') {
      startAutoDemo({ resetTime: true });
      showToast('自动演示开始 · 四阶段连续实验');
    } else if (event.key.toLowerCase() === 'r') {
      resetDemo();
    } else if (event.key.toLowerCase() === 'f') {
      ui.fullscreenBtn.click();
    } else if (event.key.toLowerCase() === 'c') {
      ui.cameraBtn.click();
    } else if (event.key.toLowerCase() === 't') {
      toggleTheme();
    }
  });

}

function nowReady() {
  return performance.now() >= state.introReadyAt;
}

function boot() {
  lab = new OhmLab(ui.scene, {
    onFrame: (dt) => tick(dt),
    onAutoCameraChange: (enabled) => {
      ui.cameraBtn.setAttribute('aria-pressed', String(enabled));
      ui.cameraBtn.classList.toggle('is-active', enabled);
    },
    onUserInteract: () => {
      if (lab.autoCamera) {
        ui.cameraBtn.setAttribute('aria-pressed', 'false');
      }
    },
  });

  // Initial chart family curves.
  ui.family12.setAttribute('d', lineForResistance(12));
  ui.family9.setAttribute('d', lineForResistance(9));
  ui.family6.setAttribute('d', lineForResistance(6));

  const initialTheme = CAPTURE_MODE
    ? (CAPTURE_THEME === 'light' ? 'light' : 'dark')
    : (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  applyTheme(initialTheme, { persist: false });

  bindEvents();
  updateStageCopy(0, true);
  onStageChanged(0);
  updateUI(performance.now());
  updateTransportUI();

  if (CAPTURE_MODE) {
    document.documentElement.classList.add('capture-mode');
    ui.loader.classList.add('is-hidden');
    ui.loader.style.display = 'none';
    lab.renderer.setAnimationLoop(null);

    window.__captureReady = true;
    window.__captureFrame = (time) => {
      const t = Math.max(0, Math.min(DEMO_DURATION, Number(time) || 0));
      state.time = t;
      state.auto = true;
      state.playing = true;
      state.completed = false;
      state.freeExplore = false;
      state.introReadyAt = 0;
      const frame = sampleDemo(t);
      syncFromDemo(frame);
      if (t === 0) lab.resetCaptureState();
      onStageChanged(state.stage);

      const sequence = ['i', 'u', 'r'];
      state.lawFocus = state.stage === 3
        ? sequence[Math.floor((t - STAGES[3].start) / 2.4) % sequence.length]
        : null;
      updateUI(performance.now());

      lab.update(1 / 30, {
        stage: state.stage,
        voltage: state.voltage,
        resistance: state.resistance,
        current: state.current,
        switchClosed: state.switchClosed,
        assemblyTime: state.assemblyTime,
        lawFocus: state.lawFocus,
        running: true,
        auto: true,
      });
      updateAnnotations();

      return new Promise((resolve) => {
        requestAnimationFrame(() => resolve({
          time: t,
          stage: state.stage,
          current: state.current,
          voltage: state.voltage,
          resistance: state.resistance,
        }));
      });
    };
    return;
  }

  window.setTimeout(() => {
    ui.loader.classList.add('is-hidden');
  }, 620);

}

// Recover gracefully when WebGL is unavailable.
try {
  boot();
} catch (error) {
  console.error(error);
  ui.loader.classList.add('is-hidden');
  showToast('三维场景初始化失败，请使用支持 WebGL 2 的现代浏览器');
}

window.addEventListener('beforeunload', () => {
  if (lab) lab.dispose();
});

