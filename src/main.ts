import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSnowVillage, type SceneSettings } from './scene';
import { averageSummaries, summarizeFrames, type FrameSummary } from './stats';
import './style.css';

type Backend = 'webgpu' | 'webgl2';
type Quality = 'low' | 'medium' | 'high' | 'ultra';
type Renderer = InstanceType<typeof WebGPURenderer> | THREE.WebGLRenderer;

interface AppSettings extends SceneSettings {
  backend: Backend;
  quality: Quality;
  shadowMapSize: number;
  pixelRatio: number;
  paused: boolean;
}

interface SegmentResult {
  backend: Backend;
  initMs: number;
  summary: FrameSummary;
  drawCalls: number;
  triangles: number;
}

interface BenchmarkState {
  active: boolean;
  cancelled: boolean;
  reason: string;
  phase: 'idle' | 'warmup' | 'sample';
  frame: number;
  samples: number[];
  resolve?: (summary: FrameSummary) => void;
  reject?: (error: Error) => void;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('缺少 #app 根节点');

app.innerHTML = `
  <div class="app-shell">
    <div id="viewport" aria-label="雪地聚落三维画布"></div>
    <aside class="panel" id="panel">
      <header class="panel-header">
        <div class="panel-title"><span>RENDER CONTROL</span></div>
        <button class="icon-button" id="collapse" title="折叠控制面板" aria-label="折叠控制面板">‹</button>
      </header>
      <div class="panel-content" id="panel-content">
        <section class="section">
          <h2>渲染管线</h2>
          <div class="control-row"><label for="renderer">请求后端</label><select id="renderer"><option value="webgpu">WebGPU · WebGPURenderer</option><option value="webgl2">WebGL2 · WebGLRenderer</option></select></div>
          <div class="backend-line"><span>实际后端</span><strong id="actual-backend">初始化中</strong></div>
          <div class="backend-line"><span>初始化耗时</span><strong id="init-time">—</strong></div>
          <div class="control-row"><label for="quality">质量预设</label><select id="quality"><option value="low">低</option><option value="medium">中</option><option value="high" selected>高</option><option value="ultra">极限</option></select></div>
        </section>
        <section class="section">
          <h2>场景负载</h2>
          <div class="control-row"><label for="trees">针叶树</label><input id="trees" type="range" min="40" max="600" step="20" value="160"><output id="trees-value">160</output></div>
          <div class="control-row"><label for="units">居民</label><input id="units" type="range" min="4" max="80" step="2" value="18"><output id="units-value">18</output></div>
          <div class="control-row"><label for="snow">雪花</label><input id="snow" type="range" min="200" max="10000" step="200" value="2200"><output id="snow-value">2200</output></div>
          <div class="control-row"><label for="shadows">动态阴影</label><input id="shadows" type="checkbox" checked></div>
          <div class="control-row"><label for="shadow-size">阴影贴图</label><select id="shadow-size"><option value="512">512</option><option value="1024">1024</option><option value="2048" selected>2048</option><option value="4096">4096</option></select></div>
          <div class="control-row"><label for="pixel-ratio">像素倍率</label><input id="pixel-ratio" type="range" min="0.5" max="2" step="0.25" value="1.5"><output id="pixel-ratio-value">1.50</output></div>
          <div class="button-grid"><button id="pause">暂停场景</button><button id="reset-camera">重置镜头</button></div>
        </section>
        <section class="section">
          <h2>实时指标</h2>
          <div class="metrics">
            <div class="metric"><span>FPS</span><strong id="fps">—</strong></div><div class="metric"><span>P50</span><strong id="median">—</strong></div><div class="metric"><span>P95</span><strong id="p95">—</strong></div>
            <div class="metric"><span>P99</span><strong id="p99">—</strong></div><div class="metric"><span>&gt;16.7ms</span><strong id="over16">—</strong></div><div class="metric"><span>&gt;33.3ms</span><strong id="over33">—</strong></div>
            <div class="metric"><span>Draw calls</span><strong id="draw-calls">—</strong></div><div class="metric"><span>Triangles</span><strong id="triangles">—</strong></div><div class="metric"><span>样本</span><strong id="sample-count">0</strong></div>
          </div>
        </section>
        <section class="section">
          <h2>自动跑分</h2>
          <div class="button-grid"><button class="primary" id="benchmark">开始交叉跑分</button><button class="danger" id="cancel" disabled>取消</button></div>
          <p class="notice" id="benchmark-status">每段预热 60 帧、采样 180 帧；执行 WebGPU→WebGL2 与 WebGL2→WebGPU 两轮。</p>
          <div class="results-wrap"><table class="results"><thead><tr><th>后端</th><th>FPS</th><th>中位</th><th>P95</th><th>P99</th><th>&gt;16.7</th><th>&gt;33.3</th><th>Calls</th><th>三角形</th><th>初始化</th><th>FPS差异</th></tr></thead><tbody id="results"><tr><td colspan="11">尚无结果</td></tr></tbody></table></div>
        </section>
      </div>
    </aside>
    <div class="brand"><h1>霜境渲染实验室</h1><p><span class="status-dot"></span><span id="status">正在启动</span></p></div>
    <div class="loading visible" id="loading"><div class="loading-card"><span class="spinner"></span><span id="loading-text">正在初始化渲染器</span></div></div>
  </div>`;

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`缺少界面元素 #${id}`);
  return result as T;
}

