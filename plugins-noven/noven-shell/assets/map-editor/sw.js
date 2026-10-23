importScripts("https://storage.googleapis.com/workbox-cdn/releases/6.2.0/workbox-sw.js");

const {registerRoute, setCatchHandler} = workbox.routing;
const {CacheFirst, NetworkFirst, StaleWhileRevalidate} = workbox.strategies;
const {CacheableResponsePlugin} = workbox.cacheableResponse;
const {ExpirationPlugin} = workbox.expiration;
const {PrecacheController, PrecacheRoute, cleanupOutdatedCaches} = workbox.precaching;

self.skipWaiting();
workbox.core.clientsClaim();

const DAY = 24 * 60 * 60; // in seconds
const precache = new PrecacheController();
precache.addToCacheList([{"url":"ai-generator-CurP_4Fm.js","revision":"0070ea91"},{"url":"annex-mode-CH38J7JT.js","revision":"eafe678e"},{"url":"app-offer-fBhkPoA9.js","revision":"98c631b6"},{"url":"auto-update-aie40W0_.js","revision":"14a2972f"},{"url":"axis-I8_pxNLd.js","revision":"ec45e31c"},{"url":"battle-screen-CUF6jAHv.js","revision":"8d5076fa"},{"url":"biomes-editor-BSBryTV1.js","revision":"8d3126c5"},{"url":"burg-creator-DtkNElvD.js","revision":"ebaecfba"},{"url":"burg-editor-Dkse-ZLL.js","revision":"b4fe45b4"},{"url":"burg-group-editor-Dw-4vnN9.js","revision":"973bdecd"},{"url":"burgs-overview-CFzuC8FV.js","revision":"57cc0366"},{"url":"cell-info-Bu9mc6SN.js","revision":"911924c1"},{"url":"charts-overview-BKTXc74Q.js","revision":"155bedbe"},{"url":"cloud-DwDnSPzM.js","revision":"56d9495c"},{"url":"coastline-editor-BffpGq7S.js","revision":"1cb2222d"},{"url":"color-picker-DDp6-cdB.js","revision":"f3692c5c"},{"url":"compare-prices-B4X5O8uA.js","revision":"7fc4a3ae"},{"url":"constant-CUk6ox2a.js","revision":"1abf13b6"},{"url":"controllers-BrstMkwk.js","revision":"0074165f"},{"url":"controls-B4wVUos3.js","revision":"0be26d37"},{"url":"cultures-editor-6YwmOl0J.js","revision":"757f9c2a"},{"url":"cultures-generator-B2OgcXeo.js","revision":"0fce2be9"},{"url":"dialog-helpers-DS9mxWMd.js","revision":"6e690948"},{"url":"diplomacy-Bee-zAdq.js","revision":"892f5265"},{"url":"diplomacy-editor-vObJSDzc.js","revision":"b654ebf6"},{"url":"diplomacy-overview-BhfjI1Rb.js","revision":"f411dc00"},{"url":"drag-Bl16t6jK.js","revision":"3e29c189"},{"url":"draw-landmass-D-vtcOTI.js","revision":"3131e213"},{"url":"dropbox.html","revision":"66bd6136"},{"url":"elevation-profile-j2MtnY8w.js","revision":"2af5a0fd"},{"url":"emblems-editor-Bw9YbM6a.js","revision":"6c4b6cdd"},{"url":"emblems-generator-CeUZxp9A.js","revision":"e28b2703"},{"url":"export-B11bJ_Rq.js","revision":"cfbd40a1"},{"url":"export-json-DbP1ehSq.js","revision":"98cca6a5"},{"url":"extent-V-JVJWfI.js","revision":"38b4e56c"},{"url":"features-generator-B9s8Notr.js","revision":"0a9af175"},{"url":"features-overview-DQNKpaXX.js","revision":"e5cf56a2"},{"url":"fonts-BZxN4Obh.js","revision":"edf14745"},{"url":"generation-pipeline-QY581QsE.js","revision":"9f3be215"},{"url":"good-editor-Dxbv6wuv.js","revision":"21c42e40"},{"url":"goods-distribution-editor-DdYgVnbN.js","revision":"dfcc4e5d"},{"url":"goods-editor-DxHtEF8_.js","revision":"d555fef6"},{"url":"graph-override-CTajfJ6x.js","revision":"130a1b01"},{"url":"heightmap-selection-mXKwxsf7.js","revision":"e9d9e307"},{"url":"heightmaps/africa-centric.png","revision":"5983b84f"},{"url":"heightmaps/arabia.png","revision":"60e4b200"},{"url":"heightmaps/atlantics.png","revision":"297ee191"},{"url":"heightmaps/britain.png","revision":"184d3e92"},{"url":"heightmaps/caribbean.png","revision":"e3a7f190"},{"url":"heightmaps/east-asia.png","revision":"7a7cc7e1"},{"url":"heightmaps/eurasia.png","revision":"b39d203b"},{"url":"heightmaps/europe-accented.png","revision":"e83ef22a"},{"url":"heightmaps/europe-and-central-asia.png","revision":"a78319b6"},{"url":"heightmaps/europe-central.png","revision":"28f7f5f5"},{"url":"heightmaps/europe-north.png","revision":"5c75687a"},{"url":"heightmaps/europe.png","revision":"7f7debbe"},{"url":"heightmaps/greenland.png","revision":"403c79ec"},{"url":"heightmaps/hellenica.png","revision":"a26c47fe"},{"url":"heightmaps/iceland.png","revision":"9e6b3932"},{"url":"heightmaps/import-rules.txt","revision":"717d7d5b"},{"url":"heightmaps/indian-ocean.png","revision":"0fde55cb"},{"url":"heightmaps/mediterranean-sea.png","revision":"da56ae5f"},{"url":"heightmaps/middle-east.png","revision":"f7764042"},{"url":"heightmaps/north-america.png","revision":"a34787a2"},{"url":"heightmaps/us-centric.png","revision":"8f491da6"},{"url":"heightmaps/us-mainland.png","revision":"4d5b9521"},{"url":"heightmaps/world-from-pacific.png","revision":"64a9b798"},{"url":"heightmaps/world.png","revision":"71e82ef4"},{"url":"hierarchy-tree-etJUUugO.js","revision":"31107ac6"},{"url":"highlight-rFg_BwKw.js","revision":"a322a55d"},{"url":"highlighting-UKkABEOD.js","revision":"9c030dd0"},{"url":"ice-editor-gwut--84.js","revision":"a0d17611"},{"url":"icon-picker-CET-kbij.js","revision":"1e3833e2"},{"url":"icons-archive-CzoAyi1l.js","revision":"8deb60c3"},{"url":"icons-burgs-B24413Qn.js","revision":"cfac3eb1"},{"url":"icons-charges-agriculture-FZS7-KtM.js","revision":"e0b8030f"},{"url":"icons-charges-architecture-KTnVEsRl.js","revision":"c3f4b77a"},{"url":"icons-charges-arms-CbXfhufj.js","revision":"8eda1d5d"},{"url":"icons-charges-beastHeads-D6dgzeO9.js","revision":"e7b20168"},{"url":"icons-charges-beasts-DNvTkaDd.js","revision":"d4a7b80f"},{"url":"icons-charges-birds-BboD7mXg.js","revision":"eb558cc9"},{"url":"icons-charges-bodyparts-BuKbwMC1.js","revision":"d5df175c"},{"url":"icons-charges-bugs-DxOyqhmQ.js","revision":"f7ef1855"},{"url":"icons-charges-conventional-Cr6QO9yV.js","revision":"a26eab56"},{"url":"icons-charges-crosses-DjWAUcQK.js","revision":"31deba5d"},{"url":"icons-charges-fantastic-B4d5bv3r.js","revision":"7828924f"},{"url":"icons-charges-fishes-Bk5dhJvb.js","revision":"2be3bb4f"},{"url":"icons-charges-miscellaneous-BAj_iC6-.js","revision":"72b1862b"},{"url":"icons-charges-molluscs-CH-6rF7U.js","revision":"4d748871"},{"url":"icons-charges-ornaments-Wa0j7Jfj.js","revision":"9ea9d799"},{"url":"icons-charges-people-BWF5gqXv.js","revision":"644d5ca9"},{"url":"icons-charges-plants-B6ubLZAU.js","revision":"8f57248e"},{"url":"icons-charges-reptiles-BR9YneYc.js","revision":"6007d946"},{"url":"icons-charges-seafaring-4sgdMpRt.js","revision":"34d39ea0"},{"url":"icons-charges-tools-COgqQEcz.js","revision":"56766af0"},{"url":"icons-goods-BTwedJXr.js","revision":"7f70a742"},{"url":"icons-list-BiXau1Li.js","revision":"e1122591"},{"url":"icons-ports-CvcJxePd.js","revision":"18b60b56"},{"url":"icons-relief-colored-Cq_lY5Xv.js","revision":"c32c249c"},{"url":"icons-relief-gray-B0iZ1zvh.js","revision":"debe0de5"},{"url":"icons-relief-illustrated-Db6vGYZS.js","revision":"f51d3d6b"},{"url":"icons-relief-simple-Bq1wIzCe.js","revision":"cf9cd5e4"},{"url":"icons-relief-stickers-BTFo_C8E.js","revision":"383a3886"},{"url":"icons.css","revision":"1421ad39"},{"url":"images/Discord.png","revision":"c286fac8"},{"url":"images/Facebook.png","revision":"d8f6fd63"},{"url":"images/Pinterest.png","revision":"8180482a"},{"url":"images/Reddit.png","revision":"1d9fb4c9"},{"url":"images/Twitter.png","revision":"3d4be405"},{"url":"images/icons/favicon-16x16.png","revision":"ef1dc52c"},{"url":"images/icons/favicon-32x32.png","revision":"85b2ed24"},{"url":"images/icons/icon_x512.png","revision":"96db41ec"},{"url":"images/icons/maskable_icon_x128.png","revision":"43deca06"},{"url":"images/icons/maskable_icon_x192.png","revision":"8df7457d"},{"url":"images/icons/maskable_icon_x384.png","revision":"29269c99"},{"url":"images/icons/maskable_icon_x512.png","revision":"a4549048"},{"url":"images/kiwiroo.png","revision":"61f54115"},{"url":"images/markers/ship.svg","revision":"2ab0488f"},{"url":"images/markers/wagon.svg","revision":"b886e64e"},{"url":"images/pattern1.png","revision":"5bed361c"},{"url":"images/pattern2.png","revision":"f0940ccd"},{"url":"images/pattern3.png","revision":"e17a59c5"},{"url":"images/pattern4.png","revision":"4c29905f"},{"url":"images/pattern5.png","revision":"27767e4b"},{"url":"images/pattern6.png","revision":"54e9be30"},{"url":"images/preview.png","revision":"d30e01fe"},{"url":"images/style-presets/ancient.avif","revision":"1f8ce67c"},{"url":"images/style-presets/atlas.avif","revision":"8c4871c4"},{"url":"images/style-presets/cinderwood.avif","revision":"c24dd37c"},{"url":"images/style-presets/clean.avif","revision":"c4cccc45"},{"url":"images/style-presets/cyberpunk.avif","revision":"48b0c56e"},{"url":"images/style-presets/darkSeas.avif","revision":"44b7954c"},{"url":"images/style-presets/default.avif","revision":"347a7e43"},{"url":"images/style-presets/frostbite.avif","revision":"bbbbaeef"},{"url":"images/style-presets/gloom.avif","revision":"0ab45eb3"},{"url":"images/style-presets/ink.avif","revision":"b622b205"},{"url":"images/style-presets/light.avif","revision":"7196d45a"},{"url":"images/style-presets/monochrome.avif","revision":"39b3cdd1"},{"url":"images/style-presets/night.avif","revision":"8d13e517"},{"url":"images/style-presets/pale.avif","revision":"6827632a"},{"url":"images/style-presets/watercolor.avif","revision":"e0c90db2"},{"url":"images/textures/antique-big.jpg","revision":"e018ce4b"},{"url":"images/textures/antique-small.jpg","revision":"18ebde80"},{"url":"images/textures/folded-paper-big.jpg","revision":"eb156d1b"},{"url":"images/textures/folded-paper-small.jpg","revision":"d4588330"},{"url":"images/textures/gray-paper.jpg","revision":"79d3e355"},{"url":"images/textures/iran-small.jpg","revision":"7a2c9c37"},{"url":"images/textures/marble-big.jpg","revision":"264f0ff8"},{"url":"images/textures/marble-blue-big.jpg","revision":"85017608"},{"url":"images/textures/marble-blue-small.jpg","revision":"7aa3717b"},{"url":"images/textures/marble-small.jpg","revision":"062aabd9"},{"url":"images/textures/mars-big.jpg","revision":"e835a07b"},{"url":"images/textures/mars-small.jpg","revision":"6cefbda7"},{"url":"images/textures/mauritania-small.jpg","revision":"8886930b"},{"url":"images/textures/mercury-big.jpg","revision":"1603b5c7"},{"url":"images/textures/mercury-small.jpg","revision":"334fbff6"},{"url":"images/textures/ocean.jpg","revision":"4fc82bfc"},{"url":"images/textures/pergamena-small.jpg","revision":"eeb50ab4"},{"url":"images/textures/plaster.jpg","revision":"0094ce95"},{"url":"images/textures/soiled-paper-vertical.png","revision":"0b33f76d"},{"url":"images/textures/soiled-paper.jpg","revision":"af3e72ba"},{"url":"images/textures/spain-small.jpg","revision":"c7fdf23d"},{"url":"images/textures/timbercut-big.jpg","revision":"1f009d0e"},{"url":"images/textures/timbercut-small.jpg","revision":"93c12f56"},{"url":"images/tour-button-icon.png","revision":"093d2feb"},{"url":"images/waves.png","revision":"d6665b72"},{"url":"images/whitecaps.png","revision":"02c85e61"},{"url":"index-Cwm3CXVK.js","revision":"538c3b5b"},{"url":"index.css","revision":"61a87fe3"},{"url":"index.html","revision":"0d0761a7"},{"url":"journey-editor-BHKzGyhm.js","revision":"8288f4ca"},{"url":"journey-travel-DLb4ElUL.js","revision":"ab6b10e5"},{"url":"journeys-overview-hMqIu4ik.js","revision":"43f4eb9d"},{"url":"label-arc-DZtu_da5.js","revision":"31ca0ce6"},{"url":"label-creator-CP_gINsa.js","revision":"776276af"},{"url":"labels-editor-DT1P7WGM.js","revision":"6db12474"},{"url":"labels-generator-Dan3oY7y.js","revision":"483f9e53"},{"url":"labels-group-editor-CuY6-UWf.js","revision":"14143003"},{"url":"labels-overview-BHWLQY1T.js","revision":"bcde02e6"},{"url":"lakes-editor-CTiNcQKf.js","revision":"8723cc78"},{"url":"layer-labels-B4jLVCV-.js","revision":"23cdeb59"},{"url":"layers-DIeLdGlo.js","revision":"0e697574"},{"url":"layers-tab-Ct7nc31Z.js","revision":"553d1c65"},{"url":"libs/alea.min.js","revision":"4e59c20e"},{"url":"libs/d3.min.js","revision":"c6c1a886"},{"url":"libs/delaunator.min.js","revision":"ddbdb0f6"},{"url":"libs/dropbox-sdk.min.js","revision":"72c63328"},{"url":"libs/flatqueue.js","revision":"c41f52be"},{"url":"libs/indexedDB.js","revision":"84a8bb23"},{"url":"libs/jquery-3.1.1.min.js","revision":"85556761"},{"url":"libs/jquery-ui.css","revision":"f2ff5e58"},{"url":"libs/jquery-ui.min.js","revision":"e3c94d49"},{"url":"libs/jquery.ui.touch-punch.min.js","revision":"000854d7"},{"url":"libs/jszip.min.js","revision":"301f9629"},{"url":"libs/loopsubdivison.min.js","revision":"f4446f9b"},{"url":"libs/mapControls.min.js","revision":"7afc1cd5"},{"url":"libs/objexporter.min.js","revision":"3b879583"},{"url":"libs/orbitControls.min.js","revision":"93ead010"},{"url":"libs/polylabel.min.js","revision":"940d1f19"},{"url":"libs/rgbquant.min.js","revision":"557e7e62"},{"url":"libs/simplify.js","revision":"2580cc23"},{"url":"libs/three.min.js","revision":"941d19ba"},{"url":"limitation-picker-CNT2nh2u.js","revision":"2401f5bd"},{"url":"lore-editor-C5BunMDi.js","revision":"6031f820"},{"url":"manifest.webmanifest","revision":"b989c1f5"},{"url":"map-brush-Bja-1E8W.js","revision":"2cfd3571"},{"url":"map-placement-SZeDhMFD.js","revision":"01cf99b9"},{"url":"marker-creator-D7II13kl.js","revision":"d776ee39"},{"url":"markers-editor-CbRqwqdw.js","revision":"11187631"},{"url":"markers-in-radius-DhnqS5nr.js","revision":"3e93dac7"},{"url":"markers-overview-CTWf0Wl0.js","revision":"dd0c89ea"},{"url":"markers-settings-Bxjr6l1t.js","revision":"510cba70"},{"url":"market-deals-overview-DqVciKXG.js","revision":"4b722369"},{"url":"market-overview-nf9bq50w.js","revision":"19641637"},{"url":"markets-overview-Ghb0Pt7L.js","revision":"fabbafac"},{"url":"mean-4Awewi9R.js","revision":"705d432d"},{"url":"measurers-editor-BCTlgnKp.js","revision":"5d409495"},{"url":"median-DcgPm6YA.js","revision":"1cd2c0a2"},{"url":"military-overview-B0qn3yUX.js","revision":"f3065027"},{"url":"minIndex-4vd4__Hw.js","revision":"bfbd0989"},{"url":"minimap-BE32Z-c_.js","revision":"99169a7c"},{"url":"names-generator-CzP_RmI8.js","revision":"37e5cca5"},{"url":"namesbase-editor-BZafk4Ak.js","revision":"bfc47ad2"},{"url":"natural-kerJ22Hb.js","revision":"66fc8def"},{"url":"notes-C7jvcLve.js","revision":"f6589528"},{"url":"notes-editor-DVB7LGv8.css","revision":"f77202e3"},{"url":"notes-editor-ijGFoof-.js","revision":"40bc46e1"},{"url":"noven-host.html","revision":"7393b168"},{"url":"noven-i18n.js","revision":"c1bb137b"},{"url":"noven-shell.css","revision":"ce8d9d42"},{"url":"noven-shell.js","revision":"565889ef"},{"url":"noven-theme.css","revision":"16cece9b"},{"url":"omnibar-BwdFyayE.js","revision":"b167c4ef"},{"url":"options-schema-CpDo-2q5.js","revision":"b49f34d1"},{"url":"options-tab-Cr1amyfh.js","revision":"c086d6b5"},{"url":"pack-CyBKcrr4.js","revision":"f082fa13"},{"url":"paint-editor-j0s4myzf.js","revision":"63cb0ac2"},{"url":"pictures-BxBNZ7oZ.js","revision":"3da8b536"},{"url":"pins-D3nomYHl.js","revision":"500c778a"},{"url":"platform-BpT4CoYe.js","revision":"3d0310d6"},{"url":"population-generator-WbIkbQDE.js","revision":"14452b88"},{"url":"preload-helper-kNaey6uv.js","revision":"2f8a57ae"},{"url":"production-chains-BcBDgEm8.js","revision":"466fa32d"},{"url":"production-overview-oftY_Bqu.js","revision":"335924a6"},{"url":"provinces-editor-BHnPiWd9.js","revision":"49250b8a"},{"url":"regiment-editor-DqHVAoJC.js","revision":"7f44b848"},{"url":"regiments-overview-DW3Ivxrv.js","revision":"5930a296"},{"url":"relief-editor-JhX4pVPg.js","revision":"5e1c5018"},{"url":"relief-generator-DkSFXP9m.js","revision":"616d0a9b"},{"url":"relief-pool-editor-CtgJoe8y.js","revision":"166601ec"},{"url":"relief-previews-CJjLmiJy.js","revision":"7adbf0da"},{"url":"relief-rules-editor-CyHmCgbt.js","revision":"d7de53b2"},{"url":"religions-editor-mnoufo2E.js","revision":"db30118a"},{"url":"river-auto-creator-0Shb431r.js","revision":"572c0704"},{"url":"river-creator-BapL5as1.js","revision":"a8fcb06b"},{"url":"river-editor-DGulcwe3.js","revision":"bb6cb161"},{"url":"rivers-overview-23JrLUu8.js","revision":"c658d232"},{"url":"rolldown-runtime-QTnfLwEv.js","revision":"5db5ba82"},{"url":"route-creator-B9kr4S2Z.js","revision":"62fd9c16"},{"url":"route-editor-D5yK-zL7.js","revision":"9d391540"},{"url":"route-groups-editor-Cu5omnoq.js","revision":"322332d8"},{"url":"routes-overview-DvFHkPZp.js","revision":"6de1718a"},{"url":"schemaUtils-B2thnuln.js","revision":"a52a8755"},{"url":"sin-DYm9hqTl.js","revision":"fe4d8721"},{"url":"state-B2hBYDzv.js","revision":"566a1269"},{"url":"states-editor-DhZbyfy1.js","revision":"1a0d4e3e"},{"url":"stratify-CGdiYggi.js","revision":"171bdc70"},{"url":"style-editor-BcOzlJId.js","revision":"f90e0664"},{"url":"style-preset-DClMWCBK.js","revision":"1cc7cd4c"},{"url":"style-presets-DbFmf_7q.js","revision":"f35de1cb"},{"url":"styles-BdF3bynh.js","revision":"9eb25f31"},{"url":"styles-legacy-CbFmeQaz.js","revision":"d104e9a0"},{"url":"styles/ancient.json","revision":"0011d9de"},{"url":"styles/atlas.json","revision":"201e4fcb"},{"url":"styles/cinderwood.json","revision":"5c591977"},{"url":"styles/clean.json","revision":"49b623c7"},{"url":"styles/cyberpunk.json","revision":"4e12a326"},{"url":"styles/darkSeas.json","revision":"a7d75f44"},{"url":"styles/frostbite.json","revision":"7f3441c2"},{"url":"styles/gloom.json","revision":"c45948e1"},{"url":"styles/ink.json","revision":"0280465e"},{"url":"styles/light.json","revision":"4d536af2"},{"url":"styles/monochrome.json","revision":"74b527e6"},{"url":"styles/night.json","revision":"2a83c18e"},{"url":"styles/pale.json","revision":"9c466eaf"},{"url":"styles/watercolor.json","revision":"4cb1e78e"},{"url":"submap-tool-De7IvKZ2.js","revision":"adccce3f"},{"url":"sum-BpJJqxFM.js","revision":"a5c15474"},{"url":"table-Bt05xoGB.js","revision":"11292e8c"},{"url":"temperature-graph-GuiuWQRN.js","revision":"f91d18fd"},{"url":"tooltips-CZta3-Qx.js","revision":"ffbff5c6"},{"url":"trade-animation-editor-DvO6A1Cm.js","revision":"52e80bf7"},{"url":"trade-details-BX4CCPEn.js","revision":"7a6f803c"},{"url":"transform-tool-BIukhaIc.js","revision":"e62d55f9"},{"url":"transport-editor-DeFPagC8.js","revision":"09516010"},{"url":"transports-generator-Dv1kk2bu.js","revision":"28805396"},{"url":"ui-tour-B3l7mx48.css","revision":"df5e188e"},{"url":"ui-tour-BKtp7fq-.js","revision":"2e5b435d"},{"url":"units-editor-ZNM1EJ3j.js","revision":"2bdb6284"},{"url":"utils-C0Xrn36t.js","revision":"32a89683"},{"url":"validationUtils-cfDkYsje.js","revision":"0b2b4355"},{"url":"versioning-D4ioougV.js","revision":"0dd06ef2"},{"url":"view-3d-BUXJJm91.js","revision":"85170977"},{"url":"view-3d-options-DjhMN5EO.js","revision":"164be0d1"},{"url":"view-3d-renderer-BU4DGk6k.js","revision":"3aaf4834"},{"url":"view-mode-Bb6sP84q.js","revision":"7aab53a8"},{"url":"viewbox-events-BrRVcn1L.js","revision":"b2026494"},{"url":"viewport-C0deAIKO.js","revision":"a398cde9"},{"url":"world-configurator-BhPcroQQ.js","revision":"4c4d048e"},{"url":"wrap-tool-DIU7w69m.js","revision":"d790be5e"},{"url":"zones-editor-BSo__5ts.js","revision":"300857ba"},{"url":"zoom-QQcd47St.js","revision":"afcacd89"}] || []);
const assets = new CacheFirst({
  cacheName: precache.strategy.cacheName,
  plugins: [...precache.strategy.plugins, new CacheableResponsePlugin({statuses: [200]})]
});
const runtimeAssets = new CacheFirst({
  cacheName: "fmg-assets",
  plugins: [...assets.plugins, new ExpirationPlugin({maxEntries: 100, maxAgeSeconds: 30 * DAY})]
});
const indexURL = new URL("index.html", self.location.href).href;
const offlineCacheName = `fmg-offline-${self.registration.scope}`;
let offlineDownload;

