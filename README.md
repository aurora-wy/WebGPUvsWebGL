# WebGPU vs WebGL2：霜境渲染实验室

一个基于 Three.js 的单页 3D 渲染对比 Demo，用同一套雪地聚落场景比较 WebGPU 与 WebGL2 的端到端表现。

项目不会同时运行两个渲染后端。页面始终只有一个可见 Canvas；切换后端时会先初始化并验证新渲染器，成功后再释放旧渲染器，从而避免 WebGPU 与 WebGL2 同时给 GPU 施压。

## 功能

- 在同一页面切换：
  - WebGPU：Three.js `WebGPURenderer`
  - WebGL2：Three.js `WebGLRenderer`
- 原创低多边形雪地聚落场景
- 实例化针叶树、岩石、木箱和围栏
- 动态居民、飘雪、炉火、灯光与阴影
- 低、中、高、极限四档场景负载
- 可调整树木、居民、雪花、阴影分辨率和像素倍率
- 实时显示 FPS、P50/P95/P99 帧间隔、长帧比例、Draw Calls 和三角形数量
- 自动执行 WebGPU → WebGL2、WebGL2 → WebGPU 的交叉跑分
- 跑分时将初始化耗时与稳态帧数据分开统计
- 页面失焦、隐藏、尺寸或 DPR 变化时自动取消当前跑分
- WebGPU 不可用或发生静默回退时给出明确提示

## 对比口径

两个后端共用同一套：

- Scene Graph
- 相机与镜头位置
- Geometry、Material 和灯光
- 实例数量与固定随机布局
- 动画逻辑
- 色彩空间、Tone Mapping、阴影设置和 DPR

为了提高实际稳定性，当前对比的是两个完整渲染路径：

| 选项 | Three.js 渲染器 | 图形 API |
| --- | --- | --- |
| WebGPU | `WebGPURenderer` | WebGPU |
| WebGL2 | `WebGLRenderer` | WebGL2 |

因此结果不仅包含底层 API 的差异，也可能包含 Three.js 两种渲染器实现的差异。项目适合做同一业务场景下的端到端对比，不应被解读为纯 API 微基准。

## 环境要求

- Node.js 22.12 或更高版本
- 支持 WebGL2 的现代浏览器
- WebGPU 测试需要支持 WebGPU 的浏览器和设备
- WebGPU 只能在安全上下文运行：
  - 本地开发使用 `localhost` 或 `127.0.0.1`
  - 在线部署使用 HTTPS

建议优先使用最新版 Chrome 或 Edge 测试。不同浏览器、操作系统、显卡驱动、分辨率和设备温度都会影响结果。

## 本地运行

```bash
npm install
npm run dev
```

根据终端提示打开本地地址。不要直接双击 `dist/index.html` 测试 WebGPU，因为 `file://` 页面不属于可靠的安全上下文。

## 质量检查

```bash
npm run typecheck
npm test
npm run build
```

构建完成后，可预览生产版本：

```bash
npm run preview
```

## 项目结构

```text
WebGPUvsWebGL/
├── src/
│   ├── main.ts          # 页面、渲染器切换、指标与自动跑分
│   ├── scene.ts         # 程序化雪地聚落与场景更新
│   ├── stats.ts         # 帧间隔统计函数
│   ├── stats.test.ts    # Vitest 单元测试
│   └── style.css        # 控制面板与响应式样式
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── .gitignore
└── README.md
```

`node_modules/` 和 `dist/` 不需要提交到 GitHub，它们已经写入 `.gitignore`：

- `node_modules/` 可通过 `npm install` 或 `npm ci` 重建
- `dist/` 可通过 `npm run build` 重建

## 自动跑分方法

每个后端的测试分为两个阶段：

1. 预热 60 帧，不计入稳态成绩
2. 采样 180 帧

完整顺序为：

```text
WebGPU → WebGL2 → WebGL2 → WebGPU
```

反转顺序可以减小首次执行、缓存和设备升温对结果的偏差。两轮结果会按后端聚合。

当前展示的指标：

- 平均 FPS
- 帧间隔中位数
- P95 / P99 帧间隔
- 超过 16.7 ms 的帧比例
- 超过 33.3 ms 的帧比例
- Draw Calls
- 三角形数量
- 渲染器初始化耗时

项目不会把 `performance.now()` 包围 `renderer.render()` 得到的时间冒充为 GPU 时间，也不展示浏览器无法稳定横向比较的 GPU 占用率、功耗或温度。

如果两个后端都稳定在显示器刷新率上限附近，FPS 可能无法拉开差距。此时可以提高场景负载，并重点观察 P95、P99 和长帧比例。

## GitHub Pages

Vite 已设置相对资源路径，生产构建可以部署到 GitHub Pages 的仓库子路径。

先生成静态文件：

```bash
npm ci
npm run build
```

然后将 `dist/` 作为 GitHub Pages 的部署目录。线上页面必须通过 HTTPS 访问，GitHub Pages 默认满足该要求。

## 上传到 GitHub

在项目根目录执行：

```bash
git init
git add .
git commit -m "Initial WebGPU and WebGL2 benchmark"
git branch -M main
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```

首次提交前可以运行：

```bash
git status
```

确认 `node_modules/` 和 `dist/` 没有出现在待提交文件中。

## 已知边界

- WebGPU 支持情况取决于浏览器、系统、GPU 和驱动
- WebGPU 可用不代表一定能成功获得 GPU Adapter 或 Device
- WebGPU 与 WebGL2 在抗锯齿、浮点精度和阴影边缘上可能存在轻微视觉差异
- 浏览器可能把两个 API 映射到不同的系统图形路径
- 本项目反映的是当前设备、浏览器、窗口尺寸与场景配置下的结果
- 正式性能结论应补充多台设备、多轮测试和设备温度控制