const ui = {
  viewport: element<HTMLDivElement>('viewport'),
  panel: element<HTMLElement>('panel'),
  collapse: element<HTMLButtonElement>('collapse'),
  renderer: element<HTMLSelectElement>('renderer'),
  actualBackend: element<HTMLElement>('actual-backend'),
  initTime: element<HTMLElement>('init-time'),
  quality: element<HTMLSelectElement>('quality'),
  trees: element<HTMLInputElement>('trees'),
  treesValue: element<HTMLOutputElement>('trees-value'),
  units: element<HTMLInputElement>('units'),
  unitsValue: element<HTMLOutputElement>('units-value'),
  snow: element<HTMLInputElement>('snow'),
  snowValue: element<HTMLOutputElement>('snow-value'),
  shadows: element<HTMLInputElement>('shadows'),
  shadowSize: element<HTMLSelectElement>('shadow-size'),
  pixelRatio: element<HTMLInputElement>('pixel-ratio'),
  pixelRatioValue: element<HTMLOutputElement>('pixel-ratio-value'),
  pause: element<HTMLButtonElement>('pause'),
  resetCamera: element<HTMLButtonElement>('reset-camera'),
  benchmark: element<HTMLButtonElement>('benchmark'),
  cancel: element<HTMLButtonElement>('cancel'),
  benchmarkStatus: element<HTMLElement>('benchmark-status'),
  results: element<HTMLTableSectionElement>('results'),
  loading: element<HTMLElement>('loading'),
  loadingText: element<HTMLElement>('loading-text'),
  status: element<HTMLElement>('status'),
  fps: element<HTMLElement>('fps'),
  median: element<HTMLElement>('median'),
  p95: element<HTMLElement>('p95'),
  p99: element<HTMLElement>('p99'),
  over16: element<HTMLElement>('over16'),
  over33: element<HTMLElement>('over33'),
  drawCalls: element<HTMLElement>('draw-calls'),
  triangles: element<HTMLElement>('triangles'),
  sampleCount: element<HTMLElement>('sample-count'),
};

const webGpuAvailable = window.isSecureContext && 'gpu' in navigator;
const webGl2Probe = document.createElement('canvas').getContext('webgl2');
const webGl2Available = webGl2Probe !== null;
if (webGl2Probe) webGl2Probe.getExtension('WEBGL_lose_context')?.loseContext();

const webGpuOption = ui.renderer.querySelector<HTMLOptionElement>('option[value="webgpu"]');
const webGlOption = ui.renderer.querySelector<HTMLOptionElement>('option[value="webgl2"]');
if (webGpuOption) {
  webGpuOption.disabled = !webGpuAvailable;
  if (!webGpuAvailable) webGpuOption.textContent = 'WebGPU（不可用）';
}
if (webGlOption) webGlOption.disabled = !webGl2Available;
if (!webGpuAvailable && webGl2Available) ui.renderer.value = 'webgl2';
if (!webGpuAvailable && !webGl2Available) throw new Error('浏览器未提供 WebGPU 或 WebGL2');

