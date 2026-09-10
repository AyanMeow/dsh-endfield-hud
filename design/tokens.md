# 设计 token · 终末地 HUD（M0）

> 机器可读版本见 [`tokens.json`](tokens.json)。本文件说明**每个值从哪来、为什么这么定、怎么用**。
> 色值来自对终末地官网 official-v4 前端 CSS 的全量统计（9 个样式表 / 109,530 字符），
> 字体来自官网 `@font-face` 的实际文件，布局参数来自 DSH 官方 `columns.ts`。

## 1. 来源证据

| 项 | 来源 | 结论 |
|---|---|---|
| 主强调色 | 官网 CSS 频次统计 | `#FFFA00` 出现 22 次，是**高饱和柠檬黄**，不是工业琥珀黄 |
| 底色 | 同上 | `#191919` 出现 23 次为主面板底，`#141414 / #131315 / #1F1F22` 为层次色 |
| 信号色 | 同上 | 品红 `#FF1AAC`、薄荷绿 `#00FFA2`，用于状态而非装饰 |
| 展示字体 | 官网 `@font-face` | Novecento Sans Wide（Medium / DemiBold / Bold） |
| 正文字体 | 同上 | Gilroy（Light / Medium / ExtraBold） |
| 警示字体 | 同上 | Protest Strike Regular |
| 数据字体 | 同上 | Space Grotesk、Roboto（Regular / Black） |
| 布局 | DSH `ui-layout/src/client/columns.ts` | 侧栏 280（264–420，折叠 56）、详情 360（300–520）、中栏下限 640 |
| 动效 | DSH `ui-theme/src/styles/base.css` | 原生 `--ds-ease-in-out: cubic-bezier(.4,0,.2,1)`、`--ds-transition-duration: .2s`（fast .1s / slow .3s） |

## 2. 色彩

### 基底与线

| token | 值 | 用途 |
|---|---|---|
| `--ef-black-900` | `#0E0E0E` | 页面底（背景网格层） |
| `--ef-black-800` | `#131315` | 次级面板 / 侧栏渐变暗端 |
| `--ef-black-700` | `#191919` | **主面板底（官网主色）** |
| `--ef-black-600` | `#1F1F22` | 抬升面板 / 卡片 / 消息块 |
| `--ef-gray-500` | `#35373C` | 分隔线 / 描边 |
| `--ef-line-1/2/3` | `rgba(255,255,255,.10/.16/.28)` | 1px 描边三级 |

### 文字灰阶（对比度基于 `#191919`）

| token | 值 | 对比度 | 结论 |
|---|---|---|---|
| `--ef-white` | `#FFFFFF` | 17.4 | 标题 |
| `--ef-white-soft` | `#E6E6E6` | **14.09** | 正文（AA ✓） |
| `--ef-gray-100` | `#B2B2B2` | **8.29** | 次级正文（AA ✓） |
| `--ef-gray-200` | `#999999` | **6.17** | 微标 / 时间戳（AA ✓） |
| `--ef-gray-300` | `#666666` | 3.06 | **仅装饰**（图标、分隔），不承载正文 |

### 强调与信号

| token | 值 | 用途 | 纪律 |
|---|---|---|---|
| `--ef-accent` | `#FFFA00` | 选中、进度、关键数字、主按钮 | **单屏面积 < 5%**（M0 实测 1.02%） |
| `--ef-accent-hi` | `#FFFF21` | 悬停态 |
| `--ef-accent-lo` | `#E6DE01` | 按下态 / 次级黄 |
| `--ef-magenta` | `#FF1AAC` | 告警 / 错误 / 录制指示 |
| `--ef-mint` | `#00FFA2` | 在线 / 成功 / 新增 |

## 2b. 亮色主题（官方未加 `data-ds-dark-theme` 时）

终末地的亮色变体沿用同一套语言：暖白底 + 纯黑字 + 柠檬黄只作填充。

| token | 亮色值 | 暗色值 | 说明 |
|---|---|---|---|
| `--dsw-alias-bg-base` | `#EDEDEB` | `#0E0E0E` | 页面底 |
| `--dsw-alias-bg-layer-2` | `#FFFFFF` | `#191919` | 主面板 |
| `--dsw-alias-label-primary` | `#191919` | `#E6E6E6` | 正文（17.58 / 14.09） |
| `--dsw-alias-label-tertiary` | `#5F5F5F` | `#999999` | 三级文字（6.19 / 6.17） |
| `--dsw-alias-brand-primary` | `#FFE900` | `#FFFA00` | 填充色（配黑字） |
| `--dsw-alias-brand-text` | `#6B5E00` | `#FFFA00` | 文字用黄（亮底加深） |
| `--dsw-alias-state-success-primary` | `#00784A` | `#00FFA2` | 成功 |
| `--dsw-alias-state-error-primary` | `#C2006A` | `#FF1AAC` | 错误 |
| `--dsw-alias-markdown-code-block` | `#F5F5F3` | `#0B0B0B` | 代码块（跟随 shiki 亮/暗主题） |

主题键是官方 `body[data-ds-dark-theme]`（`ui-theme/boot-theme.ts`）；暗色块同时用
`:has(body[data-ds-dark-theme])` 与 `body[data-ds-dark-theme]` 两路覆盖，
前者让 `html` 自身也拿到暗色值，后者是 `:has` 不受支持时的兜底。
HUD 装饰层的线条颜色也随主题切换（亮色深线 / 暗色浅线）。

## 3. 悬浮深度 d0–d3

