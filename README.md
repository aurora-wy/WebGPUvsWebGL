<div align="center">

# WebGPU vs WebGL2

用Three.js写的同一套雪地场景，直观对比两种技术的渲染效果。

![Three.js](https://img.shields.io/badge/Three.js-r185-111111?logo=threedotjs&logoColor=white)
![WebGPU](https://img.shields.io/badge/WebGPU-supported-2563eb)
![WebGL2](https://img.shields.io/badge/WebGL2-supported-f97316)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=white)

</div>

## 项目简介

这是一个单页 3D 渲染对比 Demo。

页面只保留一个 Canvas。选择 WebGPU 或 WebGL2 后，项目会切换渲染器。

| 模式 | Three.js 渲染器 | 图形 API |
| --- | --- | --- |
| WebGPU | `WebGPURenderer` | WebGPU |
| WebGL2 | `WebGLRenderer` | WebGL2 |

场景、相机、材质、灯光、对象数量和动画逻辑保持一致。测试结果表示两条完整渲染路径在当前设备上的表现，不是纯 API 微基准。

## 功能

- WebGPU / WebGL2 手动切换
- 低、中、高、极限四档负载
- 树木、居民、雪花、阴影和像素倍率调节
- FPS、P50、P95、P99、长帧比例、Draw Calls、三角形数量
- WebGPU → WebGL2 → WebGL2 → WebGPU 交叉跑分
- 桌面控制面板和移动端布局

## 第一次运行

### 1. 准备 Node.js

这个项目依赖较新的 Three.js 和新版 TypeScript 构建链，所以需要 **Node.js 22.12 或更高版本**。版本太低的话，`npm ci` 和构建脚本大概率会直接报错。

先看看本机版本：

```bash
node -v
```

如果输出的版本已经 >= 22.12.0，可以跳过这一步。否则在下面几种装法中选择一种进行安装。

#### 用 nvm 管理 🌟

nvm（Node Version Manager）能让你在一台机器上并存多个 Node 版本，切换很方便。

**macOS / Linux**

```bash
# 安装 nvm（本机已有可跳过）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash

# 安装并切到 Node 22
nvm install 22
nvm use 22
```

装完重新开一个终端，或者手动 `source ~/.zshrc`（用 bash 就 `source ~/.bashrc`），再 `node -v` 确认一下。

**Windows**

Windows 上没有原版 nvm，用社区维护的 **nvm-windows**：去它的 GitHub Releases 下载 `nvm-setup.exe` 安装，然后在终端里：

```bash
nvm install 22
nvm use 22
```

#### macOS — Homebrew

如果你更习惯用 Homebrew 管开发工具，一行就能装好（npm 会跟着一起装上）：

```bash
brew install node
```

Apple Silicon 的 Mac 上 Homebrew 装在 `/opt/homebrew`，Intel Mac 则是 `/usr/local`。如果终端报 `brew: command not found`，先把对应路径加进 PATH：

```bash
# Apple Silicon
export PATH="/opt/homebrew/bin:$PATH"
# Intel
export PATH="/usr/local/bin:$PATH"
```

建议把这行写进 `~/.zshrc`，省得每次新开终端都要重新敲。

#### Windows — 官方安装包

不想碰命令行，就去 [nodejs.org](https://nodejs.org) 下载 **LTS** 里 22.x 的安装包，双击运行。安装向导里记得勾上 **Add to PATH**，装完就能直接在终端用 `node` 和 `npm` 了。

用 winget 也可以一行搞定：

```bash
winget install OpenJS.NodeJS.LTS
```

#### Linux

Debian / Ubuntu 源里的 Node 版本往往偏旧，不建议直接 `apt install nodejs`。还是上面的 nvm 最省心；或者去 nodejs.org 下载官方二进制包，解压到 `/usr/local` 即可。

#### 验证安装

不管用哪种方式，最后都跑一下：

```bash
node -v
npm -v
```

两个命令都能正常打印版本号，就说明环境没问题了。要是 `node -v` 报 `command not found`，基本是 PATH 没配好——把 Node 所在目录加进环境变量再试一次就行。

### 2. 获取项目

使用 Git 克隆：

```bash
git clone <仓库地址>
cd WebGPUvsWebGL
```

也可以在 GitHub 页面点击 `Code` → `Download ZIP`，解压后在终端进入项目目录。

### 3. 安装依赖

```bash
npm ci
```

### 4. 启动网页

```bash
npm run dev
```

终端会显示本地地址，通常是：

```text
http://127.0.0.1:5173
```

点击终端中的地址，或复制到浏览器打开。

### 5. 开始对比

1. 在左侧面板选择 `WebGPU` 或 `WebGL2`
2. 选择质量预设，或手动调整场景负载
3. 查看实时帧指标
4. 点击“开始交叉跑分”生成两种模式的结果

WebGPU 需要安全上下文。本地请通过 `localhost` 或 `127.0.0.1` 打开，不要直接双击 HTML 文件。

## 常用命令

```bash
npm run dev        # 启动开发服务器
npm run typecheck  # TypeScript 类型检查
npm test           # 运行单元测试
npm run build      # 生成生产文件
npm run preview    # 预览生产构建
```

生产文件会生成在 `dist/`。

## 跑分说明

每个后端先预热 60 帧，再采样 180 帧。完整顺序为：

```text
WebGPU → WebGL2 → WebGL2 → WebGPU
```

初始化耗时与稳态帧数据分开记录。页面失焦、隐藏、尺寸变化或 DPR 变化会取消当前测试。

如果两个后端都接近显示器刷新率上限，FPS 差异会很小。此时可提高场景负载，重点观察 P95、P99 和长帧比例。

## 项目结构

```text
├── src/
│   ├── main.ts          # 页面、渲染器切换与跑分
│   ├── scene.ts         # 雪地场景
│   ├── stats.ts         # 帧数据统计
│   ├── stats.test.ts    # 单元测试
│   └── style.css        # 页面样式
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
└── vite.config.ts
```

## 浏览器支持

建议使用最新版 Chrome 或 Edge。

WebGPU 是否可用取决于浏览器、操作系统、显卡和驱动。WebGL2 覆盖更广。不同设备、窗口尺寸和温度状态下的结果不宜直接横向比较。
