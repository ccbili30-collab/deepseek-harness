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
  const CSS_VERSION = "1";
  const STYLE_ID = "nv-shell-style";

  const WORLD_GROUPS = [
    {
      id: "politics",
      label: "政治",
      countKey: "states",
      unit: "国",
      rows: [
        { label: "国家", note: "总览 / 编辑", countKey: "states", run: () => openController("StatesEditor") },
        { label: "省份", note: "总览 / 编辑", countKey: "provinces", run: () => openController("ProvincesEditor") },
        { label: "区域", note: "区域图层", countKey: "zones", run: () => openController("ZonesEditor") },
        { label: "外交", note: "关系矩阵", run: () => openController("DiplomacyOverview") },
        { label: "军事", note: "军队与军团", run: () => openController("MilitaryOverview") }
      ]
    },
    {
      id: "culture",
      label: "文化",
      countKey: "cultures",
      unit: "族",
      rows: [
        { label: "文化", note: "总览 / 编辑", countKey: "cultures", run: () => openController("CulturesEditor") },
        { label: "宗教", note: "总览 / 编辑", countKey: "religions", run: () => openController("ReligionsEditor") },
        { label: "语言与名称", note: "命名库", run: () => openController("NamesbaseEditor") },
        { label: "纹章", note: "盾徽与配色", run: () => openController("EmblemsEditor", "openDefault") }
      ]
    },
    {
      id: "geo",
      label: "地理",
      countKey: "biomes",
      unit: "群系",
      rows: [
        { label: "河流", note: "总览 / 编辑", countKey: "rivers", run: () => openController("RiversOverview") },
        { label: "湖泊", note: "湖泊编辑器", countKey: "lakes", run: () => openController("LakesEditor") },
        { label: "海岸线", note: "海岸设置", run: () => openController("CoastlineEditor") },
        { label: "生物群系", note: "颜色与宜居度", countKey: "biomes", run: () => openController("BiomesEditor") },
        { label: "地貌", note: "岛屿与海陆", countKey: "features", run: () => openController("FeaturesOverview") },
        { label: "高程", note: "画笔 / 模板 / 图片", run: () => openController("HeightmapEditor") }
      ]
    },
    {
      id: "settle",
      label: "聚落与经济",
      countKey: "burgs",
      unit: "城",
      rows: [
        { label: "城市", note: "总览 / 编辑", countKey: "burgs", run: () => openController("BurgsOverview") },
        { label: "市场", note: "市场与贸易", countKey: "markets", run: () => openController("MarketsOverview") },
        { label: "商品", note: "资源与图标", countKey: "goods", run: () => openController("GoodsEditor") },
        { label: "贸易", note: "贸易动画", run: () => openController("TradeAnimationEditor") },
        { label: "生产链", note: "商品配方", run: () => openController("ProductionChains") },
        { label: "道路", note: "总览 / 编辑", countKey: "routes", run: () => openController("RoutesOverview") },
        { label: "旅程", note: "旅途与运输", run: () => openController("JourneysOverview") }
      ]
    },
    {
      id: "mark",
      label: "标注",
      countKey: "markers",
      unit: "标记",
      rows: [
        { label: "标记", note: "兴趣点 / 编辑", countKey: "markers", run: () => openController("MarkersOverview") },
        { label: "标签", note: "文字与排版", countKey: "labels", run: () => openController("LabelsOverview") },
        { label: "测量", note: "距离与标尺", run: () => openController("MeasurersEditor") },
        { label: "笔记", note: "实体备注", run: () => openController("NotesEditor") },
        { label: "传说", note: "地图设定", run: () => openController("LoreEditor") }
      ]
    },
    {
      id: "tools",
      label: "工具与视图",
      rows: [
        { label: "单元格", note: "点地图查看", run: () => openController("CellInfo") },
        { label: "图表", note: "统计图", run: () => openController("ChartsOverview") },
        { label: "小地图", note: "导航缩略图", run: () => openController("Minimap") },
        { label: "单位与比例", note: "人口 / 距离", run: () => openController("UnitsEditor") },
        { label: "世界配置", note: "气候与尺寸", run: () => openController("WorldConfigurator") },
        { label: "子地图", note: "从视口生成", run: () => openController("SubmapTool") },
        { label: "变换", note: "旋转 / 缩放", run: () => openController("TransformTool") },
        { label: "包裹", note: "调整格形", run: () => openController("WrapTool") }
      ]
    }
  ];

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
    worldGroup: "politics",
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
        <button type="button" data-stage="blank">白膜</button><i></i>
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
      <div id="nv-actions">
        <button id="nv-world-btn" class="nv-btn" type="button" disabled>世界</button>
        <button id="nv-menu-btn" class="nv-icon" type="button" aria-label="更多" title="更多">⋯</button>
      </div>
      <aside id="nv-panel" hidden>
        <header id="nv-panel-head">
          <strong id="nv-panel-title"></strong>
          <button id="nv-panel-close" type="button" aria-label="收起" title="收起">×</button>
        </header>
        <div id="nv-panel-body"></div>
      </aside>
      <div id="nv-menu" hidden>
        <button type="button" data-menu="layers">图层</button>
        <button type="button" data-menu="ai">AI 改动</button>
        <button type="button" data-menu="generate">生成 / 重建</button>
        <button type="button" data-menu="settings">地图设置</button>
        <hr>
        <button type="button" data-menu="fullscreen">全屏</button>
        <button type="button" data-menu="submap">子地图</button>
        <button type="button" data-menu="transform">变换</button>
        <button type="button" data-menu="wrap">包裹</button>
        <hr>
        <button type="button" data-menu="blank" class="danger">重开白膜</button>
        <button type="button" data-menu="random" class="danger">随机世界</button>
      </div>
      <div id="nv-stagebar">
        ${steps}
        <div id="nv-stage-info">
          <strong id="nv-stage-name">白膜</strong>
          <span id="nv-stage-counts">先涂地形</span>
        </div>
        <button id="nv-brush-btn" type="button">画笔</button>
        <button id="nv-primary" type="button">定稿地形 →</button>
      </div>
      <div id="nv-gen" hidden>
        <section id="nv-gen-card" role="dialog" aria-modal="true" aria-labelledby="nv-gen-title">
          <header id="nv-gen-head">
            <strong id="nv-gen-title">生成人文层</strong>
            <button id="nv-gen-close" type="button" aria-label="关闭" title="关闭">×</button>
          </header>
          <div id="nv-gen-body">
            <div class="nv-gen-grid">${genFields}</div>
            <p class="nv-gen-note">保留已定稿的海岸、河流与地形，只补国家、省份、文化、宗教和城市。已有世界会被重写。</p>
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
          <button id="nv-boot-action" type="button" hidden>重开白膜</button>
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
      worldBtn: byId("nv-world-btn"),
      menuBtn: byId("nv-menu-btn"),
      panel: byId("nv-panel"),
      panelTitle: byId("nv-panel-title"),
      panelBody: byId("nv-panel-body"),
      panelClose: byId("nv-panel-close"),
      menu: byId("nv-menu"),
      stagebar: byId("nv-stagebar"),
      steps: [...root.querySelectorAll("#nv-steps button")],
      stageName: byId("nv-stage-name"),
      stageCounts: byId("nv-stage-counts"),
      brushBtn: byId("nv-brush-btn"),
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
          state.dirty = true;
          updatePrimary();
          updateCounts();
          refreshAi();
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
    ui.worldBtn.addEventListener("click", () => {
      if (ui.panel.hidden === false && state.panel === "world") closePanel();
      else openWorld();
    });
    ui.menuBtn.addEventListener("click", event => {
      event.stopPropagation();
      closePanel();
      closeSettings();
      ui.menu.hidden = !ui.menu.hidden;
    });
    ui.panelClose.addEventListener("click", closePanel);
    ui.brushBtn.addEventListener("click", openBrush);
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
    updateBootCopy("正在等待卡片数据…", "卡片连接后会载入地图或白膜。");
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

  /** The app remembers a viewport from earlier sessions. The workspace owns the
      window, so fit to the current viewport instead of a stored card size. */
  function fitToWindow() {
    try {
      if (window.options?.app) window.options.app.viewport = null;
    } catch (error) {
      console.warn("Noven viewport reset failed", error);
    }
    // The app computes the cover scale from its viewport. Settle the viewport
    // to the window first, then reset zoom, or the map keeps a stale card size.
    window.dispatchEvent(new Event("resize"));
    try {
      window.novenMap?.fit?.();
    } catch (error) {
      console.warn("Noven map fit failed", error);
    }
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
    ui.stageName.textContent = stage === "world" ? "人文" : stage === "terrain" ? "地形" : "白膜";
    ui.worldBtn.disabled = stage !== "world";
    ui.brushBtn.hidden = stage !== "blank";
    if (stage !== "world" && state.panel === "world") closePanel();
    updateCounts();
    updatePrimary();
    if (!options.initial) {
      // A stage transition is a deliberate context switch; do not leave a
      // settings sheet from the previous stage floating over the new one.
      closeSettings();
    }
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
    if (ui === null) return;
    if (state.stage === "blank") {
      const land = landCells();
      ui.stageCounts.textContent = land === 0
        ? "先涂地形"
        : land < 200
          ? `陆地 ${land} / 200`
          : `陆地 ${land} 块 · 可定稿`;
      return;
    }
    if (state.stage === "terrain") {
      ui.stageCounts.textContent = "地形已定稿 · 可生成人文层";
      return;
    }
    const counts = readCounts();
    const saved = state.saving ? " · 保存中" : !embedded ? " · 预览" : state.dirty ? " · 未保存" : " · 已保存";
    ui.stageCounts.textContent = `${counts.states} 国 · ${counts.provinces} 省 · ${counts.burgs} 城${saved}`;
  }

  function updatePrimary() {
    if (ui === null) return;
    if (state.stage === "blank") {
      ui.primary.hidden = false;
      ui.primary.textContent = "定稿地形 →";
      ui.primary.disabled = !state.ready || state.saving;
      return;
    }
    if (state.stage === "terrain") {
      ui.primary.hidden = false;
      ui.primary.textContent = "生成人文层 →";
      ui.primary.disabled = !state.ready || state.saving;
      return;
    }
    ui.primary.hidden = !embedded || !state.dirty;
    ui.primary.textContent = state.saving ? "保存中…" : "保存到卡 →";
    ui.primary.disabled = state.saving;
  }

  function primaryAction() {
    if (state.stage === "blank") void finalizeTerrain();
    else if (state.stage === "terrain") openGeneration();
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
      status("草稿自动保存");
      hideBoot();
      post("noven-map-blank-started");
      window.setTimeout(openBrush, 120);
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
      fitToWindow();
      state.dirty = true;
      setStage("world");
      status("地图已生成");
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

    const viewbox = document.getElementById("viewbox");
    let mapPointer = null;
    viewbox?.addEventListener("mousedown", event => {
      mapPointer = { x: event.clientX, y: event.clientY };
    }, true);
    viewbox?.addEventListener("click", event => {
      const start = mapPointer;
      mapPointer = null;
      if (start === null || state.stage !== "world") return;
      if (document.body.classList.contains("nv-editor-open")) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
      selectMapPoint(event);
    }, true);
  }

  function onTerrainFinalized() {
    if (state.stage === "terrain" || state.stage === "world") return;
    closeBrush();
    clearDraft();
    state.dirty = false;
    setStage("terrain");
    hideNativeLoading();
    fitToWindow();
    status("地形已定稿");
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
          if (data.stage === "terrain") {
            setStage("terrain");
            window.novenMap?.showTerrain?.();
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
    status(draft ? "白膜 · 恢复草稿…" : "白膜 · 准备中…");
    updateBootCopy("正在准备白膜…", "正在建立空白高度图。");
    ui.bootAction.hidden = true;
    ui.boot.hidden = false;
    try {
      await window.novenMap.startBlank({ seed, width, height, points });
      if (draft) restoreDraft(draft);
      hideNativeLoading();
      fitToWindow();
      status(draft ? "草稿已恢复" : "草稿自动保存");
      hideBoot();
      setStage("blank");
    } catch (error) {
      status("白膜启动失败", true);
      updateBootCopy("白膜启动失败", String(error));
      console.error("Noven blank map failed", error);
    }
  }

  async function finalizeTerrain() {
    if (!state.ready || window.novenBlank !== true) return;
    status("定稿中…");
    updatePrimary();
    try {
      await window.novenMap.finalize();
      if (window.novenBlank === true) {
        status("陆地不足 200 块，继续涂", true);
        updatePrimary();
        return;
      }
      onTerrainFinalized();
    } catch (error) {
      status("地形定稿失败", true);
      updatePrimary();
      console.error("Noven terrain finalize failed", error);
    }
  }

  async function generateHuman(options = {}) {
    if (!state.ready || state.stage === "blank") return;
    status("生成人文层中…");
    try {
      await window.novenMap.generateHuman(options);
      hideNativeLoading();
      fitToWindow();
      window.novenMap.clearUndoHistory?.(state.undoKey);
      state.dirty = true;
      setStage("world");
      status("人文层已生成");
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
      fitToWindow();
      const counts = readCounts();
      const terrainOnly = counts.states === 0 && counts.cultures <= 1;
      if (terrainOnly) {
        setStage("terrain");
        window.novenMap.showTerrain?.();
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
      hideNativeLoading();
      fitToWindow();
      state.dirty = true;
      setStage("world");
      status("地图已生成");
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
      status("先在白膜上起稿", true);
      return;
    }
    try {
      const summary = window.novenMap.composeTerrain(spec);
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
      status("先在白膜上起稿", true);
      return;
    }
    try {
      const summary = window.novenMap.paintTerrain(operations);
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
    if (state.stage !== "blank") {
      toast("地形已定稿；要改高程请用「世界 → 地理 → 高程」");
      return;
    }
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

  // ---------- world inspector ----------

  function closePanel() {
    if (ui === null) return;
    ui.panel.hidden = true;
    state.panel = null;
  }

  function openWorld() {
    if (state.stage !== "world") return;
    closeSettings();
    closeGeneration();
    state.panel = "world";
    ui.panelTitle.textContent = "世界";
    ui.panel.hidden = false;
    ui.panelBody.replaceChildren();

    const search = document.createElement("div");
    search.className = "nv-search";
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "搜索国家、城市、生物群系…";
    input.addEventListener("input", () => renderWorldList(input.value));
    search.appendChild(input);
    ui.panelBody.appendChild(search);

    const hint = document.createElement("p");
    hint.className = "nv-hint";
    hint.textContent = "点地图上的国家或城市，或点下面的列表；地图可继续缩放和拖动。";
    ui.panelBody.appendChild(hint);

    const list = document.createElement("div");
    list.id = "nv-world-list";
    ui.panelBody.appendChild(list);
    renderWorldList("");
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

  function selectMapPoint(event) {
    const viewbox = document.getElementById("viewbox");
    const svg = document.getElementById("map");
    if (viewbox === null || svg === null || typeof svg.createSVGPoint !== "function") return;
    const ctm = viewbox.getScreenCTM();
    if (ctm === null) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    const gridCell = window.Grid?.findCell?.(local.x, local.y);
    if (gridCell === undefined) return;
    const pack = window.pack;
    const cell = packCellForGrid(gridCell);
    if (cell === undefined) return;

    const burgId = pack.cells.burg?.[cell] ?? 0;
    if (burgId > 0) {
      const burg = pack.burgs?.[burgId];
      if (!burg || burg.removed) return;
      const state = pack.states?.[burg.state];
      const detail = [state?.name, burg.population ? `人口 ${Math.round(burg.population * 1000)}` : ""].filter(Boolean).join(" · ");
      openWorldSelection({
        kicker: burg.capital ? "首都" : "城市",
        name: burg.name ?? "未命名城市",
        detail,
        controller: "BurgsOverview",
        editorLabel: "城市总览"
      });
      return;
    }

    const stateId = pack.cells.state?.[cell] ?? 0;
    if (stateId > 0) {
      const state = pack.states?.[stateId];
      if (!state || state.removed) return;
      const capital = pack.burgs?.[state.capital]?.name;
      const detail = [state.form, capital ? `首都 ${capital}` : "无首都"].filter(Boolean).join(" · ");
      openWorldSelection({
        kicker: "国家",
        name: state.name ?? "未命名国家",
        detail,
        controller: "StatesEditor",
        editorLabel: "国家编辑器"
      });
      return;
    }

    const cultureId = pack.cells.culture?.[cell] ?? 0;
    if (cultureId > 0) {
      const culture = pack.cultures?.[cultureId];
      if (!culture || culture.removed) return;
      openWorldSelection({
        kicker: "文化",
        name: culture.name ?? "未命名文化",
        detail: culture.type ?? "",
        controller: "CulturesEditor",
        editorLabel: "文化编辑器"
      });
    }
  }

  function openWorldSelection(ref) {
    openWorld();
    const box = document.createElement("div");
    box.className = "nv-selection";
    const kicker = document.createElement("span");
    kicker.className = "nv-selection-kicker";
    kicker.textContent = ref.kicker;
    const name = document.createElement("strong");
    name.textContent = ref.name;
    const detail = document.createElement("span");
    detail.className = "nv-selection-detail";
    detail.textContent = ref.detail;
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = `打开${ref.editorLabel}`;
    open.addEventListener("click", () => {
      closePanel();
      openController(ref.controller);
    });
    box.append(kicker, name, detail, open);
    ui.panelBody.insertBefore(box, ui.panelBody.firstChild);
  }

  function renderWorldList(query) {
    const list = document.getElementById("nv-world-list");
    if (list === null) return;
    const counts = readCounts();
    const normalized = query.trim().toLowerCase();
    list.replaceChildren();

    let shown = 0;
    for (const group of WORLD_GROUPS) {
      const rows = group.rows.filter(row => {
        if (normalized === "") return true;
        return `${row.label} ${row.note ?? ""} ${group.label}`.toLowerCase().includes(normalized);
      });
      if (rows.length === 0) continue;
      shown += rows.length;

      const details = document.createElement("details");
      details.className = "nv-group";
      details.open = normalized !== "" || group.id === state.worldGroup;
      const summary = document.createElement("summary");
      const label = document.createElement("span");
      label.textContent = group.label;
      summary.appendChild(label);
      if (group.countKey !== undefined) {
        const count = document.createElement("span");
        count.className = "nv-count";
        count.textContent = `${counts[group.countKey] ?? 0} ${group.unit ?? ""}`;
        summary.appendChild(count);
      }
      summary.addEventListener("click", () => {
        state.worldGroup = group.id;
      });
      details.appendChild(summary);

      for (const row of rows) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "nv-row";
        const name = document.createElement("span");
        name.textContent = row.label;
        const note = document.createElement("span");
        note.className = "nv-note";
        note.textContent = row.note ?? "";
        button.append(name, note);
        if (row.countKey !== undefined) {
          const count = document.createElement("span");
          count.className = "nv-count";
          count.textContent = String(counts[row.countKey] ?? 0);
          button.appendChild(count);
        }
        const go = document.createElement("span");
        go.className = "nv-go";
        go.textContent = "›";
        button.appendChild(go);
        button.addEventListener("click", () => {
          closePanel();
          row.run();
        });
        details.appendChild(button);
      }
      list.appendChild(details);
    }

    if (shown === 0) {
      const empty = document.createElement("div");
      empty.className = "nv-empty";
      empty.textContent = `没有找到「${query}」。`;
      list.appendChild(empty);
    }
  }

  function openController(name, method = "open", ...args) {
    const entry = window.Controllers?.[name];
    const fn = entry?.[method];
    if (typeof fn !== "function") {
      toast(`暂时打不开「${name}」`);
      return;
    }
    closePanel();
    closeSettings();
    try {
      Promise.resolve(fn.apply(entry, args)).catch(error => {
        console.warn(`Noven controller ${name}.${method} failed`, error);
        toast("编辑器没有打开");
      });
    } catch (error) {
      console.warn(`Noven controller ${name}.${method} failed`, error);
      toast("编辑器没有打开");
    }
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
        const gear = document.createElement("button");
        gear.type = "button";
        gear.className = "nv-gear";
        gear.title = "样式";
        gear.textContent = "⚙";
        gear.addEventListener("click", event => {
          event.stopPropagation();
          closePanel();
          openController("StyleEditor", "open", id);
        });
        row.append(eye, name, gear);
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
    ui.panelTitle.textContent = "AI 改动";
    ui.panel.hidden = false;
    renderAi();
  }

  function renderAi() {
    ui.panelBody.replaceChildren();
    const note = document.createElement("p");
    note.className = "nv-ai-note";
    note.textContent = "AI 改图在卡片对话里完成。这里记录已经应用到地图的批次，可整批回退。";
    ui.panelBody.appendChild(note);

    const count = aiUndoCount();
    const box = document.createElement("div");
    box.className = "nv-ai-state";
    const title = document.createElement("strong");
    title.textContent = count > 0 ? `可撤销 ${count} 批` : "暂无 AI 改动";
    const body = document.createElement("span");
    body.textContent = count > 0 ? "撤销会整批回退上一次 AI 改动。" : "地图当前没有被 AI 修改过的批次。";
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
      case "submap":
        openController("SubmapTool");
        return;
      case "transform":
        openController("TransformTool");
        return;
      case "wrap":
        openController("WrapTool");
        return;
      default:
        return;
    }
  }

  function armConfirm(button, action) {
    if (button.dataset.confirm === "1") {
      button.dataset.confirm = "";
      button.textContent = action === "blank" ? "重开白膜" : "随机世界";
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