registerRoute(
  ({request}) => request.mode === "navigate",
  new NetworkFirst({
    networkTimeoutSeconds: 15,
    cacheName: "fmg-html",
    plugins: [
      new CacheableResponsePlugin({statuses: [0, 200]}),
      {cachedResponseWillBeUsed: async ({cachedResponse}) => (await offlinePage()) || cachedResponse}
    ]
  })
);

cleanupOutdatedCaches();
const assetRoute = new PrecacheRoute(precache, {ignoreURLParametersMatching: [/.*/]});
registerRoute(assetRoute.match, async options => {
  const stamp = options.url.searchParams.get("v");
  if (/^[a-f0-9]{8}$/.test(stamp)) {
    // Keep content-hash stamps from stamp-assets.js tied to their original revision.
    const key = new URL(options.params.cacheKey);
    key.searchParams.set("__WB_REVISION__", stamp);
    options.params.cacheKey = key.href;
  }
  return (await caches.match(options.params.cacheKey, {cacheName: assets.cacheName})) || runtimeAssets.handle(options);
});

self.addEventListener("message", event => {
  if (event.data?.type !== "CACHE_OFFLINE") return;
  offlineDownload ||= cacheOffline(event).finally(() => { offlineDownload = undefined; });
  event.waitUntil(offlineDownload.then(
    () => event.ports[0]?.postMessage({type: "CACHE_OFFLINE", ok: true}),
    error => {
      console.warn("Offline caching failed: ", error);
      event.ports[0]?.postMessage({type: "CACHE_OFFLINE", ok: false});
    }
  ));
});

