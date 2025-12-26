# LynxMusic — 一个自由随性的音乐播放器

LynxMusic 是一个基于 React + TypeScript + Vite 的开源本地/在线音乐播放器前端示例项目，目标是在桌面与移动 Web 环境下提供流畅的音乐播放体验与灵活的播放列表管理功能。

**主要特性**

- 支持本地与在线歌曲管理与播放
- 播放队列、播放列表管理与收藏
- 下载管理与离线播放支持（受限于运行环境权限）
- 简洁的移动优先 UI，使用 Tailwind CSS 构建
- 基于 Hook 的音频播放管理逻辑，便于扩展与复用

**技术栈**

- 框架：React + TypeScript
- 构建：Vite
- 样式：Tailwind CSS
- 状态与 Hook：自定义 Hooks（见 `hooks/`）
- 本地存储 / 数据：IndexedDB / 本地文件系统（见 `utils/db.ts` / `utils/fileSystem.ts`）

项目结构（摘要）

- `components/`：可复用的 UI 组件（播放栏、歌曲项、弹窗等）
- `hooks/`：自定义 Hook（音频控制、歌曲操作等）
- `pages/`：页面路由组件（首页、歌单、播放中等）
- `utils/`：工具与业务逻辑（API、数据库、下载管理、本地文件系统桥接）
- 其它：`index.html`、`App.tsx`、`vite.config.ts`、`package.json` 等

快速开始

1. 克隆仓库

```bash
git clone <仓库地址>
cd Lynxmusic
```

2. 安装依赖（需已安装 Node.js）

```bash
npm install
```

3. 本地开发

```bash
npm run dev
```

4. 打包构建

```bash
npm run build
```

5. 预览构建结果

```bash
npm run preview
```

开发说明

- 入口文件：`index.tsx` 和 `App.tsx`。
- 页面路由与视图位于 `pages/`，每个页面使用函数组件与 Tailwind CSS 组织样式。
- 音频播放逻辑集中在 `hooks/useAudioPlayer.ts`，推荐阅读以理解播放队列、进度与事件管理。
- 与原生环境交互（如文件读写、下载）封装在 `utils/nativeBridge.ts`、`utils/fileSystem.ts` 与 `utils/downloadManager.ts`。

测试与质量

- 本仓库当前未包含自动化测试脚本；为确保质量，建议在引入新特性时为关键逻辑添加单元测试并使用 lint/格式化工具。

贡献指南

- 欢迎 Fork 并提交 PR：先在本地创建分支，补充说明和变更点，确保 TypeScript 类型正确。
- 提交前请运行 `npm run build` 确认没有构建错误。

许可

- 本项目包含 `LICENSE` 文件，请参阅仓库根目录中的许可说明。

常见问题（FAQ）

- Q: 如何添加本地歌曲？
  A: 目前本地歌曲支持依赖浏览器文件选择或原生桥接功能（在桌面/移动容器中），实现位于 `utils/fileSystem.ts`。
- Q: 下载功能是否支持断点续传？
  A: 下载管理逻辑在 `utils/downloadManager.ts`，是否支持断点取决于后端与实现细节。

更多信息
如需了解具体实现或某个文件的位置，请查看项目源码，例如 `components/`、`hooks/` 与 `utils/`。
