import{P as e,S as t}from"./utils-C0Xrn36t.js";import{p as n,t as r}from"./layers-BnOdDZo9.js";import{n as i,t as a}from"./highlight-rFg_BwKw.js";import{r as o}from"./tooltips-CZta3-Qx.js";import{i as s}from"./viewport-C0deAIKO.js";import{u as c}from"./zoom-C2c0hDAB.js";import{n as l,r as u}from"./notes-CCdjKTuX.js";import{I as d}from"./index-CQEUZswI.js";function f(e){let{width:t}=s,[n,r]=e?[Math.max(0,e.left),Math.min(t,e.right)]:[0,0];if(r<=n)return[0,t];let[i,a]=n>=t-r?[0,n]:[r,t];return a-i<t*.3?[0,t]:[i,a]}function p([e,t,n,r],i,a={},o){let[l,u]=f(o),d=Math.min(i,(u-l)*.65/Math.max(1,n-e),s.height*.65/Math.max(1,r-t)),p=Math.max(a.min??1,Math.min(a.max??20,Math.max(1,d))),m=(s.width/2-(l+u)/2)/p;return c((e+n)/2+m,(t+r)/2,p,1500),p}function m(e,{layers:n,maxScale:o,zoom:s,element:c,cover:l}){if(!e.length)return!1;r.show(...n);let u=t(e);return p(u,o,s,l),setTimeout(()=>{let e=c();e?i(e):a({x:u[0],y:u[1],width:u[2]-u[0],height:u[3]-u[1]})},750),!0}function h(t,n){let r=u.getDisplay(t),i=u.getElementId(t);return m(u.getPoints(t),{layers:r.layers,maxScale:r.scale,element:()=>r.highlight&&document.querySelector(r.highlight)||(i?e(i):null),cover:n})}var g=`fmg-omnibar-history`,_=10,v=50,y=60,b=100,x=800,S=document.createElement(`template`),C=class{root;input;list;status;events;previousFocus;keys=new Set;records=[];results=[];matched=0;history=[];selected=-1;busy=!1;open(){if(this.root)return void this.input?.focus();this.busy||(this.previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:void 0,this.records=this.collect(),this.history=this.readHistory(),this.render(),this.listen(),this.search(),this.input?.focus())}close(){this.dismiss(!0)}collect(){let e=d.map(e=>({kind:`command`,id:e.id,name:e.name,context:`Command`,fields:{name:w(e.name),alias:w(e.aliases)},command:e}));if(typeof pack>`u`||!pack.cells?.i?.length)return e;let t=new Map;for(let e of l)for(let n of u.collect(e,{located:!0})){let{ref:e,entity:r}=n,i=u.key(e),a=u.getDisplay(e),o=u.getName(e)||r.name||``,s=[a.kind,u.getContext(e)].filter(Boolean).join(` · `),c=o?`${r.name||o} ${s}`:s;t.set(i,{kind:`entity`,id:`entity:${i}`,name:o||a.kind,context:s,fields:{...this.fields({name:o,alias:c,note:r.note}),unnamed:!o},target:n,display:a})}for(let e of n()){if(!e.text)continue;let n=e.type===`added`?`addedLabel`:e.type,r=t.get(u.key({type:n,id:e.entityId}));if(r?.kind!==`entity`||e.type===`added`)continue;let i=e.text.replaceAll(`|`,` `);t.set(`label:${e.id}`,{kind:`label`,id:`label:${e.id}`,name:i,context:`Label · ${r.context}`,fields:this.fields({name:i,alias:`${r.name} ${r.context}`}),target:r.target,label:e})}return[...e,...t.values()]}fields({name:e,alias:t,note:n}){let r=D(n||``);return{name:w(e),alias:w(t),note:r,normalizedNote:r?w(r):void 0}}readHistory(){try{let e=JSON.parse(localStorage.getItem(g)||`[]`),t=new Set(this.records.filter(e=>e.kind===`command`).map(e=>e.id));return Array.isArray(e)?[...new Set(e.filter(e=>typeof e==`string`&&t.has(e)))].slice(0,_):[]}catch{return[]}}render(){let e=document.createElement(`div`);e.id=`omnibar`,e.setAttribute(`role`,`dialog`),e.setAttribute(`aria-label`,`Search map and commands`),e.innerHTML=`
      <style>
        #omnibar {
          --line: color-mix(in srgb, var(--bg-main) 22%, transparent);
          --muted: color-mix(in srgb, currentColor 55%, transparent);
          position: fixed;
          top: 0.8em;
          left: 50%;
          transform: translateX(-50%);
          width: min(50em, calc(100vw - 2em));
          z-index: 100000;
          box-sizing: border-box;
          overflow: hidden;
          background: var(--bg-dialogs, rgb(250 250 250 / 97%));
          color: #30343b;
          box-shadow: 0 0.5em 1.5em #00000030;
          font: 1.2em/1.3 var(--sans-serif);
        }

        #omnibar .omnibar-search {
          display: flex;
          align-items: center;
          gap: 0.7em;
          padding: 0 0.9em;
        }

        #omnibar .omnibar-search > .icon-search {
          color: var(--dark-solid);
          font-size: 1em;
        }

        #omnibar input {
          box-sizing: border-box;
          flex: 1;
          min-width: 0;
          height: 2.7em;
          margin: 0;
          padding: 0;
          border: 0;
          border-radius: 0;
          outline: none;
          box-shadow: none;
          background: transparent;
          color: inherit;
          caret-color: var(--dark-solid);
          font: inherit;
        }

        #omnibar input::placeholder {
          color: var(--muted);
        }

        #omnibar .omnibar-escape {
          color: var(--muted);
          font-size: 0.75em;
        }

        #omnibar-list {
          max-height: min(26em, 50vh);
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: var(--line) transparent;
        }

        #omnibar-list:not(:empty) {
          padding: 0.25em;
          border-top: 1px solid var(--line);
        }

        #omnibar [role="option"] {
          display: flex;
          align-items: center;
          gap: 0.6em;
          min-width: 0;
          padding: 0.3em 0.6em;
          cursor: pointer;
        }

        #omnibar [role="option"]:hover {
          background: color-mix(in srgb, var(--dark-solid) 5%, transparent);
        }

        #omnibar [role="option"][aria-selected="true"] {
          background: color-mix(in srgb, var(--dark-solid) 12%, transparent);
        }

        #omnibar [aria-disabled="true"] {
          color: var(--muted);
          cursor: default;
        }

        #omnibar .omnibar-icon {
          flex: 0 0 1.3em;
          color: var(--muted);
          font-size: 0.95em;
          text-align: center;
        }

        #omnibar [aria-selected="true"] .omnibar-icon {
          color: var(--dark-solid);
        }

        #omnibar .omnibar-name {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        #omnibar .omnibar-detail {
          flex: 0 1 auto;
          max-width: 50%;
          margin-left: auto;
          overflow: hidden;
          color: var(--muted);
          font-size: 0.85em;
          text-align: right;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        #omnibar mark {
          background: transparent;
          color: var(--dark-solid);
          font-weight: 600;
        }

        #omnibar-status {
          padding: 0.35em 1.2em;
          border-top: 1px solid var(--line);
          color: var(--muted);
          font-size: 0.75em;
        }

        #omnibar-status:empty {
          display: none;
        }
      </style>

      <div class="omnibar-search">
        <span class="icon-search" aria-hidden="true"></span>
        <input
          id="omnibar-input"
          role="combobox"
          aria-label="Search map and commands"
          aria-expanded="true"
          aria-controls="omnibar-list"
          aria-autocomplete="list"
          autocomplete="off"
          spellcheck="false"
          placeholder="Search map and commands"
        >
        <span class="omnibar-escape" aria-hidden="true">esc</span>
      </div>

      <div id="omnibar-list" role="listbox" aria-label="Search results"></div>
      <div id="omnibar-status" role="status" aria-live="polite"></div>
    `,document.body.append(e),this.root=e,this.input=e.querySelector(`input`),this.list=e.querySelector(`#omnibar-list`),this.status=e.querySelector(`#omnibar-status`),this.input.addEventListener(`input`,()=>this.search()),this.list.addEventListener(`mousedown`,e=>e.preventDefault()),this.list.addEventListener(`click`,e=>{let t=e.target.closest(`[data-index]`);t&&this.activate(Number(t.dataset.index))})}listen(){if(this.events)return;this.events=new AbortController;let e={capture:!0,signal:this.events.signal};window.addEventListener(`keydown`,e=>{if(this.root){if(e.code===`Space`&&!this.input?.value){e.preventDefault(),e.stopImmediatePropagation();return}if(this.keys.add(e.code),e.stopImmediatePropagation(),!e.isComposing)if([`Escape`,`Enter`,`ArrowDown`,`ArrowUp`,`Tab`].includes(e.key)&&e.preventDefault(),((e.ctrlKey||e.metaKey)&&e.code===`KeyS`||/^F\d+$/.test(e.code))&&e.preventDefault(),e.key===`Escape`)this.close();else if(e.key===`Enter`&&!e.repeat)this.activate(this.selected);else if(e.key===`ArrowDown`||e.key===`ArrowUp`){let t=this.results.length;t&&this.select((this.selected+(e.key===`ArrowDown`?1:-1)+t)%t)}else e.key===`Tab`&&this.input?.focus()}},e),window.addEventListener(`keyup`,e=>{(this.root||this.keys.has(e.code))&&(e.stopImmediatePropagation(),e.preventDefault()),this.keys.delete(e.code),e.key===`Meta`&&this.keys.clear(),this.cleanup()},e),window.addEventListener(`pointerdown`,e=>{this.root&&!this.root.contains(e.target)&&this.close()},e),window.addEventListener(`blur`,()=>{this.keys.clear(),this.close()},{signal:this.events.signal}),window.addEventListener(`map:generated`,()=>{this.root&&(this.records=this.collect(),this.search(),this.report(`The map changed. Select a current result.`))},{signal:this.events.signal})}search(){let e=this.input?.value.trim()||``,t=e.startsWith(`>`),n=w(t?e.slice(1):e),r=!n||/[\p{L}\p{N}?]/u.test(n),i=this.records.filter(e=>!t||e.kind===`command`).map((e,i)=>({result:e,order:i,score:r?this.score(e,n,t,this.history.indexOf(e.id)):0})).filter(e=>e.score>0).sort((e,t)=>t.score-e.score||e.order-t.order);this.matched=i.length,this.results=i.slice(0,t?1/0:v).map(e=>e.result),this.selected=0,this.renderResults(n)}score(e,t,n,r){if(t){let{fields:n}=e,r=O(n.name,t),i=O(n.alias,t),a=n.normalizedNote?.includes(t)?b:0,o=e.kind===`command`&&e.command.matches?.(t)?x:0,s=Math.max(r&&r+400,i&&i+200,o,a);return n.unnamed?Math.min(s,b):s}return e.kind===`command`?r>=0?1e3-r:+!!n:0}renderResults(e){if(!this.list||!this.status)return;let t=k();this.list.replaceChildren(),this.results.forEach((n,i)=>{let a=document.createElement(`div`);a.id=`omnibar-result-${i}`,a.dataset.index=String(i),a.setAttribute(`role`,`option`),a.setAttribute(`aria-disabled`,String(!!t));let o=document.createElement(`span`);o.className=`omnibar-icon`,n.kind===`command`?o.textContent=`>`:o.classList.add(n.kind===`label`?`icon-font`:n.display.icon),o.setAttribute(`aria-hidden`,`true`);let s=document.createElement(`span`);s.className=`omnibar-name`,this.highlight(s,n.name,e);let c=document.createElement(`span`);c.className=`omnibar-detail`;let l=n.kind===`command`?n.command.layer:void 0;c.textContent=t||`${n.context}${l?` · ${r.isOn(l)?`Visible`:`Hidden`}`:``}`,a.append(o,s,c);let u=n.kind===`entity`?n.fields:void 0,d=n.kind===`entity`&&n.display.previewNote;if(u?.note&&(d||e&&u.normalizedNote?.includes(e))){let t=document.createElement(`span`);this.highlight(t,E(u.note,d?``:e),e),c.append(` · `,t)}a.title=`${n.name} · ${c.textContent}`,this.list.append(a)});let n=this.matched>this.results.length?`${this.results.length} of ${this.matched}`:this.results.length;this.status.textContent=this.results.length?`${n} results · ↑↓ navigate · ↵ select`:e?`No matches`:``,this.select(this.selected)}highlight(e,t,n){let{letters:r,haystack:i,owners:a}=T(t),o=new Set;for(let e of n.split(` `).filter(Boolean)){let t=i.indexOf(e);for(;t!==-1;){for(let n=t;n<t+e.length;n++)o.add(a[n]);t=i.indexOf(e,t+e.length)}}r.forEach((t,n)=>{if(!o.has(n)){e.append(t);return}let r=document.createElement(`mark`);r.textContent=t,e.append(r)})}select(e){this.selected=e,this.list?.querySelectorAll(`[role='option']`).forEach((t,n)=>{t.setAttribute(`aria-selected`,String(n===e))});let t=this.list?.children[e];t?(this.input?.setAttribute(`aria-activedescendant`,t.id),t.scrollIntoView({block:`nearest`})):this.input?.removeAttribute(`aria-activedescendant`)}async activate(e){let t=this.results[e];if(!(!t||this.busy)&&!this.unavailable()){if(t.kind!==`command`&&!this.current(t)){this.records=this.collect(),this.search(),this.report(`The map changed. Select a current result.`);return}this.busy=!0,this.dismiss(!1);try{if(t.kind===`command`)await t.command.run(),this.remember(t.id);else if(t.kind===`label`)this.navigate(t.target,{label:t.label});else{let e=u.open(t.target.ref);e?await e:this.navigate(t.target)}}catch{o(`Could not open the search result. Please try again.`,!1,`error`)}finally{this.busy=!1}}}current(e){return u.get(e.target.ref)===e.target.entity}navigate(t,{label:n}={}){let i;if(n){let t=options.map.labels.groups.find(e=>e.name===n.group),a=[`labels`];t?.layerDependency&&r.has(t.layerDependency)&&a.push(t.layerDependency),i=m([[n.anchor[0]+(n.dx||0),n.anchor[1]+(n.dy||0)]],{layers:a,maxScale:8,zoom:t?.zoom,element:()=>e(n.id)})}else i=h(t.ref);i||this.report(`This element has no map location`,`warn`)}remember(e){this.history=[e,...this.history.filter(t=>t!==e)].slice(0,_);try{localStorage.setItem(g,JSON.stringify(this.history))}catch{}}report(e,t){t?o(e,!1,t,4e3):this.status&&(this.status.textContent=e)}unavailable(){let e=k();return e?(this.report(e),!0):!1}dismiss(e){this.root?.remove(),this.root=this.input=this.list=this.status=void 0,this.records=this.results=[],e&&this.previousFocus?.isConnected&&this.previousFocus.focus(),this.previousFocus=void 0,this.cleanup()}cleanup(){this.root||this.keys.size||(this.events?.abort(),this.events=void 0)}};function w(e){return e.normalize(`NFD`).replace(/\p{M}/gu,``).toLowerCase().replace(/\s+/g,` `).trim()}function T(e){let t=Array.from(e),n=t.map(e=>e.normalize(`NFD`).replace(/\p{M}/gu,``).toLowerCase()),r=n.flatMap((e,t)=>Array(e.length).fill(t));return{letters:t,haystack:n.join(``),owners:r}}function E(e,t){let{letters:n,haystack:r,owners:i}=T(e),a=t?r.indexOf(t):-1,o=a===-1?0:Math.max(0,i[a]-35);return`${o?`…`:``}${n.slice(o,o+y).join(``)}`}function D(e){if(!e)return``;S.innerHTML=e;for(let e of S.content.querySelectorAll(`script, style`))e.remove();for(let e of S.content.querySelectorAll(`br, p, div, li`))e.append(` `);let t=S.content.textContent||``;return S.innerHTML=``,t.replace(/\s+/g,` `).trim()}function O(e,t){if(e===t)return 1e3;if(e.startsWith(t))return 850;if(e.includes(t))return 700;let n=t.split(` `);return n.length>1&&n.every(t=>e.includes(t))?600:0}function k(){return typeof pack>`u`||!pack.cells?.i?.length?`Generate or load a map first`:typeof customization<`u`&&customization?`Exit customization mode first`:document.getElementById(`canvas3d`)?`Switch to the 2D map first`:``}var A=new C;export{A as Omnibar};