async function cacheOffline(event) {
  const offlineCache = await caches.open(offlineCacheName);
  const previous = await offlinePage();
  if (previous) await offlineCache.put(indexURL, previous);

  // Commit the offline page and remove old assets only after the whole download succeeds.
  const urls = precache.getCachedURLs().filter(url => url !== indexURL);
  urls.push(indexURL);
  for (const url of urls) {
    const request = new Request(url, {cache: "reload", credentials: "same-origin"});
    const [response] = await Promise.all(assets.handleAll({event, request}));
    if (response.status !== 200) throw new Error(`Cannot cache ${url}: ${response.status}`);
  }
  await offlineCache.put(indexURL, await precache.matchPrecache(indexURL));
  await precache.activate(event);
}

async function offlinePage() {
  const offlineCache = await caches.open(offlineCacheName);
  const cache = await caches.open(assets.cacheName);
  return (await offlineCache.match(indexURL)) || cache.match(indexURL, {ignoreSearch: true});
}

setCatchHandler(async ({request}) => {
  if (request.mode === "navigate") return (await offlinePage()) || Response.error();
  const cache = await caches.open(assets.cacheName);
  return (await cache.match(request, {ignoreSearch: true})) || Response.error();
});

const retainedAssets = {
  cachedResponseWillBeUsed: async ({request, cachedResponse}) =>
    cachedResponse || caches.match(request, {cacheName: assets.cacheName, ignoreSearch: true})
};

