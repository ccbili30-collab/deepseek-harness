import{En as e,H as t,N as n,R as r,V as i,a,at as o,en as s,gt as c,o as l,tr as u,v as d,zn as f}from"./utils-C0Xrn36t.js";import{B as p,H as m,W as h,t as g}from"./layers-BnOdDZo9.js";import{t as _}from"./sum-BpJJqxFM.js";import{t as v}from"./sin-DYm9hqTl.js";import{r as y}from"./tooltips-CZta3-Qx.js";import{t as b}from"./controllers-CIDnRwoN.js";import{t as x}from"./population-generator-WbIkbQDE.js";import{i as S,l as C,n as w,s as T}from"./dialog-helpers-DS9mxWMd.js";import{h as E,m as D}from"./index-CQEUZswI.js";import{t as O}from"./highlighting-UKkABEOD.js";import{a as k,i as A,n as j,r as M}from"./table-Bt05xoGB.js";import{i as ee,t as te}from"./relief-previews-CJjLmiJy.js";import{t as ne}from"./relief-pool-editor-BOK1FH4q.js";var N=`biomesEditor`,P=`Biomes`,F={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},I=[],L=[{key:`name`,label:`Biome`,width:`15em`,permanent:!0,sortBy:e=>e.name,sortType:`alpha`},{key:`habitability`,label:`Habitability`,width:`6.5em`,sortBy:e=>e.habitability},{key:`relief`,label:`Relief`,width:`6.5em`,sortBy:e=>e.iconsDensity},{key:`cells`,label:`Cells`,width:`5em`,sortBy:e=>I[e.i]?.cells??0,defaultSort:`desc`},{key:`area`,label:`Area`,width:`7em`,mobileHidden:!0,sortBy:e=>I[e.i]?.area??0},{key:`population`,label:`Population`,width:`6.2em`,mobileHidden:!0,sortBy:e=>{let t=I[e.i];return t?t.rural+t.urban:0}},{key:`note`,width:`1.1em`},{key:`wiki`,width:`1.1em`},{key:`remove`,width:`1.4em`,permanent:!0}],R=M({getData:()=>E(N,pack.biomes.filter(e=>e.i&&!e.removed),L),onUpdate:e=>W(e,I)});function z(){customization||(w(`#${N}, .stable`),g.show(`biomes`),g.hide(`states`,`cultures`),g.hide(`religions`,`provinces`),B(),I=U(),R.reset(),$(`#${N}`).dialog({title:`Biomes Editor`,resizable:!1,close:pe,position:F}))}function B(){S(N);let e=`<div id="${N}" class="dialog stable editorDialog">
      ${A({dialogId:N,columns:L})}
      <div id="biomesBody" class="table" data-type="absolute"></div>
      <div id="biomesFooter" class="totalLine">
        <div data-tip="Number of land biomes" style="margin-left: 12px">
          Biomes:&nbsp;<span id="biomesFooterBiomes">0</span>
        </div>
        <div data-col="cells" data-tip="Total land cells number" style="margin-left: 12px">
          Cells:&nbsp;<span id="biomesFooterCells">0</span>
        </div>
        <div data-col="area" data-tip="Total land area" style="margin-left: 12px">
          Land Area:&nbsp;<span id="biomesFooterArea">0</span>
        </div>
        <div data-col="population" data-tip="Total population" style="margin-left: 12px">
          Population:&nbsp;<span id="biomesFooterPopulation">0</span>
        </div>
      </div>
      <div id="biomesBottom">
        <button id="biomesEditorRefresh" data-tip="Refresh the Editor" class="icon-cw"></button>
        <button id="biomesEditStyle" data-tip="Edit biomes style in Style Editor" class="icon-adjust"></button>
        <button id="biomesLegend" data-tip="Toggle Legend box" class="icon-list-bullet"></button>
        <button
          id="biomesPercentage"
          data-tip="Toggle percentage / absolute values views"
          class="icon-percent"
        ></button>
        <button
          id="biomesManually"
          data-tip="Manually re-assign biomes to not follow the default moisture/temperature pattern"
          class="icon-brush"
        ></button>
        <button id="biomesReliefRules" data-tip="Edit the relief rules: hills, mountains and other relief placed by elevation" class="icon-mountain"></button>
        <button id="biomesAdd" data-tip="Add a custom biome" class="icon-plus"></button>
        <button
          id="biomesRestore"
          data-tip="Restore the defaults and re-define biomes based on current moisture and temperature"
          class="icon-history"
        ></button>
        <button
          id="biomesExport"
          data-tip="Save biomes-related data as a text file (.csv)"
          class="icon-download"
        ></button>
      </div>
    </div>`;n(`dialogs`).insertAdjacentHTML(`beforeend`,e),j({dialogId:N,columns:L,onUpdate:()=>C(N,{width:`fit-content`,position:F})}),n(`biomesEditorRefresh`).addEventListener(`click`,V),n(`biomesEditStyle`).addEventListener(`click`,()=>void b.StyleEditor.open(`biomes`)),n(`biomesLegend`).addEventListener(`click`,se),n(`biomesPercentage`).addEventListener(`click`,X),n(`biomesManually`).addEventListener(`click`,ue),n(`biomesRestore`).addEventListener(`click`,fe),n(`biomesReliefRules`).addEventListener(`click`,()=>void b.ReliefRulesEditor.open()),n(`biomesAdd`).addEventListener(`click`,ce),n(`biomesExport`).addEventListener(`click`,Z),D(N,R.reset),O(N,({cellId:e})=>e&&pack.cells.biome[e]),n(`biomesBody`).addEventListener(`click`,e=>{let t=e.target,n=t.classList;t.tagName===`FILL-BOX`?J(t):n.contains(`icon-book`)?ae(t):n.contains(`icon-info-circled`)?oe(t):n.contains(`icon-trash-empty`)?le(t):t.closest(`.biomeRelief`)&&K(t)}),n(`biomesBody`).addEventListener(`change`,e=>{let t=e.target,n=t.classList;n.contains(`biomeName`)?Y(t):n.contains(`biomeHabitability`)&&ie(t)})}function V(){I=U(),R.refresh()}function H(e=pack){let{cells:t}=e,n=e.biomes.map(()=>({cells:0,area:0,rural:0,urban:0}));for(let r of t.i){if(t.h[r]<20)continue;let i=n[t.biome[r]];i.cells++,i.area+=t.area[r],i.rural+=t.pop[r];let a=t.burg[r]?e.burgs[t.burg[r]]:null;a&&(i.urban+=a.population??0)}return n}function U(){return H(pack)}function W(e,t){let r=` ${l()}`,i=``,o=0,s=0;for(let n of e.rows){let{i:e,name:o,color:s,habitability:c}=n,{cells:l,area:f,rural:p,urban:m}=t[e],h=a(f),g=p*options.map.units.population.scale,_=m*options.map.units.population.scale*options.map.units.population.urbanization.rate,v=u(g+_),y=`Total population: ${d(v)}; Rural population: ${d(g)}; Urban population: ${d(_)}`;i+=`
      <div
        class="states biomes"
        data-id="${e}"
        data-name="${o}"
        data-habitability="${c}"
        data-cells=${l}
        data-area=${h}
        data-population=${v}
        data-color=${s}
      >
        <div data-col="name">
          <fill-box fill="${s}"></fill-box>
          <input data-tip="Biome name. Click and type to change" class="biomeName" value="${o}" autocorrect="off" spellcheck="false" />
        </div>
        <div data-col="habitability" class="hide">
          <span data-tip="Biome habitability percent">%</span>
          <input data-tip="Biome habitability percent. Click and set new value to change" type="number" min="0" max="9999" class="biomeHabitability" value=${c} />
        </div>
        <div data-col="relief" class="hide">${G(n)}</div>
        <div data-col="cells" class="hide"><span data-tip="Cells count" class="icon-check-empty"></span><span data-tip="Cells count" class="biomeCells">${l}</span></div>
        <div data-col="area" class="hide"><span data-tip="Biome area" class="icon-map-o" style="padding-right: 2px"></span><span data-tip="Biome area" class="biomeArea">${d(h)+r}</span></div>
        <div data-col="population" class="hide"><span data-tip="${y}" class="icon-male"></span><span data-tip="${y}" class="biomePopulation">${d(v)}</span></div>
        ${T(`this biome`)}
        <span data-col="wiki" data-tip="Open Wikipedia article about the biome" class="icon-info-circled pointer"></span>
        <span data-col="remove" ${e>12&&!l?`data-tip="Remove the custom biome" class="icon-trash-empty"`:``}></span>
      </div>
    `}let c=n(`biomesBody`);c.innerHTML=i,te(c,styles.relief.options.set);for(let n of e.all){let e=t[n.i];o+=a(e.area),s+=u(e.rural*options.map.units.population.scale+e.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate)}let f=a(_(pack.cells.area));n(`biomesFooterBiomes`).innerHTML=String(e.all.length),n(`biomesFooterCells`).innerHTML=String(pack.cells.h.filter(e=>e>=20).length);let p=n(`biomesFooterArea`);p.innerHTML=d(o)+r,n(`biomesFooterPopulation`).innerHTML=d(s),p.dataset.area=String(o),p.dataset.mapArea=String(f),n(`biomesFooterPopulation`).dataset.population=String(s),k(n(`biomesFooter`),e,R.goto),c.querySelectorAll(`div.biomes`).forEach(e=>{e.addEventListener(`mouseenter`,q)}),c.querySelectorAll(`div.biomes`).forEach(e=>{e.addEventListener(`mouseleave`,re)}),c.dataset.type===`percentage`&&(c.dataset.type=`absolute`,X()),C(N,{width:`fit-content`,position:F})}function G({icons:e,iconsDensity:t}){return ee(e,t,`biomeRelief`)}function K(e){let t=Number(e.closest(`.biomes`).dataset.id);ne.open({biome:t,onApply:V})}function q(t){if(customization===6)return;let n=+t.target.dataset.id,r=s().duration(2e3).ease(v);e(`#biomes > #biome${n}`).raise().transition(r).attr(`stroke-width`,2).attr(`stroke`,`#cd4c11`)}function re(t){if(customization===6)return;let n=+t.target.dataset.id,r=pack.biomes[n].color;e(`#biomes > #biome${n}`).transition().attr(`stroke-width`,.7).attr(`stroke`,r)}function J(e){let t=e.getAttribute(`fill`),n=+e.closest(`.biomes`).dataset.id;b.ColorPicker.open(t,t=>{e.fill=t,pack.biomes[n].color=t,g.draw(`biomes`)})}function Y(e){let t=e.closest(`.biomes`),n=+t.dataset.id;if(!e.value.trim()){e.value=pack.biomes[n].name;return}Biomes.rename(n,e.value),t.dataset.name=pack.biomes[n].name}function ie(e){let t=e.closest(`.biomes`),n=+t.dataset.id;if(Number.isNaN(+e.value)||+e.value<0||+e.value>9999){e.value=String(pack.biomes[n].habitability),y(`Please provide a valid number in range 0-9999`,!1,`error`);return}Biomes.setHabitability(n,+e.value),t.dataset.habitability=e.value,Q(),V()}function ae(e){let t=+(e.closest(`.biomes`)?.dataset.id||0);b.NotesEditor.open({type:`biome`,id:t})}function oe(e){let t=e.closest(`.biomes`)?.dataset.name;if(t===`Custom`||!t){y(`Please fill in the biome name`,!1,`error`);return}let n={"Hot desert":`Desert_climate#Hot_desert_climates`,"Cold desert":`Desert_climate#Cold_desert_climates`,Savanna:`Tropical_and_subtropical_grasslands,_savannas,_and_shrublands`,Grassland:`Temperate_grasslands,_savannas,_and_shrublands`,"Tropical seasonal forest":`Seasonal_tropical_forest`,"Temperate deciduous forest":`Temperate_deciduous_forest`,"Tropical rainforest":`Tropical_rainforest`,"Temperate rainforest":`Temperate_rainforest`,Taiga:`Taiga`,Tundra:`Tundra`,Glacier:`Glacier`,Wetland:`Wetland`},r=`https://en.wikipedia.org/w/index.php?search=${t}`;o(n[t]?`https://en.wikipedia.org/wiki/`+n[t]:r)}function se(){if(h(P)){p(P);return}let e=U(),t=pack.biomes.filter(({i:t})=>e[t].cells).sort((t,n)=>e[n.i].area-e[t.i].area).map(({i:e,color:t,name:n})=>[e,t,n]);if(!t.length)return void y(`No biomes to show`,!1,`error`);m(P,t)}function X(){let e=n(`biomesBody`);if(e.dataset.type===`absolute`){e.dataset.type=`percentage`;let t=+n(`biomesFooterCells`).innerHTML,r=n(`biomesFooterArea`),i=+r.dataset.area,a=+r.dataset.mapArea,o=+n(`biomesFooterPopulation`).dataset.population;e.querySelectorAll(`:scope > div`).forEach(e=>{e.querySelector(`.biomeCells`).innerHTML=`${u(+e.dataset.cells/t*100)}%`,e.querySelector(`.biomeArea`).innerHTML=`${u(+e.dataset.area/i*100)}%`,e.querySelector(`.biomePopulation`).innerHTML=`${u(+e.dataset.population/o*100)}%`}),r.innerHTML=`${u(i/a*100)}%`}else e.dataset.type=`absolute`,R.refresh()}function ce(){try{Biomes.add(`Custom`,c(),50)}catch{y(`Maximum number of biomes reached (255), data cleansing is required`,!1,`error`);return}I=U(),R.refresh()}function le(e){let t=+e.closest(`.biomes`).dataset.id;try{Biomes.remove(t)}catch{return}I=U(),R.refresh()}function Z(){let e=`Id,Biome,Color,Habitability,Cells,Area ${options.map.units.area.unit===`square`?`${options.map.units.distance.unit}2`:options.map.units.area.unit},Population\n`,n=U();for(let t of pack.biomes){if(!t.i||t.removed)continue;let{cells:r,area:i,rural:o,urban:s}=n[t.i],c=u(o*options.map.units.population.scale+s*options.map.units.population.scale*options.map.units.population.urbanization.rate);e+=`${t.i},${t.name},${t.color},${t.habitability}%,${r},${a(i)},${c}\n`}let r=`${t(`Biomes`)}.csv`;i(e,r)}function ue(){g.show(`biomes`),b.PaintEditor.open({title:`Paint Biomes`,parentDialogId:N,onClose:z,items:pack.biomes.filter(e=>e.i&&!e.removed).map(e=>({id:e.i,name:e.name,color:e.color})),getValue:e=>pack.cells.biome[e],filterCell:e=>r(e,pack),onApply:de})}function de(e){for(let[t,n]of f(e))Biomes.setCells(t,n);e.size&&(g.draw(`biomes`),document.getElementById(N)&&V())}function fe(){Biomes.restore(),g.draw(`biomes`),Q(),V()}function pe(){$(`#biomesEditor`).dialog(`destroy`),n(`biomesEditor`).remove()}function Q(){x.regenerate(),g.draw(`population`,`goods`)}var me={open:z,exportCsv:Z};export{me as BiomesEditor};