const settings: AppSettings = {
  backend: ui.renderer.value as Backend,
  quality: 'high',
  treeCount: 160,
  unitCount: 18,
  snowCount: 2200,
  shadows: true,
  shadowMapSize: 2048,
  pixelRatio: 1.5,
  paused: false,
};

const village = createSnowVillage();
let renderer: Renderer | null = null;
let controls: OrbitControls | null = null;
let actualBackend: Backend | null = null;
let rafId: number | null = null;
let generation = 0;
let switchQueue: Promise<number> = Promise.resolve(0);
let lastFrameTime = 0;
let simulationTime = 0;
let lastDpr = window.devicePixelRatio;
let lastMetricsUpdate = 0;
const liveFrames: number[] = [];

const benchmark: BenchmarkState = {
  active: false,
  cancelled: false,
  reason: '',
  phase: 'idle',
  frame: 0,
  samples: [],
};

function setLoading(visible: boolean, text = '正在切换渲染后端'): void {
  ui.loadingText.textContent = text;
  ui.loading.classList.toggle('visible', visible);
}

function backendLabel(backend: Backend | null): string {
  return backend === 'webgpu' ? 'WebGPU' : backend === 'webgl2' ? 'WebGL2' : '未初始化';
}

function setControlLock(locked: boolean): void {
  ui.renderer.disabled = locked;
  ui.quality.disabled = locked;
  ui.trees.disabled = locked;
  ui.units.disabled = locked;
  ui.snow.disabled = locked;
  ui.shadows.disabled = locked;
  ui.shadowSize.disabled = locked;
  ui.pixelRatio.disabled = locked;
  ui.pause.disabled = locked;
  ui.resetCamera.disabled = locked;
  ui.benchmark.disabled = locked;
  ui.cancel.disabled = !locked;
}

function configureRenderer(nextRenderer: Renderer): void {
  nextRenderer.setPixelRatio(Math.min(settings.pixelRatio, window.devicePixelRatio));
  nextRenderer.setSize(window.innerWidth, window.innerHeight);
  nextRenderer.outputColorSpace = THREE.SRGBColorSpace;
  nextRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  nextRenderer.toneMappingExposure = 1.08;
  nextRenderer.shadowMap.enabled = settings.shadows;
  nextRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  village.sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
  village.sun.shadow.needsUpdate = true;
  if (nextRenderer instanceof WebGPURenderer) {
    nextRenderer.onDeviceLost = (info) => {
      invalidateBenchmark(`${info.api} 设备丢失：${info.message || info.reason || '未知原因'}`);
      ui.status.textContent = `${info.api} 设备已丢失`;
    };
  }
}

function rendererStats(activeRenderer: Renderer): { drawCalls: number; triangles: number } {
  if (activeRenderer instanceof THREE.WebGLRenderer) {
    return {
      drawCalls: activeRenderer.info.render.calls,
      triangles: activeRenderer.info.render.triangles,
    };
  }
  return {
    drawCalls: activeRenderer.info.render.drawCalls,
    triangles: activeRenderer.info.render.triangles,
  };
}

function startLoop(): void {
  if (rafId !== null || !renderer) return;
  lastFrameTime = 0;
  rafId = requestAnimationFrame(frame);
}

function stopLoop(): void {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  lastFrameTime = 0;
}

function requestBackend(target: Backend): Promise<number> {
  const token = ++generation;
  const operation = switchQueue.catch(() => 0).then(async () => {
    if (token !== generation) return 0;
    return performBackendSwitch(target, token);
  });
  switchQueue = operation.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    ui.status.textContent = `切换失败：${message}`;
    setLoading(false);
    return 0;
  });
  return operation;
}

