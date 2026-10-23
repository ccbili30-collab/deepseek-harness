/**
 * Noven map workspace, mounted inside the Fantasy Map Generator document.
 *
 * The map, the shell, the native editors and their overlays share one document
 * and one stacking context. The card frame only carries data: it posts load /
 * generate / edit requests and receives save payloads.
 */
(() => {
  "use strict";

  const embedded = window.parent !== window;
  const CSS_VERSION = "28";
  const STYLE_ID = "nv-shell-style";

  const LAYER_GROUPS = [
    { id: "geo", label: "地理", ids: [["texture", "纹理"], ["heightmap", "高度图"], ["lakes", "湖泊"], ["biomes", "生物群系"], ["cells", "网格单元"], ["grid", "网格"], ["coordinates", "坐标"], ["compass", "罗盘玫瑰"]] },
    { id: "terrain", label: "地形", ids: [["rivers", "河流"], ["relief", "地形起伏"]] },
    { id: "culture", label: "人文", ids: [["religions", "宗教"], ["cultures", "文化"], ["states", "国家"], ["provinces", "省份"], ["zones", "区域"], ["borders", "边界"], ["routes", "道路"]] },
    { id: "data", label: "数据", ids: [["temperature", "温度"], ["ice", "冰川"], ["goods", "商品"], ["markets", "市场"], ["trade", "贸易"], ["precipitation", "降水"], ["population", "人口"], ["emblems", "纹章"], ["burgIcons", "图标"]] },
    { id: "mark", label: "标注", ids: [["labels", "标签"], ["military", "军事"], ["markers", "标记"], ["journeys", "旅程"]] },
    { id: "frame", label: "画布", ids: [["rulers", "标尺"], ["scaleBar", "比例尺"], ["vignette", "暗角"]] }
  ];

  const PRESETS = [
    ["political", "政治地图"], ["cultural", "文化地图"], ["religions", "宗教地图"],
    ["provinces", "省份地图"], ["biomes", "生物群系地图"], ["heightmap", "高度图"],
    ["physical", "自然地图"], ["poi", "兴趣点"], ["goods", "商品地图"],
    ["trade", "贸易动画"], ["military", "军事地图"], ["emblems", "纹章"],
    ["landmass", "纯陆地"]
  ];

  const REBUILDS = [
    ["国家", "regenerateStates"], ["省份", "regenerateProvinces"], ["城市", "regenerateBurgs"],
    ["文化", "regenerateCultures"], ["宗教", "regenerateReligions"], ["河流", "regenerateRivers"],
    ["道路", "regenerateRoutes"], ["国家标签", "regenerateStateLabels"], ["地形起伏", "regenerateReliefIcons"],
    ["纹章", "regenerateEmblems"], ["标记", "regenerateMarkers"], ["区域", "regenerateZones"],
    ["军事", "regenerateMilitary"], ["人口", "regeneratePopulation"], ["商品", "regenerateGoods"],
    ["经济", "regenerateEconomy"], ["生产", "regenerateProduction"], ["市场", "regenerateMarkets"],
    ["冰川", "regenerateIce"]
  ];

  const BRUSH_LABELS = {
    brushRaise: "抬高",
    brushElevate: "渐高",
    brushLower: "降低",
    brushDepress: "渐低",
    brushAlign: "抹平",
    brushSmooth: "平滑",
    brushDisrupt: "扰动",
    brushFill: "填充",
    brushLine: "画线"
  };

  const BIOME_ZH = {
    "Marine": "海洋",
    "Tropical seasonal forest": "热带季雨林",
    "Savanna": "稀树草原",
    "Temperate deciduous forest": "温带落叶林",
    "Tropical rainforest": "热带雨林",
    "Temperate rainforest": "温带雨林",
    "Wetland": "湿地",
    "Grassland": "草原",
    "Taiga": "针叶林",
    "Hot desert": "热带沙漠",
    "Tundra": "冻原",
    "Glacier": "冰川",
    "Cold desert": "寒漠"
  };

  const state = {
    ready: false,
    booted: false,
    stage: "blank",
    dirty: false,
    saving: false,
    undoKey: "",
    draftKey: "",
    draftMeta: null,
    draftTimer: 0,
    toastTimer: 0,
    panel: null,
    baseView: "height",
    baseMode: "height",
    tool: "select",
    viewMode: "2d",
    selected: null,
    overlays: { states: false, cultures: false },
    brushLayer: "base",
    brushMode: "paint",
    brushSize: 34,
    brushPower: 5,
    heightMode: "raise",
    heightHistory: [],
    heightStroke: null,
    heightFrame: 0,
    heightEvent: null,
    targetState: 0,
    targetCulture: 0,
    targetBiome: 0,
    painting: false,
    painted: false,
    paintMoved: false,
    paintStart: null,
    paintDirty: false,
    paintTimer: 0,
    paintPending: { paint: new Set(), erase: new Set() },
    brushHistory: [],
    saveTimer: 0,
    card: null,
    confirmTimer: 0
  };

  let ui = null;

  function styleHref() {
    return `noven-shell.css?v=${CSS_VERSION}`;
  }

  function mountStyle() {
    if (document.getElementById(STYLE_ID) !== null) return;
    const link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = styleHref();
    document.head.appendChild(link);
  }

  /** Keep the shell stylesheet after any styles the app injects at boot. */
  function liftStyle() {
    const link = document.getElementById(STYLE_ID);
    if (link !== null && link !== document.head.lastElementChild) document.head.appendChild(link);
  }

  function shellMarkup() {
    const steps = `
      <div id="nv-steps" aria-label="创作阶段">
        <button type="button" data-stage="blank">海面</button><i></i>
        <button type="button" data-stage="terrain">地形</button><i></i>
        <button type="button" data-stage="world">人文</button>
      </div>`;

    const genFields = [
      ["nv-gen-states", "国家数量", "number", "20", "2", "80", "1"],
      ["nv-gen-provinces", "省份比例", "number", "0.5", "0", "1", "0.1"],
      ["nv-gen-cultures", "文化数量", "number", "8", "1", "40", "1"],
      ["nv-gen-religions", "宗教数量", "number", "6", "1", "30", "1"],
      ["nv-gen-burgs", "城市数量", "number", "120", "10", "800", "1"],
      ["nv-gen-seed", "种子", "text", "", "", "", ""]
    ].map(([id, label, type, value, min, max, step]) => `
      <label>${label}<input id="${id}" type="${type}" value="${value}"${min ? ` min="${min}"` : ""}${max ? ` max="${max}"` : ""}${step ? ` step="${step}"` : ""}${type === "text" ? ' placeholder="留空则随机"' : ""}></label>`).join("");

    return `
      <div id="nv-status" role="status">正在连接地图引擎…</div>
      <div id="nv-topbar">
        <span id="nv-space">海面</span>
        <div id="nv-views"></div>
        <button id="nv-fit" type="button" title="适应全图">适应</button>
        <div id="nv-zoomgroup">
          <button id="nv-zoom-out" type="button" title="缩小">−</button>
          <span id="nv-zoom-value">100%</span>
          <button id="nv-zoom-in" type="button" title="放大">＋</button>
        </div>
        <button id="nv-undo" type="button" title="撤销">撤销</button>
        <span id="nv-save">已保存</span>
        <button id="nv-menu-btn" class="nv-icon" type="button" aria-label="更多" title="更多">⋯</button>
      </div>
      <div id="nv-tools">
        <button type="button" data-tool="select" title="选择 (V)"><svg viewBox="0 0 20 20"><path d="M4 2.8 16 11l-5.2 1.3L8.4 18Z"/></svg></button>
        <button type="button" data-tool="pan" title="平移 (H / 空格拖)"><svg viewBox="0 0 20 20"><path d="M6.5 10V5.2a1.2 1.2 0 0 1 2.4 0V9m0-4.6a1.2 1.2 0 0 1 2.4 0V9m0-3.3a1.2 1.2 0 0 1 2.4 0V11m-7.2-1.5V7a1.2 1.2 0 0 0-2.4 0v4.4c0 3 2 5.4 5.2 5.4h1.2c2.6 0 4.2-1.6 4.2-4.2V9"/></svg></button>
        <button type="button" data-tool="zoom" title="缩放 (Z / 滚轮)"><svg viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.2"/><path d="m12.4 12.4 4.2 4.2M6.2 8.5h4.6M8.5 6.2v4.6"/></svg></button>
        <i></i>
        <button type="button" data-tool="terrain" title="地形笔 (T)"><svg viewBox="0 0 20 20"><path d="m2 16 5.2-8 3 4.2L13 8l5 8Z"/><path d="m8.4 5.5 1.8-2 1.4 2"/></svg></button>
        <button type="button" data-tool="geo" title="地理笔 (G)"><svg viewBox="0 0 20 20"><path d="M3 4h14v12H3zM3 8h14M3 12h14M7 4v12M13 4v12"/></svg></button>
        <button type="button" data-tool="states" title="国家笔 (S)"><svg viewBox="0 0 20 20"><path d="M5 18V3m0 1h9l-2 3 2 3H5"/></svg></button>
        <button type="button" data-tool="cultures" title="文化笔 (C)"><svg viewBox="0 0 20 20"><circle cx="6" cy="7" r="2.2"/><circle cx="14" cy="7" r="2.2"/><path d="M2.5 16c.4-2.6 1.8-4 3.5-4s3.1 1.4 3.5 4M10.5 16c.4-2.6 1.8-4 3.5-4s3.1 1.4 3.5 4"/></svg></button>
        <button type="button" data-tool="erase" title="擦除 (E)"><svg viewBox="0 0 20 20"><path d="m3 12 6.5-6.5 5 5L8 17H4Z"/><path d="m9.5 5.5 5 5M8 17h9"/></svg></button>
        <i></i>
        <button type="button" id="nv-tool-undo" title="撤销 (⌘Z)"><svg viewBox="0 0 20 20"><path d="M7 6H3v-4M3.2 6a7 7 0 1 1-.2 7"/></svg></button>
      </div>
      <aside id="nv-inspector">
        <header id="nv-inspector-bar">
          <strong id="nv-inspector-title">工具</strong>
          <div id="nv-inspector-buttons">
            <button id="nv-inspector-collapse" type="button" title="折叠">−</button>
            <button id="nv-inspector-close" type="button" title="关闭">×</button>
          </div>
        </header>
        <div id="nv-inspector-body">
          <div id="nv-inspector-tool"></div>
          <div id="nv-inspector-selection" hidden></div>
        </div>
      </aside>
      <button id="nv-inspector-open" type="button" hidden>属性</button>
      <aside id="nv-panel" hidden>
        <header id="nv-panel-head">
          <strong id="nv-panel-title"></strong>
          <button id="nv-panel-close" type="button" aria-label="收起" title="收起">×</button>
        </header>
        <div id="nv-panel-body"></div>
      </aside>
      <aside id="nv-card" hidden>
        <header id="nv-card-head">
          <span id="nv-card-kind"></span>
          <button id="nv-card-close" type="button" aria-label="关闭" title="关闭">×</button>
        </header>
        <strong id="nv-card-name"></strong>
        <div id="nv-card-facts"></div>
        <label id="nv-card-field">名称<input id="nv-card-input" type="text" autocomplete="off" spellcheck="false"></label>
        <p id="nv-card-hint"></p>
      </aside>
      <div id="nv-brush" hidden>
        <div id="nv-brush-tabs"></div>
        <div id="nv-brush-body"></div>
      </div>
      <div id="nv-menu" hidden>
        <button type="button" data-menu="ai">改动记录</button>
        <button type="button" data-menu="settings">地图设置</button>
        <hr>
        <button type="button" data-menu="fullscreen">全屏</button>
        <hr>
        <button type="button" data-menu="blank" class="danger">重开海面</button>
      </div>
      <div id="nv-cmdbar"><span>&gt;</span><input id="nv-cmd" type="text" autocomplete="off" spellcheck="false" placeholder="命令：view render / fill geo Grassland / zoom fit"></div>
      <div id="nv-stagebar">
        ${steps}
        <div id="nv-stage-info">
          <strong id="nv-stage-name">海面</strong>
          <span id="nv-stage-counts">底层 · 高度视图</span>
        </div>
        <button id="nv-brush-btn" type="button" hidden>画笔</button>
        <button id="nv-secondary" type="button" hidden>生成人文层…</button>
        <button id="nv-primary" type="button" hidden>定稿地形 →</button>
      </div>
      <div id="nv-gen" hidden>
        <section id="nv-gen-card" role="dialog" aria-modal="true" aria-labelledby="nv-gen-title">
          <header id="nv-gen-head">
            <strong id="nv-gen-title">生成人文层（可选）</strong>
            <button id="nv-gen-close" type="button" aria-label="关闭" title="关闭">×</button>
          </header>
          <div id="nv-gen-body">
            <div class="nv-gen-grid">${genFields}</div>
            <p class="nv-gen-note">人文层是可选的。不生成就保留纯地形；也可以稍后从「⋯ → 生成 / 重建」进入，或回卡内对话让 AI 生成。生成会保留已定稿的海岸、河流与地形；名称留空，之后由你或 AI 命名。</p>
            <details class="nv-rebuild">
              <summary>重建单项</summary>
              <div class="nv-rebuild-grid" id="nv-rebuild"></div>
            </details>
          </div>
          <footer id="nv-gen-foot">
            <button id="nv-gen-cancel" type="button">取消</button>
            <button id="nv-gen-run" class="primary" type="button">生成人文层</button>
          </footer>
        </section>
      </div>
      <div id="nv-boot">
        <div class="nv-boot-card">
          <strong id="nv-boot-title">正在准备地图…</strong>
          <span id="nv-boot-text">正在连接地图引擎。</span>
          <button id="nv-boot-action" type="button" hidden>重开海面</button>
        </div>
      </div>
      <div id="nv-toast" hidden></div>`;
  }

  function mount() {
    const root = document.createElement("div");
    root.id = "nv-root";
    root.innerHTML = shellMarkup();
    document.body.appendChild(root);

    ui = {
      root,
      status: byId("nv-status"),
      space: byId("nv-space"),
      views: byId("nv-views"),
      fit: byId("nv-fit"),
      zoomIn: byId("nv-zoom-in"),
      zoomOut: byId("nv-zoom-out"),
      zoomValue: byId("nv-zoom-value"),
      undo: byId("nv-undo"),
      save: byId("nv-save"),
      tools: byId("nv-tools"),
      toolUndo: byId("nv-tool-undo"),
      inspector: byId("nv-inspector"),
      inspectorBar: byId("nv-inspector-bar"),
      inspectorTitle: byId("nv-inspector-title"),
      inspectorBody: byId("nv-inspector-body"),
      inspectorCollapse: byId("nv-inspector-collapse"),
      inspectorClose: byId("nv-inspector-close"),
      inspectorOpen: byId("nv-inspector-open"),
      inspectorTool: byId("nv-inspector-tool"),
      inspectorSelection: byId("nv-inspector-selection"),
      cmd: byId("nv-cmd"),
      menuBtn: byId("nv-menu-btn"),
      panel: byId("nv-panel"),
      panelTitle: byId("nv-panel-title"),
      panelBody: byId("nv-panel-body"),
      panelClose: byId("nv-panel-close"),
      card: byId("nv-card"),
      cardKind: byId("nv-card-kind"),
      cardName: byId("nv-card-name"),
      cardFacts: byId("nv-card-facts"),
      cardInput: byId("nv-card-input"),
      cardHint: byId("nv-card-hint"),
      cardClose: byId("nv-card-close"),
      brush: byId("nv-brush"),
      brushTabs: byId("nv-brush-tabs"),
      brushBody: byId("nv-brush-body"),
      menu: byId("nv-menu"),
      stagebar: byId("nv-stagebar"),
      steps: [...root.querySelectorAll("#nv-steps button")],
      stageName: byId("nv-stage-name"),
      stageCounts: byId("nv-stage-counts"),
      brushBtn: byId("nv-brush-btn"),
      secondary: byId("nv-secondary"),
      primary: byId("nv-primary"),
      gen: byId("nv-gen"),
      genRun: byId("nv-gen-run"),
      genCancel: byId("nv-gen-cancel"),
      genClose: byId("nv-gen-close"),
      rebuild: byId("nv-rebuild"),
      boot: byId("nv-boot"),
      bootTitle: byId("nv-boot-title"),
      bootText: byId("nv-boot-text"),
      bootAction: byId("nv-boot-action"),
      toast: byId("nv-toast")
    };

    for (const [label, id] of REBUILDS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => {
        closeGeneration();
        closePanel();
        const target = document.getElementById(id);
        if (target === null) {
          toast(`没有找到「${label}」的重建入口`);
          return;
        }
        target.click();
        window.setTimeout(() => {
          clearGeneratedNames();
          state.dirty = true;
          updatePrimary();
          updateCounts();
          refreshAi();
          toast(`${label}已重建 · 名称留空`);
        }, 220);
      });
      ui.rebuild.appendChild(button);
    }

    bindShell();
    bindMapEvents();
    bindCardMessages();
    bindTooltipFade();
    startBootWatch();
    setStage("blank", { initial: true });
    updateBootCopy("正在准备地图…", "正在连接地图引擎。");
  }

  function bindShell() {
    ui.cardClose.addEventListener("click", closeCard);
    ui.tools.addEventListener("click", event => {
      const button = event.target.closest("button[data-tool]");
      if (button === null) return;
      void setTool(button.dataset.tool);
    });
    ui.toolUndo.addEventListener("click", undoCurrent);
    ui.undo.addEventListener("click", undoCurrent);
    ui.fit.addEventListener("click", fitAll);
    ui.zoomIn.addEventListener("click", () => zoomBy(1.35));
    ui.zoomOut.addEventListener("click", () => zoomBy(1 / 1.35));
    ui.cmd.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const command = ui.cmd.value;
      ui.cmd.value = "";
      runCommand(command);
    });
    ui.inspectorCollapse.addEventListener("click", () => {
      state.inspectorCollapsed = !state.inspectorCollapsed;
      renderInspector();
    });
    ui.inspectorClose.addEventListener("click", () => {
      state.inspectorClosed = true;
      renderInspector();
    });
    ui.inspectorOpen.addEventListener("click", () => {
      state.inspectorClosed = false;
      state.inspectorCollapsed = false;
      renderInspector();
    });
    let inspectorDrag = null;
    ui.inspectorBar.addEventListener("pointerdown", event => {
      if (event.target instanceof Element && event.target.closest("button") !== null) return;
      const rect = ui.inspector.getBoundingClientRect();
      ui.inspector.style.setProperty("left", `${rect.left}px`, "important");
      ui.inspector.style.setProperty("top", `${rect.top}px`, "important");
      ui.inspector.style.setProperty("right", "auto", "important");
      ui.inspector.style.setProperty("bottom", "auto", "important");
      inspectorDrag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      ui.inspector.classList.add("dragging");
      event.preventDefault();
    });
    document.addEventListener("pointermove", event => {
      if (inspectorDrag === null) return;
      const left = Math.max(0, Math.min(window.innerWidth - 80, event.clientX - inspectorDrag.dx));
      const top = Math.max(44, Math.min(window.innerHeight - 60, event.clientY - inspectorDrag.dy));
      ui.inspector.style.setProperty("left", `${left}px`, "important");
      ui.inspector.style.setProperty("top", `${top}px`, "important");
    });
    document.addEventListener("pointerup", () => {
      if (inspectorDrag === null) return;
      inspectorDrag = null;
      ui.inspector.classList.remove("dragging");
    });
    ui.menuBtn.addEventListener("click", event => {
      event.stopPropagation();
      closePanel();
      closeSettings();
      ui.menu.hidden = !ui.menu.hidden;
    });
    ui.panelClose.addEventListener("click", closePanel);
    ui.brushBtn.addEventListener("click", openBrush);
    ui.secondary.addEventListener("click", () => { if (state.stage === "terrain") openGeneration(); });
    ui.primary.addEventListener("click", primaryAction);
    ui.genRun.addEventListener("click", () => void runGeneration());
    ui.genCancel.addEventListener("click", closeGeneration);
    ui.genClose.addEventListener("click", closeGeneration);
    ui.gen.addEventListener("click", event => {
      if (event.target === ui.gen) closeGeneration();
    });
    ui.bootAction.addEventListener("click", () => void startBlank({ fresh: true }));

    ui.menu.addEventListener("click", event => {
      const button = event.target.closest("button[data-menu]");
      if (button === null) return;
      const action = button.dataset.menu;
      if (action === "blank" || action === "random") {
        armConfirm(button, action);
        return;
      }
      ui.menu.hidden = true;
      runMenuAction(action);
    });

    document.addEventListener("click", event => {
      if (ui.menu.hidden) return;
      if (ui.menu.contains(event.target) || ui.menuBtn.contains(event.target)) return;
      ui.menu.hidden = true;
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        if (!ui.gen.hidden) {
          closeGeneration();
          return;
        }
        if (!ui.menu.hidden) {
          ui.menu.hidden = true;
          return;
        }
        if (state.card !== null) {
          closeCard();
          return;
        }
        if (state.selected !== null) {
          state.selected = null;
          renderInspector();
          updateStatus();
          return;
        }
        if (!ui.panel.hidden) {
          closePanel();
          return;
        }
        if (document.body.classList.contains("nv-options-open")) {
          closeSettings();
          return;
        }
      }
      if ((event.key === "b" || event.key === "B") && !isTyping(event.target) && state.stage === "blank") {
        openBrush();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !isTyping(event.target) && (isPaintBrush() || isHeightBrush())) {
        event.preventDefault();
        event.stopPropagation();
        if (isHeightBrush()) undoHeight();
        else undoBrush();
      }
    });

    window.addEventListener("resize", () => {
      window.setTimeout(fitToWindow, 80);
    });

    const optionsHide = document.getElementById("optionsHide");
    optionsHide?.addEventListener("click", () => {
      document.body.classList.remove("nv-options-open");
    });

    new MutationObserver(() => {
      enhanceBrushDialog();
      dismissUpstreamPrompts();
      syncEditorContext();
      window.setTimeout(translateNativeValues, 150);
      window.setTimeout(translateNativeValues, 600);
    }).observe(document.getElementById("dialogs") ?? document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    });
    window.setTimeout(dismissUpstreamPrompts, 800);
    window.setTimeout(dismissUpstreamPrompts, 2500);
  }

  /** A native editor owns the screen while it is open; the shell returns after
      it closes. The brush dialog is a tool, not an editor context. */
  function syncEditorContext() {
    const dialogs = [...document.querySelectorAll("#dialogs .ui-dialog")];
    const hasEditor = dialogs.some(dialog => {
      if (dialog.querySelector("#brushesPanel") !== null) return false;
      const style = window.getComputedStyle(dialog);
      return style.display !== "none" && style.visibility !== "hidden" && dialog.offsetParent !== null;
    });
    document.body.classList.toggle("nv-editor-open", hasEditor);
  }

  /** Read-only native fields display raw boolean values; show Chinese without
      changing the control's stored value for engines that read it back. */
  function translateNativeValues() {
    const outlet = document.getElementById("lakeOutlet");
    if (outlet !== null) {
      if (outlet.value === "no") outlet.value = "否";
      else if (outlet.value === "yes") outlet.value = "是";
    }
    const subtype = document.getElementById("lakeSubtype");
    if (subtype !== null && subtype.dataset.nvBound !== "true") {
      subtype.dataset.nvBound = "true";
      subtype.addEventListener("change", () => window.setTimeout(translateNativeValues, 120));
    }
  }

  /** The vendored build greets first-time users with a release-notes modal.
      It is not part of the workspace; dismiss it once, never touch user dialogs. */
  function dismissUpstreamPrompts() {
    const dialog = [...document.querySelectorAll("#dialogs .ui-dialog")].find(item => {
      const title = (item.querySelector(".ui-dialog-title")?.textContent ?? "").toLowerCase();
      if (title.includes("update") || title.includes("更新")) return true;
      return [...item.querySelectorAll(".ui-dialog-buttonpane button")]
        .some(button => /show again|不再显示/i.test(button.textContent ?? ""));
    });
    if (dialog === undefined) return;
    const buttons = dialog.querySelectorAll(".ui-dialog-buttonpane button");
    const dismiss = buttons[buttons.length - 1];
    if (dismiss !== undefined) dismiss.click();
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function isTyping(target) {
    return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
  }

  // ---------- boot ----------

  function startBootWatch() {
    const start = Date.now();
    const tick = () => {
      if (window.novenMap && window.novenMapReady === true) {
        onBridgeReady();
        return;
      }
      if (Date.now() - start > 15000) {
        updateBootCopy("地图引擎没有启动", "刷新卡片或重新打开地图模块。");
        ui.bootAction.hidden = embedded;
        return;
      }
      window.setTimeout(tick, 100);
    };
    tick();
  }

  function onBridgeReady() {
    if (state.ready) return;
    state.ready = true;
    window.novenHostReady = true;
    liftStyle();
    status(embedded ? "已连接" : "预览模式");
    post("noven-map-ready");
    if (!embedded) {
      void startBlank({ fresh: true });
      return;
    }
    updateBootCopy("正在等待卡片数据…", "卡片连接后会载入地图或海面。");
    window.setTimeout(() => {
      if (state.booted) return;
      updateBootCopy("地图数据还没送达", "可以刷新卡片，或重新打开地图模块。");
      ui.bootAction.hidden = true;
    }, 8000);
    window.setTimeout(() => {
      if (!state.booted) hideBoot();
    }, 12000);
  }

  function updateBootCopy(title, text) {
    if (ui === null) return;
    ui.bootTitle.textContent = title;
    ui.bootText.textContent = text;
  }

  function hideBoot() {
    if (ui === null) return;
    state.booted = true;
    ui.boot.hidden = true;
  }

  function hideNativeLoading() {
    const loading = document.getElementById("loading");
    if (loading !== null) loading.style.display = "none";
    window.Layers?.hide?.("ice", "scaleBar");
  }

  /** Upstream posts English tips such as "Map is successfully loaded"; the
      shell status line already says the same thing in Chinese. */
  function clearNativeTip() {
    try { window.clearMainTip?.(); } catch { /* the tip element is optional */ }
  }

  /** The app remembers a viewport from earlier sessions. The workspace owns the
      window, so fit to the current viewport instead of a stored card size. */
  function fitToWindow() {
    try {
      if (window.options?.app) window.options.app.viewport = null;
    } catch (error) {
      console.warn("Noven viewport reset failed", error);
    }
    // The app computes the cover scale from its viewport; fit() sets that
    // viewport before resetting zoom. Dispatching resize here would re-enter
    // the window resize handler and loop.
    try {
      window.novenMap?.fit?.();
    } catch (error) {
      console.warn("Noven map fit failed", error);
    }
    fitAll();
  }

  function currentScale() {
    const transform = document.getElementById("viewbox")?.getAttribute("transform") ?? "";
    const match = /scale\(([^)]+)\)/.exec(transform);
    return match === null ? 1 : Number(match[1]) || 1;
  }

  function fitScale() {
    const graph = window.options?.map?.graph;
    if (!graph?.width || !graph?.height) return 1;
    return Math.min(window.innerWidth / graph.width, window.innerHeight / graph.height) * 0.84;
  }

  function updateZoomLabel() {
    if (ui === null) return;
    const base = fitScale();
    const percent = base > 0 ? Math.round((currentScale() / base) * 100) : 100;
    ui.zoomValue.textContent = `${percent}%`;
  }

  function fitAll() {
    const graph = window.options?.map?.graph;
    if (!graph?.width || !graph?.height) return;
    try {
      window.setZoomExtent?.(fitScale() * 0.85, fitScale() * 14);
      window.zoomTo?.(graph.width / 2, graph.height / 2, fitScale(), 0);
    } catch (error) {
      console.warn("Noven fit failed", error);
    }
    window.setTimeout(updateZoomLabel, 80);
  }

  function zoomBy(factor) {
    const next = currentScale() * factor;
    try {
      window.setMapZoom?.(next);
    } catch (error) {
      console.warn("Noven zoom failed", error);
    }
    window.setTimeout(updateZoomLabel, 80);
  }

  // ---------- map stage ----------

  function setStage(stage, options = {}) {
    state.stage = stage;
    if (ui === null) return;
    for (const button of ui.steps) {
      const value = button.dataset.stage;
      button.classList.toggle("active", value === stage);
      button.classList.toggle("done", stageOrder(value) < stageOrder(stage));
    }
    closeCard();
    if (stage === "blank") {
      state.baseView = "height";
      state.baseMode = "height";
      state.overlays = { states: false, cultures: false };
      state.brushLayer = "base";
      state.tool = "terrain";
      state.targetState = 0;
      state.targetCulture = 0;
      state.selected = null;
      closePanel();
    } else if (state.tool === "terrain") {
      closeTerrainBrush();
      state.tool = "select";
    }
    ensureLayers();
    renderViews();
    applyViews();
    if (state.stage === "blank") showHeightView();
    renderInspector();
    updateStatus();
    updatePrimary();
    window.setTimeout(updateZoomLabel, 120);
    if (!options.initial) closeSettings();
  }

  function stageOrder(stage) {
    return stage === "world" ? 2 : stage === "terrain" ? 1 : 0;
  }

  function readCounts() {
    const pack = window.pack;
    const live = list => (Array.isArray(list) ? list : []).filter(item => item && item.i !== 0 && !item.removed).length;
    return {
      states: live(pack?.states),
      provinces: live(pack?.provinces),
      zones: live(pack?.zones),
      cultures: live(pack?.cultures),
      religions: live(pack?.religions),
      burgs: live(pack?.burgs),
      markets: live(pack?.markets),
      goods: live(pack?.goods),
      routes: live(pack?.routes),
      markers: live(pack?.markers),
      rivers: live(pack?.rivers),
      features: live(pack?.features),
      biomes: (pack?.biomes ?? []).filter(biome => biome && biome.i).length,
      lakes: (pack?.features ?? []).filter(feature => feature && feature.type === "lake").length,
      labels: 0
    };
  }

  function landCells() {
    const heights = window.grid?.cells?.h;
    if (!heights || typeof heights.length !== "number") return 0;
    let count = 0;
    for (const height of heights) if (height >= 20) count += 1;
    return count;
  }

  function updateCounts() {
    updateStatus();
  }

  function updatePrimary() {
    if (ui === null) return;
    ui.primary.hidden = true;
    ui.secondary.hidden = true;
  }

  function primaryAction() {
    if (state.stage === "blank") void finalizeTerrain();
    else if (state.stage === "terrain") { if (embedded) void saveToCard("terrain"); }
    else void saveToCard("world");
  }

  function status(text, error = false) {
    if (ui === null) return;
    ui.status.textContent = text;
    if (error) ui.status.setAttribute("data-error", "");
    else ui.status.removeAttribute("data-error");
  }

  function toast(text) {
    if (ui === null) return;
    window.clearTimeout(state.toastTimer);
    ui.toast.textContent = text;
    ui.toast.hidden = false;
    state.toastTimer = window.setTimeout(() => {
      ui.toast.hidden = true;
    }, 2400);
  }

  // ---------- map events ----------

  function bindMapEvents() {
    document.addEventListener("noven:blank-started", () => {
      setStage("blank");
      status("海面 · 用画笔抬高成陆");
      hideBoot();
      post("noven-map-blank-started");
      for (const delay of [200, 600, 1200, 2000, 3000]) {
        window.setTimeout(() => {
          if (!window.novenBlank) return;
          closeTerrainBrush();
          window.customization = 0;
          showHeightView();
        }, delay);
      }
    });

    document.addEventListener("noven:terrain-finalized", event => {
      if (event.detail?.ok === false) {
        status("地形定稿失败", true);
        updatePrimary();
        return;
      }
      onTerrainFinalized();
    });

    document.addEventListener("noven:heightmap-changed", () => {
      scheduleDraft();
      updateCounts();
    });

    document.addEventListener("noven:map-saved", () => {
      state.dirty = true;
      if (embedded && state.stage !== "blank") void saveToCard(state.stage);
      else updatePrimary();
    });

    document.addEventListener("noven:map-generated", () => {
      hideNativeLoading();
      clearNativeTip();
      fitToWindow();
      clearGeneratedNames();
      state.dirty = true;
      state.baseView = "geo";
      state.overlays = { states: false, cultures: false };
      state.brushLayer = "base";
      setStage("world");
      status("地图已生成 · 国家/文化可切");
      updateCounts();
      updatePrimary();
    });

    document.addEventListener("noven:height-hover", event => {
      const height = Number(event.detail?.height);
      if (!Number.isFinite(height)) return;
      const value = document.getElementById("nv-height-value");
      const label = document.getElementById("nv-height-label");
      if (value !== null) value.textContent = String(Math.round(height));
      if (label !== null) {
        label.textContent = height < 20 ? "海面" : height < 35 ? "低地" : height < 50 ? "丘陵" : height < 65 ? "高地" : height < 80 ? "山地" : "高山";
      }
    });

    // Loading a map replaces the whole SVG, including #viewbox. Delegation keeps
    // map selection alive across that replacement.
    let mapPointer = null;
    document.addEventListener("mousedown", event => {
      if (!(event.target instanceof Element) || event.target.closest("#viewbox") === null) return;
      mapPointer = { x: event.clientX, y: event.clientY };
    }, true);
    document.addEventListener("mousedown", event => {
      if (!isPaintBrush() && !isHeightBrush()) return;
      if (!insideViewbox(event)) return;
      if (document.body.classList.contains("nv-editor-open")) return;
      state.painting = true;
      state.painted = false;
      state.paintMoved = false;
      state.paintStart = { x: event.clientX, y: event.clientY };
      state.heightStroke = isHeightBrush() ? new Map() : null;
      if (isHeightBrush()) window.clearTimeout(state.terrainTimer);
      event.stopPropagation();
      event.preventDefault();
      if (isHeightBrush()) {
        state.painted = true;
        paintHeightAt(event);
      }
    }, true);
    document.addEventListener("mousemove", event => {
      if (!state.painting) return;
      event.stopPropagation();
      event.preventDefault();
      if (isHeightBrush()) {
        queueHeightPaint(event);
        return;
      }
      const start = state.paintStart;
      if (!state.paintMoved && start !== null && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 3) return;
      state.paintMoved = true;
      paintAt(event);
    }, true);
    document.addEventListener("mouseup", event => {
      if (!state.painting) return;
      state.painting = false;
      state.paintStart = null;
      event.stopPropagation();
      event.preventDefault();
      if (isHeightBrush()) {
        flushHeightPaint();
        if (state.heightStroke !== null && state.heightStroke.size > 0) {
          state.heightHistory.push({ before: [...state.heightStroke].map(([cell, h]) => ({ cell, h })) });
          if (state.heightHistory.length > 40) state.heightHistory.shift();
        }
        state.heightStroke = null;
        showHeightView();
        scheduleTerrainUpdate();
        window.setTimeout(() => { state.painted = false; }, 0);
        return;
      }
      if (!state.paintMoved) return;
      flushPaint();
      window.setTimeout(() => { state.painted = false; }, 0);
    }, true);
    document.addEventListener("click", event => {
      if (!(event.target instanceof Element) || event.target.closest("#viewbox") === null) return;
      const start = mapPointer;
      mapPointer = null;
      if (state.painted) {
        state.painted = false;
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      if (start === null || state.stage === "blank") return;
      if (document.body.classList.contains("nv-editor-open")) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
      selectMapPoint(event);
      // The upstream label/entity editors listen on the same map click. The
      // shell card is the only editor here, so the click stops at this handler.
      event.stopPropagation();
      event.preventDefault();
    }, true);
    document.addEventListener("dblclick", event => {
      if (!(event.target instanceof Element) || event.target.closest("#viewbox") === null) return;
      if (state.stage === "blank" || document.body.classList.contains("nv-editor-open")) return;
      event.stopPropagation();
      event.preventDefault();
    }, true);
    document.addEventListener("wheel", event => {
      if (!insideViewbox(event)) return;
      event.preventDefault();
      event.stopPropagation();
      zoomBy(event.deltaY < 0 ? 1.35 : 1 / 1.35);
    }, { capture: true, passive: false });
    document.addEventListener("mousemove", event => {
      const cursor = document.getElementById("nv-brush-cursor");
      if (cursor === null) return;
      if ((!isPaintBrush() && !isHeightBrush()) || !insideViewbox(event)) {
        cursor.style.display = "none";
        return;
      }
      const point = viewboxPoint(event);
      if (point === undefined) {
        cursor.style.display = "none";
        return;
      }
      cursor.setAttribute("cx", String(point.x));
      cursor.setAttribute("cy", String(point.y));
      cursor.setAttribute("r", String(state.brushSize));
      const fill = state.tool === "terrain"
        ? state.heightMode === "lower" ? "rgba(95, 155, 200, 0.18)"
          : state.heightMode === "raise" ? "rgba(196, 190, 117, 0.22)"
            : "rgba(120, 120, 120, 0.10)"
        : "rgba(47, 93, 69, 0.06)";
      cursor.setAttribute("fill", fill);
      cursor.style.display = "";
    }, true);
  }

  function onTerrainFinalized() {
    if (state.stage === "terrain" || state.stage === "world") return;
    closeBrush();
    clearDraft();
    state.dirty = false;
    state.baseView = "geo";
    state.overlays = { states: false, cultures: false };
    state.brushLayer = "base";
    setStage("terrain");
    hideNativeLoading();
    clearNativeTip();
    fitToWindow();
    clearGeneratedTerrainNames();
    status("地理已生成 · 国家/文化可切");
    hideBoot();
    post("noven-map-terrain-finalized");
    if (embedded) void saveToCard("terrain");
  }

  // ---------- card messages ----------

  function post(type, detail = {}) {
    if (!embedded) return;
    window.parent.postMessage({ type, ...detail }, "*");
  }

  function bindCardMessages() {
    window.addEventListener("message", event => {
      if (event.source !== window.parent) return;
      const data = event.data;
      if (data === null || typeof data !== "object") return;
      switch (data.type) {
        case "noven-map-saved":
          state.saving = false;
          state.dirty = false;
          status("已保存到卡");
          updatePrimary();
          updateCounts();
          return;
        case "noven-map-save-failed":
          state.saving = false;
          status(typeof data.message === "string" && data.message !== "" ? data.message : "保存失败", true);
          updatePrimary();
          return;
        case "noven-map-load":
          if (typeof data.data !== "string") return;
          if (typeof data.undoKey === "string") state.undoKey = data.undoKey;
          void loadMap(data.data, data);
          return;
        case "noven-map-generate":
          void generateMap(data.options ?? {});
          return;
        case "noven-map-blank":
          void startBlank(data.options ?? {});
          return;
        case "noven-map-finalize":
          void finalizeTerrain();
          return;
        case "noven-map-human":
          void generateHuman();
          return;
        case "noven-map-compose":
          composeTerrain(data.spec);
          return;
        case "noven-map-paint":
          paintTerrain(data.operations);
          return;
        case "noven-map-edit":
          void applyEdit(data.operations, data.undoKey);
          return;
        case "noven-map-stage":
          state.baseView = "geo";
          state.overlays = { states: false, cultures: false };
          state.brushLayer = "base";
          if (data.stage === "terrain") {
            setStage("terrain");
          } else if (data.stage === "world") {
            setStage("world");
            document.body.classList.remove("noven-terrain");
          }
          return;
        case "noven-map-fullscreen":
          return;
        default:
          return;
      }
    });
  }

  // ---------- lifecycle operations ----------

  async function startBlank(options = {}) {
    if (!state.ready) return;
    if (typeof options.undoKey === "string") state.undoKey = options.undoKey;
    window.novenMap.clearUndoHistory?.(state.undoKey);
    if (typeof options.draftKey === "string") state.draftKey = options.draftKey;
    if (options.fresh === true && state.draftKey !== "") {
      try { localStorage.removeItem(state.draftKey); } catch { /* storage may be unavailable */ }
    }
    const draft = options.fresh === true ? undefined : readDraft(state.draftKey);
    const seed = draft?.seed ?? options.seed ?? `noven-blank-${Date.now()}`;
    const width = draft?.width ?? options.width ?? 1280;
    const height = draft?.height ?? options.height ?? 800;
    const points = draft?.points ?? options.points ?? 10000;
    state.draftMeta = { seed, width, height, points };
    closePanel();
    closeGeneration();
    closeSettings();
    state.dirty = false;
    setStage("blank");
    status(draft ? "海面 · 恢复草稿…" : "海面 · 准备中…");
    updateBootCopy("正在准备海面…", "正在建立全海高度图。");
    ui.bootAction.hidden = true;
    ui.boot.hidden = false;
    try {
      await window.novenMap.startBlank({ seed, width, height, points });
      if (draft) restoreDraft(draft);
      hideNativeLoading();
      clearNativeTip();
      fitToWindow();
      for (const delay of [200, 600, 1200, 2000, 3000]) {
        window.setTimeout(() => {
          if (!window.novenBlank) return;
          closeTerrainBrush();
          window.customization = 0;
          showHeightView();
        }, delay);
      }
      status(draft ? "草稿已恢复" : "海面 · 抬高成陆");
      hideBoot();
      setStage("blank");
    } catch (error) {
      status("海面启动失败", true);
      updateBootCopy("海面启动失败", String(error));
      console.error("Noven blank map failed", error);
    }
  }

  async function finalizeTerrain() {
    if (!state.ready || window.novenBlank !== true) return;
    status("生成地理中…");
    updatePrimary();
    try {
      await window.novenMap.finalize();
      if (window.novenBlank === true) {
        status("陆地不足 200 块，继续抬高", true);
        updatePrimary();
        return;
      }
      onTerrainFinalized();
    } catch (error) {
      status("生成地理失败", true);
      updatePrimary();
      console.error("Noven terrain finalize failed", error);
    }
  }

  /** Blank a generated entity's name. Names are only ever entered by the user
      or by an AI operation; generation leaves the geometry and clears the name. */
  function clearName(item) {
    if (item === null || typeof item !== "object") return false;
    let changed = false;
    if (typeof item.name === "string" && item.name !== "") {
      item.name = "";
      changed = true;
    }
    if (typeof item.fullName === "string" && item.fullName !== "") {
      item.fullName = "";
      changed = true;
    }
    if (typeof item.formName === "string" && item.formName !== "") {
      item.formName = "";
      changed = true;
    }
    if (item.label && typeof item.label.text === "string" && item.label.text !== "") {
      item.label.text = "";
      changed = true;
    }
    return changed;
  }

  function clearGeneratedTerrainNames() {
    const pack = window.pack;
    if (!pack?.cells?.i?.length) return 0;
    let count = 0;
    for (const feature of pack.features ?? []) {
      if (feature?.i && !feature.removed && clearName(feature)) count += 1;
    }
    for (const river of pack.rivers ?? []) {
      if (river?.i && !river.removed && clearName(river)) count += 1;
    }
    redrawNames();
    return count;
  }

  function clearGeneratedNames() {
    const pack = window.pack;
    if (!pack?.cells?.i?.length) return 0;
    let count = clearGeneratedTerrainNames();
    for (const list of [pack.states, pack.provinces, pack.cultures, pack.religions, pack.burgs, pack.markers]) {
      for (const item of list ?? []) {
        if (item && !item.removed && clearName(item)) count += 1;
      }
    }
    redrawNames();
    return count;
  }

  async function generateHuman(options = {}) {
    if (!state.ready || state.stage === "blank") return;
    status("生成人文层中…");
    try {
      await window.novenMap.generateHuman(options);
      clearGeneratedNames();
      hideNativeLoading();
      clearNativeTip();
      fitToWindow();
      window.novenMap.clearUndoHistory?.(state.undoKey);
      state.dirty = true;
      state.baseView = "geo";
      state.overlays = { states: false, cultures: false };
      state.brushLayer = "base";
      setStage("world");
      status("人文层已生成 · 国家/文化可切");
      toast("名称留空：点地图命名，或让 AI 命名");
      hideBoot();
      post("noven-map-human-generated");
      await saveToCard("world");
    } catch (error) {
      status("生成人文层失败", true);
      toast("生成人文层失败，请重试");
      console.error("Noven human layer generation failed", error);
    }
  }

  async function loadMap(data, options = {}) {
    if (!state.ready) return;
    if (typeof options.undoKey === "string") state.undoKey = options.undoKey;
    closePanel();
    closeGeneration();
    closeSettings();
    clearDraft();
    state.dirty = false;
    updateBootCopy("正在载入地图…", "正在解析卡片里的地图文档。");
    ui.boot.hidden = false;
    status("载入中…");
    try {
      await window.novenMap.load(data);
      hideNativeLoading();
      clearNativeTip();
      fitToWindow();
      const counts = readCounts();
      const terrainOnly = counts.states === 0 && counts.cultures <= 1;
      state.baseView = "geo";
      state.overlays = { states: false, cultures: false };
      state.brushLayer = "base";
      if (terrainOnly) {
        setStage("terrain");
      } else {
        setStage("world");
        document.body.classList.remove("noven-terrain");
      }
      status("已载入");
      hideBoot();
      post("noven-map-loaded");
      if (Array.isArray(options.afterEdit) && options.afterEdit.length > 0) {
        await applyEdit(options.afterEdit, options.undoKey);
      }
      if (options.afterHuman === true && terrainOnly) await generateHuman();
    } catch (error) {
      status("载入失败", true);
      updateBootCopy("地图载入失败", String(error));
      console.error("Noven map load failed", error);
      post("noven-map-load-failed", { message: String(error) });
    }
  }

  async function generateMap(options = {}) {
    if (!state.ready) return;
    closePanel();
    closeGeneration();
    closeSettings();
    clearDraft();
    window.novenMap.clearUndoHistory?.(state.undoKey);
    state.dirty = false;
    status("生成地图中…");
    updateBootCopy("正在生成地图…", "正在生成地形与人文层。");
    ui.boot.hidden = false;
    try {
      await window.novenMap.generate(options);
      clearGeneratedNames();
      hideNativeLoading();
      clearNativeTip();
      fitToWindow();
      state.dirty = true;
      state.baseView = "geo";
      state.overlays = { states: false, cultures: false };
      state.brushLayer = "base";
      setStage("world");
      status("地图已生成 · 国家/文化可切");
      hideBoot();
      post("noven-map-generated");
      await saveToCard("world");
    } catch (error) {
      status("地图生成失败", true);
      updateBootCopy("地图生成失败", String(error));
      console.error("Noven map generation failed", error);
    }
  }

  async function applyEdit(operations, undoKey) {
    if (!state.ready || !Array.isArray(operations) || operations.length === 0) return;
    try {
      const result = window.novenMap.applyOperations(operations, undoKey ?? state.undoKey);
      state.dirty = true;
      status(`AI 改动 · ${result.applied} 项`);
      refreshAi();
      applyViews();
      renderViews();
      renderBrush();
      updatePrimary();
      updateCounts();
      post("noven-map-edited", { applied: result.applied });
    } catch (error) {
      status("AI 改动失败", true);
      post("noven-map-edit-failed", { message: String(error) });
      console.error("Noven map edit failed", error);
    }
  }

  function composeTerrain(spec) {
    if (!state.ready || window.novenBlank !== true) {
      status("先在海面上起稿", true);
      return;
    }
    try {
      const summary = window.novenMap.composeTerrain(spec);
      paintHeightPreview([...window.grid.cells.i]);
      status(`AI 地形 · 陆地 ${Math.round(summary.landRatio * 100)}%`);
      updateCounts();
      post("noven-map-terrain-summary", { summary });
      scheduleDraft();
    } catch (error) {
      status("AI 地形起稿失败", true);
      console.error("Noven terrain compose failed", error);
    }
  }

  function paintTerrain(operations) {
    if (!state.ready || window.novenBlank !== true) {
      status("先在海面上起稿", true);
      return;
    }
    try {
      const summary = window.novenMap.paintTerrain(operations);
      paintHeightPreview([...window.grid.cells.i]);
      status(`AI 地形 · 陆地 ${Math.round(summary.landRatio * 100)}%`);
      updateCounts();
      post("noven-map-terrain-summary", { summary });
      scheduleDraft();
    } catch (error) {
      status("AI 地形修改失败", true);
      console.error("Noven terrain paint failed", error);
    }
  }

  async function saveToCard(stage = state.stage) {
    if (!embedded || state.saving) return;
    if (!state.ready) return;
    state.saving = true;
    updatePrimary();
    updateCounts();
    status("保存中…");
    try {
      const data = window.novenMap.save();
      let summary;
      try {
        const full = window.novenMap.summary?.();
        if (full) summary = { ...full, burgs: full.burgs.slice(0, 120) };
      } catch (summaryError) {
        console.warn("Noven map summary failed", summaryError);
      }
      post("noven-map-save", { data, stage, summary });
    } catch (error) {
      state.saving = false;
      status("保存失败", true);
      updatePrimary();
      console.error("Noven map save failed", error);
    }
  }

  function openBrush() {
    const controller = window.Controllers?.HeightmapEditor;
    if (controller === null || controller === undefined) {
      toast("画笔还没准备好");
      return;
    }
    closePanel();
    ui.menu.hidden = true;
    try {
      if (typeof controller.openBrushes === "function") Promise.resolve(controller.openBrushes()).catch(reportBrushFailure);
      else controller.open?.({ mode: "erase" });
    } catch (error) {
      reportBrushFailure(error);
    }
  }

  function reportBrushFailure(error) {
    console.warn("Noven brush open failed", error);
    toast("画笔没有打开");
  }

  function closeBrush() {
    try {
      const jq = window.jQuery;
      if (typeof jq === "function") {
        const dialog = jq("#brushesPanel");
        if (dialog.dialog("isOpen")) dialog.dialog("close");
      }
    } catch (error) {
      console.warn("Noven brush close failed", error);
    }
  }

  function enhanceBrushDialog() {
    const panel = document.getElementById("brushesPanel");
    if (panel === null) return;
    const dialog = panel.closest(".ui-dialog");
    const title = dialog?.querySelector(".ui-dialog-title");
    if (title !== null && title !== undefined && title.textContent?.trim() === "Paint Brushes") title.textContent = "画笔";
    if (panel.dataset.nvEnhanced !== "true") {
      panel.dataset.nvEnhanced = "true";
      const hint = document.createElement("p");
      hint.className = "nv-brush-hint";
      hint.textContent = "拖动涂抹；半径、力度和范围作用于当前画笔。";
      panel.insertBefore(hint, panel.firstChild);
      const readout = document.createElement("div");
      readout.id = "nv-height-readout";
      readout.innerHTML = '<span>光标高度</span><strong id="nv-height-value">—</strong><em id="nv-height-label"></em>';
      hint.insertAdjacentElement("afterend", readout);
    }
    const filterLabel = panel.querySelector('label[for="cellTypeFilter"]');
    if (filterLabel !== null && filterLabel.textContent !== "作用范围") filterLabel.textContent = "作用范围";
    const filter = document.getElementById("cellTypeFilter");
    const filterLabels = { all: "全部碎块", land: "只改陆地", water: "只改水域" };
    for (const option of filter?.options ?? []) {
      const next = filterLabels[option.value];
      if (next !== undefined && option.textContent !== next) option.textContent = next;
    }
    const sliderLabels = { "Radius:": "半径", "Power:": "力度", "Randomness:": "随机度" };
    for (const element of panel.querySelectorAll("#brushesSliders div, #lineSlider div")) {
      if (element.children.length !== 0) continue;
      const next = sliderLabels[element.textContent?.trim() ?? ""];
      if (next !== undefined && element.textContent !== next) element.textContent = next;
    }
    for (const [id, label] of Object.entries(BRUSH_LABELS)) {
      const button = document.getElementById(id);
      if (button === null || button.querySelector(".nv-brush-label") !== null) continue;
      const span = document.createElement("span");
      span.className = "nv-brush-label";
      span.textContent = label;
      button.appendChild(span);
    }
    const modify = panel.querySelector("#modifyButtons");
    if (modify !== null && panel.querySelector(".nv-foot-caption") === null) {
      const caption = document.createElement("div");
      caption.className = "nv-foot-caption";
      caption.textContent = "整理";
      modify.parentNode.insertBefore(caption, modify);
    }
    if (panel.querySelector("#brushesButtons > button.pressed") === null) {
      document.getElementById("brushRaise")?.click();
    }
  }

  /** Hover text has no box and leaves after it has been read. */
  function bindTooltipFade() {
    const tip = document.getElementById("tooltip");
    if (tip === null || tip.dataset.nvFade === "true") return;
    tip.dataset.nvFade = "true";
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const text = (tip.textContent ?? "").trim();
        if (text === "" || tip.dataset.main === tip.innerHTML) return;
        tip.classList.add("noven-tip-fading");
        window.setTimeout(() => {
          if (!tip.classList.contains("noven-tip-fading")) return;
          tip.innerHTML = "";
          tip.classList.remove("noven-tip-fading");
        }, 500);
      }, 1600);
    };
    new MutationObserver(() => {
      const text = (tip.textContent ?? "").trim();
      if (text === (tip.dataset.nvText ?? "")) return;
      tip.dataset.nvText = text;
      tip.classList.remove("noven-tip-fading");
      if (text !== "") schedule();
    }).observe(tip, { childList: true, subtree: true, characterData: true });
  }

  function closePanel() {
    if (ui === null) return;
    ui.panel.hidden = true;
    state.panel = null;
  }

  // ---------- views ----------

  const PLACEHOLDER_LABEL = "…";

  const OVERLAY_COLORS = ["#6a4c93", "#a8503f", "#3a5c8c", "#966e28", "#2f6d63", "#8a5a2b"];

  function liveStates() {
    return (window.pack?.states ?? []).filter(item => item && item.i && !item.removed);
  }

  function liveCultures() {
    return (window.pack?.cultures ?? []).filter(item => item && item.i && !item.removed);
  }

  function makeButton(label, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (className !== "") button.className = className;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderViews() {
    if (ui === null) return;
    const host = ui.views;
    host.replaceChildren();
    const group = (label, entries) => {
      const wrap = document.createElement("div");
      wrap.className = "nv-view-group";
      const name = document.createElement("span");
      name.className = "nv-view-label";
      name.textContent = label;
      wrap.appendChild(name);
      for (const entry of entries) {
        const button = makeButton(entry.label, "", entry.run);
        if (entry.attr !== undefined) button.dataset[entry.attr] = entry.value;
        button.classList.toggle("active", entry.active === true);
        if (entry.disabled === true) button.disabled = true;
        if (entry.title !== undefined) button.title = entry.title;
        wrap.appendChild(button);
      }
      host.appendChild(wrap);
    };

    const browsing = state.viewMode !== "2d";
    group("视图", [
      { label: "2D", attr: "viewMode", value: "2d", active: state.viewMode === "2d", run: () => setViewMode("2d") },
      { label: "3D", attr: "viewMode", value: "3d", active: state.viewMode === "3d", run: () => setViewMode("3d") },
      { label: "球体", attr: "viewMode", value: "globe", active: state.viewMode === "globe", run: () => setViewMode("globe") },
    ]);
    group("底层", [
      {
        label: "高度图", attr: "base", value: "height", active: state.baseView === "height",
        disabled: browsing || !window.grid?.cells?.h,
        title: browsing ? "切回 2D 编辑" : "",
        run: () => setBaseView("height")
      },
      {
        label: "渲染图", attr: "base", value: "geo", active: state.baseView === "geo",
        disabled: browsing,
        title: browsing ? "切回 2D 编辑" : "",
        run: () => setBaseView("geo")
      },
    ]);
    group("覆盖", [
      { label: "无", attr: "overlay", value: "none", active: !state.overlays.states && !state.overlays.cultures, disabled: browsing, title: browsing ? "切回 2D 编辑" : "", run: () => selectOverlay("none") },
      { label: "国家", attr: "overlay", value: "states", active: state.overlays.states, disabled: browsing, title: browsing ? "切回 2D 编辑" : "", run: () => selectOverlay("states") },
      { label: "文化", attr: "overlay", value: "cultures", active: state.overlays.cultures, disabled: browsing, title: browsing ? "切回 2D 编辑" : "", run: () => selectOverlay("cultures") },
    ]);
  }

  function setViewMode(mode) {
    document.body.dataset.novenView = mode;
    if (mode !== "2d") {
      if (state.tool !== "pan" && state.tool !== "zoom") state.tool = "pan";
      state.overlays = { states: false, cultures: false };
      state.brushMode = "paint";
    }
    state.viewMode = mode;
    const id = mode === "3d" ? "viewMesh" : mode === "globe" ? "viewGlobe" : "viewStandard";
    document.getElementById(id)?.click();
    if (mode === "2d") applyViews();
    renderViews();
    renderInspector();
    updateStatus();
  }

  function setBaseView(view) {
    if (state.viewMode !== "2d") {
      toast("3D/球体只浏览；切回 2D 再编辑");
      return;
    }
    if (view === "height" && !window.grid?.cells?.h) {
      toast("这张地图没有高度图");
      return;
    }
    if (view === "geo" && window.novenBlank === true) {
      void ensureSurface().then(ok => {
        if (!ok) return;
        state.baseView = "geo";
        if (state.tool === "geo") state.baseMode = "geo";
        applyViews();
        renderViews();
        renderInspector();
        updateStatus();
      });
      return;
    }
    state.baseView = view;
    if (state.tool === "geo") state.baseMode = "geo";
    applyViews();
    renderViews();
    renderInspector();
    updateStatus();
  }

  function selectOverlay(kind) {
    if (kind === "none") {
      state.overlays = { states: false, cultures: false };
      if (state.tool === "states" || state.tool === "cultures" || state.tool === "erase") state.tool = "select";
      state.brushMode = "paint";
      applyViews();
      renderViews();
      renderInspector();
      updateStatus();
      return;
    }
    void setTool(kind);
  }

  async function ensureSurface() {
    if (window.novenBlank !== true) return true;
    if (landCells() < 200) {
      toast("先抬高出一块陆地，再上地理色");
      return false;
    }
    try {
      await window.novenMap.finalize();
      state.stage = "terrain";
      state.baseView = "geo";
      hideNativeLoading();
      fitToWindow();
      clearGeneratedTerrainNames();
      setStage("terrain");
      return true;
    } catch (error) {
      console.warn("Noven surface finalize failed", error);
      toast("地理还没准备好");
      return false;
    }
  }

  /** A blank sheet finalizes before FMG's pack has every optional collection.
      Renderers and label/zone operations iterate these arrays, so start empty. */
  function ensurePackCollections() {
    const pack = window.pack;
    if (pack === undefined) return;
    for (const key of ["features", "rivers", "markers", "zones", "addedLabels", "states", "cultures", "burgs", "provinces", "religions"]) {
      if (!Array.isArray(pack[key])) pack[key] = [];
    }
  }

  /** Loading a map inserts its own SVG; groups the saved file omitted stay missing
      until the layer registry recreates them. */
  function ensureLayers() {
    if (document.getElementById("biomes") !== null && document.getElementById("terrs") !== null) return;
    try {
      window.Layers?.init?.();
    } catch (error) {
      console.warn("Noven layer init failed", error);
    }
  }

  /** The base view and the overlays are independent: height/geography chooses
      the bottom picture, state/culture choose transparent sheets on top. */
  function applyViews() {
    if (ui === null) return;
    ensurePackCollections();
    ensureLayers();
    ensureMapChrome();
    const layers = window.Layers;
    if (layers === undefined) return;
    try {
      const heightView = state.baseView === "height";
      if (heightView) {
        layers.hide?.("heightmap", "biomes", "lakes", "rivers", "routes");
      } else {
        layers.show?.("biomes", "lakes", "rivers", "routes");
        layers.hide?.("heightmap");
      }
      const surface = ensureHeightLayer();
      if (surface !== null) surface.style.display = heightView ? "" : "none";
      const terrs = document.getElementById("terrs");
      if (terrs !== null) terrs.style.display = heightView ? "none" : "";
      if (!heightView) layers.show?.("labels");
      else layers.hide?.("labels");
      if (state.overlays.states) layers.show?.("states", "borders");
      else layers.hide?.("states", "borders");
      if (state.overlays.cultures) layers.show?.("cultures");
      else layers.hide?.("cultures");
      setLabelGroups();
      layers.draw?.("labels", "states", "borders", "cultures", "biomes");
      ensureMapChrome();
    } catch (error) {
      console.warn("Noven views failed", error);
    }
    document.body.dataset.novenBase = state.baseView;
    document.body.dataset.novenOverlays = `${state.overlays.states ? "states" : ""}${state.overlays.cultures ? " cultures" : ""}`.trim();
  }

  function setLabelGroups() {
    const groups = window.options?.map?.labels?.groups;
    if (!Array.isArray(groups)) return;
    for (const group of groups) {
      if (group.name === "added") group.active = true;
      else if (group.type === "state" || group.type === "province" || group.type === "burg") {
        group.active = state.overlays.states;
      } else group.active = false;
    }
    window.Layers?.draw?.("labels");
  }

  function biomeLabel(id) {
    const biome = window.pack?.biomes?.[id];
    if (biome === undefined) return "未选";
    return BIOME_ZH[biome.name] ?? biome.name;
  }

  function updateStatus() {
    if (ui === null) return;
    const saved = state.saving ? "保存中" : !embedded ? "预览" : state.dirty ? "未保存" : "已保存";
    const base = state.baseView === "geo" ? "渲染图" : "高度图";
    const overlay = state.overlays.states ? "国家" : state.overlays.cultures ? "文化" : "无";
    if (ui.save !== null) ui.save.textContent = saved;
    if (ui.space !== null) ui.space.textContent = "海面";
    updateZoomLabel();
    if (state.viewMode !== "2d") {
      ui.stageName.textContent = state.viewMode === "3d" ? "3D 浏览" : "球体浏览";
      ui.stageCounts.textContent = `只浏览；点任意编辑工具会切回 2D · ${saved}`;
      return;
    }
    let title = "工具";
    let hint = "从左侧选择工具";
    if (state.tool === "terrain") {
      title = "地形笔";
      hint = state.baseView === "height"
        ? "高度图 · 拖动涂抹；可改海也可改陆；⌘Z 撤销一笔"
        : "渲染图预览 · 落笔自动回高度图；拖动涂抹";
    } else if (state.tool === "geo") {
      title = "地理笔";
      hint = state.baseView === "geo"
        ? `渲染图 · 目标 ${biomeLabel(state.targetBiome)} · 拖动上色`
        : "高度图预览 · 落笔自动回渲染图；拖动上色";
    } else if (state.tool === "states") {
      const item = liveStates().find(stateItem => stateItem.i === state.targetState);
      title = "国家笔";
      hint = `${base} · 目标 ${item === undefined ? "未选" : entityName(item.name)} · 拖动=涂，Shift=擦，单击=选中`;
    } else if (state.tool === "cultures") {
      const item = liveCultures().find(culture => culture.i === state.targetCulture);
      title = "文化笔";
      hint = `${base} · 目标 ${item === undefined ? "未选" : entityName(item.name)} · 拖动=涂，Shift=擦，单击=选中`;
    } else if (state.tool === "erase") {
      title = "擦除";
      hint = `${overlay} · 拖动擦除；⌘Z 撤销`;
    } else if (state.tool === "select") {
      title = "选择";
      hint = `${base} · 覆盖 ${overlay} · 单击选中${overlay === "无" ? "底层" : "区域"}，Esc 取消`;
    } else if (state.tool === "pan") {
      title = "平移";
      hint = "拖动画布；空格或中键也可拖；滚轮缩放";
    } else if (state.tool === "zoom") {
      title = "缩放";
      hint = "滚轮 1.35×；顶部适应 / 100% / ＋－";
    }
    ui.stageName.textContent = title;
    ui.stageCounts.textContent = `${hint} · ${saved}`;
  }

  async function setTool(tool) {
    flushPaint();
    state.inspectorClosed = false;
    state.inspectorCollapsed = false;
    closeTerrainBrush();
    if (state.viewMode !== "2d" && tool !== "pan" && tool !== "zoom") setViewMode("2d");
    if (tool === "terrain") {
      try { window.customization = 0; } catch { /* mode flag is optional */ }
      state.tool = "terrain";
      state.brushLayer = "base";
      state.brushMode = "paint";
      state.baseMode = "height";
      state.baseView = "height";
      state.overlays = { states: false, cultures: false };
      showHeightView();
      renderViews();
      renderInspector();
      updateStatus();
      return;
    }
    if (tool === "geo") {
      const ready = await ensureSurface();
      if (!ready) return;
      state.tool = "geo";
      state.brushLayer = "base";
      state.brushMode = "paint";
      state.baseMode = "geo";
      state.baseView = "geo";
      state.overlays = { states: false, cultures: false };
    } else if (tool === "states" || tool === "cultures") {
      state.tool = tool;
      state.brushLayer = tool;
      state.brushMode = "paint";
      state.overlays = { states: tool === "states", cultures: tool === "cultures" };
      if (tool === "states" && !state.targetState) state.targetState = liveStates()[0]?.i ?? 0;
      if (tool === "cultures" && !state.targetCulture) state.targetCulture = liveCultures()[0]?.i ?? 0;
    } else if (tool === "erase") {
      if (!isOverlayBrush()) {
        toast("底层没有擦除；用高度笔改海陆");
        return;
      }
      state.tool = "erase";
      state.brushMode = "erase";
    } else {
      state.tool = tool;
      state.brushMode = "paint";
    }
    applyViews();
    renderViews();
    renderInspector();
    updateStatus();
  }

  function setBrushLayer(layer) {
    return setTool(layer);
  }

  function renderBrush() {
    renderInspector();
  }

  function renderTools() {
    if (ui === null) return;
    for (const button of ui.tools.querySelectorAll("button[data-tool]")) {
      const tool = button.dataset.tool;
      button.classList.toggle("active", tool === state.tool);
      if (tool === "erase") {
        button.disabled = !isOverlayBrush();
        button.title = button.disabled ? "先选国家或文化" : "擦除 (E)";
      }
    }
    document.body.dataset.novenTool = state.tool;
  }

  function inspectorTitle(text, hint) {
    ui.inspectorTitle.textContent = text;
    if (hint) {
      const note = document.createElement("p");
      note.className = "nv-hint";
      note.textContent = hint;
      ui.inspectorTool.appendChild(note);
    }
  }

  function renderInspector() {
    if (ui === null) return;
    renderTools();
    if (state.inspectorClosed) {
      ui.inspector.hidden = true;
      ui.inspectorOpen.hidden = false;
      return;
    }
    ui.inspector.hidden = false;
    ui.inspectorOpen.hidden = true;
    ui.inspector.classList.toggle("collapsed", state.inspectorCollapsed);
    ui.inspectorCollapse.textContent = state.inspectorCollapsed ? "+" : "−";
    ui.inspectorTool.replaceChildren();
    ui.inspectorSelection.replaceChildren();
    ui.inspectorSelection.hidden = state.selected === null;

    if (state.tool === "select") {
      inspectorTitle("选择", "点地图上的国家/文化/底层；选中后在这里改名、改色。");
    } else if (state.tool === "pan") {
      inspectorTitle("平移", "拖动画布；空格拖或中键拖也可以。");
    } else if (state.tool === "zoom") {
      inspectorTitle("缩放", "滚轮 1.35×；顶部适应全图、100%、＋/－。");
    } else if (state.tool === "terrain") {
      renderTerrainBrush();
    } else if (state.tool === "erase") {
      renderOverlayBrush(state.brushLayer, true);
    } else if (state.tool === "geo") {
      renderGeoBrush();
    } else if (state.tool === "states" || state.tool === "cultures") {
      renderOverlayBrush(state.tool, false);
    } else {
      inspectorTitle("工具", "从左侧选一个工具。");
    }

    renderSelection();
  }

  function renderGeoBrush() {
    inspectorTitle("地理笔", "选一个地理类型，拖动给陆地上色；海洋由高度低于海平面表示。");
    const biomes = (window.pack?.biomes ?? []).filter(biome => biome.i && !biome.removed && biome.name !== "Marine");
    if (state.targetBiome === 0 && biomes.length > 0) state.targetBiome = biomes[0].i;
    const targets = document.createElement("div");
    targets.className = "nv-targets vertical";
    for (const biome of biomes) {
      const button = makeButton("", "nv-target", () => {
        state.targetBiome = biome.i;
        renderInspector();
      });
      button.dataset.id = String(biome.i);
      button.classList.toggle("active", biome.i === state.targetBiome);
      const swatch = document.createElement("i");
      swatch.className = "nv-swatch";
      swatch.style.background = biome.color || "#999";
      const name = document.createElement("span");
      name.textContent = BIOME_ZH[biome.name] ?? biome.name;
      button.append(swatch, name);
      targets.appendChild(button);
    }
    ui.inspectorTool.appendChild(targets);
    if (biomes.length === 0) return;
    ui.inspectorTool.appendChild(sizeRow());
  }

  function renderTerrainBrush() {
    inspectorTitle("地形笔", "拖动涂抹；海洋是高度低于海平面；⌘Z 撤销一笔。");
    const modes = [["raise", "↑ 抬高"], ["lower", "↓ 降低"], ["flatten", "⇆ 抹平"], ["smooth", "∿ 平滑"], ["disrupt", "≈ 扰动"]];
    const grid = document.createElement("div");
    grid.className = "nv-height-modes";
    for (const [id, label] of modes) {
      const button = makeButton(label, "nv-mode", () => {
        state.heightMode = id;
        renderInspector();
      });
      button.classList.toggle("active", state.heightMode === id);
      grid.appendChild(button);
    }
    ui.inspectorTool.appendChild(grid);
    ui.inspectorTool.appendChild(sizeRow());
    const power = document.createElement("label");
    power.className = "nv-size";
    power.textContent = "力度";
    const range = document.createElement("input");
    range.type = "range";
    range.min = "1";
    range.max = "10";
    range.value = String(state.brushPower);
    range.addEventListener("input", () => {
      state.brushPower = Number(range.value);
    });
    power.appendChild(range);
    ui.inspectorTool.appendChild(power);
  }

  function showHeightView() {
    try { window.customization = 0; } catch { /* mode flag is optional */ }
    state.baseView = "height";
    if (ui !== null) applyViews();
    else ensureHeightLayer();
  }

  function isHeightBrush() {
    return state.tool === "terrain" && state.brushLayer === "base" && state.baseMode === "height";
  }

  function gridPoint(event) {
    const viewbox = document.getElementById("viewbox");
    const svg = document.getElementById("map");
    if (viewbox === null || svg === null || typeof svg.createSVGPoint !== "function") return undefined;
    const ctm = viewbox.getScreenCTM();
    if (ctm === null) return undefined;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    const cell = window.Grid?.findCell?.(local.x, local.y);
    if (cell === undefined) return undefined;
    return { cell, x: local.x, y: local.y };
  }

  const HEIGHT_RAMP = [
    [20, 241, 239, 216],
    [35, 223, 227, 176],
    [50, 207, 216, 154],
    [65, 185, 199, 132],
    [80, 162, 176, 111],
    [100, 135, 147, 91]
  ];

  function heightRgb(height) {
    const h = Math.min(100, Math.max(20, height));
    for (let index = 1; index < HEIGHT_RAMP.length; index++) {
      const [top, tr, tg, tb] = HEIGHT_RAMP[index];
      if (h > top) continue;
      const [bottom, br, bg, bb] = HEIGHT_RAMP[index - 1];
      const ratio = (h - bottom) / (top - bottom);
      const mix = (from, to) => Math.round(from + (to - from) * ratio);
      return [mix(br, tr), mix(bg, tg), mix(bb, tb)];
    }
    return [135, 147, 91];
  }

  function heightFill(cell, heights) {
    const height = heights[cell];
    if (height < 20) return "transparent";
    const [red, green, blue] = heightRgb(height);
    return `rgb(${red}, ${green}, ${blue})`;
  }

  let heightLayer = null;
  let heightLayerSource = null;
  let heightLayerPolygons = [];

  /** Noven owns the white-film view: one polygon per grid cell, colored by
      height. FMG's heightmap layer is absent on some loaded maps. */
  function ensureHeightLayer() {
    const map = document.getElementById("map");
    const grid = window.grid;
    if (map === null || !grid?.cells?.i || !grid?.cells?.v || !grid?.vertices?.p) return null;
    if (heightLayer !== null && heightLayerSource === grid && heightLayer.isConnected) return heightLayer;
    if (heightLayer !== null) heightLayer.remove();
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.id = "nv-height-layer";
    group.setAttribute("pointer-events", "none");
    group.setAttribute("aria-hidden", "true");
    const polygons = [];
    const fragment = document.createDocumentFragment();
    for (const cell of grid.cells.i) {
      const vertices = grid.cells.v[cell];
      if (!vertices || vertices.length < 3) continue;
      const points = [];
      let valid = true;
      for (const vertex of vertices) {
        const point = grid.vertices.p[vertex];
        if (!point) { valid = false; break; }
        points.push(`${Math.round(point[0] * 10) / 10},${Math.round(point[1] * 10) / 10}`);
      }
      if (!valid) continue;
      const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      const fill = heightFill(cell, grid.cells.h);
      polygon.setAttribute("points", points.join(" "));
      polygon.setAttribute("fill", fill);
      polygon.setAttribute("stroke", fill);
      polygon.setAttribute("stroke-width", "0.6");
      polygon.dataset.cell = String(cell);
      fragment.appendChild(polygon);
      polygons[cell] = polygon;
    }
    group.appendChild(fragment);
    const viewbox = document.getElementById("viewbox");
    const anchor = document.getElementById("cells") ?? document.getElementById("cults") ?? document.getElementById("nv-map-frame");
    if (viewbox !== null && anchor !== null && anchor.parentNode === viewbox) viewbox.insertBefore(group, anchor);
    else if (viewbox !== null) viewbox.appendChild(group);
    else map.appendChild(group);
    group.style.display = state.baseView === "height" ? "" : "none";
    heightLayer = group;
    heightLayerSource = grid;
    heightLayerPolygons = polygons;
    return group;
  }

  function paintHeightPreview(cells) {
    const heights = window.grid?.cells?.h;
    if (heights === undefined) return;
    ensureHeightLayer();
    for (const cell of cells) {
      const polygon = heightLayerPolygons[cell];
      if (polygon) {
        const fill = heightFill(cell, heights);
        polygon.setAttribute("fill", fill);
        polygon.setAttribute("stroke", fill);
      }
    }
  }

  function ensureMapChrome() {
    const viewbox = document.getElementById("viewbox");
    const graph = window.options?.map?.graph;
    if (viewbox === null || !graph?.width || !graph?.height) return;
    let frame = document.getElementById("nv-map-frame");
    if (frame === null) {
      frame = document.createElementNS("http://www.w3.org/2000/svg", "g");
      frame.id = "nv-map-frame";
      const shade = document.createElementNS("http://www.w3.org/2000/svg", "path");
      shade.setAttribute("fill", "rgba(43, 47, 40, 0.07)");
      shade.setAttribute("fill-rule", "evenodd");
      shade.setAttribute("pointer-events", "none");
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("fill", "none");
      rect.setAttribute("stroke", "#2b2f28");
      rect.setAttribute("stroke-opacity", "0.62");
      rect.setAttribute("stroke-width", "1.2");
      rect.setAttribute("vector-effect", "non-scaling-stroke");
      frame.append(shade, rect);
    }
    const shade = frame.querySelector("path");
    const rect = frame.querySelector("rect");
    const width = String(graph.width);
    const height = String(graph.height);
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", width);
    rect.setAttribute("height", height);
    shade.setAttribute("d", `M-100000 -100000 H100000 V100000 H-100000 Z M0 0 H${width} V${height} H0 Z`);
    viewbox.appendChild(frame);

    let cursor = document.getElementById("nv-brush-cursor");
    if (cursor === null) {
      cursor = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      cursor.id = "nv-brush-cursor";
      cursor.setAttribute("fill", "none");
      cursor.setAttribute("stroke", "#2f5d45");
      cursor.setAttribute("stroke-width", "1.2");
      cursor.setAttribute("stroke-dasharray", "4 4");
      cursor.setAttribute("vector-effect", "non-scaling-stroke");
      cursor.setAttribute("pointer-events", "none");
      cursor.style.display = "none";
    }
    cursor.setAttribute("r", String(state.brushSize));
    viewbox.appendChild(cursor);
  }

  function viewboxPoint(event) {
    const viewbox = document.getElementById("viewbox");
    const svg = document.getElementById("map");
    if (viewbox === null || svg === null || typeof svg.createSVGPoint !== "function") return undefined;
    const ctm = viewbox.getScreenCTM();
    if (ctm === null) return undefined;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(ctm.inverse());
  }

  function scheduleTerrainUpdate() {
    window.clearTimeout(state.terrainTimer);
    state.terrainTimer = window.setTimeout(() => {
      const run = () => updateTerrainDerived();
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 1500 });
      else run();
    }, 600);
  }

  function updateTerrainDerived() {
    if (window.novenBlank === true) return;
    const pack = window.pack;
    const grid = window.grid;
    if (!pack?.cells?.h || !grid?.cells?.h) return;
    try {
      for (const cell of pack.cells.i) {
        const gridCell = pack.cells.g?.[cell];
        if (gridCell !== undefined) pack.cells.h[cell] = grid.cells.h[gridCell];
      }
      window.Features?.markupPack?.();
      window.Biomes?.define?.();
      window.Rivers?.regenerate?.();
      for (const cell of pack.cells.i) {
        if (pack.cells.h[cell] >= 20) continue;
        pack.cells.state[cell] = 0;
        pack.cells.culture[cell] = 0;
        const burg = pack.burgs?.[pack.cells.burg?.[cell]];
        if (burg) {
          burg.state = 0;
          burg.culture = 0;
        }
      }
      recomputeOverlay("states");
      recomputeOverlay("cultures");
      window.Layers?.draw?.("ocean", "landmass", "lakes", "coastline", "biomes", "rivers", "states", "cults", "borders", "labels");
      state.dirty = true;
      updateStatus();
      if (embedded) void saveToCard(state.stage);
    } catch (error) {
      console.warn("Noven terrain derive failed", error);
      status("高度已改，地理重算失败", true);
    }
  }

  function queueHeightPaint(event) {
    state.heightEvent = { clientX: event.clientX, clientY: event.clientY };
    if (state.heightFrame !== 0) return;
    state.heightFrame = window.requestAnimationFrame(() => {
      state.heightFrame = 0;
      const pending = state.heightEvent;
      state.heightEvent = null;
      if (pending !== null) paintHeightAt(pending);
    });
  }

  function flushHeightPaint() {
    if (state.heightFrame !== 0) window.cancelAnimationFrame(state.heightFrame);
    state.heightFrame = 0;
    const pending = state.heightEvent;
    state.heightEvent = null;
    if (pending !== null) paintHeightAt(pending);
  }

  function paintHeightAt(event) {
    if (!isHeightBrush()) return;
    const spot = gridPoint(event);
    if (spot === undefined) return;
    if (state.baseView !== "height") {
      state.baseView = "height";
      state.baseMode = "height";
      applyViews();
      renderViews();
    }
    const grid = window.grid;
    if (!grid?.cells?.i?.length) return;
    const radius = state.brushSize;
    const cells = [];
    for (const cell of grid.cells.i) {
      const [cx, cy] = grid.points[cell];
      if (Math.hypot(cx - spot.x, cy - spot.y) <= radius) cells.push(cell);
    }
    if (cells.length === 0) return;
    const cursor = window.Grid?.findCell?.(spot.x, spot.y);
    const targetHeight = cursor === undefined ? 30 : grid.cells.h[cursor];
    const before = cells.map(cell => ({ cell, h: grid.cells.h[cell] }));
    if (state.heightStroke !== null) {
      for (const item of before) {
        if (!state.heightStroke.has(item.cell)) state.heightStroke.set(item.cell, item.h);
      }
    }
    const step = Math.max(1, Math.round(state.brushPower / 2));
    for (const cell of cells) {
      const height = grid.cells.h[cell];
      if (state.heightMode === "raise") grid.cells.h[cell] = Math.min(100, height + step);
      else if (state.heightMode === "lower") grid.cells.h[cell] = Math.max(0, height - step);
      else if (state.heightMode === "flatten") grid.cells.h[cell] = targetHeight;
      else if (state.heightMode === "smooth") {
        const neighbors = grid.cells.c?.[cell] ?? [];
        if (neighbors.length > 0) {
          let sum = 0;
          for (const neighbor of neighbors) sum += grid.cells.h[neighbor];
          grid.cells.h[cell] = Math.round(sum / neighbors.length);
        }
      } else if (state.heightMode === "disrupt") {
        grid.cells.h[cell] = Math.max(0, Math.min(100, height + Math.round((Math.random() * 2 - 1) * state.brushPower)));
      }
    }
    state.painted = true;
    state.dirty = true;
    paintHeightPreview(cells);
    document.dispatchEvent(new CustomEvent("noven:heightmap-changed"));
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => {
      if (embedded && state.dirty) void saveToCard(state.stage);
    }, 600);
  }

  function undoHeight() {
    const batch = state.heightHistory.pop();
    if (batch === undefined) return false;
    const grid = window.grid;
    if (!grid?.cells?.h) return false;
    for (const { cell, h } of batch.before) grid.cells.h[cell] = h;
    state.dirty = true;
    paintHeightPreview(batch.before.map(item => item.cell));
    showHeightView();
    scheduleTerrainUpdate();
    document.dispatchEvent(new CustomEvent("noven:heightmap-changed"));
    updateStatus();
    if (embedded) void saveToCard(state.stage);
    toast("已撤销一笔高度");
    return true;
  }

  function sizeRow() {
    const size = document.createElement("label");
    size.className = "nv-size";
    size.textContent = "大小";
    const range = document.createElement("input");
    range.type = "range";
    range.min = "10";
    range.max = "90";
    range.value = String(state.brushSize);
    range.addEventListener("input", () => {
      state.brushSize = Number(range.value);
    });
    size.appendChild(range);
    return size;
  }

  function renderOverlayBrush(kind, eraseTool) {
    const isState = kind === "states";
    const items = isState ? liveStates() : liveCultures();
    const targetId = isState ? state.targetState : state.targetCulture;
    const target = items.find(item => item.i === targetId);
    inspectorTitle(eraseTool ? "擦除" : isState ? "国家笔" : "文化笔", eraseTool ? "拖动擦掉当前覆盖层；⌘Z 撤销。" : "选目标，拖动涂抹；单击选中并命名；Shift+拖擦除。");

    const targets = document.createElement("div");
    targets.className = "nv-targets vertical";
    for (const item of items) {
      const button = makeButton("", "nv-target", () => {
        if (isState) state.targetState = item.i;
        else state.targetCulture = item.i;
        state.brushLayer = kind;
        state.overlays = { states: isState, cultures: !isState };
        renderViews();
        applyViews();
        renderInspector();
        updateStatus();
      });
      button.dataset.id = String(item.i);
      button.classList.toggle("active", item.i === targetId);
      const swatch = document.createElement("i");
      swatch.className = "nv-swatch";
      swatch.style.background = item.color || "#999";
      const name = document.createElement("span");
      name.textContent = entityName(item.name);
      button.append(swatch, name);
      targets.appendChild(button);
    }
    if (eraseTool) {
      targets.appendChild(makeButton("＋", "nv-target nv-target-add", () => void createTarget(kind)));
    } else {
      targets.appendChild(makeButton("＋", "nv-target nv-target-add", () => void createTarget(kind)));
    }
    ui.inspectorTool.appendChild(targets);

    if (!eraseTool) {
      const row = document.createElement("div");
      row.className = "nv-brush-row";
      const paint = makeButton("涂", "nv-mode", () => { state.brushMode = "paint"; renderInspector(); });
      const erase = makeButton("擦", "nv-mode", () => { state.brushMode = "erase"; state.tool = "erase"; renderInspector(); });
      paint.classList.toggle("active", state.brushMode !== "erase");
      erase.classList.toggle("active", state.brushMode === "erase");
      row.append(paint, erase);
      const color = document.createElement("input");
      color.type = "color";
      color.title = "当前对象的颜色";
      color.value = target?.color || "#6a4c93";
      color.disabled = target === undefined;
      color.addEventListener("change", () => {
        if (target !== undefined) recolorTarget(kind, target.i, color.value);
      });
      row.appendChild(color);
      ui.inspectorTool.appendChild(row);
    }
    ui.inspectorTool.appendChild(sizeRow());
  }

  function renderSelection() {
    if (ui === null) return;
    const selected = state.selected;
    ui.inspectorSelection.replaceChildren();
    ui.inspectorSelection.hidden = selected === null;
    if (selected === null) return;
    const head = document.createElement("div");
    head.className = "nv-inspector-head";
    const title = document.createElement("strong");
    title.textContent = selected.kind === "states" ? "国家" : selected.kind === "cultures" ? "文化" : "底层";
    head.appendChild(title);
    ui.inspectorSelection.appendChild(head);

    if (selected.kind === "base") {
      const facts = document.createElement("div");
      facts.className = "nv-selection-facts";
      const height = Number(window.pack?.cells?.h?.[selected.cell]) || 0;
      for (const [key, value] of [["高度", String(Math.round(height))], ["地形", heightBand(height)], ["群系", biomeText(selected.cell)], ["面积", areaText(patchArea(selected.cell))]]) {
        const row = document.createElement("div");
        const k = document.createElement("span"); k.textContent = key;
        const v = document.createElement("b"); v.textContent = value;
        row.append(k, v);
        facts.appendChild(row);
      }
      ui.inspectorSelection.appendChild(facts);
      return;
    }

    const isState = selected.kind === "states";
    const item = isState ? window.pack?.states?.[selected.id] : window.pack?.cultures?.[selected.id];
    if (!item || item.removed) {
      state.selected = null;
      ui.inspectorSelection.hidden = true;
      return;
    }
    const facts = document.createElement("div");
    facts.className = "nv-selection-facts";
    const rows = isState
      ? [["面积", areaText(stateArea(item))]]
      : [["面积", areaText(cultureArea(item))], ["覆盖国家", cultureStates(item)]];
    for (const [key, value] of rows) {
      const row = document.createElement("div");
      const k = document.createElement("span"); k.textContent = key;
      const v = document.createElement("b"); v.textContent = value;
      row.append(k, v);
      facts.appendChild(row);
    }
    ui.inspectorSelection.appendChild(facts);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "nv-name-input";
    input.placeholder = "未命名";
    input.value = item.name ?? "";
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") input.blur();
    });
    input.addEventListener("blur", () => {
      const text = input.value.trim();
      if (text === "" || text === (item.name ?? "")) return;
      const operations = isState
        ? [{ op: "States.rename", args: [item.i, text] }, { op: "States.setFullName", args: [item.i, text] }]
        : [{ op: "Cultures.rename", args: [item.i, text] }];
      void applyMapOperations(operations).then(() => {
        renderInspector();
        renderSelection();
      });
    });
    ui.inspectorSelection.appendChild(input);
    const colorRow = document.createElement("label");
    colorRow.className = "nv-size";
    colorRow.textContent = "颜色";
    const color = document.createElement("input");
    color.type = "color";
    color.value = item.color || "#6a4c93";
    color.addEventListener("change", () => recolorTarget(isState ? "states" : "cultures", item.i, color.value));
    colorRow.appendChild(color);
    ui.inspectorSelection.appendChild(colorRow);
    markSelectedPath(isState ? "statesBody" : "cults", item.i);
  }

  function markSelectedPath(groupId, id) {
    for (const path of document.querySelectorAll(".nv-selected")) path.classList.remove("nv-selected");
    const prefix = groupId === "statesBody" ? "state" : "culture";
    const path = document.getElementById(`${prefix}${id}`);
    if (path !== null) path.classList.add("nv-selected");
  }

  function closeTerrainBrush() {
    const panel = document.getElementById("brushesPanel");
    if (panel === null) return;
    try {
      window.jQuery?.("#brushesPanel").dialog("close");
    } catch (error) {
      panel.remove();
    }
  }

  function undoCurrent() {
    if (state.tool === "terrain") {
      if (undoHeight()) return;
      const nativeUndo = document.getElementById("undo");
      if (nativeUndo !== null && !nativeUndo.disabled) nativeUndo.click();
      return;
    }
    if (!undoBrush()) {
      const nativeUndo = document.getElementById("undo");
      if (state.brushLayer === "base" && nativeUndo !== null && !nativeUndo.disabled) nativeUndo.click();
    }
  }

  function runCommand(raw) {
    const text = String(raw ?? "").trim();
    if (text === "") return;
    const words = text.split(/\s+/);
    const command = words[0].toLowerCase();
    const rest = words.slice(1);
    if (command === "view") {
      const value = (rest[0] ?? "").toLowerCase();
      if (value === "height" || value === "heightmap" || value === "高度") return setBaseView("height");
      if (value === "render" || value === "geo" || value === "渲染") return setBaseView("geo");
      if (value === "2d" || value === "3d" || value === "globe" || value === "球体") return setViewMode(value === "球体" ? "globe" : value);
      toast("view 支持 height / render / 2d / 3d / globe");
      return;
    }
    if (command === "tool") {
      const value = (rest[0] ?? "").toLowerCase();
      const map = { select: "select", pan: "pan", zoom: "zoom", terrain: "terrain", geo: "geo", state: "states", states: "states", culture: "cultures", cultures: "cultures", erase: "erase" };
      if (map[value] === undefined) {
        toast("tool 支持 select / pan / zoom / terrain / geo / states / cultures / erase");
        return;
      }
      void setTool(map[value]);
      return;
    }
    if (command === "zoom") {
      const value = (rest[0] ?? "").toLowerCase();
      if (value === "fit" || value === "适应") return fitAll();
      if (value === "in" || value === "+") return zoomBy(1.35);
      if (value === "out" || value === "-") return zoomBy(1 / 1.35);
      const percent = Number.parseFloat(value);
      if (Number.isFinite(percent)) {
        try { window.setMapZoom?.(fitScale() * (percent / 100)); } catch (error) { console.warn("Noven zoom failed", error); }
        window.setTimeout(updateZoomLabel, 80);
        return;
      }
      toast("zoom 支持 fit / in / out / 200%");
      return;
    }
    if (command === "undo") return undoCurrent();
    if (command === "fill") {
      const kind = (rest[0] ?? "").toLowerCase();
      const name = rest.slice(1).join(" ");
      if (name === "") {
        toast("fill 需要目标，例如 fill state 3 / fill culture 1 / fill geo Grassland");
        return;
      }
      if (kind === "geo") {
        const biome = (window.pack?.biomes ?? []).find(item => item.i && !item.removed && (item.name.toLowerCase() === name.toLowerCase() || BIOME_ZH[item.name] === name));
        if (biome === undefined) {
          toast("没有这个地理类型");
          return;
        }
        void applyMapOperations([{ op: "Noven.fillGeography", args: [biome.name, 0.5, 0.5, 0.06] }]);
        return;
      }
      if (kind === "state" || kind === "states") {
        void applyMapOperations([{ op: "Noven.fillState", args: [Number(name), 0.5, 0.5, 0.06] }]);
        return;
      }
      if (kind === "culture" || kind === "cultures") {
        void applyMapOperations([{ op: "Noven.fillCulture", args: [Number(name), 0.5, 0.5, 0.06] }]);
        return;
      }
      toast("fill 支持 geo / state / culture");
      return;
    }
    if (command === "name") {
      const kind = (rest[0] ?? "").toLowerCase();
      const id = Number(rest[1]);
      const name = rest.slice(2).join(" ");
      if (!Number.isFinite(id) || name === "") {
        toast("name 语法：name state 3 坎特伯雷");
        return;
      }
      if (kind === "state" || kind === "states") {
        void applyMapOperations([{ op: "Noven.nameState", args: [id, name] }]);
        return;
      }
      if (kind === "culture" || kind === "cultures") {
        void applyMapOperations([{ op: "Noven.nameCulture", args: [id, name] }]);
        return;
      }
      toast("name 支持 state / culture");
      return;
    }
    toast(`不认得的命令：${command}`);
  }

  async function createTarget(kind) {
    if (await ensureSurface() === false) return;
    const pack = window.pack;
    const cell = findLandCell();
    if (cell === undefined) {
      toast("还没有陆地");
      return;
    }
    const [x, y] = pack.cells.p[cell];
    try {
      const id = kind === "states" ? window.States.add(x, y) : window.Cultures.add(x, y);
      const item = kind === "states" ? pack.states[id] : pack.cultures[id];
      if (item) {
        item.name = "";
        if ("fullName" in item) item.fullName = "";
        if (item.label) item.label.text = "";
        const color = OVERLAY_COLORS[id % OVERLAY_COLORS.length];
        if (kind === "states") window.States.recolor(id, color);
        else window.Cultures.recolor(id, color);
        if (kind === "states") {
          state.targetState = id;
          const capital = pack.states[id]?.capital;
          const burg = capital ? pack.burgs?.[capital] : undefined;
          if (burg) {
            burg.name = "";
            if (burg.label) burg.label.text = "";
          }
        } else {
          state.targetCulture = id;
        }
      }
      state.overlays = { states: kind === "states", cultures: kind === "cultures" };
      state.brushLayer = kind;
      state.dirty = true;
      renderViews();
      applyViews();
      renderBrush();
      updateStatus();
      if (embedded) void saveToCard(state.stage);
    } catch (error) {
      status("新建失败", true);
      toast(String(error?.message ?? error));
      console.error("Noven new overlay failed", error);
    }
  }

  function recolorTarget(kind, id, color) {
    try {
      if (kind === "states") window.States.recolor(id, color);
      else window.Cultures.recolor(id, color);
      state.dirty = true;
      applyViews();
      updateStatus();
      if (embedded) void saveToCard(state.stage);
    } catch (error) {
      status("改色失败", true);
      console.error("Noven recolor failed", error);
    }
  }

  function findLandCell() {
    const pack = window.pack;
    const cells = pack?.cells;
    if (!cells?.i?.length) return undefined;
    const blocked = new Set();
    for (const item of pack.states ?? []) {
      if (!item?.i || item.removed) continue;
      blocked.add(item.center);
      const capital = pack.burgs?.[item.capital];
      if (capital) blocked.add(capital.cell);
    }
    const usable = cells.i.find(cell => cells.h[cell] >= 20 && !blocked.has(cell));
    if (usable !== undefined) return usable;
    return cells.i.find(cell => cells.h[cell] >= 20);
  }

  function findBrushCells(x, y, radius) {
    const pack = window.pack;
    const cells = pack?.cells;
    if (!cells?.i?.length) return [];
    const found = [];
    for (const cell of cells.i) {
      if (cells.h[cell] < 20) continue;
      const [cx, cy] = cells.p[cell];
      if (Math.hypot(cx - x, cy - y) <= radius) found.push(cell);
    }
    return found;
  }

  function isOverlayBrush() {
    return (state.brushLayer === "states" && state.overlays.states) || (state.brushLayer === "cultures" && state.overlays.cultures);
  }

  function isPaintBrush() {
    return isOverlayBrush() || (state.brushLayer === "base" && state.baseMode === "geo");
  }

  function insideViewbox(event) {
    return event.target instanceof Element && event.target.closest("#viewbox, #map") !== null;
  }

  function paintAt(event) {
    if (!isPaintBrush()) return;
    const spot = mapPoint(event);
    if (spot === undefined) return;
    if (state.brushLayer === "base" && state.baseMode === "geo" && state.baseView !== "geo") {
      state.baseView = "geo";
      applyViews();
      renderViews();
    }
    const kind = state.brushLayer === "base" ? "biomes" : state.brushLayer;
    const target = kind === "biomes" ? state.targetBiome : kind === "states" ? state.targetState : state.targetCulture;
    if (!target) {
      if (kind !== "biomes") void createTarget(kind);
      return;
    }
    const erase = kind !== "biomes" && (state.brushMode === "erase" || event.shiftKey === true);
    const cells = findBrushCells(spot.x, spot.y, state.brushSize);
    if (cells.length === 0) return;
    state.painted = true;
    for (const cell of cells) {
      if (erase) state.paintPending.erase.add(cell);
      else state.paintPending.paint.add(cell);
    }
    state.paintDirty = true;
    if (state.paintTimer === 0) state.paintTimer = window.setTimeout(flushPaint, 70);
  }

  function flushPaint() {
    if (state.paintTimer !== 0) {
      window.clearTimeout(state.paintTimer);
      state.paintTimer = 0;
    }
    if (!state.paintDirty) return;
    state.paintDirty = false;
    const pending = state.paintPending;
    state.paintPending = { paint: new Set(), erase: new Set() };
    const kind = state.brushLayer === "base" ? "biomes" : state.brushLayer;
    const target = kind === "biomes" ? state.targetBiome : kind === "states" ? state.targetState : state.targetCulture;
    const pack = window.pack;
    if (!target || !pack?.cells?.i?.length) return;
    const touched = new Set([...pending.paint, ...pending.erase]);
    const before = [...touched].map(cell => ({
      cell,
      value: kind === "biomes" ? pack.cells.biome[cell] : kind === "states" ? pack.cells.state[cell] : pack.cells.culture[cell]
    }));
    try {
      if (pending.paint.size > 0) {
        const cells = [...pending.paint].filter(cell => {
          if (kind === "biomes") return pack.cells.biome[cell] !== target;
          if (kind === "states") {
            if (pack.cells.state[cell] === target) return false;
            const owner = pack.cells.state[cell];
            return pack.states?.[owner]?.center !== cell;
          }
          if (pack.cells.culture[cell] === target) return false;
          const owner = pack.cells.culture[cell];
          return pack.cultures?.[owner]?.center !== cell;
        });
        if (cells.length > 0) {
          if (kind === "biomes") window.Biomes.setCells(target, cells);
          else if (kind === "states") window.States.setCells(target, cells);
          else window.Cultures.setCells(target, cells);
        }
      }
      if (pending.erase.size > 0 && kind !== "biomes") {
        for (const cell of pending.erase) {
          if (kind === "states" && pack.cells.state[cell] === target) {
            pack.cells.state[cell] = 0;
            const burg = pack.burgs?.[pack.cells.burg?.[cell]];
            if (burg) burg.state = 0;
          } else if (kind === "cultures" && pack.cells.culture[cell] === target) {
            pack.cells.culture[cell] = 0;
            const burg = pack.burgs?.[pack.cells.burg?.[cell]];
            if (burg) burg.culture = 0;
          }
        }
      }
      if (kind !== "biomes") recomputeOverlay(kind);
      const changed = before.filter(item => {
        const value = kind === "biomes" ? pack.cells.biome[item.cell] : kind === "states" ? pack.cells.state[item.cell] : pack.cells.culture[item.cell];
        return value !== item.value;
      });
      if (changed.length > 0) {
        state.brushHistory.push({ kind, before: changed });
        if (state.brushHistory.length > 40) state.brushHistory.shift();
      }
      state.dirty = true;
      window.Layers?.draw?.("states", "borders", "cultures", "labels", "biomes");
      updateStatus();
      updatePrimary();
      window.clearTimeout(state.saveTimer);
      state.saveTimer = window.setTimeout(() => {
        if (embedded && state.dirty) void saveToCard(state.stage);
      }, 600);
    } catch (error) {
      console.warn("Noven overlay paint failed", error);
      toast("这一笔没涂上");
    }
  }

  function recomputeOverlay(kind) {
    const pack = window.pack;
    if (!pack?.cells?.i?.length) return;
    const items = kind === "states" ? pack.states : pack.cultures;
    for (const item of items ?? []) {
      if (!item?.i || item.removed) continue;
      item.area = 0;
      item.cells = 0;
    }
    for (const cell of pack.cells.i) {
      const id = kind === "states" ? pack.cells.state[cell] : pack.cells.culture[cell];
      if (id <= 0) continue;
      const item = items?.[id];
      if (!item || item.removed) continue;
      item.area = (Number(item.area) || 0) + (Number(pack.cells.area?.[cell]) || 0);
      item.cells = (Number(item.cells) || 0) + 1;
    }
  }

  function undoBrush() {
    if (!isPaintBrush()) return false;
    const batch = state.brushHistory.pop();
    if (batch === undefined) {
      toast("没有可撤销的笔画");
      return false;
    }
    const pack = window.pack;
    if (!pack?.cells?.i?.length) return false;
    for (const { cell, value } of batch.before) {
      if (batch.kind === "biomes") {
        pack.cells.biome[cell] = value;
      } else if (batch.kind === "states") {
        pack.cells.state[cell] = value;
        const burg = pack.burgs?.[pack.cells.burg?.[cell]];
        if (burg) burg.state = value;
      } else {
        pack.cells.culture[cell] = value;
        const burg = pack.burgs?.[pack.cells.burg?.[cell]];
        if (burg) burg.culture = value;
      }
    }
    if (batch.kind !== "biomes") recomputeOverlay(batch.kind);
    state.dirty = true;
    window.Layers?.draw?.("states", "borders", "cultures", "labels", "biomes");
    updateStatus();
    updatePrimary();
    if (embedded) void saveToCard(state.stage);
    toast("已撤销一笔");
    return true;
  }

  function selectBase(spot) {
    state.selected = { kind: "base", cell: spot.cell };
    state.inspectorClosed = false;
    state.inspectorCollapsed = false;
    renderInspector();
  }

  // ---------- selection cards ----------

  function closeCard() {
    if (ui === null || ui.card === null) return;
    ui.card.hidden = true;
    state.card = null;
  }

  function entityName(name) {
    const text = typeof name === "string" ? name.trim() : "";
    return text === "" || text === PLACEHOLDER_LABEL ? "未命名" : text;
  }

  function openCard(ref) {
    if (ui === null) return;
    ui.card.hidden = false;
    ui.cardKind.textContent = ref.kind;
    const shown = entityName(ref.name);
    ui.cardName.textContent = shown;
    ui.cardFacts.replaceChildren();
    for (const [label, value] of ref.facts ?? []) {
      if (value === undefined || value === null || value === "") continue;
      const row = document.createElement("div");
      row.className = "nv-card-fact";
      const key = document.createElement("span");
      key.textContent = label;
      const data = document.createElement("b");
      data.textContent = value;
      row.append(key, data);
      ui.cardFacts.appendChild(row);
    }
    ui.cardInput.value = shown === "未命名" ? "" : shown;
    ui.cardInput.placeholder = ref.placeholder ?? "未命名";
    ui.cardInput.disabled = ref.readOnly === true;
    ui.cardHint.textContent = ref.hint ?? "";
    state.card = {
      name: shown === "未命名" ? "" : shown,
      allowEmpty: ref.allowEmpty !== false,
      submit: ref.onSubmit
    };
    ui.cardInput.onkeydown = event => {
      if (event.key === "Escape") {
        closeCard();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        ui.cardInput.blur();
      }
    };
    ui.cardInput.onblur = () => {
      const current = state.card;
      if (current === null) return;
      const value = ui.cardInput.value.trim();
      if (value === (current.name ?? "").trim()) return;
      if (value === "" && current.allowEmpty === false) {
        ui.cardInput.value = current.name ?? "";
        return;
      }
      current.name = value;
      ui.cardName.textContent = entityName(value);
      Promise.resolve(current.submit?.(value)).catch(error => {
        status("修改失败", true);
        toast(String(error?.message ?? error));
        console.error("Noven card submit failed", error);
      });
    };
  }

  async function applyMapOperations(operations) {
    if (!state.ready) return;
    try {
      window.novenMap.applyOperations(operations, state.undoKey);
      state.dirty = true;
      refreshAi();
      updatePrimary();
      updateCounts();
      redrawNames();
      if (embedded) await saveToCard(state.stage);
    } catch (error) {
      status("修改失败", true);
      toast(String(error?.message ?? error));
      console.error("Noven map operation failed", error);
      throw error;
    }
  }

  function redrawNames() {
    try {
      window.Layers?.draw?.("states", "provinces", "burgLabels", "burgIcons", "labels", "lakes", "rivers", "markers", "zones");
    } catch (error) {
      console.warn("Noven name redraw failed", error);
    }
  }

  function areaText(raw) {
    const units = window.options?.map?.units;
    const scale = Number(units?.distance?.scale) || 1;
    const unit = units?.area?.unit && units.area.unit !== "square"
      ? units.area.unit
      : `${units?.distance?.unit ?? "格"}²`;
    const value = Math.max(0, Number(raw) || 0) * scale * scale;
    const number = value >= 1000 ? Math.round(value).toLocaleString("zh-CN") : value.toFixed(value >= 10 ? 0 : 1);
    return `${number} ${unit}`;
  }

  function latitudeBand(cell) {
    const height = Number(window.options?.map?.graph?.height) || 1;
    const y = Number(window.pack?.cells?.p?.[cell]?.[1]) || 0;
    const ratio = y / height;
    if (ratio < 0.2 || ratio > 0.8) return "高纬 · 寒";
    if (ratio < 0.35 || ratio > 0.65) return "中纬 · 温";
    return "低纬 · 热";
  }

  function heightBand(height) {
    if (height < 20) return "海面";
    if (height < 35) return "低地";
    if (height < 50) return "丘陵";
    if (height < 65) return "高地";
    if (height < 80) return "山地";
    return "高山";
  }

  function biomeText(cell) {
    const pack = window.pack;
    const biome = pack?.biomes?.[pack?.cells?.biome?.[cell]];
    if (biome === undefined) return "";
    return BIOME_ZH[biome.name] ?? biome.name ?? "";
  }

  function patchArea(cell) {
    const pack = window.pack;
    const biome = pack?.cells?.biome?.[cell];
    if (biome === undefined) return 0;
    const seen = new Set([cell]);
    const queue = [cell];
    let area = 0;
    while (queue.length > 0) {
      const current = queue.pop();
      area += Number(pack.cells.area?.[current]) || 0;
      for (const neighbor of pack.cells.c?.[current] ?? []) {
        if (seen.has(neighbor) || pack.cells.biome?.[neighbor] !== biome) continue;
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
    return area;
  }

  function stateArea(item) {
    if (Number.isFinite(item?.area)) return item.area;
    const cells = window.pack?.cells;
    let area = 0;
    for (const cell of cells?.i ?? []) if (cells.state?.[cell] === item.i) area += Number(cells.area?.[cell]) || 0;
    return area;
  }

  function cultureArea(item) {
    if (Number.isFinite(item?.area)) return item.area;
    const cells = window.pack?.cells;
    let area = 0;
    for (const cell of cells?.i ?? []) if (cells.culture?.[cell] === item.i) area += Number(cells.area?.[cell]) || 0;
    return area;
  }

  function cultureStates(item) {
    const pack = window.pack;
    const ids = new Set();
    for (const cell of pack?.cells?.i ?? []) {
      if (pack.cells.culture?.[cell] !== item.i) continue;
      const stateId = pack.cells.state?.[cell] ?? 0;
      if (stateId > 0) ids.add(stateId);
    }
    const names = [...ids].map(id => entityName(pack.states?.[id]?.name)).filter(name => name !== "未命名");
    return names.length > 0 ? names.join("、") : "无";
  }

  let gridToPack = new Map();
  let gridToPackSource = null;

  function packCellForGrid(gridCell) {
    const cells = window.pack?.cells;
    if (!cells?.i || !cells.g) return undefined;
    if (gridToPackSource !== cells.g) {
      gridToPack = new Map();
      for (const cell of cells.i) gridToPack.set(cells.g[cell], cell);
      gridToPackSource = cells.g;
    }
    return gridToPack.get(gridCell);
  }

  function mapPoint(event) {
    const viewbox = document.getElementById("viewbox");
    const svg = document.getElementById("map");
    if (viewbox === null || svg === null || typeof svg.createSVGPoint !== "function") return undefined;
    const ctm = viewbox.getScreenCTM();
    if (ctm === null) return undefined;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    const gridCell = window.Grid?.findCell?.(local.x, local.y);
    if (gridCell === undefined) return undefined;
    const cell = packCellForGrid(gridCell);
    if (cell === undefined) return undefined;
    return { cell, x: local.x, y: local.y };
  }

  function selectMapPoint(event) {
    ensurePackCollections();
    const spot = mapPoint(event);
    if (spot === undefined) return;
    if (state.tool === "terrain" || state.tool === "pan" || state.tool === "zoom") return;
    if (state.tool === "states") return selectState(spot);
    if (state.tool === "cultures") return selectCulture(spot);
    if (state.tool === "geo") return selectBase(spot);
    const pack = window.pack;
    if (state.overlays.states) {
      const stateId = pack?.cells?.state?.[spot.cell] ?? 0;
      if (stateId > 0) return selectState(spot);
    }
    if (state.overlays.cultures) {
      const cultureId = pack?.cells?.culture?.[spot.cell] ?? 0;
      if (cultureId > 0) return selectCulture(spot);
    }
    return selectBase(spot);
  }

  function selectState(spot) {
    const pack = window.pack;
    const stateId = pack?.cells?.state?.[spot.cell] ?? 0;
    const item = stateId > 0 ? pack.states?.[stateId] : undefined;
    if (!item || item.removed) {
      state.selected = { kind: "base", cell: spot.cell };
      renderInspector();
      return;
    }
    state.targetState = item.i;
    state.selected = { kind: "states", id: item.i };
    state.inspectorClosed = false;
    state.inspectorCollapsed = false;
    renderInspector();
    updateStatus();
  }

  function selectCulture(spot) {
    const pack = window.pack;
    const cultureId = pack?.cells?.culture?.[spot.cell] ?? 0;
    const item = cultureId > 0 ? pack.cultures?.[cultureId] : undefined;
    if (!item || item.removed) {
      state.selected = { kind: "base", cell: spot.cell };
      renderInspector();
      return;
    }
    state.targetCulture = item.i;
    state.selected = { kind: "cultures", id: item.i };
    state.inspectorClosed = false;
    state.inspectorCollapsed = false;
    renderInspector();
    updateStatus();
  }

  // ---------- layers ----------

  function openLayers() {
    closeSettings();
    closeGeneration();
    state.panel = "layers";
    ui.panelTitle.textContent = "图层";
    ui.panel.hidden = false;
    renderLayers();
  }

  function renderLayers() {
    ui.panelBody.replaceChildren();

    const presetWrap = document.createElement("div");
    presetWrap.className = "nv-preset";
    const preset = document.createElement("select");
    preset.setAttribute("aria-label", "图层预设");
    for (const [value, label] of PRESETS) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      preset.appendChild(option);
    }
    const hiddenPreset = document.getElementById("layersPreset");
    preset.value = hiddenPreset !== null && PRESETS.some(([value]) => value === hiddenPreset.value)
      ? hiddenPreset.value
      : "political";
    preset.addEventListener("change", () => {
      if (hiddenPreset === null) return;
      hiddenPreset.value = preset.value;
      hiddenPreset.dispatchEvent(new Event("change", { bubbles: true }));
      window.setTimeout(renderLayers, 120);
    });
    presetWrap.appendChild(preset);
    ui.panelBody.appendChild(presetWrap);

    const view = document.createElement("div");
    view.className = "nv-view";
    for (const [id, label] of [["viewStandard", "标准"], ["viewMesh", "3D"], ["viewGlobe", "球体"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.classList.toggle("active", Boolean(document.getElementById(id)?.classList.contains("pressed")));
      button.addEventListener("click", () => {
        document.getElementById(id)?.click();
        window.setTimeout(renderLayers, 260);
      });
      view.appendChild(button);
    }
    ui.panelBody.appendChild(view);

    for (const group of LAYER_GROUPS) {
      const details = document.createElement("details");
      details.className = "nv-group";
      details.open = group.id === "culture" || group.id === "geo";
      const summary = document.createElement("summary");
      summary.textContent = group.label;
      details.appendChild(summary);

      for (const [id, label] of group.ids) {
        let on = true;
        try { on = window.Layers?.isOn?.(id) !== false; } catch { on = true; }
        const row = document.createElement("div");
        row.className = `nv-layer-row${on ? "" : " off"}`;
        const eye = document.createElement("button");
        eye.type = "button";
        eye.className = "nv-eye";
        eye.title = on ? "隐藏" : "显示";
        eye.innerHTML = on
          ? '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M1.8 9s2.6-4.2 7.2-4.2S16.2 9 16.2 9s-2.6 4.2-7.2 4.2S1.8 9 1.8 9Z"/><circle cx="9" cy="9" r="2.1"/></svg>'
          : '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M1.8 9s2.6-4.2 7.2-4.2S16.2 9 16.2 9s-2.6 4.2-7.2 4.2S1.8 9 1.8 9Z"/><circle cx="9" cy="9" r="2.1"/><path d="m3 15 12-12"/></svg>';
        eye.addEventListener("click", event => {
          event.stopPropagation();
          try { window.Layers?.toggle?.(id); } catch (error) { console.warn("Noven layer toggle failed", error); }
          renderLayers();
        });
        const name = document.createElement("span");
        name.className = "nv-layer-name";
        name.textContent = label;
        row.append(eye, name);
        details.appendChild(row);
      }
      ui.panelBody.appendChild(details);
    }
  }

  // ---------- AI history ----------

  function openAi() {
    closeSettings();
    closeGeneration();
    state.panel = "ai";
    ui.panelTitle.textContent = "改动记录";
    ui.panel.hidden = false;
    renderAi();
  }

  function renderAi() {
    ui.panelBody.replaceChildren();
    const note = document.createElement("p");
    note.className = "nv-ai-note";
    note.textContent = "命名、涂层、AI 改图都会记成一批。这里可以整批回退。";
    ui.panelBody.appendChild(note);

    const count = aiUndoCount();
    const box = document.createElement("div");
    box.className = "nv-ai-state";
    const title = document.createElement("strong");
    title.textContent = count > 0 ? `可撤销 ${count} 批` : "暂无改动";
    const body = document.createElement("span");
    body.textContent = count > 0 ? "撤销会整批回退上一次改动。" : "地图当前没有被修改过的批次。";
    box.append(title, body);
    ui.panelBody.appendChild(box);

    if (count > 0) {
      const undo = document.createElement("button");
      undo.type = "button";
      undo.className = "nv-ai-undo";
      undo.textContent = "撤销上一批";
      undo.addEventListener("click", undoAi);
      ui.panelBody.appendChild(undo);
    }
  }

  function aiUndoCount() {
    try { return window.novenMap?.undoCount?.(state.undoKey) ?? 0; } catch { return 0; }
  }

  function refreshAi() {
    if (state.panel === "ai") renderAi();
  }

  function undoAi() {
    try {
      const result = window.novenMap?.undoOperations?.(state.undoKey);
      if (result === null || result === undefined) {
        toast("没有可撤销的 AI 改动");
        return;
      }
      state.dirty = true;
      status(`已撤销 AI 改动 · ${result.undone} 项`);
      renderAi();
      updatePrimary();
      updateCounts();
    } catch (error) {
      status("撤销失败", true);
      console.error("Noven AI undo failed", error);
    }
  }

  // ---------- menu / settings ----------

  function runMenuAction(action) {
    switch (action) {
      case "layers":
        openLayers();
        return;
      case "ai":
        openAi();
        return;
      case "generate":
        if (state.stage === "blank") {
          toast("先定稿地形，再生成人文层");
          return;
        }
        openGeneration();
        return;
      case "settings":
        openSettings();
        return;
      case "fullscreen":
        toggleFullscreen();
        return;
      default:
        return;
    }
  }

  function armConfirm(button, action) {
    if (button.dataset.confirm === "1") {
      button.dataset.confirm = "";
      button.textContent = action === "blank" ? "重开海面" : "随机世界";
      ui.menu.hidden = true;
      if (action === "blank") void startBlank({ fresh: true });
      else void generateMap({ template: "continents", seed: `noven-${Date.now()}`, width: 1280, height: 800, points: 10000 });
      return;
    }
    const original = button.textContent;
    button.dataset.confirm = "1";
    button.textContent = "再点一次确认";
    window.clearTimeout(state.confirmTimer);
    state.confirmTimer = window.setTimeout(() => {
      if (!button.isConnected) return;
      button.dataset.confirm = "";
      button.textContent = original;
    }, 3000);
  }

  function openSettings() {
    closePanel();
    closeGeneration();
    document.body.classList.add("nv-options-open");
    try {
      window.showOptions?.();
      document.getElementById("optionsTab")?.click();
    } catch (error) {
      console.warn("Noven settings failed to open", error);
      toast("地图设置没有打开");
    }
  }

  function closeSettings() {
    if (!document.body.classList.contains("nv-options-open")) return;
    document.body.classList.remove("nv-options-open");
    try { window.hideOptions?.(); } catch { /* options may not be open */ }
  }

  function toggleFullscreen() {
    if (embedded) {
      post("noven-map-fullscreen-toggle");
      return;
    }
    if (document.fullscreenElement === null) void document.documentElement.requestFullscreen?.();
    else void document.exitFullscreen?.();
  }

  // ---------- generation ----------

  function openGeneration() {
    if (state.stage !== "terrain" && state.stage !== "world") return;
    closePanel();
    closeSettings();
    ui.genRun.textContent = state.stage === "world" ? "重新生成人文层" : "生成人文层";
    ui.genCancel.textContent = state.stage === "world" ? "取消" : "只保留地形";
    ui.gen.hidden = false;
  }

  function closeGeneration() {
    if (ui !== null) ui.gen.hidden = true;
  }

  function numberValue(id, fallback) {
    const value = Number(document.getElementById(id)?.value);
    return Number.isFinite(value) ? value : fallback;
  }

  async function runGeneration() {
    const options = {
      states: Math.max(2, Math.round(numberValue("nv-gen-states", 20))),
      provinces: Math.min(1, Math.max(0, numberValue("nv-gen-provinces", 0.5))),
      cultures: Math.max(1, Math.round(numberValue("nv-gen-cultures", 8))),
      religions: Math.max(1, Math.round(numberValue("nv-gen-religions", 6))),
      burgs: Math.max(10, Math.round(numberValue("nv-gen-burgs", 120)))
    };
    const seed = String(document.getElementById("nv-gen-seed")?.value ?? "").trim();
    if (seed !== "") options.seed = seed;
    closeGeneration();
    await generateHuman(options);
  }

  // ---------- drafts ----------

  function encodeHeights(heights) {
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < heights.length; index += chunk) {
      binary += String.fromCharCode(...heights.subarray(index, index + chunk));
    }
    return btoa(binary);
  }

  function decodeHeights(text) {
    const binary = atob(text);
    const heights = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) heights[index] = binary.charCodeAt(index);
    return heights;
  }

  function readDraft(key) {
    if (key === "") return undefined;
    try {
      const draft = JSON.parse(localStorage.getItem(key) ?? "null");
      if (!draft || typeof draft.heights !== "string" || typeof draft.seed !== "string" || draft.seed === "") return undefined;
      return draft;
    } catch {
      return undefined;
    }
  }

  function saveDraft() {
    if (state.draftKey === "" || state.draftMeta === null || window.novenBlank !== true) return;
    const heights = window.grid?.cells?.h;
    if (!heights) return;
    try {
      localStorage.setItem(state.draftKey, JSON.stringify({ ...state.draftMeta, heights: encodeHeights(heights) }));
    } catch (error) {
      console.warn("Noven blank draft could not be saved", error);
    }
  }

  function scheduleDraft() {
    window.clearTimeout(state.draftTimer);
    state.draftTimer = window.setTimeout(saveDraft, 700);
  }

  function clearDraft() {
    window.clearTimeout(state.draftTimer);
    if (state.draftKey !== "") {
      try { localStorage.removeItem(state.draftKey); } catch { /* storage may be unavailable */ }
    }
    state.draftKey = "";
    state.draftMeta = null;
  }

  function restoreDraft(draft) {
    const heights = window.grid?.cells?.h;
    if (!heights) return;
    const restored = decodeHeights(draft.heights);
    if (restored.length !== heights.length) return;
    heights.set(restored);
    paintHeightPreview([...heights.keys()]);
    window.Controllers?.HeightmapEditor?.open?.({ mode: "erase" });
  }

  window.addEventListener("beforeunload", () => {
    if (window.novenBlank === true) saveDraft();
  });

  // ---------- start ----------

  function start() {
    mountStyle();
    mount();
    liftStyle();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