// Google-hosted scripts (analytics) are left to the browser: with a blocker installed the
// request never gets a response, and a worker strategy would surface that as an uncaught error
registerRoute(
  ({request, url}) =>
    request.destination === "script" &&
    !url.pathname.endsWith("min.js") &&
    !url.hostname.includes("google"),
  new StaleWhileRevalidate({
    cacheName: "fmg-scripts",
    plugins: [
      new CacheableResponsePlugin({statuses: [0, 200]}),
      new ExpirationPlugin({maxEntries: 100, maxAgeSeconds: 30 * DAY}),
      retainedAssets
    ]
  })
);

registerRoute(
  ({request}) => request.destination === "style",
  new CacheFirst({
    cacheName: "fmg-stylesheets",
    plugins: [
      new CacheableResponsePlugin({statuses: [0, 200]}),
      new ExpirationPlugin({maxEntries: 100, maxAgeSeconds: 30 * DAY}),
      retainedAssets
    ]
  })
);

registerRoute(
  ({request, url}) => request.destination === "script" && url.pathname.endsWith("min.js"),
  new CacheFirst({
    cacheName: "fmg-libs",
    plugins: [
      new CacheableResponsePlugin({statuses: [0, 200]}),
      new ExpirationPlugin({maxEntries: 100, maxAgeSeconds: 30 * DAY}),
      retainedAssets
    ]
  })
);

registerRoute(
  new RegExp(".json$"),
  new CacheFirst({
    cacheName: "fmg-json",
    plugins: [
      new CacheableResponsePlugin({statuses: [0, 200]}),
      new ExpirationPlugin({maxEntries: 100, maxAgeSeconds: 30 * DAY}),
      retainedAssets
    ]
  })
);

registerRoute(
  ({request}) => request.destination === "image",
  new CacheFirst({
    cacheName: "fmg-images",
    plugins: [
      new CacheableResponsePlugin({statuses: [0, 200]}),
      new ExpirationPlugin({maxEntries: 100, maxAgeSeconds: 60 * DAY}),
      retainedAssets
    ]
  })
);

registerRoute(
  ({request}) => request.destination === "font",
  new CacheFirst({
    cacheName: "fmg-fonts",
    plugins: [
      new CacheableResponsePlugin({statuses: [0, 200]}),
      new ExpirationPlugin({maxEntries: 100, maxAgeSeconds: 60 * DAY}),
      retainedAssets
    ]
  })
);
