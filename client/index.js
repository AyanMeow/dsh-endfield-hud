/**
 * Endfield HUD · browser half (module-loader closure factory)
 *
 * 不需要构建步骤：直接以 DSH 客户端模块加载器要求的
 * window.__ModuleLoader__.load({ id, factory }) 形式书写。
 * 依赖只有平台提供的 react。
 *
 * 职责：
 *   1. 实时开关皮肤（html[data-ef-hud] + 样式表）
 *   2. 注入 HUD 装饰层（网格 / 扫描线 / 角标 / 顶部危险条纹 / 读数），pointer-events: none
 *   3. 在「设置 → 终末地 HUD」注册设置卡，状态经 /api/endfield-hud/* 持久化
 */
window.__ModuleLoader__.load({
	id: "dsh-client-ui-endfield-hud",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const react = require("react");
		const h = react.createElement;

		const NS = "endfield-hud";
		const ASSET_PREFIX = "/plugins/endfield-hud/assets";
		const API = "/api/endfield-hud";
		const STYLE_ID = "ef-hud-plugin-css";
		const LINK_ID = "ef-hud-skin-css";
		const DECO_CLASS = "ef-hud-deco";

		const DEFAULTS = { enabled: true, opacity: 100, decorations: true, parallax: 1, edge: 1, bgOpacity: 100, fisheye: 0 };

		/* ---------- 本机设置覆盖层 ----------
		   parallax>5 / bgOpacity / fisheye 这三项是 host 半区没有的字段，
		   放在 localStorage 里可以立刻生效、刷新不丢，不需要重启 dsh web。
		   下一步（用户重启后）host 的 schema 也会接纳它们，届时两边一致。 */
		const LOCAL_KEY = "ef-hud.settings";
		function readLocal() {
			try {
				const raw = window.localStorage.getItem(LOCAL_KEY);
				if (raw === null) return {};
				const parsed = JSON.parse(raw);
				return parsed !== null && typeof parsed === "object" ? parsed : {};
			} catch { return {} }
		}
		function writeLocal(patch) {
			try {
				window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...readLocal(), ...patch }));
			} catch { /* 无 localStorage 时静默 */ }
		}

		/* ---------- S1 · 线性图标系统 ----------
		   24×24 网格、1.5px 描边、直角端点、切角母题；全部走 currentColor，
		   随主题与状态变色，内联 sprite 零额外请求。 */
		const NS_SVG = "http://www.w3.org/2000/svg";
		const ICON_PATHS = {
			power: '<path d="M12 3v8"/><path d="M7.2 6.4a7.5 7.5 0 1 0 9.6 0"/>',
			layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
			opacity: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 8h5M12 12h7M12 16h5"/>',
			parallax: '<path d="M4 12h5M15 12h5M12 4v5M12 15v5M9 9L4 12l5 3M15 9l5 3-5 3"/>',
			edge: '<path d="M3 6h18v12H3z"/><path d="M6 9h5M6 12h8M6 15h4"/>',
			info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
			send: '<path d="M3 12L21 3l-9 18-2-7-7-2z"/>',
			stop: '<path d="M7 7h10v10H7z"/>',
			model: '<path d="M7 7h10v10H7z"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
			effort: '<path d="M3 12h3l2-6 3 12 3-15 2 9h5"/>',
			shield: '<path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z"/>',
			clip: '<path d="M16 7l-7 7a3 3 0 0 0 4 4l7-7a5 5 0 0 0-7-7l-7 7a7 7 0 0 0 10 10l4-4"/>',
			quote: '<path d="M6 7h5v5H6z"/><path d="M6 12c0 3.5 2 5.5 5 5.5"/><path d="M13 7h5v5h-5z"/><path d="M13 12c0 3.5 2 5.5 5 5.5"/>',
			crosshair: '<circle cx="12" cy="12" r="9"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>',
			signal: '<path d="M4 20v-4M9 20v-8M14 20v-12M19 20v-16"/>',
			clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
			terminal: '<path d="M3 5h18v14H3z"/><path d="M7 10l2.5 2.5L7 15M13 15h4"/>',
			folder: '<path d="M3 6h6l2 2h10v10H3z"/>',
			git: '<path d="M7 6a2 2 0 1 0 0-.01M7 18a2 2 0 1 0 0-.01M17 12a2 2 0 1 0 0-.01M7 8v8M9 12h6"/>',
			gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3l1 3 3 1 3-1 1 3-2 2 2 2-1 3-3-1-3 1-1 3-1-3-3-1-3 1-1-3 2-2-2-2 1-3 3 1 3-1z"/>',
			pet: '<path d="M6 14a3 3 0 1 1 3-3M18 14a3 3 0 1 0-3-3M12 20c-4 0-6-2-6-5s3-5 6-5 6 2 6 5-2 5-6 5z"/>',
			lens: '<circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="3"/>',
			background: '<path d="M3 5h18v14H3z"/><path d="M3 15l5-5 4 4 3-3 6 6"/><circle cx="8.5" cy="9" r="1.5"/>',
		};
		const SPRITE_ID = "ef-hud-icon-sprite";
		function ensureSprite() {
			if (document.getElementById(SPRITE_ID) !== null) return;
			if (typeof document.createElementNS !== "function") return;
			const svg = document.createElementNS(NS_SVG, "svg");
			svg.setAttribute("id", SPRITE_ID);
			svg.setAttribute("aria-hidden", "true");
			svg.setAttribute("width", "0");
			svg.setAttribute("height", "0");
			svg.style.position = "absolute";
			let markup = "";
			for (const [name, body] of Object.entries(ICON_PATHS)) {
				markup += '<symbol id="ef-i-' + name + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
					+ 'stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">' + body + '</symbol>';
			}
			svg.innerHTML = markup;
			document.body.appendChild(svg);
		}
		/* ---------- 鱼眼透视：内联 SVG 位移滤镜 ---------- */
		const FISHEYE_ID = "ef-hud-fisheye";
		/** 滑杆 0–100 → feDisplacementMap scale 0–60。 */
		const FISHEYE_MAX_SCALE = 60;
		function ensureFisheyeFilter() {
			if (document.getElementById(FISHEYE_ID) !== null) return;
			if (typeof document.createElementNS !== "function") return;
			const svg = document.createElementNS(NS_SVG, "svg");
			svg.setAttribute("width", "0");
			svg.setAttribute("height", "0");
			svg.setAttribute("aria-hidden", "true");
			svg.style.position = "absolute";
			svg.style.pointerEvents = "none";
			svg.innerHTML = '<defs><filter id="' + FISHEYE_ID + '" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">'
				+ '<feImage href="' + ASSET_PREFIX + '/art/fisheye-map.png" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>'
				+ '<feDisplacementMap in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G"/>'
				+ '</filter></defs>';
			document.body.appendChild(svg);
		}
		function applyFisheye(value) {
			ensureFisheyeFilter();
			const prim = document.querySelector("#" + FISHEYE_ID + " feDisplacementMap");
			if (prim === null) return;
			const scale = Math.round((Math.max(0, Math.min(100, value)) / 100) * FISHEYE_MAX_SCALE);
			if (prim.getAttribute("scale") !== String(scale)) prim.setAttribute("scale", String(scale));
		}

		/** DOM 版图标（装饰层用）。 */
		function iconEl(name, size) {
			if (typeof document.createElementNS !== "function") return null;
			const svg = document.createElementNS(NS_SVG, "svg");
			svg.setAttribute("class", "ef-icon");
			svg.setAttribute("width", String(size || 16));
			svg.setAttribute("height", String(size || 16));
			svg.setAttribute("aria-hidden", "true");
			const use = document.createElementNS(NS_SVG, "use");
			use.setAttribute("href", "#ef-i-" + name);
			svg.appendChild(use);
			return svg;
		}
		/** React 版图标（设置卡用）。 */
		function Icon(props) {
			return h("svg", { className: "ef-icon", width: props.size || 16, height: props.size || 16, "aria-hidden": "true" },
				h("use", { href: "#ef-i-" + props.name }));
		}

		/* ---------- 状态（单一来源 + 订阅） ---------- */
		let state = { ...DEFAULTS };
		let transportError = null;
		const listeners = new Set();
		const subscribe = (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } };
		const snapshot = () => state;
		const errorSnapshot = () => transportError;
		function publish(next, error) {
			state = next;
			transportError = error === undefined ? null : error;
			for (const fn of listeners) fn();
		}

		async function fetchState() {
			const res = await fetch(API + "/state", { headers: { accept: "application/json" } });
			if (!res.ok) throw new Error("state " + res.status);
			return await res.json();
		}
		async function pushState(patch) {
			const res = await fetch(API + "/set", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(patch),
			});
			if (!res.ok) throw new Error("set " + res.status);
			return await res.json();
		}

		/* ---------- DOM 副作用 ---------- */
		function ensurePluginCss() {
			if (document.getElementById(STYLE_ID) !== null) return;
			const tag = document.createElement("style");
			tag.id = STYLE_ID;
			tag.textContent = [
				/* 全部走官方 token，随明暗主题自动切换（亮色/暗色各一套值） */
				".ef-hud-card{font-family:'Gilroy','HarmonyOS Sans SC','PingFang SC','Microsoft YaHei',sans-serif;color:var(--dsw-alias-label-primary)}",
				".ef-hud-card .ef-hd{display:flex;align-items:baseline;gap:10px;margin-bottom:4px}",
				".ef-hud-card .ef-t{font-family:'Novecento Wide','Gilroy',sans-serif;font-weight:600;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--dsw-alias-label-primary-foreground)}",
				".ef-hud-card .ef-sub{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
				".ef-hud-card .ef-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}",
				".ef-hud-card .ef-row:last-child{border-bottom:0}",
				".ef-hud-card .ef-lb{flex:1;min-width:0}",
				".ef-hud-card .ef-n{font-size:13px;color:var(--dsw-alias-label-primary)}",
				".ef-hud-card .ef-d{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
				".ef-hud-card .ef-sw{width:38px;height:18px;border:1px solid var(--dsw-alias-border-l2);position:relative;cursor:pointer;background:transparent;padding:0}",
				".ef-hud-card .ef-sw i{position:absolute;top:2px;left:2px;width:12px;height:12px;background:var(--dsw-alias-label-tertiary);display:block}",
				".ef-hud-card .ef-sw[data-on='true']{border-color:var(--dsw-alias-brand-text)}",
				".ef-hud-card .ef-sw[data-on='true'] i{left:22px;background:var(--dsw-alias-brand-text)}",
				".ef-hud-card .ef-sw:disabled{opacity:.45;cursor:not-allowed}",
				".ef-hud-card .ef-range{width:140px;height:4px;background:var(--dsw-alias-bg-multi-select);position:relative;flex:none}",
				".ef-hud-card .ef-range i{position:absolute;left:0;top:0;bottom:0;background:var(--dsw-alias-brand-text);display:block}",
				".ef-hud-card .ef-range b{position:absolute;top:-3px;width:8px;height:10px;background:var(--dsw-alias-brand-text);display:block}",
				".ef-hud-card .ef-val{font-family:'Space Grotesk EF',ui-monospace,Consolas,monospace;font-size:12px;color:var(--dsw-alias-label-primary);width:44px;text-align:right;flex:none}",
				".ef-hud-card .ef-tag{font-family:'Space Grotesk EF',ui-monospace,Consolas,monospace;font-size:10px;letter-spacing:.12em;color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l2);padding:1px 6px;flex:none}",
				".ef-hud-card .ef-note{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:10px;line-height:18px}",
				".ef-hud-card .ef-err{color:var(--dsw-alias-state-error-primary)}",
			].join("");
			document.head.appendChild(tag);
		}

		function ensureSkinLink() {
			if (document.getElementById(LINK_ID) !== null) return;
			const link = document.createElement("link");
			link.id = LINK_ID;
			link.rel = "stylesheet";
			link.href = ASSET_PREFIX + "/skin.css";
			document.head.appendChild(link);
		}
		function removeSkinLink() {
			const link = document.getElementById(LINK_ID);
			if (link !== null) link.remove();
		}

		/** 美术背景层：z-index:-1，落在页面底之上、内容之下（不受皮肤中心 body 内联样式影响）。 */
		function ensureBg() {
			if (document.querySelector(".ef-hud-bg") !== null) return;
			const bg = document.createElement("div");
			bg.className = "ef-hud-bg";
			bg.setAttribute("data-dsh-plugin", NS);
			bg.setAttribute("aria-hidden", "true");
			document.body.appendChild(bg);
		}
		function removeBg() {
			const bg = document.querySelector(".ef-hud-bg");
			if (bg !== null) bg.remove();
		}

		/** HUD 徽章独立层：与背景同 z-index、DOM 在后，因此压在背景之上；
		    关键点是它**不套背景的 blur / RGB / mask**，1px 描边才能保持锐利。 */
		function ensureEmblem() {
			if (document.querySelector(".ef-hud-emblem") !== null) return;
			const emblem = document.createElement("div");
			emblem.className = "ef-hud-emblem";
			emblem.setAttribute("data-dsh-plugin", NS);
			emblem.setAttribute("aria-hidden", "true");
			document.body.appendChild(emblem);
		}
		function removeEmblem() {
			const emblem = document.querySelector(".ef-hud-emblem");
			if (emblem !== null) emblem.remove();
		}

		/** 左下角装饰线：与背景同层（z-index:-1），因此永远不会盖住左侧抽屉栏。 */
		function ensureBl() {
			if (document.querySelector(".ef-hud-bl") !== null) return;
			const bl = document.createElement("div");
			bl.className = "ef-hud-bl";
			bl.setAttribute("data-dsh-plugin", NS);
			bl.setAttribute("aria-hidden", "true");
			document.body.appendChild(bl);
		}
		function removeBl() {
			const bl = document.querySelector(".ef-hud-bl");
			if (bl !== null) bl.remove();
		}

		/** 右下角立塔：同样放背景层（z-index:-1）。原来它在装饰层（z-index:40），
		    而卡片区 x 921–1165 正好压着中栏正文和输入卡，正文被盖住 —— 沉到内容之下。 */
		function ensureTower() {
			if (document.querySelector(".ef-hud-tower") !== null) return;
			const tower = document.createElement("div");
			tower.className = "ef-hud-tower";
			tower.setAttribute("data-dsh-plugin", NS);
			tower.setAttribute("aria-hidden", "true");
			document.body.appendChild(tower);
		}
		function removeTower() {
			const tower = document.querySelector(".ef-hud-tower");
			if (tower !== null) tower.remove();
		}

		/** 侧栏条带纹理：独立层，透明度只由 CSS 的 .ef-hud-side-tape { opacity } 控制。
		    挂成侧栏容器的第一个子元素 + z-index:-1，夹在「面板底色之上、内容之下」。 */
		/** 条带层几何：面板若带 transform（视差开启时就是），它自己就是包含块，用 0,0；
		    否则包含块是视口，用面板的视口坐标。 */
		function placeSideTape(tape, panel) {
			tape.style.width = panel.clientWidth + "px";
			tape.style.height = panel.clientHeight + "px";
			if (getComputedStyle(panel).transform !== "none") {
				tape.style.left = "0px";
				tape.style.top = "0px";
			} else {
				const rect = panel.getBoundingClientRect();
				tape.style.left = Math.round(rect.left) + "px";
				tape.style.top = Math.round(rect.top) + "px";
			}
		}
		function ensureSideTape() {
			const panel = document.querySelector('[data-slot="sidebar"] > *');
			if (panel === null || panel === undefined) return;
			const found = panel.querySelector(".ef-hud-side-tape");
			if (found !== null) { placeSideTape(found, panel); return; }
			const tape = document.createElement("div");
			tape.className = "ef-hud-side-tape";
			// 注意：不要打 data-dsh-plugin —— skin.css 中 [data-slot="sidebar"] [data-dsh-plugin]
			// 会把它当插件块设成 position:relative，条带会掉回文档流（已踩过）。
			tape.setAttribute("aria-hidden", "true");
			panel.insertBefore(tape, panel.firstChild);
			placeSideTape(tape, panel);
		}
		function removeSideTape() {
			for (const tape of document.querySelectorAll(".ef-hud-side-tape")) tape.remove();
		}
		let sideTapeTimer = 0;
		function startSideTape() {
			ensureSideTape();
			if (sideTapeTimer !== 0 || typeof window.setInterval !== "function") return;
			sideTapeTimer = window.setInterval(ensureSideTape, 1500);
		}
		function stopSideTape() {
			if (sideTapeTimer !== 0) { window.clearInterval(sideTapeTimer); sideTapeTimer = 0; }
			removeSideTape();
		}

		function ensureDeco() {
			if (document.querySelector("." + DECO_CLASS) !== null) return;
			const box = document.createElement("div");
			box.className = DECO_CLASS;
			box.setAttribute("data-dsh-plugin", NS);
			box.setAttribute("aria-hidden", "true");
			const stamp = document.createElement("div");
			stamp.className = "stamp";
			stamp.innerHTML = "SYS <b>0.98</b><br>ENDFIELD HUD<br>// TALOS-II";
			// 装饰件：底部条带、区块分隔、属性/职业/星标图标（全部官方素材，随主题换色）
			const tape = document.createElement("div");
			tape.className = "tape";
			const glyphs = document.createElement("div");
			glyphs.className = "glyphs";
			for (const name of ["crosshair", "signal", "model", "effort", "shield", "clock"]) {
				const glyph = iconEl(name, 14);
				if (glyph !== null) glyphs.append(glyph);
			}
			glyphs.append(Object.assign(document.createElement("span"), { textContent: "TALOS-II / AIC-04" }));
			box.append(
				Object.assign(document.createElement("div"), { className: "grid" }),
				Object.assign(document.createElement("div"), { className: "scan" }),
				Object.assign(document.createElement("div"), { className: "corner tl" }),
				Object.assign(document.createElement("div"), { className: "corner tr" }),
				Object.assign(document.createElement("div"), { className: "corner bl" }),
				Object.assign(document.createElement("div"), { className: "corner br" }),
				tape,
				glyphs,
				Object.assign(document.createElement("div"), { className: "ruler left" }),
				Object.assign(document.createElement("div"), { className: "ruler right" }),
				Object.assign(document.createElement("div"), { className: "deco-tape" }),
				Object.assign(document.createElement("div"), { className: "flash" }),
				stamp,
			);
			document.body.appendChild(box);
		}
		function removeDeco() {
			const box = document.querySelector("." + DECO_CLASS);
			if (box !== null) box.remove();
		}

		/** 把当前状态投影到 DOM（幂等）。 */
		function syncDom() {
			const root = document.documentElement;
			root.style.setProperty("--ef-panel-opacity", String(state.opacity / 100));
			root.style.setProperty("--ef-edge-k", String(state.edge ?? 0));
			root.style.setProperty("--ef-bg-opacity", String((state.bgOpacity ?? 100) / 100));
			applyFisheye(state.fisheye ?? 0);
			applyEdgeFx(state.edge ?? 0);
			if (state.enabled) {
				root.dataset.efHud = "on";
				ensureSprite();
				ensureSkinLink();
				ensureBg();
				ensureEmblem();
				ensureBl();
				ensureTower();
				startSideTape();
				if (state.decorations) ensureDeco(); else removeDeco();
				if (state.decorations) startReadouts(); else stopReadouts();
				if ((state.parallax ?? 0) > 0) { startParallax(); startFreezeWatch(); } else { stopParallax(); stopFreezeWatch(); }
				startTransitions();
			} else {
				delete root.dataset.efHud;
				removeSkinLink();
				removeBg();
				removeEmblem();
				removeBl();
				removeTower();
				stopSideTape();
				removeDeco();
				stopReadouts();
				stopParallax();
				stopFreezeWatch();
				stopTransitions();
			}
		}

		/* ---------- M4 动效 ---------- */

		/** 尊重系统「减少动效」偏好。 */
		function reducedMotion() {
			try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches } catch { return false }
		}

		/* 视差分层表：[选择器, 深度, 倾斜系数(度/深度×强度)]
		   深度沿用设计表 d0–d3：背景 1 / 网格条带 2 / 角标分隔 3 / 读数 4。
		   功能 UI（侧栏抽屉 / 右侧栏 / 会话头 / 输入卡）也参与跟随，深度压低到 1–2，
		   倾斜系数更小，保证文字仍然清晰、点击热区跟手。 */
		const PARALLAX_LAYERS = [
			// 装饰层
			[".ef-hud-bg", 1, 0],
			[".ef-hud-emblem", 1, 0],
			[".ef-hud-bl", 1, 0],
			[".ef-hud-deco .grid", 2, 0.20],
			[".ef-hud-deco .scan", 2, 0.20],
			[".ef-hud-deco .tape", 2, 0.16],
			[".ef-hud-deco .corner", 3, 0.26],
			[".ef-hud-tower", 1, 0],
			[".ef-hud-deco .stamp", 4, 0.34],
			[".ef-hud-deco .glyphs", 4, 0.34],
			// 功能 UI：跟随平移 + 轻微倾斜
			['[data-slot="sidebar"] > *', 1, 0.16],
			['[data-slot="details"] > *', 1, 0.16],
			['[data-slot="conversation.session.header"]', 2, 0.20],
			["[data-composer-card]", 2, 0.22],
		];
		/** 每 (深度 × 强度) 对应的像素幅度。 */
		const PARALLAX_AMPLITUDE = 0.75;
		/** 倾斜角度上限（度），避免大强度下画面翻掉。 */
		const TILT_MAX = 4;

		/* 功能 UI 里一旦挂载弹层（设置面板 / 菜单），就冻结该元素的变换：
		   transform 会让元素成为 position:fixed 后代的包含块，设置面板会因此
		   被压成侧栏宽度（实测 bug）。装饰层不受影响。 */
		const OVERLAY_SELECTOR = '[role="dialog"],[role="menu"],[data-state="open"]';
		const UI_LAYER_SELECTORS = PARALLAX_LAYERS.filter(([sel]) => sel.startsWith("[data-")).map(([sel]) => sel);
		function hasOverlayInside(node) {
			return node.querySelector(OVERLAY_SELECTOR) !== null;
		}
		function freezeUiLayers() {
			for (const selector of UI_LAYER_SELECTORS) {
				for (const node of document.querySelectorAll(selector)) {
					if (hasOverlayInside(node)) {
						if (node.style.transform !== "") node.style.transform = "";
					} else if (node.dataset.efHudFrozen === "1") {
						delete node.dataset.efHudFrozen;
					}
					if (hasOverlayInside(node)) node.dataset.efHudFrozen = "1";
				}
			}
		}
		let freezeCtl = null;
		function startFreezeWatch() {
			if (freezeCtl !== null) return;
			if (typeof window === "undefined" || typeof window.MutationObserver !== "function") return;
			const observer = new window.MutationObserver(() => freezeUiLayers());
			const roots = [];
			for (const selector of UI_LAYER_SELECTORS) {
				for (const node of document.querySelectorAll(selector)) {
					if (!roots.includes(node)) { roots.push(node); observer.observe(node, { childList: true, subtree: true }); }
				}
			}
			freezeCtl = () => observer.disconnect();
		}
		function stopFreezeWatch() {
			if (freezeCtl === null) return;
			freezeCtl();
			freezeCtl = null;
		}

		let parallaxCtl = null;
		function startParallax() {
			if (parallaxCtl !== null) return;
			if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;
			if (reducedMotion()) return;
			let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, running = false;
			const tick = () => {
				cx += (tx - cx) * 0.08;
				cy += (ty - cy) * 0.08;
				const strength = state.parallax ?? 0;
				for (const [selector, depth, tiltCoef] of PARALLAX_LAYERS) {
					const amp = depth * strength * PARALLAX_AMPLITUDE;
					const x = (cx * amp).toFixed(2);
					const y = (cy * amp).toFixed(2);
					// 倾斜：鼠标往右 → 绕 Y 轴正转；往上 → 绕 X 轴正转，形成俯仰景深
					const tiltY = Math.max(-TILT_MAX, Math.min(TILT_MAX, cx * depth * (tiltCoef ?? 0) * strength));
					const tiltX = Math.max(-TILT_MAX, Math.min(TILT_MAX, -cy * depth * (tiltCoef ?? 0) * strength));
					const transform = tiltY === 0 && tiltX === 0
						? "translate3d(" + x + "px," + y + "px,0)"
						: "perspective(1200px) translate3d(" + x + "px," + y + "px,0) rotateX(" + tiltX.toFixed(3) + "deg) rotateY(" + tiltY.toFixed(3) + "deg)";
					const isUiLayer = selector.startsWith("[data-");
					for (const node of document.querySelectorAll(selector)) {
						if (isUiLayer && hasOverlayInside(node)) {
							if (node.style.transform !== "") node.style.transform = "";
							continue;
						}
						node.style.transform = transform;
					}
				}
				if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) {
					raf = window.requestAnimationFrame(tick);
				} else {
					running = false;
				}
			};
			const onMove = (event) => {
				tx = (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
				ty = (event.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
				if (!running) { running = true; raf = window.requestAnimationFrame(tick); }
			};
			window.addEventListener("pointermove", onMove, { passive: true });
			parallaxCtl = () => {
				window.removeEventListener("pointermove", onMove);
				if (raf !== 0) window.cancelAnimationFrame(raf);
				for (const [selector] of PARALLAX_LAYERS) {
					for (const node of document.querySelectorAll(selector)) node.style.transform = "";
				}
				document.documentElement.style.removeProperty("--ef-parallax-on");
			};
		}
		function stopParallax() {
			if (parallaxCtl === null) return;
			parallaxCtl();
			parallaxCtl = null;
		}

		/* 边缘效果：四条边带做 backdrop-filter —— 柔化 + 模糊 + 渐变变淡 + RGB 偏移。
		   RGB 偏移由内联 SVG 滤镜（通道错位后 screen 合成）提供；浏览器不支持
		   backdrop-filter: url() 时自动退化成纯模糊，不影响其它效果。 */
		const EDGE_FILTER_ID = "ef-hud-rgb-split";
		function ensureEdgeFilter() {
			if (document.getElementById(EDGE_FILTER_ID) !== null) return;
			if (typeof document.createElementNS !== "function") return;
			const NS_SVG = "http://www.w3.org/2000/svg";
			const svg = document.createElementNS(NS_SVG, "svg");
			svg.setAttribute("width", "0");
			svg.setAttribute("height", "0");
			svg.setAttribute("aria-hidden", "true");
			svg.style.position = "absolute";
			svg.style.pointerEvents = "none";
			const defs = document.createElementNS(NS_SVG, "defs");
			const filter = document.createElementNS(NS_SVG, "filter");
			filter.setAttribute("id", EDGE_FILTER_ID);
			filter.setAttribute("x", "-5%");
			filter.setAttribute("y", "-5%");
			filter.setAttribute("width", "110%");
			filter.setAttribute("height", "110%");
			filter.setAttribute("color-interpolation-filters", "sRGB");
			filter.innerHTML =
				'<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="ch-r"/>'
				+ '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="ch-g"/>'
				+ '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="ch-b"/>'
				+ '<feOffset in="ch-r" dx="1.6" dy="0" result="off-r"/>'
				+ '<feOffset in="ch-b" dx="-1.6" dy="0" result="off-b"/>'
				+ '<feBlend in="off-r" in2="ch-g" mode="screen" result="rg"/>'
				+ '<feBlend in="rg" in2="off-b" mode="screen" result="rgb"/>'
				+ '<feGaussianBlur in="rgb" stdDeviation="0.5"/>';
			defs.appendChild(filter);
			svg.appendChild(defs);
			document.body.appendChild(svg);
		}
		/** 边缘效果：只作用于背景图片层（模糊 + RGB 错位 + 边缘渐隐）。 */
		function applyEdgeFx(strength) {
			const bg = document.querySelector(".ef-hud-bg");
			if (bg === null) return;
			const k = Math.max(0, Math.min(3, strength));
			if (k <= 0) {
				bg.style.filter = "url(#" + FISHEYE_ID + ")";
				bg.style.webkitMaskImage = "";
				bg.style.maskImage = "";
				return;
			}
			ensureEdgeFilter();
			const blur = (k * 2).toFixed(1);
			const offset = (k * 1.2).toFixed(2);
			bg.style.filter = "url(#" + FISHEYE_ID + ") url(#" + EDGE_FILTER_ID + ") blur(" + blur + "px)";
			const offsets = document.querySelectorAll("#" + EDGE_FILTER_ID + " feOffset");
			offsets.forEach((node, i) => node.setAttribute("dx", i === 0 ? offset : "-" + offset));
			// 边缘渐隐：径向遮罩，中心不透明、四周淡出
			const fade = Math.round(k * 7);
			const mask = "radial-gradient(130% 120% at 50% 50%, #000 " + (100 - fade) + "%, transparent 100%)";
			bg.style.webkitMaskImage = mask;
			bg.style.maskImage = mask;
		}

		/* ---------- S3 · 数据微标 / S6 · 工业标识 ----------
		   全部落在插件自己的装饰层里，不碰官方 DOM。 */
		function shortSessionId() {
			try {
				const raw = window.localStorage.getItem("dsh.sessions.current");
				if (raw === null) return "--------";
				const parsed = JSON.parse(raw);
				if (parsed !== null && typeof parsed === "object" && typeof parsed.sessionId === "string") {
					return parsed.sessionId.replace(/^session-/, "").slice(0, 8).toUpperCase();
				}
			} catch { /* 读不到就用占位 */ }
			return "--------";
		}
		function composerTexts() {
			const root = document.querySelector('[data-slot="conversation.composer"]');
			if (root === null || typeof root.querySelectorAll !== "function") return [];
			return [...root.querySelectorAll("button")]
				.map((b) => (b.innerText || "").replace(/\s+/g, " ").trim())
				.filter((t) => t.length > 0);
		}
		function readReadings() {
			const texts = composerTexts();
			const modelText = texts.find((t) => /v4|flash|pro|deepseek|gpt|claude|kimi|qwen/i.test(t)) || "—";
			const permText = texts.find((t) => /write|read|ask|danger|沙箱|权限/i.test(t)) || "—";
			const effort = /(low|medium|high|低|中|高)\b/i.exec(modelText);
			const model = modelText.split(/\s+/)[0].replace(/^deepseek-?/i, "").slice(0, 14).toUpperCase();
			return {
				session: shortSessionId(),
				msgs: document.querySelectorAll("[data-chat-flow-kind]").length,
				viewport: window.innerWidth + "×" + window.innerHeight,
				model,
				effort: effort === null ? "—" : effort[1].toUpperCase(),
				perm: permText.replace(/workspace[\s-]*/i, "WS-").replace(/\s+/g, "-").toUpperCase().slice(0, 14),
				clock: new Date().toTimeString().slice(0, 8),
			}
		}
		function ensureReadout() {
			if (document.querySelector(".ef-hud-deco .readout") !== null) return;
			const deco = document.querySelector("." + DECO_CLASS);
			if (deco === null) return;
			const box = document.createElement("div");
			box.className = "readout";
			box.setAttribute("aria-hidden", "true");
			box.innerHTML = '<div class="line rec"><i></i><b>REC</b><span class="sid">SESSION // --------</span></div>'
				+ '<div class="line">MSG <em class="msgs">[ 000 ]</em> · VP <em class="vp">[ — ]</em></div>'
				+ '<div class="line">MODEL <em class="model">[ — ]</em> · EFFORT <em class="effort">[ — ]</em></div>'
				+ '<div class="line">PERM <em class="perm">[ — ]</em> · <em class="clock">--:--:--</em></div>';
			deco.appendChild(box);
		}
		/** HUD 徽章跟随中栏水平中心（侧栏/右栏展开收起会挤压中栏）。 */
		function centerEmblem() {
			const emblem = document.querySelector(".ef-hud-emblem");
			const conv = document.querySelector('[data-slot="conversation"] > *');
			if (emblem === null || conv === null || conv === undefined) return;
			const rect = conv.getBoundingClientRect();
			if (rect.width <= 120) return;
			const size = window.innerHeight * 0.44;   // 与 CSS 的 background-size: auto 44vh 对齐
			const boxLeft = -10;                      // .ef-hud-emblem 用的是 inset:-10px
			const centerX = rect.left + rect.width / 2;
			emblem.style.backgroundPositionX = Math.round(centerX - boxLeft - size / 2) + "px";
		}
		let convObserver = null;
		/** 中栏尺寸一变就立刻重新居中（不然要等 1s 的读数刷新）。 */
		function trackEmblem(conv) {
			if (conv === null || conv === undefined) return;
			if (typeof window.ResizeObserver !== "function") return;
			if (convObserver !== null) convObserver.disconnect();
			convObserver = new window.ResizeObserver(() => centerEmblem());
			convObserver.observe(conv);
		}
		function stopEmblemTracking() {
			if (convObserver !== null) { convObserver.disconnect(); convObserver = null; }
		}

		let readoutTimer = 0;
		function updateReadouts() {
			const box = document.querySelector(".ef-hud-deco .readout");
			if (box === null || typeof box.querySelector !== "function") return;
			const r = readReadings();
			const set = (sel, text) => {
				const node = box.querySelector(sel);
				if (node !== null) node.textContent = text;
			};
			set(".sid", "SESSION // " + r.session);
			set(".msgs", "[ " + String(r.msgs).padStart(3, "0") + " ]");
			set(".vp", "[ " + r.viewport + " ]");
			set(".model", "[ " + r.model + " ]");
			set(".effort", "[ " + r.effort + " ]");
			set(".perm", "[ " + r.perm + " ]");
			set(".clock", r.clock);
			// 读数块贴住中栏右上角（中栏宽度随侧栏/右栏变化，所以每帧量一次）
			// [data-slot="conversation"] 本身是 0×0 的出口包装层，量它的直接子元素
			const conv = document.querySelector('[data-slot="conversation"] > *')
				?? document.querySelector('[data-slot="conversation"]');
			if (conv !== null) {
				const rect = conv.getBoundingClientRect();
				if (rect.width > 120) {
					box.style.left = "auto";
					box.style.right = Math.max(12, window.innerWidth - rect.right + 22) + "px";
					box.style.top = Math.round(rect.top + 62) + "px";
				}
			}
			centerEmblem();
			trackEmblem(conv);

			// 侧栏功能入口编号（01 / 02 / 03…），幂等且自愈
			const entries = [...document.querySelectorAll('[data-slot="sidebar"] button')]
				.filter((b) => typeof b.querySelector === "function" && b.querySelector('[class*="_entryIcon"]') !== null);
			entries.forEach((el, i) => {
				if (typeof el.querySelector !== "function" || el.querySelector(".ef-idx") !== null) return;
				const idx = document.createElement("i");
				idx.className = "ef-idx";
				idx.setAttribute("aria-hidden", "true");
				idx.textContent = String(i + 1).padStart(2, "0");
				el.appendChild(idx);
			});
			const glyphText = document.querySelector(".ef-hud-deco .glyphs span");
			if (glyphText !== null) glyphText.textContent = "TALOS-II // 04 · MSG " + String(r.msgs).padStart(3, "0");
		}
		function startReadouts() {
			if (readoutTimer !== 0) return;
			ensureReadout();
			updateReadouts();
			if (typeof window.setInterval !== "function") return;
			readoutTimer = window.setInterval(updateReadouts, 1000);
		}
		function stopReadouts() {
			if (readoutTimer !== 0) { window.clearInterval(readoutTimer); readoutTimer = 0; }
			stopEmblemTracking();
			const box = document.querySelector(".ef-hud-deco .readout");
			if (box !== null) box.remove();
		}

		/* 转场：会话切换时播一次扫描线掠过（真实卸载型弹窗无法拦截退场，
		   这里用视觉掩盖硬切，配合 CSS 的进场淡入）。 */
		function playFlash() {
			if (reducedMotion()) return;
			const flash = document.querySelector(".ef-hud-deco .flash");
			if (flash === null) return;
			flash.removeAttribute("data-play");
			void flash.offsetWidth;
			flash.setAttribute("data-play", "1");
		}
		let transitionCtl = null;
		function startTransitions() {
			if (transitionCtl !== null) return;
			if (typeof window === "undefined" || typeof window.MutationObserver !== "function") return;
			const header = document.querySelector('[data-slot="conversation.session.header"]');
			if (header === null) return;
			let last = header.textContent;
			const observer = new window.MutationObserver(() => {
				const now = header.textContent;
				if (now !== last) { last = now; playFlash(); }
			});
			observer.observe(header, { childList: true, subtree: true, characterData: true });
			transitionCtl = () => observer.disconnect();
		}
		function stopTransitions() {
			if (transitionCtl === null) return;
			transitionCtl();
			transitionCtl = null;
		}

		/* ---------- 设置卡 ---------- */
		function useStore(selector) {
			return react.useSyncExternalStore(subscribe, selector, selector);
		}

		function Row(props) {
			return h("div", { className: "ef-row" },
				props.icon === undefined ? null : h("span", { className: "ef-row-icon" }, h(Icon, { name: props.icon })),
				h("div", { className: "ef-lb" },
					h("div", { className: "ef-n" }, props.name),
					props.desc === undefined ? null : h("div", { className: "ef-d" }, props.desc),
				),
				props.children,
			);
		}

		function Switch(props) {
			return h("button", {
				type: "button",
				className: "ef-sw",
				role: "switch",
				"aria-checked": props.on ? "true" : "false",
				"aria-label": props.label,
				"data-on": props.on ? "true" : "false",
				disabled: props.disabled === true,
				onClick: () => { if (props.disabled !== true) props.onChange(!props.on) },
			}, h("i", null));
		}

		function Slider(props) {
			return h("input", {
				type: "range",
				className: "ef-range",
				min: props.min,
				max: props.max,
				step: 1,
				value: props.value,
				disabled: props.disabled === true,
				"aria-label": props.label,
				onChange: (event) => { props.onChange(Number(event.target.value)) },
				style: { width: 140, accentColor: "#FFFA00", height: 4 },
			});
		}

		/** 皮肤中心若激活了别的皮肤，两者会同时作用；给出可见提示。 */
		function foreignSkin() {
			const id = document.documentElement.dataset.dshSkin;
			return id !== undefined && id !== "" ? id : null;
		}

		function HudSettingsCard() {
			const s = useStore(snapshot);
			const err = useStore(errorSnapshot);
			const foreign = foreignSkin();
			const patch = (next) => {
				publish({ ...state, ...next });
				writeLocal(next);
				syncDom();
				pushState(next).then((result) => {
					if (result && result.ok === true) publish({ ...state, ...result, ...readLocal() });
					syncDom();
				}, (error) => { publish(state, String(error && error.message)); });
			};
			return h("div", { className: "ef-hud-card" },
				h("div", { className: "ef-hd" },
					h("span", { className: "ef-t" }, "终末地 HUD"),
					h("span", { className: "ef-sub" }, "Endfield HUD · M1"),
				),
				h(Row, { name: "启用终末地 HUD", desc: "关闭后立即恢复官方默认外观", icon: "power" },
					h(Switch, { on: s.enabled, label: "启用终末地 HUD", onChange: (v) => patch({ enabled: v }) }),
				),
				h(Row, { name: "HUD 装饰层", desc: "网格 / 扫描线 / 刻度尺 / 边缘读数", icon: "layers" },
					h(Switch, { on: s.decorations, label: "HUD 装饰层", disabled: !s.enabled, onChange: (v) => patch({ decorations: v }) }),
				),
				h(Row, { name: "面板不透明度", desc: "装饰层的透出强度", icon: "opacity" },
					h(Slider, { min: 0, max: 100, value: s.opacity, label: "面板不透明度", disabled: !s.enabled, onChange: (v) => patch({ opacity: v }) }),
					h("span", { className: "ef-val" }, s.opacity + "%"),
				),
				h(Row, { name: "视差强度", desc: "鼠标跟随位移 + 倾斜，0 = 关闭（上限 10 级）", icon: "parallax" },
					h(Slider, { min: 0, max: 10, value: s.parallax, label: "视差强度", disabled: !s.enabled, onChange: (v) => patch({ parallax: v }) }),
					h("span", { className: "ef-val" }, String(s.parallax)),
				),
				h(Row, { name: "背景不透明度", desc: "主视觉背景层的浓度，0 = 纯色底", icon: "background" },
					h(Slider, { min: 0, max: 100, value: s.bgOpacity, label: "背景不透明度", disabled: !s.enabled, onChange: (v) => patch({ bgOpacity: v }) }),
					h("span", { className: "ef-val" }, s.bgOpacity + "%"),
				),
				h(Row, { name: "鱼眼透视", desc: "背景径向畸变强度，0 = 关闭", icon: "lens" },
					h(Slider, { min: 0, max: 100, value: s.fisheye, label: "鱼眼透视", disabled: !s.enabled, onChange: (v) => patch({ fisheye: v }) }),
					h("span", { className: "ef-val" }, String(s.fisheye)),
				),
				h(Row, { name: "边缘效果", desc: "柔化 / 模糊 / 渐隐 / RGB 偏移，0 = 关闭", icon: "edge" },
					h(Slider, { min: 0, max: 3, value: s.edge, label: "边缘效果", disabled: !s.enabled, onChange: (v) => patch({ edge: v }) }),
					h("span", { className: "ef-val" }, String(s.edge)),
				),
				foreign === null ? null : h("div", { className: "ef-note" },
					h("span", { className: "ef-err" }, "皮肤中心当前激活的是「" + foreign + "」：两者同时开启时以终末地 HUD 为准，建议在皮肤中心切回「官方默认」。"),
				),
				h("div", { className: "ef-note" },
					err === null
						? "状态保存在 ~/.dsh/endfield-hud.json · 字体 Novecento Wide / Gilroy / Protest Strike"
						: h("span", { className: "ef-err" }, "状态同步失败：" + err),
				),
			);
		}

		/* ---------- 插件入口 ---------- */
		exports.inject = ["slots"];
		exports.apply = function apply(ctx) {
			ctx.effect(() => {
				ensurePluginCss();
				syncDom();
				let alive = true;
				fetchState().then((result) => {
					if (!alive || !result || result.ok !== true) return;
					publish({ ...DEFAULTS, ...result, ...readLocal() });
					syncDom();
				}, (error) => {
					if (!alive) return;
					publish(state, String(error && error.message));
				});
				return () => {
					alive = false;
					removeDeco();
					removeBg();
					removeEmblem();
					stopReadouts();
					stopParallax();
					stopFreezeWatch();
					stopTransitions();
					removeSkinLink();
					delete document.documentElement.dataset.efHud;
					const tag = document.getElementById(STYLE_ID);
					if (tag !== null) tag.remove();
				};
			}, "endfield-hud: dom sync");

			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: NS,
				order: 200,
				label: () => "终末地 HUD",
			}, HudSettingsCard));
		};

		return module.exports;
	}
});
