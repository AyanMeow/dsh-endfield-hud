# 实现笔记（开发向）

> 面向使用者/安装的说明见 [README.md](../README.md)。本文件记录实现细节、踩过的坑与里程碑，供二次开发参考。

## 目录结构

| 路径 | 作用 |
|---|---|
| `host/index.js` | host 半区：首屏 `tapIndex` 盖章、同源资产路由、状态持久化（零运行时依赖） |
| `client/index.js` | client 半区：模块加载器 closure-factory 格式，设置卡 + 实时开关 + HUD 装饰层（无构建步骤） |
| `assets/skin.css` | 皮肤样式表：L1 token 重映射 + L2 语义选择器 + L3 兜底 + 装饰层样式 |
| `assets/fonts/` | 官网 woff2 字体（Novecento Wide / Gilroy / Protest Strike / Roboto / Space Grotesk） |
| `assets/art/` | 美术层：主视觉 KV 背景、HUD 徽章（动态居中）、侧栏竖排装饰文字 + 竖排条带、右侧栏标志、右上条带、左下装饰线、右下立塔（原图直出，上下两段）、鱼眼位移贴图 |
| `tools/build-art.mjs` | 把 `_refs` 原图压成 `assets/art/`（sharp，可 `--list` 预演） |
| `tools/build-deco.mjs` | 用浏览器真实渲染侧栏竖排装饰文字 → 亮度转 alpha → 透明 WebP；同时生成右侧栏标志 |
| `tools/build-emblem.mjs` | 纯几何生成 HUD 徽章（同心环 / 刻度环 / 准星 / 角括号），明暗两版 SVG |
| `tools/build-fisheye.mjs` | 生成背景鱼眼位移贴图（feDisplacementMap 的 R/G 通道径向位移场） |
| `tools/build-deco-assets.mjs` | 生成官网装饰线、左旋 90° 的条带纹理（按主题染色）；右下塔身不走这里，直接引用原图 `assets/art/tower-{top,bottom}.png` |
| `tools/fetch-refs.mjs` | 抓取官网参考素材到 `_refs/`（仅本机，不进仓库） |
| `tools/selftest.mjs` | 离线自检：假 ctx / req / res / DOM 跑通两个半区（33 项断言） |
| `tools/preview-proxy.mjs` | 皮肤预览代理：把皮肤套在正在运行的 GUI 上，不动用户实例 |
| `tools/check-scope.mjs` | 样式表质量闸门：作用域 / 远程 URL / 字体 / 锚点来源 / `!important` 统计 |
| `tools/a11y-audit.mjs` | 无障碍静态审计：12 组对比度配对 + 7 项能力检查 |
| `tools/snapshot.mjs` | 基线快照：随包文件 sha256 + 规模指标，`--check` 比对改动 |
| `tools/visual-check.mjs` | 视觉回归：明暗双主题截图 vs `design/shot-baseline/`（阈值 平均差<3、差异像素<2%） |
| `design/` | 设计 token（`tokens.json` / `tokens.md`，含来源证据） |
| `prototype/` | 静态原型（`index.html` 主界面 / `specimen.html` 组件规范） |
| `cordis.patch.yml` | 插件行插入清单（`dsh.bundle.patch` 指向它） |

## 自检与预览（不依赖已安装）

```sh
node tools/selftest.mjs               # 33 项离线断言：路由 / 首屏注入 / 路径逃逸 / 跨站拒绝 / 客户端投影
node tools/preview-proxy.mjs          # http://127.0.0.1:3099 预览皮肤（反代正在运行的 3080）
node tools/fetch-refs.mjs             # 抓官网参考素材
node tools/visual-check.mjs --capture # 明暗双主题截图 + 与视觉基线比对
node tools/a11y-audit.mjs             # 明暗双主题对比度审计
node tools/snapshot.mjs --check       # 与代码/资产基线比对
node tools/check-scope.mjs            # 样式表作用域 / 锚点来源 / !important 闸门
```

