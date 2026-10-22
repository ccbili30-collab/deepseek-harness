/**
 * Noven Chinese interface layer for the vendored Fantasy Map Generator.
 *
 * Upstream hardcodes English UI strings in HTML templates and controller
 * dialogs, so this layer translates rendered UI text and tooltips instead of
 * forking every string. It observes only the editor chrome containers, never
 * the map SVG labels: generated state, burg and river names are world data.
 */
(() => {
  "use strict";
  window.__novenI18nVersion = 11;

  const PHRASES = {
    "New Map!": "新地图",
    "New Map": "新建地图",
    Layers: "图层",
    Style: "样式",
    Options: "选项",
    Tools: "工具",
    About: "关于",
    Export: "导出",
    Save: "保存",
    Load: "载入",
    "Zoom out": "缩小",
    Search: "搜索",
    LOADING: "载入中",
    Menu: "菜单",
    "Fantasy Map Generator": "奇幻地图生成器",
    "Azgaar's": "Azgaar",
    "Layers preset:": "图层预设：",
    "Political map": "政治地图",
    "Cultural map": "文化地图",
    "Religions map": "宗教地图",
    "Provinces map": "省份地图",
    "Biomes map": "生物群系地图",
    Heightmap: "高度图",
    "Physical map": "自然地图",
    "Places of interest": "兴趣点",
    "Goods map": "商品地图",
    "Trade animation": "贸易动画",
    "Military map": "军事地图",
    Emblems: "纹章",
    "Pure landmass": "纯陆地",
    "Custom (not saved)": "自定义（不保存）",
    "Displayed layers and layer order:": "显示图层与顺序：",
    Texture: "纹理",
    Lakes: "湖泊",
    Biomes: "生物群系",
    Cells: "网格单元",
    Grid: "网格",
    Coordinates: "坐标",
    "Wind Rose": "罗盘玫瑰",
    Rivers: "河流",
    Relief: "地形起伏",
    Religions: "宗教",
    Cultures: "文化",
    States: "国家",
    Provinces: "省份",
    Zones: "区域",
    Borders: "边界",
    Routes: "道路",
    Temperature: "温度",
    Ice: "冰川",
    Goods: "商品",
    Markets: "市场",
    Trade: "贸易",
    Precipitation: "降水",
    Population: "人口",
    Icons: "图标",
    Labels: "标签",
    Military: "军事",
    Markers: "标记",
    Journeys: "旅程",
    Rulers: "标尺",
    "Scale Bar": "比例尺",
    Vignette: "暗角",
    "View mode:": "视图模式：",
    Standard: "标准",
    "3D scene": "3D 场景",
    Globe: "地球仪",
    "Preset:": "预设：",
    default: "默认",
    "Element:": "元素：",
    "Group:": "分组：",
    "Map settings (apply to new maps):": "地图设置（应用于新地图）：",
    "Map size": "地图尺寸",
    "Map seed": "地图种子",
    "Points number": "网格点数",
    "High Island": "高岛",
    "Cultures number": "文化数量",
    "Cultures set": "文化名称集",
    "All-world": "世界通用",
    European: "欧洲",
    Oriental: "东方",
    English: "英语",
    Antique: "古典",
    "High Fantasy": "高奇幻",
    "Dark Fantasy": "暗黑奇幻",
    Random: "随机",
    "States number": "国家数量",
    "Provinces ratio": "省份比例",
    "Size variety": "规模差异",
    "Growth rate": "扩张速度",
    "Burgs number": "城邦数量",
    auto: "自动",
    "Religions number": "宗教数量",
    "Interface settings:": "界面设置：",
    "Interface size": "界面大小",
    "Tooltip size": "提示框大小",
    "Theme color": "主题色",
    Transparency: "透明度",
    "Autosave interval": "自动保存间隔",
    "On load": "载入时",
    "Generate random map": "生成随机地图",
    "Open last saved map": "打开上次保存的地图",
    Performance: "性能",
    Quality: "质量",
    Balance: "均衡",
    Speed: "速度",
    Custom: "自定义",
    "Azgaar Assistant": "Azgaar 助手",
    Show: "显示",
    Hide: "隐藏",
    "Speaker voice": "语音",
    "Emblem shape": "纹章形状",
    "Culture-specific": "按文化",
    "Culture-random": "文化随机",
    "State-specific": "按国家",
    "Viewport size": "视口尺寸",
    "Zoom extent": "缩放范围",
    min: "最小",
    max: "最大",
    Language: "语言",
    "Load Google Translate": "加载谷歌翻译",
    "Configure World": "配置世界",
    "Set Lore": "设置背景",
    "Reset Options": "重置选项",
    Edit: "编辑",
    Regenerate: "重新生成",
    Economy: "经济",
    "State Labels": "国家标签",
    Production: "生产",
    Add: "添加",
    Burg: "城邦",
    Burgs: "城邦",
    Coastlines: "海岸线",
    Diplomacy: "外交",
    Features: "地貌",
    Measurers: "测量",
    Namesbase: "名称库",
    Notes: "笔记",
    Units: "单位",
    Label: "标签",
    Marker: "标记",
    River: "河流",
    Route: "道路",
    Charts: "图表",
    Minimap: "小地图",
    Create: "创建",
    Submap: "子地图",
    Transform: "变换",
    Wrap: "扭曲",
    "Heightmap customization tools:": "高度图编辑工具：",
    "Paint Brushes": "白膜画笔",
    "Template Editor": "模板编辑器",
    "Image Converter": "图像转换器",
    Preview: "预览",
    "Options:": "选项：",
    "Edit mode:": "编辑模式：",
    "Render ocean cells": "渲染海洋单元",
    "Show drainage": "显示水系",
    "Allow water erosion": "允许流水侵蚀",
    "Maximum depression filling iterations:": "最大洼地填充迭代次数：",
    "Depression depth threshold:": "洼地深度阈值：",
    "Statistics:": "统计：",
    "Land cells:": "陆地单元：",
    "Mean height:": "平均高度：",
    "Cell info:": "单元信息：",
    "Coord:": "坐标：",
    "Cell:": "单元：",
    "Height:": "高度：",
    "Interactive Tour": "交互式导览",
    "Desktop App": "桌面应用",
    "open source": "开源",
    "Quick start": "快速开始",
    "Video tutorial": "视频教程",
    hotkeys: "快捷键",
    "Join our": "加入我们的",
    "Discord server": "Discord 服务器",
    "Reddit community": "Reddit 社区",
    "Support Ukraine": "支持乌克兰",
    "Check out our other projects:": "看看我们的其他项目：",
    "Chinese localization:": "中文本地化：",
    "is an": "是一个",
    "tool by Azgaar and Team. You may use maps as they are, edit them or even create a new map from\n    scratch. Check out the":
      "由 Azgaar 和团队制作的工具。你可以直接使用、编辑地图，甚至从头创建新地图。查看",
    ", and": "、以及",
    "for\n    guidance.": "获取帮助。",
    and: "和",
    "to ask\n    questions, get help and share maps. The created maps can be used for free, even for commercial purposes.":
      "提问、获取帮助并分享地图。创建的地图可以免费使用，包括商业用途。",
    "The project is under active development. Creator and main maintainer: Azgaar. To track the development\n    progress see the":
      "项目正在积极开发中。作者与主要维护者：Azgaar。查看开发进度请访问",
    devboard: "开发看板",
    ". For older\n    versions see the": "。旧版本请查看",
    changelog: "更新日志",
    ".\n    Please report bugs": "。请报告问题",
    here: "这里",
    ". You can also\n    contact me directly via": "。也可以通过",
    email: "邮件",
    "SUPPORT ON PATREON": "在 Patreon 上支持",
    "Special thanks to": "特别感谢",
    "all supporters": "所有支持者",
    "on Patreon!": "在 Patreon 上！",
    ": a tool for creating coats of arms": "：纹章制作工具",
    ": gallery of fantasy characters": "：奇幻角色画廊",
    "Share on Facebook": "分享到 Facebook",
    Tweet: "发推",
    "Pin it": "收藏到 Pinterest",
    "Submit to Reddit": "提交到 Reddit",
    "Join Discord server": "加入 Discord 服务器",
    "Click to show the Menu": "点击显示菜单",
    "Click to hide the Menu": "点击隐藏菜单",
    "Click to generate a new map": "点击生成新地图",
    "Click to change map layers": "点击切换地图图层",
    "Click to open style editor": "点击打开样式编辑器",
    "Click to change generation and UI options": "点击修改生成与界面选项",
    "Click to open tools menu": "点击打开工具菜单",
    "Click to see Generator info": "点击查看生成器信息",
    "Drag to move the Menu": "拖动菜单",
    "Drag to move the pane": "拖动面板",
    "Select a map layers preset": "选择一个地图图层预设",
    "Click to save displayed layers as a new preset": "将当前图层保存为新预设",
    "Click to remove current custom preset": "删除当前自定义预设",
    "Click to toggle a layer, drag to raise or lower a layer. Ctrl + click to edit layer style":
      "点击开关图层，拖动调整层级；Ctrl + 点击编辑图层样式",
    "Set view mode": "设置视图模式",
    "Standard view mode for editing the map": "标准视图，用于编辑地图",
    "Map presentation in 3D scene. Works best for heightmap. Cannot be used for editing":
      "在 3D 场景中展示，最适合高度图，不能用于编辑",
    "Project map on globe. Cannot be used for editing": "将地图投影到地球仪，不能用于编辑",
    "Select a style preset. State labels may required regeneration if font is changed":
      "选择样式预设；如果更换字体，可能需要重新生成国家标签",
    "Click to select a style preset": "点击选择样式预设",
    "Click to save current style as a new preset": "将当前样式保存为新预设",
    "Select an element to edit its style": "选择要编辑样式的元素",
    "Select an element to edit its style (list is ordered alphabetically)":
      "选择要编辑样式的元素（按字母排序）",
    "Browse all elements and their groups": "浏览所有元素及其分组",
    "Select element group": "选择元素分组",
    "Sample shape: this section sets no color of its own": "示例图形：此区域本身不设置颜色",
    "Set opacity. 0: transparent, 1: solid": "设置不透明度。0：透明，1：不透明",
    "Select filter for element. Filters may cause performance issues!":
      "为元素选择滤镜。滤镜可能影响性能！",
    "Sample shape: this section sets no color of its own · Filter: blur":
      "示例图形：此区域本身不设置颜色 · 滤镜：模糊",
    "Set stroke width": "设置描边宽度",
    "Blur radius in pixels. Set to 0 for a solid line": "模糊半径（像素）。设为 0 得到实线",
    "Click to toggle, drag to raise or lower the layer": "点击开关，拖动调整层级",
    "Ctrl + click to edit layer style": "Ctrl + 点击编辑图层样式",
    Coastline: "海岸线",
    Fogging: "雾效",
    Landmass: "陆地",
    Legend: "图例",
    Ocean: "海洋",
    "States body": "国家主体",
    "States halo": "国家光晕",
    Opacity: "不透明度",
    Filter: "滤镜",
    Width: "宽度",
    Blur: "模糊",
    px: "像素",
    None: "无",
    "Blurred Splotch": "模糊色块",
    Splotch: "色块",
    Outline: "轮廓",
    Pencil: "铅笔",
    Turbulence: "湍流",
    Paper: "纸张",
    Crumpled: "褶皱",
    Grayscale: "灰度",
    Sepia: "棕褐",
    Dingy: "暗沉",
    Tint: "着色",
    Mediterranean: "地中海",
    "Settings for the next map. Generate a new map to apply them":
      "下一张地图的设置。生成新地图后生效",
    "Coordinate extent the next map is generated on. It is fixed for the life of that map and cannot be changed later - the Viewport size below is what you see it through. For full-globe maps use aspect ratio 2:1":
      "下一张地图的坐标范围。地图生成后不可再改；下方视口尺寸只决定你看到的范围。全球地图请使用 2:1 比例",
    "Restore default map size: the window size": "恢复默认地图尺寸：窗口大小",
    "Map seed number. Press 'Enter' to apply. A seed reproduces the same map only if the map size and the settings are the same":
      "地图种子。按回车应用。只有地图尺寸和设置相同时，同一种子才会生成同一张地图",
    "Show seed history to apply a previous seed": "查看种子历史并应用之前的种子",
    "Copy map seed as URL. It will produce the same map only if options are default or the same":
      "复制带种子的链接。只有选项相同或为默认值时，才会生成同一张地图",
    "Set number of points to be used for graph generation. Highly affects performance. 10K is the only recommended value":
      "设置用于生成网格的点数，显著影响性能。推荐使用 10K",
    "Select template or precreated heightmap to be used on generation":
      "选择生成时使用的高度图模板或预置高度图",
    "Define how many Cultures should be generated": "设置生成多少种文化",
    "Select a set of cultures to be used for names and cultures generation":
      "选择用于名称和文化生成的文化集",
    "Define how many states and capitals should be generated": "设置生成多少国家与首都",
    "Set what share of eligible burgs in each state will become province centers. Higher values create more provinces":
      "设置每个国家中多少城邦会成为省中心。数值越高，省份越多",
    "Define how much states and cultures can vary in size. Defines expansionism value":
      "设置国家与文化规模差异，同时决定扩张倾向",
    "Set the growth rate of states and cultures. Determines how much land stays neutral":
      "设置国家与文化的扩张速度，决定多少土地保持中立",
    "Define a number of non-capital settlements to be placed (if enough suitable land exists)":
      "设置非首都聚落数量（土地足够时）",
    "Define how many organized religions and cults should be generated. Cultures will have their own folk religions in any case":
      "设置生成多少组织化宗教与教派。文化始终会有自己的民间信仰",
    "Interface preferences saved in this browser. Changes apply immediately":
      "界面偏好保存在当前浏览器中，修改立即生效",
    "Set user interface size. Please note browser zoom also affects interface size (Ctrl + or Ctrl - to change)":
      "设置界面大小。浏览器缩放也会影响界面大小（Ctrl + / Ctrl -）",
    "Set tooltip size": "设置提示框大小",
    "Set theme hue for dialogs and tool windows": "设置对话框和工具窗口的主题色",
    "Restore default theme color: pale magenta": "恢复默认主题色：淡洋红",
    "Set dialog and tool windows transparency": "设置对话框和工具窗口透明度",
    "Set autosave interval in minutes. Set 0 to disable autosave. Map is saved to browser memory":
      "设置自动保存间隔（分钟）。设为 0 关闭自动保存。地图保存在浏览器内存中",
    "Set what Generator should do on load": "设置生成器载入时的行为",
    "Rendering preset: visual quality traded for speed. Pick 'Speed' if the map feels slow":
      "渲染预设：用画质换速度。地图卡顿时选择“速度”",
    "Open the performance settings": "打开性能设置",
    "Toggle Azgaar Assistant (help bubble on the bottom right corner)":
      "开关 Azgaar 助手（右下角帮助气泡）",
    "Select speech synthesis voice to pronounce generated names": "选择朗读生成名称的语音",
    "Click to test the voice": "点击试听语音",
    "Select emblem shape. Can be changed individually in the Emblem Editor":
      "选择纹章形状。可在纹章编辑器中单独修改",
    "Size of the map window on screen. Independent of the map size: it is how much of the map you see at once. Set by hand it is remembered, until you fit it back to the window":
      "屏幕上地图窗口的大小。与地图尺寸无关，只决定一次能看到多少。手动设置后会记住，直到重新适配窗口",
    "Fit the viewport to the browser window": "让视口适配浏览器窗口",
    "Set minimum and maximum possible zoom level": "设置最小和最大缩放级别",
    "Restore the default zoom extent": "恢复默认缩放范围",
    "Minimum possible zoom level (should be > 0)": "最小缩放级别（应大于 0）",
    "Maximum possible zoom level (should be > 1)": "最大缩放级别（应大于 1）",
    "Allow dragging the map beyond the canvas borders": "允许把地图拖出画布边界",
    "Load Google Translate and select a language. Automatic translation can break some page functions. If this happens, reset the language to English or refresh the page":
      "加载谷歌翻译并选择语言。自动翻译可能破坏部分页面功能；如遇问题，请恢复英语或刷新页面",
    "Reset language to English": "恢复英语",
    "Open the World Configurator to set the map position on the globe and the world climate":
      "打开世界配置器，设置地图在全球的位置和世界气候",
    "Click to name the map, date its calendar and describe the world":
      "点击为地图命名、设置历法并描述世界",
    "Click to restore default options and reload the page": "恢复默认选项并重新载入页面",
    "Click to open Biomes Editor": "打开生物群系编辑器",
    "Click to open Burgs Overview": "打开城邦总览",
    "Click to open Coastline Editor": "打开海岸线编辑器",
    "Click to open Cultures Editor": "打开文化编辑器",
    "Click to open Diplomatical relationships Editor": "打开外交关系编辑器",
    "Click to open Emblem Editor": "打开纹章编辑器",
    "Click to open Geographical Features Overview": "打开地貌总览",
    "Click to open Goods Editor": "打开商品编辑器",
    "Click to open Heightmap customization menu": "打开高度图编辑菜单",
    "Click to open Markers Overview": "打开标记总览",
    "Click to open Markets Overview": "打开市场总览",
    "Click to open Measurers Editor": "打开测量编辑器",
    "Click to open Labels Overview": "打开标签总览",
    "Click to open Military Forces Overview": "打开军事力量总览",
    "Click to open Namesbase Editor": "打开名称库编辑器",
    "Click to open Notes Editor": "打开笔记编辑器",
    "Click to open Provinces Editor": "打开省份编辑器",
    "Click to open Religions Editor": "打开宗教编辑器",
    "Click to open Rivers Overview": "打开河流总览",
    "Click to open Routes Overview": "打开道路总览",
    "Click to open Journeys Overview": "打开旅程总览",
    "Click to open States Editor": "打开国家编辑器",
    "Click to open Trade Animation Editor": "打开贸易动画编辑器",
    "Click to open Units Editor": "打开单位编辑器",
    "Click to open Zones Editor": "打开区域编辑器",
    "Click to regenerate all unlocked burgs and routes. States will remain as they are. Note: burgs are only generated in populated areas with culture assigned":
      "重新生成所有未锁定的城邦和道路；国家保持不变。注意：城邦只会生成在已分配文化的有人区域",
    "Click to regenerate non-locked cultures": "重新生成未锁定的文化",
    "Rebuild market territories, production, trade deals, and taxes from the current goods and markets":
      "根据当前商品和市场重建市场范围、生产、贸易协议和税收",
    "Click to regenerate all emblems": "重新生成所有纹章",
    "Click to regenerate bonus goods placement": "重新生成奖励商品分布",
    "Click to regenerate icebergs and glaciers": "重新生成冰山和冰川",
    "Click to update state labels placement based on current borders": "根据当前边界更新国家标签位置",
    "Click to regenerate unlocked markers": "重新生成未锁定的标记",
    "Click to set number multiplier": "设置数量倍率",
    "Click to regenerate markets and their territories": "重新生成市场及其范围",
    "Click to recalculate military forces based on current military options":
      "根据当前军事选项重新计算军事力量",
    "Click to recalculate rural and urban population": "重新计算乡村和城市人口",
    "Click to regenerate production and trade deals": "重新生成生产和贸易协议",
    "Click to regenerate non-locked provinces. States will remain as they are":
      "重新生成未锁定的省份；国家保持不变",
    "Click to regenerate all relief icons based on current cell biome and elevation":
      "根据当前单元的生态和海拔重新生成地形图标",
    "Click to regenerate non-locked religions": "重新生成未锁定的宗教",
    "Click to regenerate all rivers (restore default state)": "重新生成所有河流（恢复默认状态）",
    "Click to regenerate all unlocked routes": "重新生成所有未锁定的道路",
    "Click to regenerate non-locked states. Emblems and military forces will be regenerated as well, burgs will remain as they are, but capitals will be different":
      "重新生成未锁定的国家；纹章和军事力量也会重建。城邦保留，但首都会变化",
    "Click to regenerate zones. Hold Ctrl and click to set zones number multiplier":
      "重新生成区域。按住 Ctrl 点击可设置区域数量倍率",
    "Click on map to place a burg. Hold Shift to add multiple": "点击地图放置城邦。按住 Shift 可连续添加",
    "Click on map to place label. Hold Shift to add multiple": "点击地图放置标签。按住 Shift 可连续添加",
    "Click on map to place a marker. Hold Shift to add multiple": "点击地图放置标记。按住 Shift 可连续添加",
    "Click on map to place a river. Hold Shift to add multiple": "点击地图放置河流。按住 Shift 可连续添加",
    "Open route creation dialog": "打开道路创建对话框",
    "Click to open Cell details view": "打开网格单元详情",
    "Click to open Charts to overview cells data": "打开图表总览单元数据",
    "Click to open minimap overview. Click minimap to center view": "打开小地图总览；点击小地图可居中",
    "Click to generate a submap from the current viewport": "从当前视口生成子地图",
    "Click to transform the map": "变换地图",
    "Adjust cell shapes with a brush": "用画笔调整单元形状",
    "Display brushes panel": "显示画笔面板",
    "Open template editor": "打开模板编辑器",
    "Open Image Converter": "打开图像转换器",
    "Render heightmap data as a small monochrome image": "将高度图渲染为小型单色图",
    "Preview the heightmap in a 3D scene": "在 3D 场景中预览高度图",
    "Heightmap edit mode": "高度图编辑模式",
    "Heightmap edit mode is active. Click on \"Exit Customization\" to finalize the heightmap":
      "高度图编辑模式已开启。点底部「定稿地形」继续。",
    "Cells to change:": "作用范围：",
    "all cells": "全部碎块",
    "only land cells": "只改陆地",
    "only water cells": "只改水域",
    "Radius:": "半径：",
    "Power:": "力度：",
    "Randomness:": "随机度：",
    "Raise brush: increase height of cells in radius by Power value": "抬高：把范围内的碎块按力度值加高",
    "Elevate brush: drag to gradually increase height of cells in radius by Power value": "渐高：拖动时逐步加高范围内的碎块",
    "Lower brush: drag to decrease height of cells in radius by Power value": "降低：拖动时按力度值降低范围内的碎块",
    "Depress brush: drag to gradually decrease height of cells in radius by Power value": "渐低：拖动时逐步降低范围内的碎块",
    "Align brush: drag to set height of cells in radius to height of the cell at mousepoint": "抹平：把范围内的碎块对齐到起始块的高度",
    "Smooth brush: drag to level height of cells in radius to height of adjacent cells": "平滑：让范围内的碎块高度接近相邻块",
    "Disrupt brush: drag to randomize height of cells in radius based on Power value": "扰动：按力度随机改变范围内的碎块高度",
    "Fill: click enclosed water or same-height land area to create a cone blob": "填充：点封闭水域或同高度的陆地区域，生成一块锥形陆地",
    "Line: select two points to change heights along the line": "画线：选两个点，沿直线修改高度",
    "Render cells below sea level (with a height less than 20)": "渲染海平面以下的单元（高度小于 20）",
    "Show where water flows: arrows point downhill, hatching marks depressions that get filled, blue hatching marks the ones deep enough to become lakes":
      "显示水流方向：箭头指向下坡，阴影标记会被填平的洼地，蓝色阴影标记会形成湖泊的深洼地",
    "Regenerate rivers and allow water flow to change heights and form new lakes. Recommended":
      "重新生成河流，允许水流改变高度并形成新湖泊。推荐开启",
    "Maximum number of iterations to fill depressions. Increase if rivers end without reaching a lake or the sea":
      "填平洼地的最大迭代次数。如果河流没有流入湖泊或海洋，请增大此值",
    "Depression depth needed to form a new lake. Increase to reduce the number of generated lakes":
      "形成新湖泊所需的洼地深度。增大此值可减少湖泊数量",
    "Take an interactive tour of the map generator": "开始地图生成器的交互式导览",
    "Install the Generator on your computer": "在电脑上安装生成器",
    "Click to see list of supporters": "查看支持者名单",
    "Generate a new map based on options": "根据选项生成新地图",
    "Select format to download image or export map data": "选择下载图片或导出地图数据的格式",
    "Save fully-functional map file": "保存完整功能的地图文件",
    "Load fully-functional map (.map or .gz formats)": "载入完整地图文件（.map 或 .gz）",
    "Reset map zoom": "重置地图缩放",
    "Search map and commands": "搜索地图和命令",
    "Search:": "搜索：",
    "State:": "国家：",
    "Type:": "类型：",
    "Edit Emblem": "编辑纹章",
    "Edit in Armoria": "在 Armoria 中编辑",
    Province: "省份",
    "Click to show and edit province emblem": "点击查看并编辑省份纹章",
    "Province form name. Click to change": "省份政体名称。点击修改",
    "Province capital. Click to zoom into view": "省份首府。点击缩放到视野",
    "Province capital. Click to select from burgs within the state. No capital means the province is governed from the state capital":
      "省份首府。点击从国内城邦中选择。没有首府时由国家首都管理",
    "Province owner": "所属国家",
    "Declare province independence (turn non-capital province with burgs into a new state)":
      "宣布省份独立（将拥有城邦的非首都省份变为新国家）",
    "Average area": "平均面积",
    "Recolor listed provinces based on state color": "按国家颜色给列出的省份重新着色",
    "Release all provinces. It will make all provinces with burgs independent":
      "释放所有省份。拥有城邦的省份将独立",
    "Merge several provinces into one": "将多个省份合并为一个",
    "Annex provinces: click the annexing province, then the provinces of the same state it absorbs. Hold Shift to keep annexing":
      "吞并省份：先点击吞并方省份，再点击同国被吞并的省份。按住 Shift 可继续吞并",
    "Remove all provinces. States will remain as they are": "移除所有省份，国家保持不变",
    "Click to sort by Type": "点击按类型排序",
    "Click to sort by Cells": "点击按单元数排序",
    "Biome name. Click and type to change": "生物群系名称。点击后输入修改",
    "Biome habitability percent": "生物群系宜居度百分比",
    "Biome habitability percent. Click and set new value to change":
      "生物群系宜居度百分比。点击并设置新值",
    "Biome area": "生物群系面积",
    "Edit free text notes (legend) for this biome": "编辑该生物群系的自由文本备注（图例）",
    "Save biomes-related data as a text file (.csv)": "将生物群系数据保存为 CSV",
    "Download biomes-related data": "下载生物群系数据",
    "Upload biomes-related data": "上传生物群系数据",
    "Open Wikipedia article about the biome": "打开该生物群系的维基百科条目",
    "Number of land biomes": "陆地生物群系数量",
    "Total land cells number": "陆地单元总数",
    "Edit biomes style in Style Editor": "在样式编辑器中编辑生物群系样式",
    "Manually re-assign biomes to not follow the default moisture/temperature pattern":
      "手动重新分配生物群系，不再遵循默认的湿度/温度模式",
    "Edit the relief rules: hills, mountains and other relief placed by elevation":
      "编辑地形规则：丘陵、山脉和其他按海拔放置的地形",
    "Add a custom biome": "添加自定义生物群系",
    "Restore the defaults and re-define biomes based on current moisture and temperature":
      "恢复默认值，并根据当前湿度和温度重新定义生物群系",
    "Select state": "选择国家",
    "Select province in state": "选择国家中的省份",
    "Select burg in province or state": "选择省份或国家中的城邦",
    "Size of this emblem, 0 hides it. Change a whole category in Menu ⭢ Style ⭢ Emblems":
      "纹章大小，0 表示隐藏。可在菜单 → 样式 → 纹章中修改整类",
    "Open the emblem in Armoria, the heraldry editor: your changes show on the map as you make them":
      "在纹章编辑器 Armoria 中打开：修改会实时显示在地图上",
    "Edit the COA string by hand, or paste an Armoria edit link, API link or COA string":
      "手动编辑纹章字符串，或粘贴 Armoria 编辑链接、API 链接或纹章字符串",
    "Set the charge: choose, link or upload a picture to place on the field":
      "设置纹章图案：选择、链接或上传图片放到盾面上",
    "Replace the whole emblem with a picture: choose, link or upload an image, such as a ready coat of arms":
      "用图片替换整个纹章：选择、链接或上传图片，例如现成的纹章",
    "Download the emblem as an image": "下载纹章图片",
    "Download all emblems as an HTML gallery (open it in a browser; preparing takes a while)":
      "将所有纹章下载为 HTML 画廊（在浏览器中打开；准备需要一些时间）",
    "Regenerate the emblem": "重新生成纹章",
    "Show the area or place of the emblem": "显示纹章所属区域或地点",
    "Show or hide all goods matching the current filter": "显示或隐藏符合当前筛选的所有商品",
    "Total units produced daily in cells (raw) and burgs (manufactured). Click to sort":
      "单元（原料）和城邦（制成品）的日总产量。点击排序",
    "Toggle this good on the Goods map": "在商品地图上开关该商品",
    "Good icon": "商品图标",
    "Good name": "商品名称",
    "Good types": "商品类型",
    "Raw goods are produced by rural population in cells based on biome availability and in cells and burgs when bonus resource is assigned to cells":
      "原料商品由单元中的乡村人口根据生物群系产出；分配奖励资源后也会在单元和城邦中产出",
    "Unit of production": "生产单位",
    "Edit free text notes (legend) for this good": "编辑该商品的自由文本备注（图例）",
    "Edit good": "编辑商品",
    "Remove good": "移除商品",
    "Manufactured goods are produced in burgs": "制成品在城邦中生产",
    "Base (initial) price. Click to compare prices across markets":
      "基准（初始）价格。点击比较各市场价格",
    "Religion name. Click and type to change": "宗教名称。点击后输入修改",
    "Religion area": "宗教面积",
    "Religion type": "宗教类型",
    "Religion form": "宗教形式",
    "Click to re-generate supreme deity": "点击重新生成主神",
    "Religion supreme deity": "宗教主神",
    "Lock this religion": "锁定该宗教",
    "Remove religion": "移除宗教",
    "Total number of organized religions": "组织化宗教总数",
    "Total number of heresies": "异端总数",
    "Total number of cults": "教派总数",
    "Total number of folk religions": "民间信仰总数",
    "Total number of believers (population)": "信徒总数（人口）",
    "Show religions hierarchy tree": "显示宗教层级树",
    "Show/hide extinct religions (religions without cells)": "显示/隐藏已消亡宗教（没有单元的宗教）",
    "Recalculate religions based on current values of growth-related attributes":
      "根据当前增长属性重新计算宗教",
    "Allow religion center, extent, and expansionism changes to take an immediate effect":
      "允许宗教中心、范围和扩张度修改立即生效",
    "Click to sort by discharge (flux in m3/s)": "点击按流量排序（立方米/秒）",
    "River name": "河流名称",
    "River type name": "河流类型",
    "River discharge (flux power)": "河流流量",
    "River length from source to mouth": "河流长度（从源头到河口）",
    "River mouth width": "河口宽度",
    "River basin (name of the main stem)": "流域（干流名称）",
    "Edit river": "编辑河流",
    "Remove river": "移除河流",
    "Filter by name, type or basin": "按名称、类型或流域筛选",
    "Rivers number": "河流数量",
    "Average discharge": "平均流量",
    "Average length": "平均长度",
    "Average mouth width": "平均河口宽度",
    "Automatically add river starting from clicked cell. Hold Shift to add multiple":
      "从点击的单元自动添加河流。按住 Shift 可连续添加",
    "Create a new river selecting river cells": "选择河流单元创建新河流",
    "Toggle basin highlight mode": "切换流域高亮模式",
    "Remove all rivers": "移除所有河流",
    "Click to sort by Length": "点击按长度排序",
    "Route name": "道路名称",
    "Route group": "道路分组",
    "Route length": "道路长度",
    "Edit route": "编辑道路",
    "Remove route": "移除道路",
    "Filter by name or group": "按名称或分组筛选",
    "Routes number": "道路数量",
    "Create a new route selecting route cells": "选择道路单元创建新道路",
    "Lock or unlock all routes": "锁定或解锁所有道路",
    "Remove all unlocked routes (locked routes are kept)": "移除所有未锁定的道路（保留锁定道路）",
    "Label text": "标签文字",
    "Label type": "标签类型",
    "Label group, select to reassign the label": "标签分组，选择以重新分配标签",
    "Hide the label": "隐藏标签",
    "Restore the default label": "恢复默认标签",
    "Show only labels of the selected type": "仅显示所选类型的标签",
    "Show only labels of the selected group": "仅显示所选分组的标签",
    "Show only labels containing the entered text": "仅显示包含输入文字的标签",
    "Number of listed labels": "列出的标签数",
    "Refresh the Overview screen": "刷新总览",
    "Bulk assignment: select multiple labels and assign them all to one group":
      "批量分配：选择多个标签并统一归入一个分组",
    "Spread currently displayed labels to not collide": "分散当前显示的标签，避免重叠",
    "Configure Label Groups": "配置标签分组",
    "Click to invert pin state for all markers": "反转所有标记的钉住状态",
    "Click to invert lock state for all markers": "反转所有标记的锁定状态",
    "Marker icon": "标记图标",
    "Marker type": "标记类型",
    "Pin marker (display only pinned markers)": "钉住标记（仅显示钉住的标记）",
    "Edit marker": "编辑标记",
    "Remove marker": "移除标记",
    "Show only markers located in the selected state": "仅显示所选国家的标记",
    "Show only markers located in the selected culture": "仅显示所选文化的标记",
    "Show only markers of the selected type": "仅显示所选类型的标记",
    "Filter by type": "按类型筛选",
    "Markers number": "标记数量",
    "Regenerate unlocked markers": "重新生成未锁定的标记",
    "Select marker type for newly added markers.": "选择新添加标记的类型。",
    "Config markers generation options": "配置标记生成选项",
    "Remove all unlocked markers": "移除所有未锁定的标记",
    "Save markers data as a text file (.csv)": "将标记数据保存为 CSV",
    "Zone description. Click and type to change": "区域描述。点击后输入修改",
    "Zone type. Click and type to change": "区域类型。点击后输入修改",
    "Cells count": "单元数量",
    "Zone area": "区域面积",
    "Drag to raise or lower the zone": "拖动调整区域层级",
    "Toggle zone focus": "切换区域聚焦",
    "Toggle zone visibility": "切换区域可见性",
    "Remove zone": "移除区域",
    "Number of zones": "区域数量",
    "Total cells number": "单元总数",
    "Total map area": "地图总面积",
    "Total map population": "地图总人口",
    "Toggle Legend box (shows all non-hidden zones)": "开关图例框（显示所有未隐藏区域）",
    "Re-assign zones": "重新分配区域",
    "Add new zone layer": "添加新区域图层",
    "Download zones-related data": "下载区域数据",
    "Show only zones of selected type": "仅显示所选类型的区域",
    "Geographical Features Overview": "地貌总览",
    "Military Overview": "军事总览",
    "Diplomacy Overview": "外交总览",
    "Distance:": "距离：",
    "Distance unit:": "距离单位：",
    "1 map pixel:": "1 个地图像素：",
    "Area unit:": "面积单位：",
    "Altitude:": "海拔：",
    "Height unit:": "高度单位：",
    "Exponent:": "指数：",
    "Temperature:": "温度：",
    "Temperature scale:": "温标：",
    "1 population point:": "1 个人口点：",
    "Urbanization rate:": "城市化率：",
    "Urban density:": "城市密度：",
    "States:": "国家：",
    "Land Area:": "陆地面积：",
    "Population:": "人口：",
    "Click to sort by Area": "点击按面积排序",
    "State name. Click to change": "国家名称。点击修改",
    "Click to show and edit state emblem": "点击查看并编辑国家纹章",
    "State form name. Click to change": "政体名称。点击修改",
    "State capital. Click to zoom into view": "国家首都。点击缩放到视野",
    "Capital name": "首都名称",
    "Dominant culture. Click to change": "主要文化。点击修改",
    "Click to overview state burgs": "点击查看该国的城邦",
    "Burgs count": "城邦数量",
    "State area": "国家面积",
    "Edit free text notes (legend) for this state": "编辑该国的自由文本备注（图例）",
    "Locate the state": "定位国家",
    "Toggle state focus": "切换国家聚焦",
    "Lock the state to protect it from re-generation": "锁定国家，避免重新生成",
    "Remove the state": "移除国家",
    "Neutral lands name. Click to change": "中立地区名称。点击修改",
    "Click to overview neutral burgs": "点击查看中立城邦",
    "Neutral lands area": "中立地区面积",
    "Total burgs number": "城邦总数",
    "Edit states style in Style Editor": "在样式编辑器中编辑国家样式",
    "Toggle percentage / absolute values views": "切换百分比 / 绝对值显示",
    "Show states bubble chart": "显示国家气泡图",
    "Show the regeneration menu and more data": "显示重新生成菜单和更多数据",
    "Manually re-assign states": "手动重新分配国家",
    "Add a new state. Hold Shift to add multiple": "添加新国家。按住 Shift 可连续添加",
    "Culture:": "文化：",
    "Burgs:": "城邦：",
    "Avg population:": "平均人口：",
    "Avg wealth:": "平均财富：",
    "Avg treasury:": "平均国库：",
    "Minimize / maximize": "最小化 / 最大化",
    "Click to sort by Population": "点击按人口排序",
    "Show or hide columns": "显示或隐藏列",
    "Click to zoom into view": "点击缩放到视野",
    "Burg name": "城邦名称",
    "Burg state": "所属国家",
    "Dominant culture": "主要文化",
    "Burg group": "城邦分组",
    "Burg population": "城邦人口",
    "Wealth: gross product divided by population": "财富：总产值除以人口",
    "Treasury: accumulated cash balance": "国库：累计现金余额",
    "Edit burg": "编辑城邦",
    "This burg is a state capital": "该国首都",
    "This burg is a port": "港口",
    "This burg is NOT a port": "不是港口",
    "This burg is a NOT state capital": "不是首都",
    "Remove burg": "移除城邦",
    "Apply a filter": "应用筛选",
    "Filter by name, province, state, culture, or group": "按名称、省份、国家、文化或分组筛选",
    "Burgs displayed": "显示城邦数",
    "Average population": "平均人口",
    "Average wealth (product per capita)": "平均财富（人均产值）",
    "Average treasury": "平均国库",
    "Refresh the Editor": "刷新编辑器",
    "Edit burg groups": "编辑城邦分组",
    "Show burgs bubble chart": "显示城邦气泡图",
    "Regenerate burg names based on assigned culture": "根据所属文化重新生成城邦名称",
    "Add a new burg. Hold Shift to add multiple": "添加新城邦。按住 Shift 可连续添加",
    "Save burgs-related data as a text file (.csv)": "将城邦数据保存为 CSV",
    "Rename burgs in bulk": "批量重命名城邦",
    "Lock or unlock all burgs": "锁定或解锁所有城邦",
    "Remove all unlocked burgs except for capitals. To remove a capital remove its state first":
      "移除所有未锁定的非首都城邦。要移除首都，请先移除其国家",
    "auto-apply changes": "自动应用更改",
    "Culture name. Click and type to change": "文化名称。点击后输入修改",
    "Culture type. Defines growth model. Click to change": "文化类型，决定扩张模型。点击修改",
    "Click to re-generate names for burgs with this culture assigned": "为该文化下的城邦重新生成名称",
    "Culture namesbase. Click to change. Click on arrows to re-generate names":
      "文化名称库。点击修改，点击箭头重新生成名称",
    "Culture area": "文化面积",
    "Edit free text notes (legend) for this culture": "编辑该文化的自由文本备注（图例）",
    "Locate the culture": "定位文化",
    "Lock culture": "锁定文化",
    "Remove culture": "移除文化",
    "Neutral culture name. Click and type to change": "中立文化名称。点击后输入修改",
    "Total land area": "陆地总面积",
    "Total population": "总人口",
    "Edit cultures style in Style Editor": "在样式编辑器中编辑文化样式",
    "Toggle Legend box": "开关图例框",
    "Toggle percentage / absolute values display mode": "切换百分比 / 绝对值显示",
    "Show cultures hierarchy tree": "显示文化层级树",
    "Manually re-assign cultures": "手动重新分配文化",
    "Edit a database used for names generation": "编辑名称生成数据库",
    "Add a new culture. Hold Shift to add multiple": "添加新文化。按住 Shift 可连续添加",
    "Download cultures-related data": "下载文化数据",
    "Upload cultures-related data": "上传文化数据",
    "Recalculate cultures based on current values of growth-related attributes":
      "根据当前增长属性重新计算文化",
    "Allow culture centers, expansion and type changes to take an immediate effect":
      "允许文化中心、扩张和类型修改立即生效",
    all: "全部",
    "Mile (mi)": "英里 (mi)",
    "Feet (ft)": "英尺 (ft)",
    "degree Fahrenheit (°F)": "华氏度 (°F)",
    square: "平方",
    Generic: "通用",
    Hunting: "狩猎",
    Highland: "高地",
    Naval: "航海",
    Nomadic: "游牧",
    "States Editor": "国家编辑器",
    "Cultures Editor": "文化编辑器",
    "Religions Editor": "宗教编辑器",
    "Provinces Editor": "省份编辑器",
    "Burgs Overview": "城邦总览",
    "Rivers Overview": "河流总览",
    "Routes Overview": "道路总览",
    "Markers Overview": "标记总览",
    "Labels Overview": "标签总览",
    "Zones Editor": "区域编辑器",
    "Emblem Editor": "纹章编辑器",
    "Biomes Editor": "生物群系编辑器",
    "Coastline Editor": "海岸线编辑器",
    "Diplomacy Editor": "外交编辑器",
    "Features Overview": "地貌总览",
    "Goods Editor": "商品编辑器",
    "Markets Overview": "市场总览",
    "Measurers Editor": "测量编辑器",
    "Military Forces Overview": "军事力量总览",
    "Namesbase Editor": "名称库编辑器",
    "Notes Editor": "笔记编辑器",
    "Trade Animation Editor": "贸易动画编辑器",
    "Units Editor": "单位编辑器",
    "Journeys Overview": "旅程总览",
    "Cell Details": "网格单元详情",
    State: "国家",
    Form: "政体",
    Capital: "首都",
    Culture: "文化",
    Area: "面积",
    Treasury: "国库",
    Name: "名称",
    Type: "类型",
    Close: "关闭",
    Cancel: "取消",
    Confirm: "确认",
    Apply: "应用",
    Delete: "删除",
    Remove: "移除",
    Rename: "重命名",
    Lock: "锁定",
    Unlock: "解锁",
    Generate: "生成",
    Randomize: "随机",
    Reset: "重置",
    Download: "下载",
    Upload: "上传",
    Copy: "复制",
    Paste: "粘贴",
    Clear: "清空",
    Done: "完成",
    Yes: "是",
    No: "否"
  };

  // Common native-editor column and field labels.
  Object.assign(PHRASES, {
    State: "国家",
    Neutrals: "中立",
    Province: "省份",
    Culture: "文化",
    Religion: "宗教",
    Burgs: "城市",
    Form: "政体",
    Capital: "首都",
    Area: "面积",
    Population: "人口",
    Treasury: "国库",
    Type: "类型",
    Name: "名称",
    Cells: "单元格",
    Emblem: "纹章",
    Color: "颜色",
    Bonus: "加成",
    Rank: "等级"
  });

  const ATTRS = ["data-tip", "title", "placeholder", "aria-label", "alt"];
  const ROOTS = [
    "#optionsContainer",
    "#dialogs",
    "#tooltip",
    "#mapOverlay",
    "#notes",
    "#loading",
    "#exitCustomization",
    "#assistantBubble",
    "#tourPromptButton",
    "#legend",
    "#scaleBar"
  ];
  const ROOT_SELECTOR = ROOTS.join(",");

  const ENTITIES = {
    state: "国家",
    states: "国家",
    province: "省份",
    provinces: "省份",
    culture: "文化",
    cultures: "文化",
    religion: "宗教",
    religions: "宗教",
    river: "河流",
    rivers: "河流",
    route: "道路",
    routes: "道路",
    marker: "标记",
    markers: "标记",
    label: "标签",
    labels: "标签",
    zone: "区域",
    zones: "区域",
    burg: "城邦",
    burgs: "城邦",
    regiment: "军团",
    regiments: "军团",
    fleet: "舰队",
    fleets: "舰队",
    market: "市场",
    markets: "市场",
    unit: "单位",
    units: "单位",
    note: "笔记",
    notes: "笔记"
  };
  const entity = name => ENTITIES[name.toLowerCase()] ?? translateText(name);

  const RULES = [
    [
      /^(.+?): click to toggle, drag to raise or lower the layer\. Ctrl \+ click to edit layer style$/,
      (_match, name) => `${translateText(name)}：点击开关，拖动调整层级；Ctrl + 点击编辑图层样式`
    ],
    [/^Autosave: saving map\.\.\.$/, () => "自动保存：正在保存…"],
    [/^Autosave: map is saved$/, () => "自动保存：地图已保存"],
    [/^Autosave failed: (.+)$/, (_match, reason) => `自动保存失败：${reason}`],
    [/^Map is saved to the browser storage$/, () => "地图已保存到浏览器存储"],
    [/^Map is saved to "(.+)"$/, (_match, name) => `地图已保存到“${name}”`],
    [/^Saving map to "(.+)"\.\.\.$/, (_match, name) => `正在保存地图到“${name}”…`],
    [/^(\d+) cells$/, (_match, n) => `${n} 个单元`],
    [/^(\d+) cell$/, (_match, n) => `${n} 个单元`],
    [/^(\S+) body$/, (_match, name) => `${translateText(name)}主体`],
    [/^(\S+) halo$/, (_match, name) => `${translateText(name)}光晕`],
    [/^(\S+) fill$/, (_match, name) => `${translateText(name)}填充`],
    [/^(\S+) stroke$/, (_match, name) => `${translateText(name)}描边`],
    [
      /^(State|States|Burg|Burgs|Culture|Cultures|Religion|Religions|Province|Provinces|River|Rivers|Route|Routes|Marker|Markers|Zone|Zones|Map|Ocean|Land|Emblems|Military|Trade|Goods) labels?$/,
      (_match, name) => `${entity(name)}标签`
    ],
    [/^Blur ([\d.]+)$/, (_match, n) => `模糊 ${n}`],
    [/^Shadow ([\d.]+)$/, (_match, n) => `阴影 ${n}`],
    [
      /^Total population: (.+)\. Rural population: (.+)\. Urban population: (.+)\. Click to edit$/,
      (_match, total, rural, urban) => `总人口：${total}，乡村人口：${rural}，城市人口：${urban}。点击编辑`
    ],
    [
      /^Total population: (.+); Rural population: (.+); Urban population: (.+)\. Click to change$/,
      (_match, total, rural, urban) => `总人口：${total}，乡村人口：${rural}，城市人口：${urban}。点击修改`
    ],
    [
      /^Total population: (.+); Rural population: (.+); Urban population: (.+)$/,
      (_match, total, rural, urban) => `总人口：${total}，乡村人口：${rural}，城市人口：${urban}`
    ],
    [
      /^Believers: (.+); Rural areas: (.+); Urban areas: (.+)\. Click to change$/,
      (_match, total, rural, urban) => `信徒：${total}，乡村：${rural}，城市：${urban}。点击修改`
    ],
    [/^Relief: (.+)\. Density (\d+)\. Click to edit$/, (_match, relief, density) => `地形：${relief}。密度 ${density}。点击编辑`],
    [/^No relief\. Click to edit$/, () => "没有地形起伏。点击编辑"],
    [
      /^Good daily production: (.+)\. Cells: (.+)\. Burgs: (.+)\. Click to see burgs producing this good$/,
      (_match, total, cells, burgs) => `日产量：${total}，单元：${cells}，城邦：${burgs}。点击查看生产该商品的城邦`
    ],
    [
      /^Total stock in all markets and burg inventories: (.+) units\. Click to see breakdown by location$/,
      (_match, total) => `所有市场和城邦库存总量：${total} 单位。点击查看分布`
    ],
    [
      /^Current treasury: (.+)\. Sales Tax: (.+)\. Poll Tax: (.+)\. Click to view and edit taxes$/,
      (_match, treasury, sales, poll) => `当前国库：${treasury}，销售税：${sales}，人头税：${poll}。点击查看并编辑税收`
    ],
    [/^Burgs: (\d+) of (\d+)$/, (_match, shown, total) => `城邦：${shown} / ${total}`],
    [/^States: (\d+)$/, (_match, n) => `国家：${n}`],
    [/^Burgs: (\d+)$/, (_match, n) => `城邦：${n}`],
    [/^Land Area: (.+)$/, (_match, area) => `陆地面积：${area}`],
    [/^Population: (.+)$/, (_match, pop) => `人口：${pop}`],
    [
      /^Locate the (state|province|culture|religion|river|route|marker|label|zone|burg)$/i,
      (_match, name) => `定位${entity(name)}`
    ],
    [
      /^Lock the (state|province|culture|religion|river|route|marker|label|zone|burg)$/i,
      (_match, name) => `锁定${entity(name)}`
    ],
    [
      /^Remove the (state|province|culture|religion|river|route|marker|label|zone|burg)$/i,
      (_match, name) => `移除${entity(name)}`
    ],
    [
      /^Toggle (state|province|culture|religion|river|route|marker|label|zone|burg) focus$/i,
      (_match, name) => `切换${entity(name)}聚焦`
    ],
    [
      /^Edit free text notes \(legend\) for this (state|province|culture|religion|river|route|marker|label|zone|burg)$/i,
      (_match, name) => `编辑该${entity(name)}的自由文本备注（图例）`
    ],
    [
      /^(State|Province|Culture|Religion|River|Route|Marker|Label|Zone|Burg) name\. Click to change$/,
      (_match, name) => `${entity(name)}名称。点击修改`
    ],
    [
      /^(State|Province|Culture|Religion|River|Route|Marker|Label|Zone|Burg) area$/,
      (_match, name) => `${entity(name)}面积`
    ],
    [
      /^Click to overview (state|province|culture|religion|river|route|marker|label|zone|burg) burgs$/i,
      (_match, name) => `点击查看${entity(name)}的城邦`
    ],
    [
      /^Edit (state|province|culture|religion|river|route|marker|label|zone|burg)s? style in Style Editor$/i,
      (_match, name) => `在样式编辑器中编辑${entity(name)}样式`
    ],
    [
      /^Save (state|province|culture|religion|river|route|marker|label|zone|burg)s?-related data as a text file \(\.csv\)$/i,
      (_match, name) => `将${entity(name)}数据保存为 CSV`
    ],
    [
      /^Download (state|province|culture|religion|river|route|marker|label|zone|burg)s?-related data$/i,
      (_match, name) => `下载${entity(name)}数据`
    ],
    [
      /^Upload (state|province|culture|religion|river|route|marker|label|zone|burg)s?-related data$/i,
      (_match, name) => `上传${entity(name)}数据`
    ],
    [
      /^Manually re-assign (state|province|culture|religion|river|route|marker|label|zone|burg)s?$/i,
      (_match, name) => `手动重新分配${entity(name)}`
    ],
    [
      /^Add a new (state|province|culture|religion|river|route|marker|label|zone|burg)\. Hold Shift to add multiple$/i,
      (_match, name) => `添加新${entity(name)}。按住 Shift 可连续添加`
    ],
    [
      /^Show (state|province|culture|religion|river|route|marker|label|zone|burg)s? chart$/i,
      (_match, name) => `显示${entity(name)}图表`
    ],
    [
      /^(state|province|culture|religion|river|route|marker|label|zone|burg)s? displayed$/i,
      (_match, name) => `显示${entity(name)}数`
    ]
  ];

  const ascii = /[A-Za-z]{2}/;
  let observer;
  let currentDocument;

  function translateText(value) {
    const trimmed = value.trim();
    if (!trimmed) return value;
    const direct = PHRASES[trimmed];
    if (direct !== undefined) return value.replace(trimmed, direct);
    for (const [pattern, replace] of RULES) {
      if (!pattern.test(trimmed)) continue;
      return value.replace(trimmed, trimmed.replace(pattern, replace));
    }
    return value;
  }

  function allowed(element) {
    // Elements come from the iframe realm, where the parent's `Element`
    // constructor does not match; nodeType is the realm-neutral check.
    if (!element || element.nodeType !== 1) return false;
    if (element.closest("script,style,textarea")) return false;
    return element.closest(ROOT_SELECTOR) !== null;
  }

  function translateTextNode(node) {
    const parent = node.parentElement;
    if (!parent || !allowed(parent)) return;
    const next = translateText(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  function translateAttributes(element) {
    if (!element || element.nodeType !== 1) return;
    for (const name of ATTRS) {
      const value = element.getAttribute(name);
      if (value === null) continue;
      const next = translateText(value);
      if (next !== value) element.setAttribute(name, next);
    }
  }

  function scan(element) {
    if (!element || element.nodeType !== 1 || !allowed(element)) return;
    translateAttributes(element);
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) translateTextNode(child);
      else if (child.nodeType === Node.ELEMENT_NODE) scan(child);
    }
  }

  function onMutations(records) {
    for (const record of records) {
      if (record.type === "characterData") {
        translateTextNode(record.target);
      } else if (record.type === "attributes") {
        translateAttributes(record.target);
      } else {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        }
      }
    }
  }

  function attach(doc) {
    if (doc === currentDocument || doc.body === null) return;
    currentDocument = doc;
    observer?.disconnect();
    observer = new MutationObserver(onMutations);
    for (const selector of ROOTS) {
      const root = doc.querySelector(selector);
      if (root !== null) scan(root);
    }
    // The editor replaces whole chrome roots during boot, so observe the body
    // rather than binding to the roots that happen to exist at first paint.
    observer.observe(doc.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS
    });
    const body = doc.body;
    if (!body.classList.contains("noven-i18n")) body.classList.add("noven-i18n");
  }

  function boot() {
    const frame = document.getElementById("fmg");
    if (!(frame instanceof HTMLIFrameElement)) { attach(document); return; }
    const tick = () => {
      try {
        const doc = frame.contentDocument;
        if (doc?.body) attach(doc);
      } catch {
        // The editor iframe is same-origin; a cross-origin document is not ours to translate.
      }
    };
    tick();
    window.setInterval(tick, 700);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
