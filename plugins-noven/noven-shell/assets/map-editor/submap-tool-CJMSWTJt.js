import{$n as e,N as t,et as n,tr as r,tt as i}from"./utils-C0Xrn36t.js";import{C as a,T as o,l as s,n as c,t as l,w as u}from"./options-tab-CU9uS1TD.js";import{t as d}from"./layers-BnOdDZo9.js";import{i as f}from"./viewport-C0deAIKO.js";import{o as p}from"./options-schema-CpDo-2q5.js";import{i as m}from"./generation-pipeline-BV-nvoWf.js";import{i as h}from"./dialog-helpers-DS9mxWMd.js";import{v as g}from"./index-CQEUZswI.js";function _(){v(),y(),$(`#submapTool`).dialog({title:`Create a submap`,resizable:!1,width:`32em`,position:{my:`center`,at:`center`,of:`svg`},close:b,buttons:{Submap:function(){S(),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}}})}function v(){h(`submapTool`);let e=String(options.generation.graph.density),n=p[+e],r=`<div id="submapTool" class="dialog">
    <p style="font-weight: bold">
      This operation is destructive and irreversible. It will create a completely new map based on the current one.
      Don't forget to save the .map file to your machine first!
    </p>
    <div style="display: flex; flex-direction: column; gap: 0.5em">
      <div data-tip="Set points (cells) number of the submap" style="display: flex; gap: 1em">
        <div>Points number</div>
        <div>
          <input id="submapPointsInput" type="range" min="1" max="13" value="${e}" />
          <output id="submapPointsFormatted" style="color: ${l(n)}">${n/1e3}K</output>
        </div>
      </div>
      <div data-tip="Check to fit burg styles (icon and label size) to the submap scale">
        <input type="checkbox" class="checkbox" id="submapRescaleBurgStyles" checked />
        <label for="submapRescaleBurgStyles" class="checkbox-label">Rescale burg styles</label>
      </div>
    </div>
  </div>`;t(`dialogs`).insertAdjacentHTML(`beforeend`,r)}function y(){t(`submapPointsInput`).oninput=x}function b(){h(`submapTool`)}function x(e){let n=p[+e.target.value],r=t(`submapPointsFormatted`);r.value=`${n/1e3}K`,r.style.color=l(n)}function S(){INFO&&console.group(`generateSubmap`);let{x0:e,y0:n,scale:r}=C();w(e,n,r);let i=t(`submapPointsInput`).value;i!==String(options.generation.graph.density)&&c(+i),a(),u(),resetZoom(0),m(),g.process({projection:(t,i)=>[(t-e)*r,(i-n)*r],inverse:(t,i)=>[t/r+e,i/r+n],scale:r}),t(`submapRescaleBurgStyles`).checked&&T(r),d.drawAll(),s(),o(),INFO&&console.groupEnd()}function C(){let{width:t,height:n}=options.map.graph,r=f.width/f.scale,i=f.height/f.scale,a=Math.min(t/r,n/i),o=t/a,s=n/a;return{x0:e(-f.x/f.scale-(o-r)/2,0,t-o),y0:e(-f.y/f.scale-(s-i)/2,0,n-s),scale:a}}function w(e,t,a){let{geography:o,graph:s,units:c}=options.map,{coordinates:l}=o;o.mapSize=r(o.mapSize/a,2);let u=l.latT/a;o.latitude=r((90-n(t,l,s.height))/(180-u)*100,2);let d=l.lonT/a;o.longitude=r((180-i(e+s.width/a,l,s.width))/(360-d)*100,2),c.distance.scale=r(c.distance.scale/a,2),c.population.scale=r(c.population.scale/a,2),Options.save()}function T(n){window.Burgs.ensureBurgGroupStyles();for(let i of t(`burgIcons`).querySelectorAll(`:scope > g`)){let t=styles.burgIcons.groups[i.id]?.groups.icons;t&&(t.options.size=r(e(t.options.size*n,.2,10),2)),i.remove()}let i=new Set(pack.burgs.filter(e=>e.i&&!e.removed).map(e=>e.label?.group||e.group||`burg`));for(let e of i){let t=styles.labels.groups[e];if(!t)continue;let i=Number.parseFloat(t.attrs[`font-size`])||0,a=Math.max(r((i+i/n)/2,2),1)*n;t.attrs[`font-size`]=`${r(a,2)}%`}}var E={open:_};export{E as SubmapTool};