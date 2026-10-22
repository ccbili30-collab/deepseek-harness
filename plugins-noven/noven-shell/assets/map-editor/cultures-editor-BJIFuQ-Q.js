import{B as e,En as t,Ft as n,H as r,Hn as i,I as a,Kn as o,N as s,R as c,Un as l,V as u,X as d,a as f,en as p,o as m,tr as h,v as g,zn as ee}from"./utils-C0Xrn36t.js";import{B as te,H as ne,W as re,at as ie,t as _}from"./layers-BnOdDZo9.js";import{t as ae}from"./drag-Bl16t6jK.js";import{t as oe}from"./sin-DYm9hqTl.js";import{n as se}from"./highlight-rFg_BwKw.js";import{t as v}from"./emblems-generator-CeUZxp9A.js";import{r as y,t as ce}from"./tooltips-CZta3-Qx.js";import{t as b}from"./controllers-CIDnRwoN.js";import{n as x}from"./cultures-generator-B2OgcXeo.js";import{i as le,l as S,n as ue,r as de,s as fe}from"./dialog-helpers-DS9mxWMd.js";import{t as pe}from"./viewbox-events-jT2_ILKT.js";import{h as me,m as he}from"./index-CQEUZswI.js";import{t as ge}from"./highlighting-UKkABEOD.js";import{a as _e,i as ve,n as ye,o as be,r as xe}from"./table-Bt05xoGB.js";var C={},w={},T=34,E=10,D=13;function O(e){return Function(`d`,`return {`+e.map(function(e,t){return JSON.stringify(e)+`: d[`+t+`] || ""`}).join(`,`)+`}`)}function Se(e,t){var n=O(e);return function(r,i){return t(n(r),i,e)}}function k(e){var t=Object.create(null),n=[];return e.forEach(function(e){for(var r in e)r in t||n.push(t[r]=r)}),n}function A(e,t){var n=e+``,r=n.length;return r<t?Array(t-r+1).join(0)+n:n}function Ce(e){return e<0?`-`+A(-e,6):e>9999?`+`+A(e,6):A(e,4)}function we(e){var t=e.getUTCHours(),n=e.getUTCMinutes(),r=e.getUTCSeconds(),i=e.getUTCMilliseconds();return isNaN(e)?`Invalid Date`:Ce(e.getUTCFullYear(),4)+`-`+A(e.getUTCMonth()+1,2)+`-`+A(e.getUTCDate(),2)+(i?`T`+A(t,2)+`:`+A(n,2)+`:`+A(r,2)+`.`+A(i,3)+`Z`:r?`T`+A(t,2)+`:`+A(n,2)+`:`+A(r,2)+`Z`:n||t?`T`+A(t,2)+`:`+A(n,2)+`Z`:``)}function Te(e){var t=RegExp(`["`+e+`
\r]`),n=e.charCodeAt(0);function r(e,t){var n,r,a=i(e,function(e,i){if(n)return n(e,i-1);r=e,n=t?Se(e,t):O(e)});return a.columns=r||[],a}function i(e,t){var r=[],i=e.length,a=0,o=0,s,c=i<=0,l=!1;e.charCodeAt(i-1)===E&&--i,e.charCodeAt(i-1)===D&&--i;function u(){if(c)return w;if(l)return l=!1,C;var t,r=a,o;if(e.charCodeAt(r)===T){for(;a++<i&&e.charCodeAt(a)!==T||e.charCodeAt(++a)===T;);return(t=a)>=i?c=!0:(o=e.charCodeAt(a++))===E?l=!0:o===D&&(l=!0,e.charCodeAt(a)===E&&++a),e.slice(r+1,t-1).replace(/""/g,`"`)}for(;a<i;){if((o=e.charCodeAt(t=a++))===E)l=!0;else if(o===D)l=!0,e.charCodeAt(a)===E&&++a;else if(o!==n)continue;return e.slice(r,t)}return c=!0,e.slice(r,i)}for(;(s=u())!==w;){for(var d=[];s!==C&&s!==w;)d.push(s),s=u();t&&(d=t(d,o++))==null||r.push(d)}return r}function a(t,n){return t.map(function(t){return n.map(function(e){return u(t[e])}).join(e)})}function o(t,n){return n??=k(t),[n.map(u).join(e)].concat(a(t,n)).join(`
`)}function s(e,t){return t??=k(e),a(e,t).join(`
`)}function c(e){return e.map(l).join(`
`)}function l(t){return t.map(u).join(e)}function u(e){return e==null?``:e instanceof Date?we(e):t.test(e+=``)?`"`+e.replace(/"/g,`""`)+`"`:e}return{parse:r,parseRows:i,format:o,formatBody:s,formatRows:c,formatRow:l,formatValue:u}}var j=Te(`,`),Ee=j.parse;j.parseRows,j.format,j.formatBody,j.formatRows,j.formatRow,j.formatValue;var M=`culturesEditor`,N=`Cultures`,P={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},F=null,I=[{key:`color`,width:`1.2em`,permanent:!0},{key:`name`,label:`Culture`,width:`10em`,permanent:!0,sortBy:e=>e.name||``,sortType:`alpha`},{key:`type`,label:`Type`,width:`6em`,mobileHidden:!0,sortBy:e=>e.type||``,sortType:`alpha`},{key:`base`,label:`Namesbase`,width:`9em`,mobileHidden:!0,sortBy:e=>e.base},{key:`cells`,label:`Cells`,width:`5em`,hidden:!0,sortBy:e=>e.cells||0},{key:`expansionism`,label:`Expansion`,width:`5em`,hidden:!0,mobileHidden:!0,sortBy:e=>e.expansionism||0},{key:`area`,label:`Area`,width:`7em`,mobileHidden:!0,sortBy:e=>e.area||0},{key:`population`,label:`Population`,width:`6em`,defaultSort:`desc`,sortBy:e=>(e.rural||0)*options.map.units.population.scale+(e.urban||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate},{key:`emblems`,label:`Emblems`,width:`7em`,hidden:!0,mobileHidden:!0,sortBy:e=>e.shield||``,sortType:`alpha`},{key:`note`,width:`1.1em`},{key:`locate`,width:`1.1em`},{key:`lock`,width:`1.1em`},{key:`remove`,width:`1.4em`,permanent:!0}],L=xe({getData:()=>me(M,pack.cultures.filter(e=>!e.removed),I),onUpdate:Oe});function R(){customization||(ue(`#${M}, .stable`),_.show(`cultures`),_.hide(`states`,`biomes`),_.hide(`religions`,`provinces`),De(),B(),q(),L.reset(),$(`#${M}`).dialog({title:`Cultures Editor`,resizable:!1,width:`fit-content`,close:Je,position:P}))}function De(){le(`culturesEditor`);let e=`<div id="culturesEditor" class="dialog stable editorDialog">
    <div id="culturesBody" class="table" data-type="absolute">${ve({dialogId:M,columns:I})}</div>

    <div id="culturesFooter" class="totalLine">
      <div data-tip="Cultures number" style="margin-left: 12px">Cultures:&nbsp;<span id="culturesFooterCultures">0</span></div>
      <div data-tip="Total land cells number" style="margin-left: 12px" data-col="cells">Cells:&nbsp;<span id="culturesFooterCells">0</span></div>
      <div data-tip="Total land area" style="margin-left: 12px" data-col="area">Land Area:&nbsp;<span id="culturesFooterArea">0</span></div>
      <div data-tip="Total population" style="margin-left: 12px" data-col="population">Population:&nbsp;<span id="culturesFooterPopulation">0</span></div>
    </div>

    <div id="culturesBottom" class="editorToolbar">
      <button id="culturesEditorRefresh" data-tip="Refresh the Editor" class="icon-cw"></button>
      <button id="culturesEditStyle" data-tip="Edit cultures style in Style Editor" class="icon-adjust"></button>
      <button id="culturesLegend" data-tip="Toggle Legend box" class="icon-list-bullet"></button>
      <button id="culturesPercentage" data-tip="Toggle percentage / absolute values display mode" class="icon-percent"></button>
      <button id="culturesHeirarchy" data-tip="Show cultures hierarchy tree" class="icon-sitemap"></button>
      <button id="culturesManually" data-tip="Manually re-assign cultures" class="icon-brush"></button>
      <button id="culturesEditNamesBase" data-tip="Edit a database used for names generation" class="icon-font"></button>
      <button id="culturesAdd" data-tip="Add a new culture. Hold Shift to add multiple" class="icon-plus"></button>
      <button id="culturesExport" data-tip="Download cultures-related data" class="icon-download"></button>
      <button id="culturesImport" data-tip="Upload cultures-related data" class="icon-upload"></button>
      <button id="culturesRecalculate" data-tip="Recalculate cultures based on current values of growth-related attributes" class="icon-retweet"></button>
      <span
        data-tip="Allow culture centers, expansion and type changes to take an immediate effect"
        class="editorToolbarPanel"
        style="display: inline-flex"
      >
        <input id="culturesAutoChange" class="checkbox" type="checkbox" />
        <label for="culturesAutoChange" class="checkbox-label"><i>auto-apply changes</i></label>
      </span>
    </div>
  </div>`;s(`dialogs`).insertAdjacentHTML(`beforeend`,e),he(M,L.reset),ge(M,({cellId:e})=>pack.cells.culture[e]),s(`culturesEditorRefresh`).addEventListener(`click`,z),ye({dialogId:M,columns:I,onUpdate:()=>S(M,{width:`fit-content`,position:P})}),s(`culturesEditStyle`).addEventListener(`click`,()=>void b.StyleEditor.open(`cultures`)),s(`culturesLegend`).addEventListener(`click`,He),s(`culturesPercentage`).addEventListener(`click`,J),s(`culturesHeirarchy`).addEventListener(`click`,Y),s(`culturesRecalculate`).addEventListener(`click`,()=>X(!0)),s(`culturesManually`).addEventListener(`click`,Ue),s(`culturesEditNamesBase`).addEventListener(`click`,()=>b.NamesbaseEditor.open()),s(`culturesAdd`).addEventListener(`click`,Ge),s(`culturesExport`).addEventListener(`click`,qe),s(`culturesImport`).addEventListener(`click`,Ye)}function z(){B(),L.refresh(),q()}function B(){let{cells:e,cultures:t,burgs:n}=pack;t.forEach(e=>{e.cells=e.area=e.rural=e.urban=0});for(let r of e.i){if(e.h[r]<20)continue;let i=e.culture[r];t[i].cells+=1,t[i].area+=e.area[r],t[i].rural+=e.pop[r];let a=e.burg[r];a&&(t[i].urban+=n[a].population)}}function Oe(e){let t=m(),n=``,r=0,i=0;for(let t of e.all)r+=f(t.area??0),i+=h((t.rural??0)*options.map.units.population.scale+(t.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate);for(let r of e.rows){let e=f(r.area??0),i=(r.rural??0)*options.map.units.population.scale,a=(r.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate,o=h(i+a),s=`Total population: ${g(o)}. Rural population: ${g(i)}. Urban population: ${g(a)}. Click to edit`;if(!r.i){n+=`<div
          class="states"
          data-id="${r.i}"
          data-name="${r.name}"
          data-color=""
          data-cells="${r.cells}"
          data-area="${e}"
          data-population="${o}"
          data-base="${r.base}"
          data-type=""
          data-expansionism=""
          data-emblems="${r.shield}"
        >
          <svg width="11" height="11" class="placeholder" data-col="color"></svg>
          <div data-col="name">
            <input data-tip="Neutral culture name. Click and type to change" class="cultureName italic"
              value="${r.name}" autocorrect="off" spellcheck="false" />
            <span class="icon-cw placeholder"></span>
          </div>
          <select class="cultureType placeholder" data-col="type">${V(r.type)}</select>
          <div data-col="base">
            <span data-tip="Click to re-generate names for burgs with this culture assigned" class="icon-arrows-cw"></span>
            <select data-tip="Culture namesbase. Click to change. Click on arrows to re-generate names"
              class="cultureBase">${H(r.base)}</select>
          </div>
          <div data-col="cells">
            <span data-tip="Cells count" class="icon-check-empty"></span>
            <div data-tip="Cells count" class="cultureCells">${r.cells}</div>
          </div>
          <div data-col="expansionism">
            <span class="icon-resize-full placeholder"></span>
            <input class="cultureExpan placeholder" type="number" />
          </div>
          <div data-col="area">
            <span data-tip="Culture area" class="icon-map-o"></span>
            <div data-tip="Culture area" class="cultureArea">${g(e)} ${t}</div>
          </div>
          <div data-col="population">
            <span data-tip="${s}" class="icon-male"></span>
            <div data-tip="${s}" class="culturePopulation pointer">${g(o)}</div>
          </div>
          <div data-col="emblems">${U(v.isDiversiform,r.shield)}</div>
          <div data-col="note"></div>
          <div data-col="locate"></div>
          <div data-col="lock"></div>
          <div data-col="remove"></div>
        </div>`;continue}n+=`<div
        class="states"
        data-id="${r.i}"
        data-name="${r.name}"
        data-color="${r.color}"
        data-cells="${r.cells}"
        data-area="${e}"
        data-population="${o}"
        data-base="${r.base}"
        data-type="${r.type}"
        data-expansionism="${r.expansionism}"
        data-emblems="${r.shield}"
      >
        <fill-box fill="${r.color}" data-col="color"></fill-box>
        <div data-col="name">
          <input data-tip="Culture name. Click and type to change" class="cultureName"
            value="${r.name}" autocorrect="off" spellcheck="false" />
          <span data-tip="Regenerate culture name" class="icon-cw hiddenIcon" style="visibility: hidden"></span>
        </div>
        <select data-tip="Culture type. Defines growth model. Click to change"
          class="cultureType" data-col="type">${V(r.type)}</select>
        <div data-col="base">
          <span data-tip="Click to re-generate names for burgs with this culture assigned" class="icon-arrows-cw"></span>
          <select data-tip="Culture namesbase. Click to change. Click on arrows to re-generate names"
            class="cultureBase">${H(r.base)}</select>
        </div>
        <div data-col="cells">
          <span data-tip="Cells count" class="icon-check-empty"></span>
          <div data-tip="Cells count" class="cultureCells">${r.cells}</div>
        </div>
        <div data-col="expansionism">
          <span data-tip="Culture expansionism. Defines competitive size" class="icon-resize-full"></span>
          <input
            data-tip="Culture expansionism. Defines competitive size. Click to change, then click Recalculate to apply change"
            class="cultureExpan"
            type="number"
            min="0"
            max="99"
            step=".1"
            value=${r.expansionism}
          />
        </div>
        <div data-col="area">
          <span data-tip="Culture area" class="icon-map-o"></span>
          <div data-tip="Culture area" class="cultureArea">${g(e)} ${t}</div>
        </div>
        <div data-col="population">
          <span data-tip="${s}" class="icon-male"></span>
          <div data-tip="${s}" class="culturePopulation pointer">${g(o)}</div>
        </div>
        <div data-col="emblems">${U(v.isDiversiform,r.shield)}</div>
        ${fe(`this culture`)}
        <span data-col="locate" data-tip="Locate the culture" class="icon-target"></span>
        <span data-col="lock" data-tip="Lock culture" class="icon-lock${r.lock?``:`-open`}"></span>
        <span data-col="remove" data-tip="Remove culture" class="icon-trash-empty"></span>
      </div>`}let a=s(`culturesBody`);a.querySelectorAll(`:scope > .states`).forEach(e=>{e.remove()}),a.insertAdjacentHTML(`beforeend`,n),s(`culturesFooterCultures`).innerHTML=String(pack.cultures.filter(e=>e.i&&!e.removed).length),s(`culturesFooterCells`).innerHTML=String(pack.cells.h.filter(e=>e>=20).length),s(`culturesFooterArea`).innerHTML=`${g(r)} ${t}`,s(`culturesFooterPopulation`).innerHTML=g(i),s(`culturesFooterArea`).dataset.area=String(r),s(`culturesFooterPopulation`).dataset.population=String(i),_e(s(`culturesFooter`),e,L.goto),s(`culturesBody`).querySelectorAll(`:scope > div.states`).forEach(e=>{e.addEventListener(`mouseenter`,W),e.addEventListener(`mouseleave`,G)}),s(`culturesBody`).querySelectorAll(`fill-box`).forEach(e=>void e.addEventListener(`click`,ke)),s(`culturesBody`).querySelectorAll(`div > input.cultureName`).forEach(e=>void e.addEventListener(`input`,Ae)),s(`culturesBody`).querySelectorAll(`div > span.icon-cw`).forEach(e=>void e.addEventListener(`click`,je)),s(`culturesBody`).querySelectorAll(`div > input.cultureExpan`).forEach(e=>void e.addEventListener(`change`,Me)),s(`culturesBody`).querySelectorAll(`div > select.cultureType`).forEach(e=>void e.addEventListener(`change`,Ne)),s(`culturesBody`).querySelectorAll(`div > select.cultureBase`).forEach(e=>void e.addEventListener(`change`,Pe)),s(`culturesBody`).querySelectorAll(`div > select.cultureEmblems`).forEach(e=>void e.addEventListener(`change`,Fe)),s(`culturesBody`).querySelectorAll(`div > div.culturePopulation`).forEach(e=>void e.addEventListener(`click`,Ie)),s(`culturesBody`).querySelectorAll(`div > span.icon-arrows-cw`).forEach(e=>void e.addEventListener(`click`,Le)),s(`culturesBody`).querySelectorAll(`div > span.icon-book`).forEach(e=>void e.addEventListener(`click`,Re)),s(`culturesBody`).querySelectorAll(`div > span.icon-target`).forEach(e=>void e.addEventListener(`click`,ze)),s(`culturesBody`).querySelectorAll(`div > span.icon-trash-empty`).forEach(e=>void e.addEventListener(`click`,Be)),s(`culturesBody`).querySelectorAll(`div > span.icon-lock`).forEach(e=>void e.addEventListener(`click`,Q)),s(`culturesBody`).querySelectorAll(`div > span.icon-lock-open`).forEach(e=>void e.addEventListener(`click`,Q)),be(M,v.isDiversiform?[]:[`emblems`]),s(`culturesBody`).dataset.type===`percentage`&&(s(`culturesBody`).dataset.type=`absolute`,J()),S(M,{width:`fit-content`,position:P})}function V(e){let t=``;return x.forEach(n=>{t+=`<option ${e===n?`selected`:``} value="${n}">${n}</option>`}),t}function H(e){let t=``;return Names.nameBases.forEach((n,r)=>{t+=`<option ${e===r?`selected`:``} value="${r}">${n.name}</option>`}),Names.nameBases[e]||(t+=`<option selected value="${e}">removed</option>`),t}function U(e,t){return e?`<select data-tip="Emblem shape associated with culture. Click to change" class="cultureEmblems">${Object.keys(v.shields.types).flatMap(e=>Object.keys(v.shields[e])).map(e=>`<option ${e===t?`selected`:``} value="${e}">${i(e)}</option>`)}</select>`:``}var W=d(e=>{let n=Number(e.id||e.target.dataset.id);if(!_.isOn(`cultures`)||customization)return;let r=p().duration(2e3).ease(oe);t(`#cults`).select(`#culture${n}`).raise().transition(r).attr(`stroke-width`,2.5).attr(`stroke`,`#d0240f`),t(`#debug`).select(`#cultureCenter${n}`).raise().transition(r).attr(`r`,3).attr(`stroke`,`#d0240f`)},200);function G(e){let n=Number(e.id||e.target.dataset.id);_.isOn(`cultures`)&&(t(`#cults`).select(`#culture${n}`).transition().attr(`stroke-width`,null).attr(`stroke`,null),t(`#debug`).select(`#cultureCenter${n}`).transition().attr(`r`,2).attr(`stroke`,null))}function ke(){let e=this.getAttribute(`fill`)||`#ffffff`,n=+this.parentNode.dataset.id;b.ColorPicker.open(e,e=>{this.fill=e,pack.cultures[n].color=e,t(`#cults`).select(`#culture${n}`).attr(`fill`,e),t(`#debug`).select(`#cultureCenter${n}`).attr(`fill`,e)})}function Ae(){let e=this.closest(`.states`),t=+e.dataset.id;e.dataset.name=this.value,this.value.trim()&&Cultures.rename(t,this.value)}function je(){let e=+this.closest(`.states`).dataset.id,t=pack.cultures[e].base;if(!Names.nameBases[t]){y(`Namesbase is not defined, please select a valid namesbase`,!1,`error`,5e3);return}let n=Names.getCultureShort(e);this.parentNode.querySelector(`input.cultureName`).value=n,Cultures.rename(e,n)}function Me(){let e=this.closest(`.states`),t=+e.dataset.id;e.dataset.expansionism=this.value,+this.value>=0&&+this.value<=99&&(Cultures.setExpansionism(t,+this.value),X())}function Ne(){let e=+this.parentNode.dataset.id;this.parentNode.dataset.type=this.value;let t=this.value;pack.cultures[e].type=t,X()}function Pe(){let e=this.closest(`.states`),t=+e.dataset.id,n=+this.value;Cultures.setBase(t,n),e.dataset.base=String(n)}function Fe(){let e=this.closest(`.states`),t=+e.dataset.id;Cultures.setEmblemShape(t,this.value),e.dataset.emblems=pack.cultures[t].shield;let n=(e,t)=>{let n=document.getElementById(e);!n||!t||(n.remove(),ie.trigger(e,t))};for(let e of pack.states)e.i&&e.culture===t&&n(`stateCOA${e.i}`,e.coa);for(let e of pack.provinces)e.i&&pack.cells.culture[e.center]===t&&n(`provinceCOA${e.i}`,e.coa);for(let e of pack.burgs)e?.i&&e.culture===t&&n(`burgCOA${e.i}`,e.coa)}function Ie(){let e=+this.closest(`.states`).dataset.id,t=pack.cultures[e];if(!t.cells){y(`Culture does not have any cells, cannot change population`,!1,`error`);return}let n=h((t.rural??0)*options.map.units.population.scale),r=h((t.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate),i=n+r,a=e=>Number(e).toLocaleString(),o=pack.burgs.filter(t=>!t.removed&&t.culture===e);alertMessage.innerHTML=`<div>
    <i>Change population of all cells assigned to the culture</i>
    <div style="margin: 0.5em 0">
      Rural: <input type="number" min="0" step="1" id="ruralPop" value=${n} style="width:6em" />
      Urban: <input type="number" min="0" step="1" id="urbanPop" value=${r} style="width:6em"
        ${o.length?``:`disabled`} />
    </div>
    <div>Total population: ${a(i)} ⇒ <span id="totalPop">${a(i)}</span>
      (<span id="totalPopPerc">100</span>%)
    </div>
  </div>`;let c=s(`ruralPop`),u=s(`urbanPop`),d=s(`totalPop`),f=s(`totalPopPerc`),p=()=>{let e=c.valueAsNumber+u.valueAsNumber;Number.isNaN(e)||(d.innerHTML=a(e),f.innerHTML=String(h(e/i*100)))};c.oninput=()=>p(),u.oninput=()=>p(),$(`#alert`).dialog({resizable:!1,title:`Change culture population`,width:`24em`,buttons:{Apply:function(){try{Cultures.setPopulation(e,+c.value||0,+u.value||0)}catch(e){y(l(e),!1,`error`);return}_.draw(`population`),z(),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`}})}function Le(){if(customization===4)return;let e=+this.closest(`.states`).dataset.id,t=pack.cultures[e].base;if(!Names.nameBases[t]){y(`Namesbase is not defined, please select a valid namesbase`,!1,`error`,5e3);return}let n=pack.burgs.filter(t=>t.culture===e&&!t.removed&&!t.lock);for(let t of n)Burgs.rename(t.i,Names.getCulture(e));_.draw(`labels`),y(`Names for ${n.length} burgs are regenerated`,!1,`success`)}function K(e){t(`#cults`).select(`#culture${e}`).remove(),t(`#debug`).select(`#cultureCenter${e}`).remove(),Cultures.remove(e),z()}function Re(){let e=+this.closest(`.states`).dataset.id;b.NotesEditor.open({type:`culture`,id:e})}function ze(){let e=+this.closest(`.states`).dataset.id;se(t(`#cults`).select(`#culture${e}`).node(),4)}function Be(){if(customization)return;let e=+this.closest(`.states`).dataset.id;de({title:`Remove culture`,message:`Are you sure you want to remove the culture? <br>This action cannot be reverted`,confirm:`Remove`,onConfirm:()=>K(e)})}function q(){let e=t(`#debug`);e.select(`#cultureCenters`).remove();let n=e.append(`g`).attr(`id`,`cultureCenters`).attr(`stroke-width`,.8).attr(`stroke`,`#444444`).style(`cursor`,`move`),r=pack.cultures.filter(e=>e.i&&!e.removed);n.selectAll(`circle`).data(r).enter().append(`circle`).attr(`id`,e=>`cultureCenter${e.i}`).attr(`data-id`,e=>e.i).attr(`r`,2).attr(`fill`,e=>e.color).attr(`cx`,e=>pack.cells.p[e.center][0]).attr(`cy`,e=>pack.cells.p[e.center][1]).on(`mouseenter`,(e,t)=>{y(`Drag to move the culture center (ancestral home)`,!0),s(`culturesBody`).querySelector(`div[data-id='${t.i}']`)?.classList.add(`selected`),W(e)}).on(`mouseleave`,(e,t)=>{y(``,!0),s(`culturesBody`).querySelector(`div[data-id='${t.i}']`)?.classList.remove(`selected`),G(e)}).call(ae().on(`start`,Ve))}function Ve(e){let t=+this.id.slice(13),n=o(this.getAttribute(`transform`)),r=+n[0]-e.x,i=+n[1]-e.y;function a(e){let{x:n,y:a}=e;this.setAttribute(`transform`,`translate(${r+n},${i+a})`);let o=Pack.findCell(n,a);if(!(o==null||pack.cells.h[o]<20)){try{Cultures.moveCenter(t,n,a)}catch(e){y(e instanceof Error?e.message:String(e),!1,`error`,2e3);return}X()}}let s=d(a,50);e.on(`drag`,s)}function He(){if(re(N)){te(N);return}let e=pack.cultures.filter(e=>e.i&&!e.removed&&e.cells).sort((e,t)=>(t.area??0)-(e.area??0)).map(e=>[e.i,e.color,e.name]);if(!e.length)return void y(`No cultures to show`,!1,`error`);ne(N,e)}function J(){if(s(`culturesBody`).dataset.type===`absolute`){s(`culturesBody`).dataset.type=`percentage`;let e=+s(`culturesFooterCells`).innerText,t=+s(`culturesFooterArea`).dataset.area,n=+s(`culturesFooterPopulation`).dataset.population;s(`culturesBody`).querySelectorAll(`:scope > div.states`).forEach(r=>{let{cells:i,area:a,population:o}=r.dataset;r.querySelector(`.cultureCells`).innerText=`${h(+i/e*100)}%`,r.querySelector(`.cultureArea`).innerText=`${h(+a/t*100)}%`,r.querySelector(`.culturePopulation`).innerText=`${h(+o/n*100)}%`})}else s(`culturesBody`).dataset.type=`absolute`,L.refresh()}async function Y(){customization||b.HierarchyTree.open({type:`cultures`,data:pack.cultures,onNodeEnter:W,onNodeLeave:G,getDescription:e=>{let{name:t,type:n,rural:r,urban:i}=e,a=r*options.map.units.population.scale+i*options.map.units.population.scale*options.map.units.population.urbanization.rate;return`${t} culture. ${n}. ${a>0?`${g(h(a))} people`:`Extinct`}`},getShape:({type:e})=>{if(e===`Generic`)return`circle`;if(e===`River`)return`diamond`;if(e===`Lake`)return`hexagon`;if(e===`Naval`)return`square`;if(e===`Highland`)return`concave`;if(e===`Nomadic`)return`octagon`;if(e===`Hunting`)return`pentagon`}})}function X(e){(e||s(`culturesAutoChange`).checked)&&(Cultures.recalculate(),_.draw(`cultures`),z())}function Ue(){_.show(`cultures`),b.PaintEditor.open({title:`Paint Cultures`,parentDialogId:M,onClose:R,items:pack.cultures.filter(e=>!e.removed).map(e=>({id:e.i,name:e.name,color:e.color||`#ffffff`})),dontOverrideControl:!0,getValue:e=>pack.cells.culture[e],filterCell:e=>c(e,pack),onApply:We})}function We(e){for(let[t,n]of ee(e))Cultures.setCells(t,n);e.size&&(_.draw(`cultures`),document.getElementById(M)&&z())}function Ge(){if(this.classList.contains(`pressed`)){Z();return}customization=9,this.classList.add(`pressed`),y(`Click on the map to add a new culture`,!0),t(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,Ke),s(`culturesBody`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.pointerEvents=`none`})}function Z(){customization=0,pe(),ce(),s(`culturesBody`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.removeProperty(`pointer-events`)});let e=s(`culturesAdd`);e.classList.contains(`pressed`)&&e.classList.remove(`pressed`)}function Ke(e){let[t,n]=a(e,this);try{Cultures.add(t,n)}catch(e){y(l(e),!1,`error`);return}e.shiftKey===!1&&Z(),q(),L.refresh()}function qe(){let e=`Id,Name,Color,Cells,Expansionism,Type,Area ${m(`2`)},Population,Namesbase,Emblems Shape,Origins`,t=L.view().all.map(e=>{let t=f(e.area??0),n=h((e.rural??0)*options.map.units.population.scale+(e.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate),r=Names.nameBases[e.base].name,i=`"${(e.origins??[]).filter(e=>!!e).map(e=>pack.cultures[e].name).join(`, `)}"`;return[e.i,e.name,e.i&&e.color||``,e.cells||0,e.i?e.expansionism||0:``,e.i?e.type:``,t,n,r,e.shield,i].join(`,`)});u([e].concat(t).join(`
`),`${r(`Cultures`)}.csv`)}function Je(){t(`#debug #cultureCenters`).remove(),customization===9&&Z(),$(`#culturesEditor`).dialog(`destroy`),s(`culturesEditor`).remove()}function Ye(){F??=e(`.csv`),F.onchange=()=>void Xe.call(F),F.click()}async function Xe(){let e=this.files[0];this.value=``;let t=Ee(await e.text(),e=>({name:e.Name,i:+e.Id,color:e.Color,expansionism:+e.Expansionism,type:e.Type,population:+e.Population,emblemsShape:e[`Emblems Shape`],origins:e.Origins,namesbase:e.Namesbase})),{cultures:r,cells:i}=pack,a=Object.keys(v.shields.types).flatMap(e=>Object.keys(v.shields[e])),o=i.pop.map((e,t)=>e?t:null).filter(e=>e);r.forEach(e=>{e.i&&(e.removed=!0)});for(let e of t){let t;if(e.i<r.length){t=r[e.i],t.removed=!1;let n=t.urban*options.map.units.population.urbanization.rate,i=t.rural+n?n/(t.rural+n):0;if(e.population>=0)try{Cultures.setPopulation(e.i,e.population*(1-i),e.population*i)}catch{}}else t={i:r.length,center:n(o),area:0,cells:0,origins:[0],rural:0,urban:0},r.push(t);t.removed=!1,t.i&&e.name.trim()?Cultures.rename(t.i,e.name):t.name=e.name,t.i&&(t.color=e.color,t.expansionism=+e.expansionism,x.includes(e.type)?t.type=e.type:t.type=`Generic`),e.origins=t.i?i(e.origins||``):[null],t.shield=a.includes(e.emblemsShape)?e.emblemsShape:`heater`,t.base=Names.nameBases.findIndex(t=>t.name===e.namesbase);function i(e){let n=e.replaceAll(`"`,``).split(`,`).map(e=>e.trim()).filter(e=>e).map(e=>{let t=r.findIndex(t=>t.name===e);return t===-1?null:t});t.origins=n.filter(e=>e!==null),t.origins.length||(t.origins=[0])}}r.filter(e=>e.removed).forEach(e=>{K(e.i)}),_.draw(`cultures`),z()}function Q(){if(customization)return;let e=+this.closest(`.states`).dataset.id,t=this.classList;Cultures.setLocked(e,!pack.cultures[e].lock),t.toggle(`icon-lock-open`),t.toggle(`icon-lock`)}var Ze={open:R,showHierarchy:Y};export{Ze as CulturesEditor};