| 级别 | 表面 | 描边 | 阴影 | 视差 k | 用途 |
|---|---|---|---|---|---|
| d0 基底 | `#0E0E0E` + 32px 网格 | — | — | 0px | 页面底、背景网格 |
| d1 平面 | `#191919` | 1px `rgba(255,255,255,.10)` | — | 1px | 侧栏、详情列、主面板 |
| d2 悬浮 | `#1F1F22` | 1px `rgba(255,255,255,.16)` | `0 2px 12px rgba(0,0,0,.5)` | 3px | 卡片、消息块、工具调用 |
| d3 悬停 | `rgba(25,25,25,.94)` + `blur(12px)` | 1px `#FFFA00` | `0 12px 40px rgba(0,0,0,.65)` | 6px | 弹窗、浮层、下拉 |

视差系数是 M4 鼠标偏移的唯一来源：**层级决定 k，不临时调参**。

## 4. 排版

| 角色 | 字体 | 字号/行高 | 字距 | 大小写 |
|---|---|---|---|---|
| display-xl | Novecento Wide 700 | 28/32 | .02em | UPPER |
| display-l | Novecento Wide 600 | 18/22 | .06em | UPPER |
| section | Novecento Wide 600 | 13/16 | .14em | UPPER |
| body | Gilroy 500 | 14/22 | 0 | — |
| body-light | Gilroy 300 | 13/20 | .01em | — |
| data | Space Grotesk | 13/16 | .04em | `tabular-nums` |
| micro | Gilroy 500 | 10/12 | .16em | UPPER |
| alert | Protest Strike | 20/24 | .06em | UPPER |
| code | SF Mono / JetBrains Mono / Consolas | 12.5/20 | 0 | — |

中文一律回退系统黑体栈（`HarmonyOS Sans SC → PingFang SC → Microsoft YaHei`），官网本身也是这么做的。

## 5. 形状

- **圆角 0**：终末地基本直角。
- **对角切**：`clip-path` 切两个对角，8px（大件）/ 5px（小件）；描边用 `mask` 合成的 1px 环，切角处不断线。
- **L 形角标**：12×12，用于面板四角强调。
- **危险条纹**：45° / 6px 黄 + 6px 透明。
- **网格**：32px 间距，`rgba(255,255,255,.035)`。
- **扫描线**：1px / 4px 周期 / 3% 白（M0 静态，M4 才动）。

## 6. 动效 token

| token | 值 | 说明 |
|---|---|---|
| `--ef-dur-fast / dur / slow` | 100 / 200 / 300ms | 与 DSH 原生 `--ds-transition-duration*` 对齐 |
| `--ef-dur-hud` | 420ms | HUD 专属（转场、噪点刷新） |
| `--ef-ease` | `cubic-bezier(.4,0,.2,1)` | 与官方 `--ds-ease-in-out` 完全一致 |
| `--ef-ease-hud` | `cubic-bezier(.16,1,.3,1)` | HUD 弹性收束 |

## 6b. M4 动效参数

| 项 | 值 |
|---|---|
| 视差层与深度系数 | 装饰：`.ef-hud-bg` 1 · `.grid`/`.scan`/`.tape` 2 · `.corner`/`.divider` 3 · `.stamp`/`.glyphs` 4；功能 UI：侧栏 1 · 右侧栏 1 · 会话头 2 · 输入卡 2 |
| 视差幅度 | `0.75px × 深度 × 强度`（强度 0–5）→ 强度 5 时背景约 4px、读数约 15px |
| 倾斜 | `min(4°, cx × 深度 × 倾斜系数 × 强度)`，带 `perspective(1200px)`；背景层不倾斜（避免露边） |
| 阻尼插值 | `current += (target - current) × 0.08`，单 rAF 循环，静止后自动停机 |
| 边缘效果 | 四条边带 `backdrop-filter: url(#ef-hud-rgb-split) blur(k) saturate(1.08)` + mask 渐变；`k = 2px + 2px × 强度(0–3)`，边带宽 `26px + 16px × 强度` |
| RGB 偏移 | 内联 SVG：通道分离（feColorMatrix）→ R/B 各偏移 ±1.6px（feOffset）→ screen 合成（feBlend）→ 轻模糊（feGaussianBlur 0.5） |
| 转场 | 弹层/菜单 `ef-fade-in` 420ms；会话切换扫描线 `ef-sweep` 260ms |
| 降级 | `prefers-reduced-motion: reduce`：视差不启动、边缘层/扫描线 `display:none`；`backdrop-filter: url()` 不支持时退化为纯模糊 |

**为什么只动装饰层**：真实 UI 元素若逐帧位移，文字会反复重栅格化（发虚），且点击热区与视觉位置脱开；装饰层是 `pointer-events: none` 的纯视觉层，移动它零副作用。

## 7. 无障碍结论

- 正文 / 次级 / 微标全部 ≥ 4.5:1（实测 14.09 / 8.29 / 6.17）。
- `#666666` 降级为纯装饰色，不承载可读文字。
- 黄底黑字 18.93:1，主按钮可读性充足。
- `prefers-reduced-motion: reduce` 时全局关闭过渡与动画（原型已生效）。

## 8. M1+ 待定

- 与官方 `--dsw-*` token 的映射表（L1 覆盖清单）。
- 语义属性选择器清单（L2）：`data-dsh-surface` / `data-dsh-part` / `data-dsh-plugin`。
- 官方 hash 类兜底清单（L3）及其回归截图基线。
