import{$n as e,En as t,H as n,Hn as r,N as i,V as a,Wn as o,at as s,tr as c}from"./utils-C0Xrn36t.js";import{at as l,ct as u,dt as d,et as f,ft as p,it as ee,lt as m,ot as te,pt as h,st as ne,ut as re}from"./layers-BnOdDZo9.js";import{t as ie}from"./drag-Bl16t6jK.js";import{r as ae}from"./highlight-rFg_BwKw.js";import{a as g,i as oe,n as _,o as se,r as v,t as y}from"./emblems-generator-CeUZxp9A.js";import{r as b,t as ce}from"./tooltips-CZta3-Qx.js";import{_ as le,d as x,h as S,m as ue,x as C}from"./schemaUtils-B2thnuln.js";import{i as de}from"./dialog-helpers-DS9mxWMd.js";import{n as fe}from"./export-BHD28v3A.js";import{t as pe}from"./pictures-BxBNZ7oZ.js";import{IconPicker as me}from"./icon-picker-CET-kbij.js";var w=e=>[...e.querySelectorAll(`use`)].flatMap(e=>{let t=e.getAttribute(`href`)??e.getAttribute(`xlink:href`);return t?.startsWith(`#`)?[t.slice(1)]:[]});function T(e,t){let n=e.cloneNode(!0);n.setAttribute(`width`,String(t)),n.setAttribute(`height`,String(t));let r=n.querySelector(`defs`)??n.insertBefore(document.createElementNS(`http://www.w3.org/2000/svg`,`defs`),n.firstChild),i=new Set,a=e=>{if(i.has(e))return;i.add(e);let t=n.querySelector(`[id="${CSS.escape(e)}"]`);if(!t){let n=document.getElementById(e);if(!n)return;t=r.appendChild(n.cloneNode(!0))}for(let e of w(t))a(e)};for(let e of w(n))a(e);return n}function E(e){let t=e.flatMap(e=>w(e).flatMap(e=>se.setForId(e)??[]));return g.require(t)}async function he(e,t,n){let r=T(e,t);n&&await fe(r);let i=new XMLSerializer().serializeToString(r),a=new Blob([i],{type:`image/svg+xml;charset=utf-8`}),o=window.URL.createObjectURL(a);return window.setTimeout(()=>window.URL.revokeObjectURL(o),6e3),o}var D=`https://azgaar.github.io/Armoria/`,ge=`https://armoria.herokuapp.com/`,O=`Paste an Armoria edit link, API link or COA string. Use the picture button for other images`;function k(e){let t=e.trim();if(!/^https?:\/\//i.test(t))return A(t);let n;try{n=new URL(t)}catch{throw Error(`The link is not a valid URL`)}if(!(n.origin===new URL(`https://azgaar.github.io/Armoria/`).origin&&n.pathname.startsWith(`/Armoria`)||n.origin===new URL(`https://armoria.herokuapp.com/`).origin)||!n.searchParams.has(`coa`))throw Error(O);return A(n.searchParams.get(`coa`)??``)}function A(e){if(!e)throw Error(O);try{let t=JSON.parse(/^%7b/i.test(e)?decodeURIComponent(e):e);if(j.safeParse(t).success)return t}catch{}throw Error(`The Armoria COA is not valid JSON with a field tincture`)}var j=S({t1:C(),shield:C().optional(),diaper:C().optional(),division:S({division:C(),t:C()}).optional(),charges:x(S({charge:C(),t:C(),p:C()})).optional(),ordinaries:x(S({ordinary:C(),t:C()})).optional(),inscriptions:x(S({text:C(),path:C()})).optional()});function _e(e){let t=new URL(ge);return t.searchParams.set(`size`,`1024`),t.searchParams.set(`format`,`svg`),t.searchParams.set(`coa`,JSON.stringify(e)),t.href}var ve=le({type:ue(`armoria:coa`),version:ue(1),session:C(),coa:j,svg:C()}),ye=class{sessions=new Map;start(e,t,n,r=new URL(D).origin){for(let[e,n]of this.sessions)n.key===t&&this.sessions.delete(e);let i=crypto.randomUUID();return this.sessions.set(i,{target:e,key:t,map:n,origin:r}),i}receive(e,t){let n=ve.safeParse(e.data);if(!n.success)return null;let{session:r,coa:i,svg:a}=n.data,o=this.sessions.get(r);return!o||e.origin!==o.origin||o.map!==t?null:{target:o.target,coa:i,svg:a}}};function be(e){let t=e=>{if(!e||typeof e!=`string`)return!1;if(e in h||/^#[\da-f]{3,8}$/i.test(e))return!0;let[n,r,i]=e.split(`-`);return!t(r)||!t(i)?!1:n.startsWith(`semy_of_`)?!!y.chargeIcon(n.slice(8)):n in re},n=e=>!e||e in d,r=e=>{let t=u(e,`heater`);return t?t in m:!!y.chargeArt(e)};return t(e.t1)&&(!e.shield||e.shield in m)&&(!e.diaper||e.diaper===`no`||e.diaper in p)&&(!e.division||(e.division.division===`no`||e.division.division in te)&&t(e.division.t)&&n(e.division.line))&&(e.ordinaries??[]).every(e=>(e.ordinary===`bordure`||e.ordinary===`orle`||e.ordinary in ne)&&t(e.t)&&(!e.t2||t(e.t2))&&n(e.line))&&(e.charges??[]).every(e=>r(e.charge)&&t(e.t)&&(!e.t2||t(e.t2))&&(!e.t3||t(e.t3)))}var M=`Size of this emblem, 0 hides it. Change a whole category in Menu ⭢ Style ⭢ Emblems`,xe=`
  #emblemEditor { padding: .5em .7em .6em; }
  #emblemEditor > div { width: auto; }
  #emblemEditor .preview { width: 12em; height: 12em; margin: 0 auto .2em; }
  #emblemEditor .preview svg { width: 100%; height: 100%; overflow: visible; }
  #emblemArmiger { display: block; margin-bottom: .5em; text-align: center; }
  #emblemEditor .fields { display: grid; grid-template-columns: 6.4em minmax(0, 1fr); align-items: center; gap: .3em .4em; }
  #emblemEditor .fields .row { display: contents; }
  #emblemEditor .fields .row.hidden { display: none; }
  #emblemEditor .tincture { display: flex; align-items: center; gap: .35em; }
  #emblemEditor .tincture select { flex: 1; min-width: 0; }
  #emblemEditor .swatch { flex: none; width: 1.1em; height: 1.1em; border: 1px solid #0006; border-radius: 2px; }
  #emblemEditor .fields label { white-space: nowrap; padding: .15em .35em; border-radius: 3px; transition: background-color .3s ease-out; }
  #emblemEditor .fields label.active { background-color: #54ca7733; font-weight: bold; }
  #emblemEditor .fields select { width: 100%; min-width: 0; margin: 0; }
  #emblemEditor .fields hr { grid-column: 1 / -1; width: 100%; margin: .2em 0; border: 0; border-top: 1px solid #0000001f; }
  #emblemEditor .size { display: flex; align-items: center; gap: .4em; }
  #emblemEditor .size input[type="range"] { flex: 1; min-width: 0; margin: 0; }
  #emblemEditor .size input[type="number"] { width: 3.8em; margin: 0; }
  #emblemEditor .armoria { margin-top: .6em; }
  #emblemEditor .armoria button { width: 100%; margin: 0; padding: .4em; font-weight: bold; }
  #emblemEditor .armoria p { margin: .3em 0 0; font-size: .85em; opacity: .75; text-align: center; }
  #emblemEditor .toolbar { display: grid; grid-template-columns: repeat(7, 1fr); gap: .25em; margin-top: .7em; }
  #emblemEditor .control { display: flex; align-items: center; gap: .3em; margin-top: .4em; }
  #emblemEditor .control.hidden { display: none; }
  #emblemEditor .control input[type="text"] { flex: 1; min-width: 0; margin: 0; }
  #emblemEditor .control input[type="number"] { width: 4.6em; margin: 0; }
  #emblemEditor .control button { margin: 0; }
  #emblemEditor #emblemDownloadControl button { flex: 1; }
`,N,P,F,I,L=new ye,R=D;async function Se(){let e=pack.states.find(e=>e.i&&!e.removed&&e.coa),t=pack.burgs.find(e=>e.i&&!e.removed&&e.coa),n=e?`state`:`burg`,r=e??t;if(!r?.coa){b(`No emblems to edit, please generate states and burgs first`,!1,`error`);return}let i=`${n}COA${r.i}`;await l.trigger(i,r.coa),z(n,i,r)}function z(e,t,n,r){if(!customization){if(!t&&r)we(r);else{if(!e||!t||!n?.coa)return;N=e,P=t,F=n}Ce(),Q(),I?.(),I=ee(Q),B(),$(`#emblemEditor`).dialog({title:`Edit Emblem`,resizable:!0,width:`22em`,height:`auto`,position:{my:`left top`,at:`left+10 top+10`,of:`svg`,collision:`fit`},close:Je})}}function Ce(){de(`emblemEditor`);let e=`<div id="emblemEditor" class="dialog stable">
      <style>${xe}</style>
      <div class="preview"><svg viewBox="0 0 200 200"><use id="emblemImage"></use></svg></div>
      <b id="emblemArmiger"></b>
      <div class="fields">
        <label for="emblemStates" data-tip="Select state">State</label>
        <select id="emblemStates" data-tip="Select state"></select>
        <label for="emblemProvinces" data-tip="Select province in state">Province</label>
        <select id="emblemProvinces" data-tip="Select province in state"></select>
        <label for="emblemBurgs" data-tip="Select burg in province or state">Burg</label>
        <select id="emblemBurgs" data-tip="Select burg in province or state"></select>
        <hr />
        <div id="emblemShapeRow" class="row">
        <label for="emblemShapeSelector" data-tip="Select shape of the emblem">Shape</label>
          <select id="emblemShapeSelector" data-tip="Select shape of the emblem">
            <option value="">None</option>
            <optgroup label="Basic">
              <option value="heater">Heater</option>
              <option value="spanish">Spanish</option>
              <option value="french">French</option>
            </optgroup>
            <optgroup label="Regional">
              <option value="horsehead">Horsehead</option>
              <option value="horsehead2">Horsehead Edgy</option>
              <option value="polish">Polish</option>
              <option value="hessen">Hessen</option>
              <option value="swiss">Swiss</option>
            </optgroup>
            <optgroup label="Historical">
              <option value="boeotian">Boeotian</option>
              <option value="roman">Roman</option>
              <option value="kite">Kite</option>
              <option value="oldFrench">Old French</option>
              <option value="renaissance">Renaissance</option>
              <option value="baroque">Baroque</option>
            </optgroup>
            <optgroup label="Specific">
              <option value="targe">Targe</option>
              <option value="targe2">Targe2</option>
              <option value="pavise">Pavise</option>
              <option value="wedged">Wedged</option>
              <option value="embowed">Embowed</option>
            </optgroup>
            <optgroup label="Banner">
              <option value="flag">Flag</option>
              <option value="pennon">Pennon</option>
              <option value="guidon">Guidon</option>
              <option value="banner">Banner</option>
              <option value="dovetail">Dovetail</option>
              <option value="gonfalon">Gonfalon</option>
              <option value="pennant">Pennant</option>
            </optgroup>
            <optgroup label="Simple">
              <option value="round">Round</option>
              <option value="oval">Oval</option>
              <option value="vesicaPiscis">Vesica Piscis</option>
              <option value="square">Square</option>
              <option value="diamond">Diamond</option>
              <option value="hexagon">Hexagon</option>
            </optgroup>
            <optgroup label="Fantasy">
              <option value="fantasy1">Fantasy1</option>
              <option value="fantasy2">Fantasy2</option>
              <option value="fantasy3">Fantasy3</option>
              <option value="fantasy4">Fantasy4</option>
              <option value="fantasy5">Fantasy5</option>
            </optgroup>
            <optgroup label="Middle Earth">
              <option value="noldor">Noldor</option>
              <option value="gondor">Gondor</option>
              <option value="easterling">Easterling</option>
              <option value="erebor">Erebor</option>
              <option value="ironHills">Iron Hills</option>
              <option value="urukHai">UrukHai</option>
              <option value="moriaOrc">Moria Orc</option>
            </optgroup>
          </select>
        </div>
        <div id="emblemFieldRow" class="row">
          <label for="emblemField" data-tip="Tincture of the field">Field</label>
          <div class="tincture"><span class="swatch"></span><select id="emblemField"></select></div>
        </div>
        <div id="emblemChargeRows" class="row">
          <label for="emblemChargeTincture" data-tip="Tincture of the main charge. A raster picture keeps its own colours">Charge</label>
          <div class="tincture"><span class="swatch"></span><select id="emblemChargeTincture"></select></div>
          <label for="emblemChargeSizeNumber" data-tip="Size of the main charge">Charge size</label>
          <div class="size" data-tip="Size of the main charge">
            <input id="emblemChargeSizeSlider" type="range" min=".2" max="3" step=".05" />
            <input id="emblemChargeSizeNumber" type="number" min=".2" max="3" step=".05" />
          </div>
        </div>
        <label for="emblemSizeNumber" data-tip="${M}">Map size</label>
        <div class="size" data-tip="${M}">
          <input id="emblemSizeSlider" type="range" min="0" max="5" step=".1" />
          <input id="emblemSizeNumber" type="number" min="0" max="5" step=".1" />
        </div>
      </div>
      <div class="armoria">
        <button id="emblemsArmoria" type="button" data-tip="Open the emblem in Armoria, the heraldry editor: your changes show on the map as you make them"><span class="icon-font"></span> Edit in Armoria</button>
      </div>
      <div class="toolbar">
        <button id="emblemsPaste" data-tip="Edit the COA string by hand, or paste an Armoria edit link, API link or COA string" class="icon-link"></button>
        <button id="emblemsCharge" data-tip="Set the charge: choose, link or upload a picture to place on the field" class="icon-chess-knight"></button>
        <button id="emblemsUpload" data-tip="Replace the whole emblem with a picture: choose, link or upload an image, such as a ready coat of arms" class="icon-shield-alt"></button>
        <button id="emblemsDownload" data-tip="Download the emblem as an image" class="icon-download"></button>
        <button id="emblemsGallery" data-tip="Download all emblems as an HTML gallery (open it in a browser; preparing takes a while)" class="icon-layer-group"></button>
        <button id="emblemsRegenerate" data-tip="Regenerate the emblem" class="icon-shuffle"></button>
        <button id="emblemsFocus" data-tip="Show the area or place of the emblem" class="icon-target"></button>
      </div>
      <div id="emblemPasteControl" class="control hidden">
        <input id="emblemPaste" type="text" placeholder="Armoria link or COA string" data-tip="The emblem's COA string: edit it, or replace it with an Armoria link or COA string, then Apply" />
        <button id="emblemPasteApply" type="button" data-tip="Apply the pasted emblem">Apply</button>
      </div>
      <div id="emblemDownloadControl" class="control hidden">
        <input id="emblemsDownloadSize" data-tip="Image size in pixels" type="number" value="500" step="100" min="100" max="10000" />
        <span>px</span>
        <button id="emblemsDownloadSVG" data-tip="Scalable vector image: best quality, opens in a browser or Inkscape">SVG</button>
        <button id="emblemsDownloadPNG" data-tip="Lossless raster image with a transparent background">PNG</button>
        <button id="emblemsDownloadJPG" data-tip="Compressed raster image on a white background">JPG</button>
      </div>
    </div>`;i(`dialogs`).insertAdjacentHTML(`beforeend`,e),i(`emblemStates`).oninput=Te,i(`emblemProvinces`).oninput=Ee,i(`emblemBurgs`).oninput=De,i(`emblemShapeSelector`).oninput=Oe,i(`emblemField`).oninput=ke,i(`emblemChargeTincture`).oninput=Ae,i(`emblemChargeSizeSlider`).oninput=W,i(`emblemChargeSizeNumber`).oninput=W,i(`emblemSizeSlider`).oninput=Ie,i(`emblemSizeNumber`).oninput=Ie,i(`emblemsRegenerate`).onclick=Le,i(`emblemsArmoria`).onclick=Re,i(`emblemsCharge`).onclick=()=>Ve(`charge`),i(`emblemsUpload`).onclick=()=>Ve(`whole`),i(`emblemsPaste`).onclick=()=>q(`emblemPasteControl`),i(`emblemPasteApply`).onclick=()=>void ze(),i(`emblemPaste`).onkeydown=e=>{e.key===`Enter`&&ze()},i(`emblemsDownload`).onclick=()=>q(`emblemDownloadControl`),i(`emblemsDownloadSVG`).onclick=()=>J(`svg`),i(`emblemsDownloadPNG`).onclick=()=>J(`png`),i(`emblemsDownloadJPG`).onclick=()=>J(`jpeg`),i(`emblemsGallery`).onclick=We,i(`emblemsFocus`).onclick=Fe}function we(e){let t=e.parentNode,n=t.id===`burgEmblems`?`burg`:t.id===`provinceEmblems`?`province`:`state`,r=+e.dataset.i,i=X(n,r);if(!i)throw Error(`Cannot edit ${n} emblem ${r}`);N=n,P=`${N}COA${r}`,F=i}function B(){let e=N,t=F,n=i(`emblemStates`),r=i(`emblemProvinces`),a=i(`emblemBurgs`),o=0,s=0,c=0;for(let[t,i]of[[n,`state`],[r,`province`],[a,`burg`]])t.previousElementSibling?.classList.toggle(`active`,e===i);e===`state`?o=t.i:e===`province`?(s=t.i,o=pack.states[t.state].i):(c=t.i,s=pack.cells.province[t.cell]?pack.provinces[pack.cells.province[t.cell]].i:0,o=t.state??0);let u=pack.burgs.filter(e=>e.i&&!e.removed&&e.coa);n.options.length=0,u.filter(e=>!e.state).length&&n.options.add(new Option(pack.states[0].name,`0`,!1,!o)),pack.states.filter(e=>e.i&&!e.removed).forEach(e=>{n.options.add(new Option(e.name,String(e.i),!1,e.i===o))}),r.options.length=0,r.options.add(new Option(``,`0`,!1,!s)),pack.provinces.filter(e=>!e.removed&&e.state===o).forEach(e=>{r.options.add(new Option(e.name,String(e.i),!1,e.i===s))}),a.options.length=0,a.options.add(new Option(``,`0`,!1,!c)),u.filter(e=>s?pack.cells.province[e.cell]===s:e.state===o).forEach(e=>{a.options.add(new Option(e.capital?`👑 ${e.name}`:e.name,String(e.i),!1,e.i===c))}),a.options[0].disabled=!0,l.trigger(P,t.coa),V()}function V(){let e=F;if(!e.coa)return;i(`emblemImage`).setAttribute(`href`,`#${P}`);let t=e.fullName||e.name;N===`burg`&&(t=`Burg of ${t}`),i(`emblemArmiger`).innerText=t??``;let n=i(`emblemShapeSelector`);n.value=e.coa.shield??(`icon`in e.coa?``:`heater`);let r=e.coa,a=U(),o=!!a&&!y.chargeIcon(a.charge)&&!!g.kind(a.charge);i(`emblemShapeRow`).classList.toggle(`hidden`,!o&&!(`icon`in r)),i(`emblemFieldRow`).classList.toggle(`hidden`,!o),i(`emblemChargeRows`).classList.toggle(`hidden`,!o),o&&!(`icon`in r)&&Me(`emblemField`,r.t1),o&&a&&(Me(`emblemChargeTincture`,a.t),i(`emblemChargeSizeSlider`).value=String(a.size??1),i(`emblemChargeSizeNumber`).value=String(a.size??1));let s=i(`emblemPaste`);if(document.activeElement!==s){let e=K(r);s.value=e?JSON.stringify(e):``}let c=e.coa.size??1;i(`emblemSizeSlider`).value=String(c),i(`emblemSizeNumber`).value=String(c)}function Te(){let e=+i(`emblemStates`).value;if(e){if(!Z(`state`,e))return}else{let e=pack.burgs.filter(e=>e.i&&!e.removed&&!e.state);if(!e.length||!Z(`burg`,e[0].i))return}B()}function Ee(){let e=+i(`emblemProvinces`).value;if(e){if(!Z(`province`,e))return}else if(!Z(`state`,+i(`emblemStates`).value))return;B()}function De(){Z(`burg`,+i(`emblemBurgs`).value)&&B()}function Oe(){let e=i(`emblemShapeSelector`),t=e.value,n=F.coa;if(t)`icon`in n?F.coa=H(n.icon,t,n):n.shield=t;else if(!(`icon`in n)){let t=n.charges?.[0]&&y.chargeArt(n.charges[0].charge);if(!t){e.value=n.shield??`heater`,b(`Only an emblem with a charge can show it without a shield`,!1,`warn`);return}F.coa={icon:t,size:n.size,x:n.x,y:n.y}}document.getElementById(P)?.remove(),l.trigger(P,F.coa),f(N,F.i),V()}function H(e,t,{size:n,x:r,y:i}){return{t1:`argent`,shield:t,charges:[{charge:y.chargeOf(e),t:`gules`,p:`e`,size:1.5}],size:n,x:r,y:i}}function U(){let e=F.coa;return`icon`in e?void 0:e.charges?.[0]}function ke(){let e=F.coa;`icon`in e||(e.t1=i(`emblemField`).value,G())}function Ae(){let e=U();e&&(e.t=i(`emblemChargeTincture`).value,G())}function W(e){let t=U(),n=+e.currentTarget.value;!t||!(n>0)||(t.size=n,G())}function G(){l.trigger(P,F.coa),V()}var je=[[`Metals`,_.metals],[`Colours`,_.colours],[`Stains`,_.stains]];function Me(e,t){let n=i(e);n.innerHTML=(je.some(([,e])=>t in e)?``:`<option value="${o(t)}">${o(Ne(t))}</option>`)+je.map(([e,t])=>`<optgroup label="${e}">${Object.keys(t).map(e=>`<option value="${e}">${r(e)}</option>`).join(``)}</optgroup>`).join(``),n.value=t,n.previousElementSibling.style.background=Pe(t)}function Ne(e){let[t,n,i]=e.split(`-`);return i?`${r(t.replace(`semy_of_`,`semy of `).replace(/([a-z])([A-Z])/g,`$1 $2`).toLowerCase())}: ${n} and ${i}`:e}function Pe(e){let[,t,n]=e.split(`-`);return n?`repeating-linear-gradient(45deg, ${h[t]??t} 0 3px, ${h[n]??n} 3px 6px)`:h[e]??e}function Fe(){ae(N,F)}function Ie(t){let n=e(+t.currentTarget.value||0,0,5);i(`emblemSizeSlider`).value=String(n),i(`emblemSizeNumber`).value=String(n);let{x:r,y:a}=F.coa;y.place(`${N}:${F.i}`,r??null,a??null,n),f(N,F.i)}function Le(){y.regenerateOne(`${N}:${F.i}`),l.trigger(P,F.coa),f(N,F.i),V()}function K(e){if(`icon`in e){let t=v.get(e.icon);if(t?.kind!==`image`||!t.content.startsWith(`https://armoria.herokuapp.com/`))return null;try{return k(t.content)}catch{return null}}let{size:t,x:n,y:r,...i}=e;return i}function Re(){let e=K(F.coa)??{t1:`sable`};e.charges?.some(({charge:e})=>!y.chargeIcon(e)&&g.kind(e))&&b(`Armoria cannot show pictures from the icon library: those charges are missing there`,!1,`warn`,6e3);let t=L.start({type:N,id:F.i,entity:F,queue:Promise.resolve()},`${N}:${F.i}`,options.map,new URL(R).origin),n=new URL(R);n.searchParams.set(`coa`,JSON.stringify(e)),n.searchParams.set(`from`,`FMG`),n.searchParams.set(`session`,t),n.searchParams.set(`returnOrigin`,location.origin),s(n.href)}async function ze(){try{await Be(N,F.i,k(i(`emblemPaste`).value)),q(`emblemPasteControl`)}catch(e){b(e.message,!1,`error`,6e3)}}async function Be(e,t,n,r,i){let a=X(e,t);if(!a)return i;let o=options.map,{size:s,x:c,y:u}=a.coa,d;if(be(n))a.coa={...n,size:s,x:c,y:u},i&&v.get(i)&&!Object.keys(g.uses(i)).length&&v.remove(i);else{let t=i&&v.get(i)?i:void 0,l=t??v.newId(),f=r?await pe.fromFile(new File([r],`armoria.svg`,{type:`image/svg+xml`}),l,`emblem`):{kind:`image`,content:_e(n),viewBox:oe};if(options.map!==o||X(e,a.i)!==a)return i;t?v.update(t,f):v.add({id:l,...f}),a.coa={icon:l,size:s,x:c,y:u},d=l,t||b(`This COA uses art FMG cannot draw; it shows as Armoria's picture`,!1,`warn`,5e3)}return N===e&&F.i===t&&(l.trigger(P,a.coa),V()),f(e,t),d}window.addEventListener(`message`,e=>{let t=L.receive(e,options.map);if(!t)return;let n=t.target;n.queue=n.queue.then(async()=>{X(n.type,n.id)===n.entity&&(n.picture=await Be(n.type,n.id,t.coa,t.svg,n.picture))}).catch(e=>b(e.message,!1,`error`,6e3))});function Ve(e){let t=F,n=N,r=P,i=options.map,a=t.coa,o=`icon`in a?``:a.charges?.[0]?y.chargeArt(a.charges[0].charge)??``:``;me.open({current:`icon`in a?a.icon:e===`charge`?o:``,preferCustom:!0,profile:`emblem`,onPick:a=>{if(!a||options.map!==i||X(n,t.i)!==t)return;let o=t.coa;if(e===`whole`)t.coa={icon:a,size:o.size,x:o.x,y:o.y};else if(`icon`in o)t.coa=H(a,o.shield??y.getShield(t.culture??0,t.state),o);else{let e=y.chargeOf(a);o.charges?.length?o.charges[0]={...o.charges[0],charge:e}:o.charges=[{charge:e,t:/^(argent|or)$/.test(o.t1)?`gules`:`or`,p:`e`,size:1.5}]}l.trigger(r,t.coa),f(n,t.i),F===t&&V()}})}function q(e){for(let[t,n]of Object.entries({emblemPasteControl:`emblemsPaste`,emblemDownloadControl:`emblemsDownload`})){let r=t===e&&i(t).classList.contains(`hidden`);i(t).classList.toggle(`hidden`,!r),i(n).classList.toggle(`pressed`,r),r&&i(t).querySelector(`input`)?.focus()}}async function J(e){await l.trigger(P,F.coa);let t=document.getElementById(P);await E([t]);let r=+i(`emblemsDownloadSize`).value,a=await he(t,r,e!==`svg`),o=document.createElement(`a`);o.download=`${n(`Emblem ${F.fullName||F.name}`)}.${e}`,e===`svg`?He(a,o):Ue(e,a,o,r),q(`emblemDownloadControl`)}function He(e,t){t.href=e,t.click()}function Ue(e,t,n,r){let i=document.createElement(`canvas`),a=i.getContext(`2d`);i.width=r,i.height=r;let o=new Image;o.src=t,o.onload=()=>{e===`jpeg`&&(a.fillStyle=`#fff`,a.fillRect(0,0,i.width,i.height)),a.drawImage(o,0,0,i.width,i.height);let t=i.toDataURL(`image/${e}`,.92);n.href=t,n.click(),window.setTimeout(()=>window.URL.revokeObjectURL(t),6e3)}}function Y(e,t){return new XMLSerializer().serializeToString(T(e,t))}async function We(){let e=n(`Emblems Gallery`),t=pack.states.filter(e=>e.i&&!e.removed&&e.coa),r=pack.provinces.filter(e=>e.i&&!e.removed&&e.coa),i=pack.burgs.filter(e=>e.i&&!e.removed&&e.coa);await Ge(t,r,i),await E([...document.querySelectorAll(`#coas > svg`)]);let o=`<a href="javascript:history.back()">Go Back</a>`,s=`<div><h2>States</h2>${t.map(e=>{let t=document.getElementById(`stateCOA${e.i}`);return`<figure id="state_${e.i}"><a href="#provinces_${e.i}"><figcaption>${e.fullName}</figcaption>${Y(t,200)}</a></figure>`}).join(``)}</div>`,c=t.map(e=>{let t=r.filter(t=>t.state===e.i),n=t.map(e=>{let t=document.getElementById(`provinceCOA${e.i}`);return`<figure id="province_${e.i}"><a href="#burgs_${e.i}"><figcaption>${e.fullName}</figcaption>${Y(t,200)}</a></figure>`}).join(``);return t.length?`<div id="provinces_${e.i}">${o}<h2>${e.fullName} provinces</h2>${n}</div>`:``}).join(``),l=t.map(e=>{let t=i.filter(t=>t.state===e.i),n=r.filter(t=>t.state===e.i).map(e=>{let n=t.filter(t=>pack.cells.province[t.cell]===e.i),r=n.map(e=>{let t=document.getElementById(`burgCOA${e.i}`);return t?`<figure id="burg_${e.i}"><figcaption>${e.name}</figcaption>${Y(t,200)}</figure>`:``}).join(``);return n.length?`<div id="burgs_${e.i}">${o}<h2>${e.fullName} burgs</h2>${r}</div>`:``}).join(``),a=t.filter(e=>!pack.cells.province[e.cell]).map(e=>{let t=document.getElementById(`burgCOA${e.i}`);return t?`<figure id="burg_${e.i}"><figcaption>${e.name}</figcaption>${Y(t,200)}</figure>`:``}).join(``);return a&&(n+=`<div><h2>${e.fullName} burgs under direct control</h2>${a}</div>`),n}).join(``),u=i.filter(e=>!e.state),d=u.length?`<div><h2>Independent burgs</h2>${u.map(e=>{let t=document.getElementById(`burgCOA${e.i}`);return t?`<figure id="burg_${e.i}"><figcaption>${e.name}</figcaption>${Y(t,200)}</figure>`:``}).join(``)}</div>`:``;a(`<!DOCTYPE html>
    <html>
      <head>
        <title>${options.map.lore.name} Emblems Gallery</title>
      </head>
      <style type="text/css">
        body { margin: 0; padding: 1em; font-family: serif; }
        h1, h2 { font-family: "Forum"; }
        div { width: 100%; max-width: 1018px; margin: 0 auto; border-bottom: 1px solid #ddd; }
        figure { margin: 0 0 2em; display: inline-block; transition: 0.2s; }
        figure:hover { background-color: #f6f6f6; }
        figcaption { text-align: center; margin: 0.4em 0; width: 200px; font-family: "Overlock SC"; }
        address { width: 100%; max-width: 1018px; margin: 0 auto; }
        a { color: black; }
        figure > a { text-decoration: none; }
        div > a { float: right; font-family: var(--monospace); margin-top: 0.8em; }
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Forum&family=Overlock+SC" rel="stylesheet" />
      <body>
        <div><h1>${options.map.lore.name} Emblems Gallery</h1></div>
        ${s} ${c} ${l} ${d}
        <address>Generated by <a href="https://azgaar.github.io/Fantasy-Map-Generator" target="_blank">Azgaar's Fantasy Map Generator</a>. The tool is free, but images may be copyrighted, see <a target="_blank" href="https://github.com/Azgaar/Armoria#license">the license</a></address>
      </body>
    </html>`,`${e}.html`,`text/plain`)}async function Ge(e,t,n){b(`Preparing for download...`,!0,`warn`);let r=e.map(e=>l.trigger(`stateCOA${e.i}`,e.coa)),i=t.map(e=>l.trigger(`provinceCOA${e.i}`,e.coa)),a=n.map(e=>l.trigger(`burgCOA${e.i}`,e.coa)),o=[...r,...i,...a];await Promise.allSettled(o),ce()}function Ke(t){let n=Number(this.getAttribute(`x`))-t.x,r=Number(this.getAttribute(`y`))-t.y;t.on(`drag`,function(e){this.setAttribute(`x`,String(n+e.x)),this.setAttribute(`y`,String(r+e.y))}),t.on(`end`,function(t){let i=Number(this.parentNode.getAttribute(`font-size`))*Number.parseFloat(this.getAttribute(`width`)||`1`)/2,a=qe(this.parentElement?.id),o=Number(this.dataset.i),s=a&&Number.isInteger(o)?X(a,o):void 0;if(!a||!s)return;let{width:l,height:u}=options.map.graph,d=e(c(n+t.x+i,2),0,l),p=e(c(r+t.y+i,2),0,u);y.place(`${a}:${o}`,d,p,s.coa.size??null),f(a,o)})}function qe(e){if(e===`burgEmblems`)return`burg`;if(e===`provinceEmblems`)return`province`;if(e===`stateEmblems`)return`state`}function X(e,t){let n=e===`burg`?pack.burgs[t]:e===`province`?pack.provinces[t]:pack.states[t];return n?.coa?n:void 0}function Z(e,t){let n=X(e,t);return n?(N=e,P=`${e}COA${t}`,F=n,!0):!1}function Q(){t(`#emblems`).selectAll(`use`).call(ie().on(`drag`,Ke)).classed(`draggable`,!0)}function Je(){I?.(),I=void 0,t(`#emblems`).selectAll(`use`).on(`.drag`,null).attr(`class`,null),$(`#emblemEditor`).dialog(`destroy`),i(`emblemEditor`).remove()}var Ye={open:z,openDefault:Se};export{Ye as EmblemsEditor};