async function performBackendSwitch(target: Backend, token: number): Promise<number> {
  if (target === 'webgpu' && !webGpuAvailable) throw new Error('WebGPU 不可用；需 localhost/HTTPS 且浏览器支持 navigator.gpu');
  if (target === 'webgl2' && !webGl2Available) throw new Error('WebGL2 context 不可用');

  setLoading(true, `正在初始化 ${backendLabel(target)}`);
  ui.status.textContent = `切换至 ${backendLabel(target)}`;
  stopLoop();
  const oldRenderer = renderer;
  const oldControls = controls;

  if (token !== generation) {
    startLoop();
    return 0;
  }
  const started = performance.now();
  let candidate: Renderer | null = null;
  try {
    candidate = target === 'webgpu'
      ? new WebGPURenderer({ antialias: true })
      : new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    configureRenderer(candidate);
    candidate.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      invalidateBenchmark('WebGL2 context lost，当前跑分已取消');
      ui.status.textContent = 'WebGL2 context lost';
    });
    if (candidate instanceof WebGPURenderer) await candidate.init();
  } catch (error) {
    candidate?.dispose();
    candidate?.domElement.remove();
    renderer = oldRenderer;
    controls = oldControls;
    actualBackend = oldRenderer ? actualBackend : null;
    setLoading(false);
    startLoop();
    throw error;
  }
  const elapsed = performance.now() - started;
  if (token !== generation) {
    candidate.dispose();
    candidate.domElement.remove();
    renderer = oldRenderer;
    controls = oldControls;
    startLoop();
    return 0;
  }

  if (!candidate) {
    renderer = oldRenderer;
    controls = oldControls;
    startLoop();
    throw new Error('渲染器创建失败');
  }
  let detected: Backend | null = null;
  if (candidate instanceof THREE.WebGLRenderer) {
    const context = candidate.getContext();
    detected = context instanceof WebGL2RenderingContext ? 'webgl2' : null;
  } else {
    const backendFlags = candidate.backend as unknown as { isWebGPUBackend?: boolean };
    detected = backendFlags.isWebGPUBackend ? 'webgpu' : null;
  }
  if (!detected || detected !== target) {
    candidate.dispose();
    candidate.domElement.remove();
    renderer = oldRenderer;
    controls = oldControls;
    setLoading(false);
    startLoop();
    if (!detected) throw new Error('无法识别实际渲染后端');
    throw new Error(`请求 ${backendLabel(target)}，实际得到 ${backendLabel(detected)}；已拒绝静默回退`);
  }

  oldControls?.dispose();
  if (oldRenderer) {
    const oldCanvas = oldRenderer.domElement;
    if (oldRenderer instanceof WebGPURenderer) oldRenderer.onDeviceLost = () => undefined;
    oldRenderer.dispose();
    oldCanvas.remove();
  }
  renderer = candidate;
  actualBackend = detected;
  ui.viewport.replaceChildren(candidate.domElement);
  controls = new OrbitControls(village.camera, candidate.domElement);
  controls.target.set(0, 3, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 18;
  controls.maxDistance = 75;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.update();
  ui.actualBackend.textContent = backendLabel(detected);
  ui.initTime.textContent = `${elapsed.toFixed(1)} ms`;
  ui.status.textContent = `${backendLabel(detected)} 运行中`;
  setLoading(false);
  liveFrames.length = 0;
  startLoop();
  return elapsed;
}

function renderMetrics(): void {
  const summary = summarizeFrames(liveFrames.slice(-180));
  ui.fps.textContent = summary.samples ? summary.fps.toFixed(1) : '—';
  ui.median.textContent = summary.samples ? `${summary.median.toFixed(1)} ms` : '—';
  ui.p95.textContent = summary.samples ? `${summary.p95.toFixed(1)} ms` : '—';
  ui.p99.textContent = summary.samples ? `${summary.p99.toFixed(1)} ms` : '—';
  ui.over16.textContent = summary.samples ? `${(summary.over16 * 100).toFixed(1)}%` : '—';
  ui.over33.textContent = summary.samples ? `${(summary.over33 * 100).toFixed(1)}%` : '—';
  ui.sampleCount.textContent = String(summary.samples);
  if (renderer) {
    const stats = rendererStats(renderer);
    ui.drawCalls.textContent = String(stats.drawCalls);
    ui.triangles.textContent = stats.triangles.toLocaleString('zh-CN');
  }
}

