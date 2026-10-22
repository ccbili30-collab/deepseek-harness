import{En as e,Jt as t,Kn as n,N as r,P as i,Yt as a,jn as o,m as s,n as c,qn as l,tr as u}from"./utils-C0Xrn36t.js";import{Ct as d,St as f,_t as p,bt as m,gt as h,t as g,vt as _,wt as v,xt as y,yt as b}from"./layers-BnOdDZo9.js";import{r as x}from"./tooltips-CZta3-Qx.js";import{t as S}from"./pins-D3nomYHl.js";import{i as C}from"./dialog-helpers-DS9mxWMd.js";function w(e){return function(t,n){var r=v(t*t+n*n),i=e(r),a=d(i),o=y(i);return[m(t*a,r*o),b(r&&n*a/r)]}}function T(e,t){return[y(t)*d(e),d(t)]}T.invert=w(b);function E(){return h(T).scale(249.5).clipAngle(90+f)}var D=p(E().translate([100,100]).scale(100));function O(){customization||(k(),I(),z(),R(),B(),$(`#worldConfigurator`).dialog({title:`Configure World`,resizable:!1,width:`minmax(40em, 85vw)`,buttons:{"Update world":L},open:function(){(this.parentElement?.querySelector(`.ui-dialog-buttonpane`))?.insertAdjacentHTML(`afterbegin`,`<div class="dontAsk" data-tip="Automatically update world on input changes and button clicks">
        <input id="wcAutoChange" class="checkbox" type="checkbox" checked />
        <label for="wcAutoChange" class="checkbox-label"><i>auto-apply changes</i></label>
      </div>`),(this.parentElement?.querySelector(`.ui-dialog-buttonset > button`))?.addEventListener(`mousemove`,()=>x(`Apply current settings to the map`))},close:()=>C(`worldConfigurator`)}))}function k(){C(`worldConfigurator`),r(`dialogs`).insertAdjacentHTML(`beforeend`,A()),j()}function A(){let e=(e,t,n)=>`<div>
    <i data-locked="0" id="lock_${e}" class="icon-lock-open"></i>
    <label data-tip="${n}">
      <i>${t}:</i>
      <input id="${e}Input" type="number" min="-50" max="50" />
      <span>°C<span id="${e}Converted"></span></span>
      <input id="${e}Output" type="range" min="-50" max="50" />
    </label>
  </div>`;return`<div id="worldConfigurator" class="dialog stable">
    <div style="display: flex">
      <div id="worldControls">
        ${e(`temperatureEquator`,`Equator`,`Set temperature at equator`)}
        ${e(`temperatureNorthPole`,`North Pole`,`Set the North Pole average yearly temperature`)}
        ${e(`temperatureSouthPole`,`South Pole`,`Set the South Pole average yearly temperature`)}
        <div>
          <i data-locked="0" id="lock_mapSize" class="icon-lock-open"></i>
          <label data-tip="Set map size relative to the world size">
            <i>Map size:</i>
            <input id="mapSizeInput" type="number" min="1" max="100" step="0.1" />%
            <input id="mapSizeOutput" type="range" min="1" max="100" step="0.1" />
          </label>
        </div>
        <div>
          <i data-locked="0" id="lock_latitude" class="icon-lock-open"></i>
          <label data-tip="Set a North-South map shift, set to 50 to make map center lie on Equator">
            <i>Latitudes:</i>
            <input id="latitudeInput" type="number" min="0" max="100" step="0.1" />
            <br /><i>N</i
            ><input
              id="latitudeOutput"
              type="range"
              min="0"
              max="100"
              step="0.1"
              style="width: 10.3em"
            /><i>S</i>
          </label>
        </div>
        <div>
          <i data-locked="0" id="lock_longitude" class="icon-lock-open"></i>
          <label data-tip="Set a West-East map shift, set to 50 to make map center lie on Prime meridian">
            <i>Longitudes:</i>
            <input id="longitudeInput" type="number" min="0" max="100" step="0.1" />
            <br /><i>W</i
            ><input
              id="longitudeOutput"
              type="range"
              min="0"
              max="100"
              step="0.1"
              style="width: 10.3em"
            /><i>E</i>
          </label>
        </div>
        <div>
          <label
            data-tip="Set precipitation - water amount clouds can bring. Defines rivers and biomes generation. Keep around 100% for default generation"
          >
            <i data-locked="0" id="lock_prec" class="icon-lock-open"></i>
            <i>Precipitation:</i>
            <input id="precInput" type="number" />%
            <input id="precOutput" type="range" min="0" max="500" />
          </label>
        </div>
        <div data-tip="The coordinate extent this map was generated on. The next map's is set in Options">
          <i>Map size:</i><br />
          <span id="mapSize"></span> px = <span id="mapSizeFriendly"></span>
        </div>
        <div>
          <i data-tip="Length of Meridian. Almost half of the equator length">Meridian length:</i><br />
          <span id="meridianLength" data-tip="Length of Meridian in pixels"></span> px =
          <span
            id="meridianLengthFriendly"
            data-tip="Length of Meridian is friendly units (depends on user configuration)"
          ></span>
          <span
            id="meridianLengthEarth"
            data-tip="Fantasy world Meridian length relative to real-world Earth (20k km)"
          ></span>
        </div>
        <div data-tip="Map coordinates on globe"><i>Coords:</i> <span id="mapCoordinates"></span></div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end">
        <svg id="globe" width="22em" viewBox="-20 -25 240 240">
          <defs>
            <linearGradient id="temperatureGradient" x1="0" x2="0" y1="0" y2="1">
              <stop id="grad90" offset="0%" stop-color="blue" />
              <stop id="grad60" offset="16.6%" stop-color="green" />
              <stop id="grad30" offset="33.3%" stop-color="yellow" />
              <stop id="grad0" offset="50%" stop-color="red" />
              <stop id="grad-30" offset="66.6%" stop-color="yellow" />
              <stop id="grad-60" offset="83.3%" stop-color="green" />
              <stop id="grad-90" offset="100%" stop-color="blue" />
            </linearGradient>
          </defs>
          <g id="globeNoteLines">
            <line x1="5" x2="220" y1="0" y2="0" />
            <line x1="5" x2="220" y1="13" y2="13" />
            <line x1="5" x2="220" y1="49.5" y2="49.5" />
            <line x1="-5" x2="220" y1="100" y2="100" />
            <line x1="5" x2="220" y1="150.5" y2="150.5" />
            <line x1="5" x2="220" y1="187" y2="187" />
            <line x1="5" x2="220" y1="200" y2="200" />
          </g>
          <g id="globeWindArrows" data-tip="Click to change wind direction" stroke-linejoin="round">
            <circle cx="210" cy="6" r="12" />
            <path data-tier="0" d="M210,11 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(225 210 6)" />
            <circle cx="210" cy="30" r="12" />
            <path data-tier="1" d="M210,35 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(45 210 30)" />
            <circle cx="210" cy="75" r="12" />
            <path data-tier="2" d="M210,80 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(225 210 75)" />
            <circle cx="210" cy="130" r="12" />
            <path data-tier="3" d="M210,135 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(315 210 130)" />
            <circle cx="210" cy="173" r="12" />
            <path data-tier="4" d="M210,178 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(135 210 173)" />
            <circle cx="210" cy="194" r="12" />
            <path data-tier="5" d="M210,199 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(315 210 194)" />
          </g>
          <g id="globaAxisLabels">
            <text x="82%" y="-4%">wind</text>
            <text x="-8%" y="-4%">latitude</text>
          </g>
          <g id="globeLatLabels">
            <text x="-15" y="5">90°</text>
            <text x="-15" y="18">60°</text>
            <text x="-15" y="53">30°</text>
            <text x="-15" y="103">0°</text>
            <text x="-15" y="153">30°</text>
            <text x="-15" y="190">60°</text>
            <text x="-15" y="204">90°</text>
          </g>
          <circle id="globeGradient" cx="100" cy="100" r="100" fill="url(#temperatureGradient)" stroke="none" />
          <line id="globePrimeMeridian" x1="100" x2="100" y1="0" y2="200" />
          <line id="globeEquator" x1="1" x2="200" y1="100" y2="100" />
          <circle id="globeOutline" cx="100" cy="100" r="100" fill="none" />
          <path id="globeGraticule" />
          <path id="globeArea" />
        </svg>
        <button id="restoreWinds" data-tip="Click to restore default (Earth-based) wind directions">
          Restore winds
        </button>
      </div>
    </div>
    <div style="margin-top: 0.3em">
      <i>Presets:</i>
      <button id="wcWholeWorld" data-tip="Click to set map size to cover the whole world">Whole world</button>
      <button id="wcNorthern" data-tip="Click to set map size to cover the Northern latitudes">Northern</button>
      <button id="wcTropical" data-tip="Click to set map size to cover the Tropical latitudes">Tropical</button>
      <button id="wcSouthern" data-tip="Click to set map size to cover the Southern latitudes">Southern</button>
    </div>
  </div>`}function j(){e(`#globe`).select(`#globeWindArrows`).on(`click`,V),e(`#globe`).select(`#globeGraticule`).attr(`d`,l(D(_()())??``)),r(`worldConfigurator`).addEventListener(`input`,N),r(`restoreWinds`).addEventListener(`click`,H),r(`wcWholeWorld`).addEventListener(`click`,()=>U(100,50)),r(`wcNorthern`).addEventListener(`click`,()=>U(33,25)),r(`wcTropical`).addEventListener(`click`,()=>U(33,50)),r(`wcSouthern`).addEventListener(`click`,()=>U(33,75)),S.bindIcons(r(`worldConfigurator`),M)}function M(e){let{temperature:t}=options.map.climate;if(e===`temperatureEquator`)return t.equator;if(e===`temperatureNorthPole`)return t.northPole;if(e===`temperatureSouthPole`)return t.southPole;if(e===`prec`)return options.map.climate.precipitation;if(e===`mapSize`)return options.map.geography.mapSize;if(e===`latitude`)return options.map.geography.latitude;if(e===`longitude`)return options.map.geography.longitude}function N(e){let t=e.target,n=t.id.match(/^(\w+?)(Input|Output)$/);if(!n||!t.value)return;let[,r,a]=n,o=Number(t.value);if(Number.isNaN(o))return;let s=i(`${r}${a===`Input`?`Output`:`Input`}`);s&&(s.value=t.value);let{geography:c,climate:l}=options.map;if(r===`temperatureEquator`)l.temperature.equator=o;else if(r===`temperatureNorthPole`)l.temperature.northPole=o;else if(r===`temperatureSouthPole`)l.temperature.southPole=o;else if(r===`prec`)l.precipitation=o;else if(r===`mapSize`||r===`latitude`||r===`longitude`)c[r]=o,Coordinates.calculate();else return;S.set(r,o),Options.save(),F(),i(`wcAutoChange`)?.checked&&L()}function P(e){return options.map.units.temperature.unit===`°C`?``:` = ${c(e)}`}function F(){let{equator:e,northPole:t,southPole:n}=options.map.climate.temperature;r(`temperatureEquatorConverted`).innerText=P(e),r(`temperatureNorthPoleConverted`).innerText=P(t),r(`temperatureSouthPoleConverted`).innerText=P(n)}function I(){let{temperature:e,precipitation:t}=options.map.climate,{mapSize:n,latitude:r,longitude:a}=options.map.geography;for(let[o,s]of Object.entries({temperatureEquator:e.equator,temperatureNorthPole:e.northPole,temperatureSouthPole:e.southPole,prec:t,mapSize:n,latitude:r,longitude:a}))for(let e of[`Input`,`Output`]){let t=i(`${o}${e}`);t&&(t.value=String(s))}F()}function L(){z(),R(),Temperature.generate(),Precipitation.generate();let e=new Uint8Array(pack.cells.h);Rivers.generate(),Rivers.specify(),pack.cells.h=new Float32Array(e),Biomes.define(),Features.defineGroups(),Features.defineNames(),g.draw(`temperature`,`precipitation`),g.draw(`biomes`,`coordinates`,`rivers`),i(`canvas3d`)&&setTimeout(()=>window.Controllers.View3d.update(),500)}function R(){let t=options.map.graph.height/2*100/options.map.geography.mapSize;Coordinates.calculate();let n=options.map.geography.coordinates,i=options.map.units.distance.unit,a=t*2*options.map.units.distance.scale*s();r(`mapSize`).innerHTML=`${options.map.graph.width}x${options.map.graph.height}`,r(`mapSizeFriendly`).innerHTML=`${u(options.map.graph.width*options.map.units.distance.scale)}x${u(options.map.graph.height*options.map.units.distance.scale)} ${i}`,r(`meridianLength`).innerHTML=String(u(t*2)),r(`meridianLengthFriendly`).innerHTML=`${u(t*2*options.map.units.distance.scale)} ${i}`,r(`meridianLengthEarth`).innerHTML=a?` = ${u(a/200)}%🌏`:``,r(`mapCoordinates`).innerHTML=`${o(n.latN)} ${Math.abs(u(n.lonW))}°W; ${o(n.latS)} ${u(n.lonE)}°E`;function o(e){return e>0?`${Math.abs(u(e))}°N`:`${Math.abs(u(e))}°S`}let c=_().extent([[n.lonW??0,n.latN??0],[n.lonE??0,n.latS??0]]);e(`#globe`).select(`#globeArea`).attr(`d`,l(D(c.outline())??``))}function z(){let n=options.map.climate.temperature.equator,r=options.map.climate.temperature.northPole,i=options.map.climate.temperature.southPole,o=a(t),s=e=>o(1-e),[c,l]=[-25,30],u=l-c;e(`#globe`).select(`#grad90`).attr(`stop-color`,s((r-c)/u)),e(`#globe`).select(`#grad60`).attr(`stop-color`,s((n-(n-r)*2/3-c)/u)),e(`#globe`).select(`#grad30`).attr(`stop-color`,s((n-(n-r)*1/4-c)/u)),e(`#globe`).select(`#grad0`).attr(`stop-color`,s((n-c)/u)),e(`#globe`).select(`#grad-30`).attr(`stop-color`,s((n-(n-i)*1/4-c)/u)),e(`#globe`).select(`#grad-60`).attr(`stop-color`,s((n-(n-i)*2/3-c)/u)),e(`#globe`).select(`#grad-90`).attr(`stop-color`,s((i-c)/u))}function B(){e(`#globe`).select(`#globeWindArrows`).selectAll(`path`).each(function(e,t){let r=n(this.getAttribute(`transform`)??``);this.setAttribute(`transform`,`rotate(${options.map.climate.winds[t]} ${r[1]} ${r[2]})`)})}function V(e){let t=e.target,i=t.tagName===`path`?t:t.nextElementSibling;if(!i?.dataset.tier)return;let a=+i.dataset.tier;options.map.climate.winds[a]=(options.map.climate.winds[a]+45)%360,Options.save();let s=n(i.getAttribute(`transform`)??``);i.setAttribute(`transform`,`rotate(${options.map.climate.winds[a]} ${s[1]} ${s[2]})`);let c=o(options.map.geography.coordinates.latN,options.map.geography.coordinates.latS,-30).map(e=>(90-e)/30|0);r(`wcAutoChange`).checked&&c.includes(a)&&L()}function H(){let e=[225,45,225,315,135,315],t=o(options.map.geography.coordinates.latN,options.map.geography.coordinates.latS,-30).map(e=>(90-e)/30|0),n=r(`wcAutoChange`).checked&&t.some(t=>options.map.climate.winds[t]!==e[t]);options.map.climate.winds=e,Options.save(),B(),n&&L()}function U(e,t){options.map.geography.mapSize=e,options.map.geography.latitude=t,Coordinates.calculate(),Options.save(),S.set(`mapSize`,e),S.set(`latitude`,t),I(),i(`wcAutoChange`)?.checked&&L()}var W={open:O};export{W as WorldConfigurator};