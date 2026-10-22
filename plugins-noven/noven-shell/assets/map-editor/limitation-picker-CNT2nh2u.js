import{N as e,Wn as t}from"./utils-C0Xrn36t.js";import{r as n}from"./tooltips-CZta3-Qx.js";var r=e=>e.filter(e=>e.i&&!e.removed);function i(e,t){return e?.length?e.map(e=>t.find(t=>t.i===e)?.name??``).join(`, `):`all`}function a({title:i,heading:a,items:o,allowed:s,onApply:c}){let l=r(o).map(({i:e,name:n,fullName:r,color:i})=>`<tr data-tip="${t(n)}">
      <td><span style="color:${t(i??``)}">⬤</span></td>
      <td>
        <input data-i="${e}" id="limitation${e}" type="checkbox" class="checkbox" ${!s?.length||s.includes(e)?`checked`:``}>
        <label for="limitation${e}" class="checkbox-label">${t(r||n)}</label>
      </td>
    </tr>`),u=e(`alertMessage`);u.innerHTML=`<b>${t(a)}:</b>
    <table style="margin-top:.3em"><tbody>${l.join(``)}</tbody></table>`;let d=()=>Array.from(u.querySelectorAll(`input`));$(`#alert`).dialog({width:`fit-content`,title:i,close:()=>$(`#alert`).dialog(`option`,`buttons`,{}),buttons:{Invert:()=>{for(let e of d())e.checked=!e.checked},Apply:()=>{let e=d().filter(e=>e.checked);if(!e.length)return n(`Select at least one element`,!1,`error`);c(e.length===d().length?[]:e.map(e=>Number(e.dataset.i))),$(`#alert`).dialog(`close`)},Cancel:()=>$(`#alert`).dialog(`close`)}})}export{a as n,i as t};