function frame(now: number): void {
  rafId = null;
  const activeRenderer = renderer;
  if (!activeRenderer) return;

  const deltaMs = lastFrameTime === 0 ? 16.7 : Math.min(now - lastFrameTime, 100);
  lastFrameTime = now;
  if (window.devicePixelRatio !== lastDpr) {
    lastDpr = window.devicePixelRatio;
    invalidateBenchmark('系统 DPR 发生变化，当前跑分已取消');
    resize();
  }

  if (!settings.paused) {
    simulationTime += deltaMs / 1000;
    village.update(deltaMs / 1000, simulationTime);
  }
  controls?.update();
  activeRenderer.render(village.scene, village.camera);

  liveFrames.push(deltaMs);
  if (liveFrames.length > 240) liveFrames.shift();
  advanceBenchmark(deltaMs);
  if (now - lastMetricsUpdate > 250) {
    renderMetrics();
    lastMetricsUpdate = now;
  }
  if (renderer === activeRenderer) rafId = requestAnimationFrame(frame);
}

function advanceBenchmark(deltaMs: number): void {
  if (!benchmark.active) return;
  benchmark.frame += 1;
  if (benchmark.phase === 'warmup') {
    ui.benchmarkStatus.textContent = `${backendLabel(actualBackend)} 预热 ${benchmark.frame}/60`;
    if (benchmark.frame >= 60) {
      benchmark.phase = 'sample';
      benchmark.frame = 0;
      benchmark.samples = [];
    }
    return;
  }
  if (benchmark.phase === 'sample') {
    benchmark.samples.push(deltaMs);
    ui.benchmarkStatus.textContent = `${backendLabel(actualBackend)} 采样 ${benchmark.frame}/180`;
    if (benchmark.frame >= 180) {
      const resolve = benchmark.resolve;
      benchmark.resolve = undefined;
      benchmark.reject = undefined;
      benchmark.phase = 'idle';
      resolve?.(summarizeFrames(benchmark.samples));
    }
  }
}

function sampleSegment(): Promise<FrameSummary> {
  benchmark.phase = 'warmup';
  benchmark.frame = 0;
  benchmark.samples = [];
  return new Promise((resolve, reject) => {
    benchmark.resolve = resolve;
    benchmark.reject = reject;
  });
}

function invalidateBenchmark(reason: string): void {
  if (!benchmark.active) return;
  benchmark.cancelled = true;
  benchmark.reason = reason;
  benchmark.phase = 'idle';
  benchmark.reject?.(new Error(reason));
  benchmark.resolve = undefined;
  benchmark.reject = undefined;
}

function resetForBenchmark(): void {
  simulationTime = 0;
  village.reset();
  controls?.target.set(0, 3, 0);
  controls?.update();
  liveFrames.length = 0;
  lastFrameTime = 0;
}

async function runBenchmark(): Promise<void> {
  if (benchmark.active || !webGpuAvailable || !webGl2Available) {
    ui.benchmarkStatus.textContent = '交叉跑分需要 WebGPU 与 WebGL2 均可用。';
    ui.benchmarkStatus.classList.add('warn');
    return;
  }
  benchmark.active = true;
  benchmark.cancelled = false;
  benchmark.reason = '';
  const requestedBackend = settings.backend;
  const wasPaused = settings.paused;
  settings.paused = false;
  ui.benchmarkStatus.classList.remove('warn');
  setControlLock(true);
  const sequence: Backend[] = ['webgpu', 'webgl2', 'webgl2', 'webgpu'];
  const results: SegmentResult[] = [];
  try {
    for (let index = 0; index < sequence.length; index += 1) {
      if (benchmark.cancelled) throw new Error(benchmark.reason || '用户取消');
      const backend = sequence[index];
      if (!backend) continue;
      ui.benchmarkStatus.textContent = `第 ${index + 1}/4 段：准备 ${backendLabel(backend)}`;
      const measuredInit = await requestBackend(backend);
      if (benchmark.cancelled) throw new Error(benchmark.reason || '用户取消');
      resetForBenchmark();
      const summary = await sampleSegment();
      if (!renderer) throw new Error('渲染器意外销毁');
      const stats = rendererStats(renderer);
      results.push({
        backend,
        initMs: measuredInit,
        summary,
        drawCalls: stats.drawCalls,
        triangles: stats.triangles,
      });
    }
    showBenchmarkResults(results);
    ui.benchmarkStatus.textContent = '交叉跑分完成；初始化耗时与稳态帧指标已分开统计。';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.benchmarkStatus.textContent = `跑分无效/已取消：${message}`;
    ui.benchmarkStatus.classList.add('warn');
  } finally {
    benchmark.active = false;
    benchmark.phase = 'idle';
    settings.paused = wasPaused;
    ui.pause.textContent = settings.paused ? '继续场景' : '暂停场景';
    if (actualBackend !== requestedBackend) {
      try {
        await requestBackend(requestedBackend);
      } catch {
        ui.benchmarkStatus.textContent += ' 恢复原后端失败。';
      }
    }
    setControlLock(false);
    ui.renderer.value = requestedBackend;
  }
}

