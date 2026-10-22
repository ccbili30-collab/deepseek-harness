import{En as e,I as t,It as n,N as r,P as i,nt as a,st as o,tr as s}from"./utils-C0Xrn36t.js";import{E as c,T as l,t as u}from"./layers-BnOdDZo9.js";import{t as d}from"./drag-Bl16t6jK.js";import{r as f,t as p}from"./tooltips-CZta3-Qx.js";import{t as m}from"./controllers-CIDnRwoN.js";import{i as h,n as g,o as _}from"./dialog-helpers-DS9mxWMd.js";var v,y=!1;function b(t){if(customization||i(`riverEditor`)&&t===v.attr(`id`))return;g(`.stable`),u.show(`rivers`),y=!u.isOn(`cells`),u.show(`cells`),c(Number(t.slice(5))),v=e(`#${t}`).on(`click`,M),f(`Drag control points to change the river course. Click on point to remove it. Click on river to add additional control point. For major changes please create a new river instead`,!0),e(`#debug`).append(`g`).attr(`id`,`controlCells`),e(`#debug`).append(`g`).attr(`id`,`controlPoints`),x(),r(`riverEditor`).dataset.entity=`river:${Number(t.slice(5))}`,T();let{cells:n,points:a}=w();O(Rivers.getRiverPoints(n,a??null)),k(n),$(`#riverEditor`).dialog({title:`Edit River`,resizable:!1,position:{my:`left top`,at:`left+10 top+10`,of:`#map`},close:W})}function x(){h(`riverEditor`);let e=`<div id="riverEditor" class="dialog">
    <div id="riverBody" style="padding-bottom: 0.3em">
      <div>
        <div class="label" style="width: 4.8em">Name:</div>
        <span id="riverNameCulture" data-tip="Generate culture-specific name for the river" class="icon-book pointer"></span>
        <span id="riverNameRandom" data-tip="Generate random name for the river" class="icon-globe pointer"></span>
        <input id="riverName" data-tip="Type to rename the river" autocorrect="off" spellcheck="false" />
        <span id="riverNameSpeak" data-tip="Speak the name. You can change voice and language in options" class="speaker">🔊</span>
      </div>
      <div data-tip="Type to change river type (e.g. fork, creek, river, brook, stream)">
        <div class="label">Type:</div>
        <input id="riverType" autocorrect="off" spellcheck="false" />
      </div>
      <div data-tip="Select parent river">
        <div class="label">Mainstem:</div>
        <select id="riverMainstem"></select>
      </div>
      <div data-tip="River drainage basin (watershed)">
        <div class="label">Basin:</div>
        <input id="riverBasin" disabled />
      </div>
      <div data-tip="River discharge (flux power)">
        <div class="label">Discharge:</div>
        <input id="riverDischarge" disabled />
      </div>
      <div data-tip="River length in selected units">
        <div class="label">Length:</div>
        <input id="riverLength" disabled />
      </div>
      <div data-tip="River mouth width in selected units">
        <div class="label">Mouth width:</div>
        <input id="riverWidth" disabled />
      </div>
      <div data-tip="River source additional width. Default value is 0">
        <div class="label">Source width:</div>
        <input id="riverSourceWidth" type="number" min="0" max="3" step=".01" />
      </div>
      <div data-tip="River width multiplier. Default value is 1">
        <div class="label">Width modifier:</div>
        <input id="riverWidthFactor" type="number" min=".1" max="4" step=".1" />
      </div>
    </div>
    <div id="riverBottom">
      <button id="riverCreateSelectingCells" data-tip="Create a new river selecting river cells" class="icon-map-pin"></button>
      <button id="riverEditStyle" data-tip="Edit style for all rivers in Style Editor" class="icon-brush"></button>
      <button id="riverElevationProfile" data-tip="Show the elevation profile for the river" class="icon-chart-area"></button>
      ${_(`riverLegend`,`this river`)}
      <button id="riverRemove" data-tip="Remove river" data-shortcut="Delete" class="icon-trash fastDelete"></button>
    </div>
  </div>`;r(`dialogs`).insertAdjacentHTML(`beforeend`,e),r(`riverCreateSelectingCells`).addEventListener(`click`,S),r(`riverEditStyle`).addEventListener(`click`,C),r(`riverElevationProfile`).addEventListener(`click`,V),r(`riverLegend`).addEventListener(`click`,H),r(`riverRemove`).addEventListener(`click`,U),r(`riverName`).addEventListener(`input`,P),r(`riverNameSpeak`).addEventListener(`click`,()=>o(r(`riverName`).value)),r(`riverType`).addEventListener(`input`,F),r(`riverNameCulture`).addEventListener(`click`,I),r(`riverNameRandom`).addEventListener(`click`,L),r(`riverMainstem`).addEventListener(`change`,R),r(`riverSourceWidth`).addEventListener(`input`,z),r(`riverWidthFactor`).addEventListener(`input`,B)}function S(){m.RiverCreator.open()}function C(){m.StyleEditor.open(`rivers`)}function w(){let e=+v.attr(`id`).slice(5);return pack.rivers.find(t=>t.i===e)}function T(){let e=w();r(`riverName`).value=e.name,r(`riverType`).value=e.type;let t=r(`riverMainstem`);t.options.length=0;let n=e.parent||e.i;pack.rivers.slice().sort((e,t)=>e.name>t.name?1:-1).forEach(e=>{let r=new Option(e.name,String(e.i),!1,e.i===n);t.options.add(r)}),r(`riverBasin`).value=pack.rivers.find(t=>t.i===e.basin).name,r(`riverDischarge`).value=`${e.discharge} m³/s`,r(`riverSourceWidth`).value=String(e.sourceWidth),r(`riverWidthFactor`).value=String(e.widthFactor),E(e),Rivers.updateWidth(e),D(e)}function E(e){e.length=s(v.node().getTotalLength()/2,2);let t=`${s(e.length*options.map.units.distance.scale)} ${options.map.units.distance.unit}`;r(`riverLength`).value=t}function D(e){let t=`${s(e.width*options.map.units.distance.scale,3)} ${options.map.units.distance.unit}`;r(`riverWidth`).value=t}function O(t){e(`#controlPoints`).selectAll(`circle`).data(t).join(`circle`).attr(`cx`,e=>e[0]).attr(`cy`,e=>e[1]).attr(`r`,.6).call(d().on(`start`,A)).on(`click`,N)}function k(t){let n=[...new Set(t)].filter(e=>pack.cells.i[e]);e(`#controlCells`).selectAll(`polygon`).data(n).join(`polygon`).attr(`points`,e=>String(Pack.getPolygon(e)))}function A(e){let{r:t,fl:n}=pack.cells,r=w(),{x:i,y:a}=e,o=Pack.findCell(i,a),c=null;e.on(`drag`,function(e){let{x:t,y:n}=e,i=Pack.findCell(t,n);c=o===i?null:i,this.setAttribute(`cx`,t),this.setAttribute(`cy`,n),this.__data__=[s(t,1),s(n,1)],j(),k(r.cells)}),e.on(`end`,()=>{if(c&&!t[c]){t[o]=0,t[c]=r.i;let e=n[o];n[o]=n[c],n[c]=e,j()}})}function j(){let t=w();t.points=e(`#controlPoints`).selectAll(`*`).data(),t.cells=t.points.map(([e,t])=>Pack.findCell(e,t)),l(t),E(t),u.draw(`labels`),i(`elevationProfile`)&&V()}function M(n){let[r,i]=t(n,this),o=[s(r,1),s(i,1)],c=w();c.points||=e(`#controlPoints`).selectAll(`*`).data();let l=a(c.points,o,2);c.points.splice(l,0,o),O(c.points),j()}function N(){this.remove(),j();let{cells:e}=w();k(e)}function P(){this.value.trim()&&(Rivers.rename(w().i,this.value),u.draw(`labels`))}function F(){this.value.trim()&&(Rivers.setType(w().i,this.value),u.draw(`labels`))}function I(){let e=w(),t=Rivers.getName(e.mouth);r(`riverName`).value=t,Rivers.rename(e.i,t),u.draw(`labels`)}function L(){let e=Names.getBase(n(Names.nameBases.length-1));r(`riverName`).value=e,Rivers.rename(w().i,e),u.draw(`labels`)}function R(){let e=w();try{Rivers.setParent(e.i,+this.value)}catch(t){f(t.message,!1,`error`),this.value=String(e.parent||e.i);return}r(`riverBasin`).value=pack.rivers.find(t=>t.i===e.basin).name}function z(){let e=w();Rivers.setWidth(e.i,Math.max(0,+this.value||0),e.widthFactor),D(e),j()}function B(){let e=w();Rivers.setWidth(e.i,e.sourceWidth??0,Math.max(0,+this.value||0)),D(e),j()}function V(){let t=e(`#controlPoints`).selectAll(`*`).data().map(([e,t])=>Pack.findCell(e,t)),n=s(w().length*options.map.units.distance.scale);m.ElevationProfile.open(t,n,!0)}function H(){m.NotesEditor.open({type:`river`,id:w().i})}function U(){alertMessage.innerHTML=`Are you sure you want to remove the river and all its tributaries`,$(`#alert`).dialog({resizable:!1,width:`22em`,title:`Remove river and tributaries`,buttons:{Remove:function(){$(this).dialog(`close`);let e=+v.attr(`id`).slice(5);Rivers.remove(e),$(`#riverEditor`).dialog(`close`),u.draw(`rivers`,`labels`)},Cancel:function(){$(this).dialog(`close`)}}})}function W(){e(`#controlPoints`).remove(),e(`#controlCells`).remove(),v.on(`click`,null),c(null),p(),y&&u.hide(`cells`),y=!1,h(`riverEditor`),v=null}var G={open:b};export{G as RiverEditor};