> 本机 PowerShell 的 HTTPS 不可用（schannel 拿不到凭据），抓取脚本改用 **Node 自带 TLS 栈**。

## 已实现

- **首屏防闪屏**：host 的 `tapIndex` 在每份送达的 `index.html` 上盖 `html[data-ef-hud="on"]` 并注入样式表与字体预加载，刷新即以皮肤启动。
- **零构建**：client 半区直接写成 DSH 客户端模块加载器要求的 `window.__ModuleLoader__.load({id, factory})` 形式，依赖只有平台提供的 `react`。
- **L1 token 重映射**：278 个官方 `--dsw-*` token 中覆盖背景 / 描边 / 文字 / 品牌 / 按钮 / 状态 / 代码 / 滚动条 / 组件级共 190+ 项。
- **与皮肤中心共存**：token 块用双重属性选择器（`0,2,1`）压过皮肤中心已激活皮肤（`0,1,1`）；设置卡会提示当前激活的其它皮肤。
- **实时开关**：关闭后立即恢复官方外观，装饰层与样式表一并卸载。
- **组件覆盖**：token 重映射 + `data-*` 锚点规则 + 类名兜底，覆盖三栏骨架、侧栏条目、输入区、会话流、工具/差异/终端/JSON 卡片、弹层菜单、表单按钮、排版代码表格、滚动条，以及任务看板 / SSH / Git 图谱 / 宠物 / 皮肤中心等插件区域。
- **锚点有据可查**：样式表用到的 `data-*` 锚点全部来自官方源码扫描或已安装插件核对（`tools/check-scope.mjs` 强制校验，防止臆造）。
- **面板背景挂在 slot 出口的直接子元素上**：`[data-slot="sidebar"]` / `[data-slot="details"]` 本身是 0×0 包装层，真正铺满栏位的是它的直接子元素（实测 280×900）。

### 动效

- **鼠标视差 + 倾斜**：单 rAF 循环 + 阻尼插值（0.08），强度 0–10 级；按深度系数位移并绕 X/Y 轴倾斜（上限 4°），带 `perspective(1200px)` 形成景深。深度：背景 1 / 网格条带 2 / 角标分隔 3 / 读数 4；**功能 UI 也跟随**（侧栏抽屉 1、右侧栏 1、会话头 2、输入卡 2）。
- **边缘效果**（只作用于**背景图片层**）：对 `.ef-hud-bg` 施加 `url(#fisheye) url(#rgb-split) blur(Npx)` 与径向遮罩渐隐；RGB 错位由内联 SVG 滤镜（通道分离 → feOffset → screen 合成）提供，偏移量与模糊半径随强度 0–3 缩放。**早期用 backdrop-filter 边带的版本会把真实 UI 一起模糊，已废弃。**
- **弹层自动冻结**：功能 UI 一旦挂载弹层（设置面板 / 菜单）就立刻清掉它身上的 transform——因为 transform 会让元素成为 `position: fixed` 后代的包含块，实测会把设置面板压成侧栏宽度（281px）。关闭弹层后自动恢复跟随。
- **转场**：弹层/菜单透明度淡入 + 会话切换时一次 260ms 扫描线掠过（掩盖内容硬切）。
- **降级**：`prefers-reduced-motion: reduce` 下视差不启动、边缘层与扫描线 `display: none`。

### 视觉强化