function showBenchmarkResults(results: SegmentResult[]): void {
  const gpuRuns = results.filter((result) => result.backend === 'webgpu');
  const glRuns = results.filter((result) => result.backend === 'webgl2');
  const gpu = averageSummaries(gpuRuns.map((result) => result.summary));
  const gl = averageSummaries(glRuns.map((result) => result.summary));
  const gpuInit = gpuRuns.reduce((sum, result) => sum + result.initMs, 0) / gpuRuns.length;
  const glInit = glRuns.reduce((sum, result) => sum + result.initMs, 0) / glRuns.length;
  const gpuCalls = gpuRuns.reduce((sum, result) => sum + result.drawCalls, 0) / gpuRuns.length;
  const glCalls = glRuns.reduce((sum, result) => sum + result.drawCalls, 0) / glRuns.length;
  const gpuTriangles = gpuRuns.reduce((sum, result) => sum + result.triangles, 0) / gpuRuns.length;
  const glTriangles = glRuns.reduce((sum, result) => sum + result.triangles, 0) / glRuns.length;
  const difference = gl.fps > 0 ? ((gpu.fps - gl.fps) / gl.fps) * 100 : 0;
  ui.results.innerHTML = `
    <tr><td>WebGPU ×2</td><td>${gpu.fps.toFixed(1)}</td><td>${gpu.median.toFixed(1)}</td><td>${gpu.p95.toFixed(1)}</td><td>${gpu.p99.toFixed(1)}</td><td>${(gpu.over16 * 100).toFixed(1)}%</td><td>${(gpu.over33 * 100).toFixed(1)}%</td><td>${gpuCalls.toFixed(0)}</td><td>${gpuTriangles.toFixed(0)}</td><td>${gpuInit.toFixed(1)}ms</td><td>${difference >= 0 ? '+' : ''}${difference.toFixed(1)}%</td></tr>
    <tr><td>WebGL2 ×2</td><td>${gl.fps.toFixed(1)}</td><td>${gl.median.toFixed(1)}</td><td>${gl.p95.toFixed(1)}</td><td>${gl.p99.toFixed(1)}</td><td>${(gl.over16 * 100).toFixed(1)}%</td><td>${(gl.over33 * 100).toFixed(1)}%</td><td>${glCalls.toFixed(0)}</td><td>${glTriangles.toFixed(0)}</td><td>${glInit.toFixed(1)}ms</td><td>基准</td></tr>`;
  const refreshCapped = gpu.median > 14 && gpu.median < 18.5 && gl.median > 14 && gl.median < 18.5;
  if (refreshCapped) {
    ui.benchmarkStatus.textContent = '两端中位帧均接近 16.7ms，结果可能受 60Hz 刷新率封顶；请重点比较尾延迟。';
    ui.benchmarkStatus.classList.add('warn');
  }
}

function applySceneSettings(): void {
  village.applySettings(settings);
  if (renderer) configureRenderer(renderer);
}

const presets: Record<Quality, Pick<AppSettings, 'treeCount' | 'unitCount' | 'snowCount' | 'shadows' | 'shadowMapSize' | 'pixelRatio'>> = {
  low: { treeCount: 80, unitCount: 10, snowCount: 800, shadows: false, shadowMapSize: 512, pixelRatio: 0.75 },
  medium: { treeCount: 120, unitCount: 14, snowCount: 1400, shadows: true, shadowMapSize: 1024, pixelRatio: 1 },
  high: { treeCount: 160, unitCount: 18, snowCount: 2200, shadows: true, shadowMapSize: 2048, pixelRatio: 1.5 },
  ultra: { treeCount: 400, unitCount: 48, snowCount: 7000, shadows: true, shadowMapSize: 4096, pixelRatio: 2 },
};

