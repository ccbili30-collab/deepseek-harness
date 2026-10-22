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
precache.addToCacheList([{"url":"ai-generator-CurP_4Fm.js","revision":"0070ea91"},{"url":"annex-mode-B1Py71-1.js","revision":"3c1dea62"},{"url":"app-offer-fBhkPoA9.js","revision":"98c631b6"},{"url":"auto-update-CaCtAqrt.js","revision":"9c08be87"},{"url":"axis-I8_pxNLd.js","revision":"ec45e31c"},{"url":"battle-screen-BhyZ-zhe.js","revision":"2d8da3b6"},{"url":"biomes-editor-UG09C6g5.js","revision":"d4f0f92d"},{"url":"burg-creator-dlp2jiem.js","revision":"d5348ca6"},{"url":"burg-editor-DUC9JRLl.js","revision":"6f5af505"},{"url":"burg-group-editor-C3Msj_UB.js","revision":"2b4fa755"},{"url":"burgs-overview-C-5PE1Je.js","revision":"e4e404b4"},{"url":"cell-info-Bu9mc6SN.js","revision":"911924c1"},{"url":"charts-overview-BKTXc74Q.js","revision":"155bedbe"},{"url":"cloud-DwDnSPzM.js","revision":"56d9495c"},{"url":"coastline-editor-IuRz8pc8.js","revision":"c49cc245"},{"url":"color-picker-DDp6-cdB.js","revision":"f3692c5c"},{"url":"compare-prices-C6NSGDxh.js","revision":"e741c0f0"},{"url":"constant-CUk6ox2a.js","revision":"1abf13b6"},{"url":"controllers-CIDnRwoN.js","revision":"7f9b003e"},{"url":"controls-CAI4mkGv.js","revision":"c36f5f49"},{"url":"cultures-editor-BJIFuQ-Q.js","revision":"e4737c11"},{"url":"cultures-generator-B2OgcXeo.js","revision":"0fce2be9"},{"url":"dialog-helpers-DS9mxWMd.js","revision":"6e690948"},{"url":"diplomacy-BkYdSTJA.js","revision":"bb7c5449"},{"url":"diplomacy-editor-BOYs7lXL.js","revision":"63e39d89"},{"url":"diplomacy-overview-lTMljajI.js","revision":"2360f8b8"},{"url":"drag-Bl16t6jK.js","revision":"3e29c189"},{"url":"draw-landmass-D-vtcOTI.js","revision":"3131e213"},{"url":"dropbox.html","revision":"66bd6136"},{"url":"elevation-profile-j2MtnY8w.js","revision":"2af5a0fd"},{"url":"emblems-editor-DjOmnj36.js","revision":"3ba3ed16"},{"url":"emblems-generator-CeUZxp9A.js","revision":"e28b2703"},{"url":"export-BHD28v3A.js","revision":"0c4e7b1d"},{"url":"export-json-DbP1ehSq.js","revision":"98cca6a5"},{"url":"extent-V-JVJWfI.js","revision":"38b4e56c"},{"url":"features-generator-x4efiAu_.js","revision":"f2ea72e4"},{"url":"features-overview-B2BlDIkL.js","revision":"aa671945"},{"url":"fonts-BZxN4Obh.js","revision":"edf14745"},{"url":"generation-pipeline-BV-nvoWf.js","revision":"24aa3079"},{"url":"good-editor-tU9gmZiu.js","revision":"fb11066d"},{"url":"goods-distribution-editor-DdYgVnbN.js","revision":"dfcc4e5d"},{"url":"goods-editor-DTNbQ8Iz.js","revision":"ccdac6af"},{"url":"graph-override-CdqrfcKJ.js","revision":"7efb727b"},{"url":"heightmap-selection-CUHz5FPl.js","revision":"ff653906"},{"url":"heightmaps/africa-centric.png","revision":"5983b84f"},{"url":"heightmaps/arabia.png","revision":"60e4b200"},{"url":"heightmaps/atlantics.png","revision":"297ee191"},{"url":"heightmaps/britain.png","revision":"184d3e92"},{"url":"heightmaps/caribbean.png","revision":"e3a7f190"},{"url":"heightmaps/east-asia.png","revision":"7a7cc7e1"},{"url":"heightmaps/eurasia.png","revision":"b39d203b"},{"url":"heightmaps/europe-accented.png","revision":"e83ef22a"},{"url":"heightmaps/europe-and-central-asia.png","revision":"a78319b6"},{"url":"heightmaps/europe-central.png","revision":"28f7f5f5"},{"url":"heightmaps/europe-north.png","revision":"5c75687a"},{"url":"heightmaps/europe.png","revision":"7f7debbe"},{"url":"heightmaps/greenland.png","revision":"403c79ec"},{"url":"heightmaps/hellenica.png","revision":"a26c47fe"},{"url":"heightmaps/iceland.png","revision":"9e6b3932"},{"url":"heightmaps/import-rules.txt","revision":"717d7d5b"},{"url":"heightmaps/indian-ocean.png","revision":"0fde55cb"},{"url":"heightmaps/mediterranean-sea.png","revision":"da56ae5f"},{"url":"heightmaps/middle-east.png","revision":"f7764042"},{"url":"heightmaps/north-america.png","revision":"a34787a2"},{"url":"heightmaps/us-centric.png","revision":"8f491da6"},{"url":"heightmaps/us-mainland.png","revision":"4d5b9521"},{"url":"heightmaps/world-from-pacific.png","revision":"64a9b798"},{"url":"heightmaps/world.png","revision":"71e82ef4"},{"url":"hierarchy-tree-etJUUugO.js","revision":"31107ac6"},{"url":"highlight-rFg_BwKw.js","revision":"a322a55d"},{"url":"highlighting-UKkABEOD.js","revision":"9c030dd0"},{"url":"ice-editor-n2W6OnHG.js","revision":"9e860be9"},{"url":"icon-picker-CET-kbij.js","revision":"1e3833e2"},{"url":"icons-archive-CzoAyi1l.js","revision":"8deb60c3"},{"url":"icons-burgs-B24413Qn.js","revision":"cfac3eb1"},{"url":"icons-charges-agriculture-FZS7-KtM.js","revision":"e0b8030f"},{"url":"icons-charges-architecture-KTnVEsRl.js","revision":"c3f4b77a"},{"url":"icons-charges-arms-CbXfhufj.js","revision":"8eda1d5d"},{"url":"icons-charges-beastHeads-D6dgzeO9.js","revision":"e7b20168"},{"url":"icons-charges-beasts-DNvTkaDd.js","revision":"d4a7b80f"},{"url":"icons-charges-birds-BboD7mXg.js","revision":"eb558cc9"},{"url":"icons-charges-bodyparts-BuKbwMC1.js","revision":"d5df175c"},{"url":"icons-charges-bugs-DxOyqhmQ.js","revision":"f7ef1855"},{"url":"icons-charges-conventional-Cr6QO9yV.js","revision":"a26eab56"},{"url":"icons-charges-crosses-DjWAUcQK.js","revision":"31deba5d"},{"url":"icons-charges-fantastic-B4d5bv3r.js","revision":"7828924f"},{"url":"icons-charges-fishes-Bk5dhJvb.js","revision":"2be3bb4f"},{"url":"icons-charges-miscellaneous-BAj_iC6-.js","revision":"72b1862b"},{"url":"icons-charges-molluscs-CH-6rF7U.js","revision":"4d748871"},{"url":"icons-charges-ornaments-Wa0j7Jfj.js","revision":"9ea9d799"},{"url":"icons-charges-people-BWF5gqXv.js","revision":"644d5ca9"},{"url":"icons-charges-plants-B6ubLZAU.js","revision":"8f57248e"},{"url":"icons-charges-reptiles-BR9YneYc.js","revision":"6007d946"},{"url":"icons-charges-seafaring-4sgdMpRt.js","revision":"34d39ea0"},{"url":"icons-charges-tools-COgqQEcz.js","revision":"56766af0"},{"url":"icons-goods-BTwedJXr.js","revision":"7f70a742"},{"url":"icons-list-BiXau1Li.js","revision":"e1122591"},{"url":"icons-ports-CvcJxePd.js","revision":"18b60b56"},{"url":"icons-relief-colored-Cq_lY5Xv.js","revision":"c32c249c"},{"url":"icons-relief-gray-B0iZ1zvh.js","revision":"debe0de5"},{"url":"icons-relief-illustrated-Db6vGYZS.js","revision":"f51d3d6b"},{"url":"icons-relief-simple-Bq1wIzCe.js","revision":"cf9cd5e4"},{"url":"icons-relief-stickers-BTFo_C8E.js","revision":"383a3886"},{"url":"icons.css","revision":"1421ad39"},{"url":"images/Discord.png","revision":"c286fac8"},{"url":"images/Facebook.png","revision":"d8f6fd63"},{"url":"images/Pinterest.png","revision":"8180482a"},{"url":"images/Reddit.png","revision":"1d9fb4c9"},{"url":"images/Twitter.png","revision":"3d4be405"},{"url":"images/icons/favicon-16x16.png","revision":"ef1dc52c"},{"url":"images/icons/favicon-32x32.png","revision":"85b2ed24"},{"url":"images/icons/icon_x512.png","revision":"96db41ec"},{"url":"images/icons/maskable_icon_x128.png","revision":"43deca06"},{"url":"images/icons/maskable_icon_x192.png","revision":"8df7457d"},{"url":"images/icons/maskable_icon_x384.png","revision":"29269c99"},{"url":"images/icons/maskable_icon_x512.png","revision":"a4549048"},{"url":"images/kiwiroo.png","revision":"61f54115"},{"url":"images/markers/ship.svg","revision":"2ab0488f"},{"url":"images/markers/wagon.svg","revision":"b886e64e"},{"url":"images/pattern1.png","revision":"5bed361c"},{"url":"images/pattern2.png","revision":"f0940ccd"},{"url":"images/pattern3.png","revision":"e17a59c5"},{"url":"images/pattern4.png","revision":"4c29905f"},{"url":"images/pattern5.png","revision":"27767e4b"},{"url":"images/pattern6.png","revision":"54e9be30"},{"url":"images/preview.png","revision":"d30e01fe"},{"url":"images/style-presets/ancient.avif","revision":"1f8ce67c"},{"url":"images/style-presets/atlas.avif","revision":"8c4871c4"},{"url":"images/style-presets/cinderwood.avif","revision":"c24dd37c"},{"url":"images/style-presets/clean.avif","revision":"c4cccc45"},{"url":"images/style-presets/cyberpunk.avif","revision":"48b0c56e"},{"url":"images/style-presets/darkSeas.avif","revision":"44b7954c"},{"url":"images/style-presets/default.avif","revision":"347a7e43"},{"url":"images/style-presets/frostbite.avif","revision":"bbbbaeef"},{"url":"images/style-presets/gloom.avif","revision":"0ab45eb3"},{"url":"images/style-presets/ink.avif","revision":"b622b205"},{"url":"images/style-presets/light.avif","revision":"7196d45a"},{"url":"images/style-presets/monochrome.avif","revision":"39b3cdd1"},{"url":"images/style-presets/night.avif","revision":"8d13e517"},{"url":"images/style-presets/pale.avif","revision":"6827632a"},{"url":"images/style-presets/watercolor.avif","revision":"e0c90db2"},{"url":"images/textures/antique-big.jpg","revision":"e018ce4b"},{"url":"images/textures/antique-small.jpg","revision":"18ebde80"},{"url":"images/textures/folded-paper-big.jpg","revision":"eb156d1b"},{"url":"images/textures/folded-paper-small.jpg","revision":"d4588330"},{"url":"images/textures/gray-paper.jpg","revision":"79d3e355"},{"url":"images/textures/iran-small.jpg","revision":"7a2c9c37"},{"url":"images/textures/marble-big.jpg","revision":"264f0ff8"},{"url":"images/textures/marble-blue-big.jpg","revision":"85017608"},{"url":"images/textures/marble-blue-small.jpg","revision":"7aa3717b"},{"url":"images/textures/marble-small.jpg","revision":"062aabd9"},{"url":"images/textures/mars-big.jpg","revision":"e835a07b"},{"url":"images/textures/mars-small.jpg","revision":"6cefbda7"},{"url":"images/textures/mauritania-small.jpg","revision":"8886930b"},{"url":"images/textures/mercury-big.jpg","revision":"1603b5c7"},{"url":"images/textures/mercury-small.jpg","revision":"334fbff6"},{"url":"images/textures/ocean.jpg","revision":"4fc82bfc"},{"url":"images/textures/pergamena-small.jpg","revision":"eeb50ab4"},{"url":"images/textures/plaster.jpg","revision":"0094ce95"},{"url":"images/textures/soiled-paper-vertical.png","revision":"0b33f76d"},{"url":"images/textures/soiled-paper.jpg","revision":"af3e72ba"},{"url":"images/textures/spain-small.jpg","revision":"c7fdf23d"},{"url":"images/textures/timbercut-big.jpg","revision":"1f009d0e"},{"url":"images/textures/timbercut-small.jpg","revision":"93c12f56"},{"url":"images/tour-button-icon.png","revision":"093d2feb"},{"url":"images/waves.png","revision":"d6665b72"},{"url":"images/whitecaps.png","revision":"02c85e61"},{"url":"index-CQEUZswI.js","revision":"27c3e214"},{"url":"index.css","revision":"61a87fe3"},{"url":"index.html","revision":"237bd3f0"},{"url":"journey-editor-BanqeDl-.js","revision":"377f2c39"},{"url":"journey-travel-DIHg_LJA.js","revision":"d1c443e5"},{"url":"journeys-overview-DaveOXOf.js","revision":"cee9e815"},{"url":"label-arc-DelL_3Xu.js","revision":"8760309b"},{"url":"label-creator-CD4WxsDy.js","revision":"a8b6accd"},{"url":"labels-editor-MzOFv7Nn.js","revision":"f53e05ef"},{"url":"labels-generator-Dan3oY7y.js","revision":"483f9e53"},{"url":"labels-group-editor-Ba2nLYVk.js","revision":"72b3ef5a"},{"url":"labels-overview-Bagjuf8G.js","revision":"d85bd2b8"},{"url":"lakes-editor-BeZ82zMq.js","revision":"4a3f80b6"},{"url":"layer-labels-B4jLVCV-.js","revision":"23cdeb59"},{"url":"layers-BnOdDZo9.js","revision":"64127e42"},{"url":"layers-tab-Bbgp4Irr.js","revision":"6faf7167"},{"url":"libs/alea.min.js","revision":"4e59c20e"},{"url":"libs/d3.min.js","revision":"c6c1a886"},{"url":"libs/delaunator.min.js","revision":"ddbdb0f6"},{"url":"libs/dropbox-sdk.min.js","revision":"72c63328"},{"url":"libs/flatqueue.js","revision":"c41f52be"},{"url":"libs/indexedDB.js","revision":"84a8bb23"},{"url":"libs/jquery-3.1.1.min.js","revision":"85556761"},{"url":"libs/jquery-ui.css","revision":"f2ff5e58"},{"url":"libs/jquery-ui.min.js","revision":"e3c94d49"},{"url":"libs/jquery.ui.touch-punch.min.js","revision":"000854d7"},{"url":"libs/jszip.min.js","revision":"301f9629"},{"url":"libs/loopsubdivison.min.js","revision":"f4446f9b"},{"url":"libs/mapControls.min.js","revision":"7afc1cd5"},{"url":"libs/objexporter.min.js","revision":"3b879583"},{"url":"libs/orbitControls.min.js","revision":"93ead010"},{"url":"libs/polylabel.min.js","revision":"940d1f19"},{"url":"libs/rgbquant.min.js","revision":"557e7e62"},{"url":"libs/simplify.js","revision":"2580cc23"},{"url":"libs/three.min.js","revision":"941d19ba"},{"url":"limitation-picker-CNT2nh2u.js","revision":"2401f5bd"},{"url":"lore-editor-FSNSRyiJ.js","revision":"56ffc51f"},{"url":"manifest.webmanifest","revision":"b989c1f5"},{"url":"map-brush-DqUpS7RX.js","revision":"336ebaec"},{"url":"map-placement-DTVzYSF3.js","revision":"b38c41d1"},{"url":"marker-creator-BRl8rYZZ.js","revision":"fe048766"},{"url":"markers-editor-xz4NNr_o.js","revision":"1034a8ae"},{"url":"markers-in-radius-BZ6uvS_1.js","revision":"b16b5e8e"},{"url":"markers-overview-D6ijAjsQ.js","revision":"854fcf43"},{"url":"markers-settings-BjXhKRbT.js","revision":"2bcb37c2"},{"url":"market-deals-overview-BGczaj5m.js","revision":"ef38dd66"},{"url":"market-overview-DP0cD2am.js","revision":"c14531cb"},{"url":"markets-overview-B3mUGPGb.js","revision":"48034861"},{"url":"mean-4Awewi9R.js","revision":"705d432d"},{"url":"measurers-editor-DZgsDJdA.js","revision":"2b12a017"},{"url":"median-DcgPm6YA.js","revision":"1cd2c0a2"},{"url":"military-overview-BwgH-4lW.js","revision":"f89e5ae6"},{"url":"minIndex-4vd4__Hw.js","revision":"bfbd0989"},{"url":"minimap-BE32Z-c_.js","revision":"99169a7c"},{"url":"names-generator-CzP_RmI8.js","revision":"37e5cca5"},{"url":"namesbase-editor-BZafk4Ak.js","revision":"bfc47ad2"},{"url":"natural-kerJ22Hb.js","revision":"66fc8def"},{"url":"notes-CCdjKTuX.js","revision":"d94cc167"},{"url":"notes-editor-DVB7LGv8.css","revision":"f77202e3"},{"url":"notes-editor-Da2FkEXx.js","revision":"17ba2bca"},{"url":"noven-host.html","revision":"9927a065"},{"url":"noven-i18n.js","revision":"48b37c47"},{"url":"noven-theme.css","revision":"c90c2950"},{"url":"omnibar-zIeu18JO.js","revision":"20b4c814"},{"url":"options-schema-CpDo-2q5.js","revision":"b49f34d1"},{"url":"options-tab-CU9uS1TD.js","revision":"b0fc49e5"},{"url":"pack-CyBKcrr4.js","revision":"f082fa13"},{"url":"paint-editor-BO801Fu5.js","revision":"75a1d850"},{"url":"pictures-BxBNZ7oZ.js","revision":"3da8b536"},{"url":"pins-D3nomYHl.js","revision":"500c778a"},{"url":"platform-BpT4CoYe.js","revision":"3d0310d6"},{"url":"population-generator-WbIkbQDE.js","revision":"14452b88"},{"url":"preload-helper-kNaey6uv.js","revision":"2f8a57ae"},{"url":"production-chains-Csy0DGgg.js","revision":"2e5254e3"},{"url":"production-overview-BtA11Czf.js","revision":"9176ad52"},{"url":"provinces-editor-ClNACs0G.js","revision":"ffd02c76"},{"url":"regiment-editor-BcfmdTO2.js","revision":"21087bc2"},{"url":"regiments-overview-BhtMFjjA.js","revision":"192677ff"},{"url":"relief-editor-4TVYZqR6.js","revision":"786c4e4b"},{"url":"relief-generator-Z7ynZsrl.js","revision":"45e82bca"},{"url":"relief-pool-editor-BOK1FH4q.js","revision":"c567cc04"},{"url":"relief-previews-CJjLmiJy.js","revision":"7adbf0da"},{"url":"relief-rules-editor-BzEdHjqo.js","revision":"2b998c06"},{"url":"religions-editor-CoVl51wD.js","revision":"ba52a7cb"},{"url":"river-auto-creator-bit0-YTI.js","revision":"f630bcee"},{"url":"river-creator-oSIv-oSW.js","revision":"3981c8d5"},{"url":"river-editor-C-mtlYXj.js","revision":"caeed435"},{"url":"rivers-overview-DnFA7K1T.js","revision":"1d1a7de5"},{"url":"rolldown-runtime-QTnfLwEv.js","revision":"5db5ba82"},{"url":"route-creator-7y11SyWN.js","revision":"61e10b89"},{"url":"route-editor-pFDg3qN8.js","revision":"e8774dc5"},{"url":"route-groups-editor-Bxludvym.js","revision":"76d7cd12"},{"url":"routes-overview-CWUgHFGj.js","revision":"de4263e1"},{"url":"schemaUtils-B2thnuln.js","revision":"a52a8755"},{"url":"sin-DYm9hqTl.js","revision":"fe4d8721"},{"url":"state-B2hBYDzv.js","revision":"566a1269"},{"url":"states-editor-BVaJlaLj.js","revision":"4aba82aa"},{"url":"stratify-CGdiYggi.js","revision":"171bdc70"},{"url":"style-editor-D4xIJ_ED.js","revision":"e3198af6"},{"url":"style-preset-BkjSihEG.js","revision":"6d28f3f1"},{"url":"style-presets-DU0nwcVz.js","revision":"f5faa5eb"},{"url":"styles-CZ2PlVd8.js","revision":"79b3f015"},{"url":"styles-legacy-DSb_kcDF.js","revision":"7fd26a49"},{"url":"styles/ancient.json","revision":"0011d9de"},{"url":"styles/atlas.json","revision":"201e4fcb"},{"url":"styles/cinderwood.json","revision":"5c591977"},{"url":"styles/clean.json","revision":"49b623c7"},{"url":"styles/cyberpunk.json","revision":"4e12a326"},{"url":"styles/darkSeas.json","revision":"a7d75f44"},{"url":"styles/frostbite.json","revision":"7f3441c2"},{"url":"styles/gloom.json","revision":"c45948e1"},{"url":"styles/ink.json","revision":"0280465e"},{"url":"styles/light.json","revision":"4d536af2"},{"url":"styles/monochrome.json","revision":"74b527e6"},{"url":"styles/night.json","revision":"2a83c18e"},{"url":"styles/pale.json","revision":"9c466eaf"},{"url":"styles/watercolor.json","revision":"4cb1e78e"},{"url":"submap-tool-CJMSWTJt.js","revision":"bc4a4b0c"},{"url":"sum-BpJJqxFM.js","revision":"a5c15474"},{"url":"table-Bt05xoGB.js","revision":"11292e8c"},{"url":"temperature-graph-GuiuWQRN.js","revision":"f91d18fd"},{"url":"tooltips-CZta3-Qx.js","revision":"ffbff5c6"},{"url":"trade-animation-editor-DvO6A1Cm.js","revision":"52e80bf7"},{"url":"trade-details-CRmphG1G.js","revision":"2314a49b"},{"url":"transform-tool-BbKwdZdM.js","revision":"bfb7174b"},{"url":"transport-editor-DeFPagC8.js","revision":"09516010"},{"url":"transports-generator-Dv1kk2bu.js","revision":"28805396"},{"url":"ui-tour-B3l7mx48.css","revision":"df5e188e"},{"url":"ui-tour-CL0atPDi.js","revision":"d09aabb7"},{"url":"units-editor-CnPl-c8B.js","revision":"d51d7818"},{"url":"utils-C0Xrn36t.js","revision":"32a89683"},{"url":"validationUtils-cfDkYsje.js","revision":"0b2b4355"},{"url":"versioning-D4ioougV.js","revision":"0dd06ef2"},{"url":"view-3d-DoKEuzcg.js","revision":"8a96147e"},{"url":"view-3d-options-DjhMN5EO.js","revision":"164be0d1"},{"url":"view-3d-renderer-BYF_7NEc.js","revision":"569f8fa2"},{"url":"view-mode-Bcvzt4ax.js","revision":"51d755f9"},{"url":"viewbox-events-jT2_ILKT.js","revision":"909230a4"},{"url":"viewport-C0deAIKO.js","revision":"a398cde9"},{"url":"world-configurator-Dvo_i2Ul.js","revision":"8c28c3f9"},{"url":"wrap-tool-D62Im6mi.js","revision":"2d3fe18e"},{"url":"zones-editor-cDOgEpVn.js","revision":"cdaf8be9"},{"url":"zoom-C2c0hDAB.js","revision":"6284cb97"}] || []);
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