- **线性图标系统**：23 个内联 SVG symbol，24×24 网格 / 1.5px 描边 / 直角端点，全部走 `currentColor`；用于装饰层图标行与设置卡每行。
- **HUD 徽章**（`.ef-hud-emblem`）：纯几何生成（同心断环 + 36 格刻度环 + 菱形 + 准星 + 角括号 + 数据弧），明暗两版 SVG。**独立成层**、与背景同 z-index 且 DOM 在后——压在背景图上、真实内容之下，**但不参与背景的 blur / RGB 错位 / 边缘渐隐**，1px 描边才能保持锐利。
- **几何语言**：卡片右上切 10px（`clip-path`，不创建 fixed 包含块）；面板「厚度」= 内侧 1px 高光 + 外侧 2px 硬投影；按钮悬停/按下时左侧 3px 强调条。
- **数据微标**：右上角读数块实时显示 `SESSION / MSG / VP / MODEL / EFFORT / PERM / CLOCK`，位置跟随中栏右边缘（每秒刷新）。
- **网格与刻度**：左右两侧 32px 刻度尺（每 128px 长刻度 + 强调色）。
- **机械动效**：REC 指示 `steps(1)` 阶跃闪烁；会话切换扫描线用 `steps(6)` 六段跳变。
- **工业标识**：右下铭牌 2px 危险斜纹下划线；关键读数一律用 `[ ]` 括号包住。
- **侧栏功能按钮**：新建会话＝黄底黑字 + 左下切角 + 左侧竖条；功能入口＝左侧状态条 + 20×20 图标取景框 + 自动编号 01/02/03；分组标题＝Novecento 大写 + 黄方块；搜索框＝直角 + 底线；底部设置＝分隔线 + 悬停黄条。
- **会话行 / 工作区行 / 退出按钮**：会话行＝左侧状态条 + 当前态黄条 + 悬停右侧黄刻度；右下角退出按钮＝HUD 控件（直角 + 右上切角 + 半透明底，悬停反色为黄底黑字）。
- **无障碍**：`:focus-visible` 黄色焦点环、`accent-color`、`::placeholder`、`prefers-reduced-motion` 全关；样式表零 `!important`（仅 body 内联背景覆盖 2 处例外）。

## 踩坑修复记录

| 日期 | 问题 | 根因 | 修复 |
|---|---|---|---|
| 2026-09-09 | 输入区文字看不见（黑底黑字） | 输入区是三层结构（mirror 量高 / backdrop 画可见文字 / textarea 文字透明），皮肤给 `textarea` 上了不透明底色，把 backdrop 里的文字整片盖住 | 单行 `input` 才上表面色；composer 的 `textarea` 保持 `background: transparent`；`tools/check-scope.mjs` 增加护栏 |
| 2026-09-10 | 设置面板被压成 281px | 给功能 UI 加 transform 后它成了 `position: fixed` 后代的包含块 | 弹层出现时冻结 transform |
| 2026-09-10 | 点设置后弹层不置顶 | 为让侧栏条带层（`z-index:-1`）夹在底色与内容之间，给侧栏面板加了 `isolation: isolate`，面板变成层叠上下文，内部弹层被困住 | `:has([role="dialog"])` 时把 isolation 让开，纯 CSS 无延迟 |
| 2026-09-10 | 输入卡弹层上半截被裁 | 卡片切角用的 `clip-path` 会连子孙一起裁 | 弹层存在时（role=menu/dialog/listbox 或 `aria-expanded=true`）撤掉切角 |

## 里程碑

| 阶段 | 内容 | 状态 |
|---|---|---|
| **M0** | 抓参考 → token → 静态原型 | ✅ |
| **M1** | 插件骨架 + 静态换肤 + 设置卡 + 离线自检 | ✅ |
| **M2** | 组件覆盖精修：官方 `data-*` 锚点 + 插件区域 + 类名兜底 + 锚点闸门 | ✅ |
| **M3** | 明暗双主题 / 无障碍审计（双主题）/ 代码资产基线 / 视觉回归基线 | ✅ |
| **M4** | 视差 + 3D 倾斜 / 边缘柔化·模糊·渐隐·RGB 偏移 / 转场 / reduced-motion 降级 | ✅ |
| **M5** | 视觉强化（图标、几何、读数、刻度、机械动效、工业标识、侧栏与会话行） | ✅ |