function syncControls(): void {
  ui.trees.value = String(settings.treeCount);
  ui.treesValue.value = String(settings.treeCount);
  ui.units.value = String(settings.unitCount);
  ui.unitsValue.value = String(settings.unitCount);
  ui.snow.value = String(settings.snowCount);
  ui.snowValue.value = String(settings.snowCount);
  ui.shadows.checked = settings.shadows;
  ui.shadowSize.value = String(settings.shadowMapSize);
  ui.pixelRatio.value = String(settings.pixelRatio);
  ui.pixelRatioValue.value = settings.pixelRatio.toFixed(2);
}

function resize(): void {
  if (benchmark.active) invalidateBenchmark('窗口尺寸发生变化，当前跑分已取消');
  village.camera.aspect = window.innerWidth / window.innerHeight;
  village.camera.updateProjectionMatrix();
  if (renderer) {
    renderer.setPixelRatio(Math.min(settings.pixelRatio, window.devicePixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

ui.renderer.addEventListener('change', () => {
  settings.backend = ui.renderer.value as Backend;
  void requestBackend(settings.backend).catch(() => {
    if (actualBackend) ui.renderer.value = actualBackend;
  });
});
ui.quality.addEventListener('change', () => {
  settings.quality = ui.quality.value as Quality;
  Object.assign(settings, presets[settings.quality]);
  syncControls();
  applySceneSettings();
});
ui.trees.addEventListener('input', () => { ui.treesValue.value = ui.trees.value; });
ui.trees.addEventListener('change', () => { settings.treeCount = Number(ui.trees.value); applySceneSettings(); });
ui.units.addEventListener('input', () => { ui.unitsValue.value = ui.units.value; });
ui.units.addEventListener('change', () => { settings.unitCount = Number(ui.units.value); applySceneSettings(); });
ui.snow.addEventListener('input', () => { ui.snowValue.value = ui.snow.value; });
ui.snow.addEventListener('change', () => { settings.snowCount = Number(ui.snow.value); applySceneSettings(); });
ui.shadows.addEventListener('change', () => { settings.shadows = ui.shadows.checked; applySceneSettings(); });
ui.shadowSize.addEventListener('change', () => { settings.shadowMapSize = Number(ui.shadowSize.value); applySceneSettings(); });
ui.pixelRatio.addEventListener('input', () => { ui.pixelRatioValue.value = Number(ui.pixelRatio.value).toFixed(2); });
ui.pixelRatio.addEventListener('change', () => { settings.pixelRatio = Number(ui.pixelRatio.value); resize(); });
ui.pause.addEventListener('click', () => { settings.paused = !settings.paused; ui.pause.textContent = settings.paused ? '继续场景' : '暂停场景'; });
ui.resetCamera.addEventListener('click', () => { village.reset(); controls?.target.set(0, 3, 0); controls?.update(); });
ui.collapse.addEventListener('click', () => {
  const collapsed = ui.panel.classList.toggle('collapsed');
  ui.collapse.textContent = collapsed ? '›' : '‹';
});
ui.benchmark.addEventListener('click', () => { void runBenchmark(); });
ui.cancel.addEventListener('click', () => { invalidateBenchmark('用户取消'); });
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) invalidateBenchmark('页面进入 hidden 状态，当前跑分已取消');
});
window.addEventListener('blur', () => invalidateBenchmark('页面失焦，当前跑分已取消'));

if (!webGpuAvailable) {
  ui.benchmark.disabled = true;
  ui.benchmarkStatus.textContent = 'WebGPU 不可用：请通过 localhost/HTTPS 并使用支持 WebGPU 的浏览器。仍可单独运行 WebGL2。';
  ui.benchmarkStatus.classList.add('warn');
}

syncControls();
void requestBackend(settings.backend).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  ui.loadingText.textContent = `启动失败：${message}`;
  ui.status.textContent = '启动失败';
});
