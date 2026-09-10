# 素材来源与合规说明

## 当前阶段（本机开发自用）

本仓库处于 M0 设计验证阶段，素材策略为**本机开发自用**，尚未对外分发：

| 类别 | 来源 | 现状 |
|---|---|---|
| 字体 | 《明日方舟：终末地》官网 `@font-face` 文件（Novecento Sans Wide、Gilroy、Protest Strike、Roboto、Space Grotesk） | 已下载到 `_refs/fonts/`（不进仓库）与 `assets/fonts/`（本地自用） |
| 图片 / 立绘 | 同上，官网 CDN | `_refs/img/` 只留构建实际要用的原图（8 张 / 2.1 MB，不进仓库，其余 132 张已清掉，可 `node tools/fetch-refs.mjs` 重抓）；压缩成品随插件发布在 `assets/art/` |
| `assets/art/logo-*.webp` | 鹰角官方《终末地》标志 | **版权素材**，仅本机自用 |
| `assets/art/sidebar-deco-*.webp` | 自研装饰文字（`tools/build-deco.mjs` 用浏览器渲染 HARNESS/DEEPSEEK 等字样） | 内容自研，但**渲染所用字体是商业字体** |
| 样式表 | 同上 | 仅在 `_refs/css/`，用于取色与版式研究 |
| GUI 布局参考 | 公开仓库 `zhu1090093659/dsh-web` 文档截图 | 仅在 `_refs/gui/` |

`_refs/` 与 `_shots/` 均已在 `.gitignore` 中排除。

## 发布前必须处理

1. **字体**：Novecento Sans Wide、Gilroy 为商业字体（Novecento 免费档明确不含 webfont），
   不可随开源仓库分发 → 需替换为 OFL / Apache 近似体（候选：Space Grotesk、Archivo、Rajdhani、
   Michroma、JetBrains Mono；Protest Strike 与 Roboto 本身即 OFL / Apache-2.0，可继续使用）。
2. **美术**：`assets/art/` 里的 KV、纹理、图标、`logo-*.webp` 均为鹰角版权作品（由 `tools/build-art.mjs`
   从官网素材压缩而来），**当前仅限本机自用**。开源发布前必须二选一：
   - 换成程序生成的等价物（同色板、同构图语言，但不是官方图）；或
   - 从包中移除 `assets/art/`，改为「用户本机自行运行 `tools/fetch-refs.mjs` + `tools/build-art.mjs`」
     在本地生成（产物落在忽略目录或本机资产目录）。
   仓库里保留本说明，发布者不得声称拥有这些美术素材的权利。
3. **商标**：不得使用官方 logo 作为插件图标；`终末地 / Endfield` 仅作风格描述，不得暗示官方关联。
4. 仓库根保留本文件，说明每项素材的许可状态。
