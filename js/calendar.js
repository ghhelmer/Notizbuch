/* Gemeinsamer Kalender: Termine gehören zu einem Notizbuch und werden mit dessen Inhaltsverzeichnis
   (notebook.json) abgeglichen. Wer das Notizbuch geteilt bekommen hat, sieht und bearbeitet die Termine. */
(function(){
"use strict";
const MONTHS=["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const DAYS=["Mo","Di","Mi","Do","Fr","Sa","So"];
const NB_COLORS=["#1f6f78","#c45a7a","#4a7fc1","#e8a33d","#4f9d69","#8a6cc4","#c4704a"];
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
let el=null,view=new Date(),sel=iso(new Date()),editing=null;

function nbColor(nb){const i=Store.notebooks.indexOf(nb);return NB_COLORS[(i<0?0:i)%NB_COLORS.length];}
function allEvents(){
  const out=[];
  Store.notebooks.forEach(nb=>(nb.events||[]).forEach(e=>{if(!e.deleted)out.push({e,nb});}));
  return out.sort((a,b)=>(a.e.date+(a.e.time||"00:00")).localeCompare(b.e.date+(b.e.time||"00:00")));
}
function build(){
  el=document.createElement("div");el.className="cal-bg";el.hidden=true;
  el.innerHTML=`<div class="cal" role="dialog" aria-label="Kalender">
    <div class="cal-head">
      <button class="iconbtn" data-prev aria-label="Voriger Monat">‹</button>
      <h3 id="calTitle"></h3>
      <button class="iconbtn" data-next aria-label="Nächster Monat">›</button>
      <button class="btn" data-today>Heute</button>
      <span style="flex:1"></span>
      <button class="iconbtn" data-close aria-label="Kalender schließen">✕</button>
    </div>
    <div class="cal-body">
      <div class="cal-grid" id="calGrid"></div>
      <div class="cal-side">
        <h4 id="calDay"></h4>
        <ul class="cal-list" id="calList"></ul>
        <form class="cal-form" id="calForm">
          <input type="text" id="calWhat" placeholder="Neuer Termin, z. B. Elternabend" required>
          <div class="cal-row">
            <label>Datum<input type="date" id="calDate"></label>
            <label>von<input type="time" id="calTime"></label>
            <label>bis<input type="time" id="calEnd"></label>
          </div>
          <label>Notiz<input type="text" id="calNote" placeholder="Ort, Raum, Hinweis"></label>
          <label>Kalender von Notizbuch<select id="calNb"></select></label>
          <div class="cal-row end"><button type="button" class="btn" data-cancel hidden>Abbrechen</button><button type="button" class="btn danger" data-del hidden>Löschen</button><button class="btn pri" id="calSave">Termin speichern</button></div>
        </form>
        <h4>Nächste Termine</h4>
        <ul class="cal-list" id="calNext"></ul>
      </div>
    </div></div>`;
  document.body.appendChild(el);
  el.addEventListener("click",e=>{if(e.target===el)toggle(false);});
  el.querySelector("[data-close]").onclick=()=>toggle(false);
  el.querySelector("[data-prev]").onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1);render();};
  el.querySelector("[data-next]").onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1);render();};
  el.querySelector("[data-today]").onclick=()=>{view=new Date();sel=iso(new Date());render();};
  el.querySelector("#calGrid").addEventListener("click",e=>{const d=e.target.closest("[data-d]");if(d){sel=d.dataset.d;resetForm();render();}});
  const pick=e=>{const li=e.target.closest("[data-ev]");if(!li)return;const [nbId,evId]=li.dataset.ev.split("|");const nb=Store.notebooks.find(n=>n.id===nbId);const ev=nb&&nb.events.find(x=>x.id===evId);if(ev)edit(nb,ev);};
  el.querySelector("#calList").addEventListener("click",pick);
  el.querySelector("#calNext").addEventListener("click",e=>{const li=e.target.closest("[data-ev]");if(li){sel=li.dataset.date;view=new Date(sel+"T12:00");}pick(e);render();});
  el.querySelector("#calForm").addEventListener("submit",e=>{e.preventDefault();save();});
  el.querySelector("[data-cancel]").onclick=()=>{resetForm();render();};
  el.querySelector("[data-del]").onclick=e=>{
    const b=e.currentTarget;if(!b.dataset.armed){b.dataset.armed="1";b.textContent="Wirklich löschen?";return;}
    if(editing){editing.ev.deleted=true;editing.ev.mod=Date.now();Store.touchIndex(editing.nb);}
    resetForm();render();
  };
}
function resetForm(){
  editing=null;const f=el.querySelector("#calForm");f.reset();
  el.querySelector("#calDate").value=sel;
  el.querySelector("#calSave").textContent="Termin speichern";
  const del=el.querySelector("[data-del]");del.hidden=true;delete del.dataset.armed;del.textContent="Löschen";
  el.querySelector("[data-cancel]").hidden=true;
  el.querySelector("#calNb").disabled=false;
}
function edit(nb,ev){
  editing={nb,ev};
  el.querySelector("#calWhat").value=ev.title;el.querySelector("#calDate").value=ev.date;el.querySelector("#calTime").value=ev.time||"";
  el.querySelector("#calEnd").value=ev.end||"";el.querySelector("#calNote").value=ev.note||"";
  el.querySelector("#calNb").value=nb.id;el.querySelector("#calNb").disabled=true;
  el.querySelector("#calSave").textContent="Änderung speichern";el.querySelector("[data-del]").hidden=false;el.querySelector("[data-cancel]").hidden=false;
  el.querySelector("#calWhat").focus();
}
function save(){
  const title=el.querySelector("#calWhat").value.trim();if(!title)return;
  const date=el.querySelector("#calDate").value||sel;
  const data={title,date,time:el.querySelector("#calTime").value,end:el.querySelector("#calEnd").value,note:el.querySelector("#calNote").value.trim(),mod:Date.now()};
  let nb;
  if(editing){nb=editing.nb;Object.assign(editing.ev,data);}
  else{
    nb=Store.notebooks.find(n=>n.id===el.querySelector("#calNb").value)||Store.notebooks[0];
    nb.events=nb.events||[];
    nb.events.push(Object.assign({id:Store.uid(),by:(window.OD&&OD.userName)||""},data));
  }
  Store.touchIndex(nb);
  sel=date;view=new Date(date+"T12:00");resetForm();render();
}
function line(x,showDate){
  const e=x.e;const t=e.time?(e.time+(e.end?"–"+e.end:"")):"ganztägig";
  const d=showDate?new Date(e.date+"T12:00").toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"short"})+" · ":"";
  const shared=x.nb.source==="onedrive"?` · ${esc(x.nb.name)}`:"";
  return `<li data-ev="${x.nb.id}|${e.id}" data-date="${e.date}"><span class="cal-dot" style="background:${nbColor(x.nb)}"></span><span><b>${esc(e.title)}</b><br><span class="small">${d}${t}${e.note?" · "+esc(e.note):""}${shared}${e.by?" · von "+esc(e.by):""}</span></span></li>`;
}
function render(){
  if(!el||el.hidden)return;
  const y=view.getFullYear(),m=view.getMonth();
  el.querySelector("#calTitle").textContent=MONTHS[m]+" "+y;
  const evs=allEvents();const byDay=new Map();
  evs.forEach(x=>{if(!byDay.has(x.e.date))byDay.set(x.e.date,[]);byDay.get(x.e.date).push(x);});
  const first=new Date(y,m,1);const offset=(first.getDay()+6)%7;const start=new Date(y,m,1-offset);
  const today=iso(new Date());
  let h=DAYS.map(d=>`<div class="cal-dow">${d}</div>`).join("");
  for(let i=0;i<42;i++){
    const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);const k=iso(d);const list=byDay.get(k)||[];
    h+=`<button type="button" class="cal-day${d.getMonth()!==m?" out":""}${k===today?" today":""}${k===sel?" sel":""}" data-d="${k}"><span class="num">${d.getDate()}</span>${list.slice(0,3).map(x=>`<span class="cal-chip" style="--c:${nbColor(x.nb)}">${esc(x.e.time?x.e.time+" ":"")}${esc(x.e.title)}</span>`).join("")}${list.length>3?`<span class="small">+${list.length-3}</span>`:""}</button>`;
  }
  el.querySelector("#calGrid").innerHTML=h;
  el.querySelector("#calDay").textContent=new Date(sel+"T12:00").toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const dayList=byDay.get(sel)||[];
  el.querySelector("#calList").innerHTML=dayList.length?dayList.map(x=>line(x,false)).join(""):`<li class="small">Keine Termine an diesem Tag.</li>`;
  const next=evs.filter(x=>x.e.date>=today).slice(0,8);
  el.querySelector("#calNext").innerHTML=next.length?next.map(x=>line(x,true)).join(""):`<li class="small">Keine anstehenden Termine.</li>`;
  const s=el.querySelector("#calNb");const cur=s.value||Store.ui.nb;
  s.innerHTML=Store.notebooks.map(n=>`<option value="${n.id}">${esc(n.name)}${n.source==="onedrive"?(n.own?" (OneDrive)":" (geteilt)"):" (nur dieses Gerät)"}</option>`).join("");
  s.value=Store.notebooks.some(n=>n.id===cur)?cur:Store.notebooks[0].id;
  if(!editing&&!el.querySelector("#calDate").value)el.querySelector("#calDate").value=sel;
}
function toggle(show){
  if(!el)build();
  el.hidden=show===undefined?!el.hidden:!show;
  if(!el.hidden){resetForm();el.querySelector("#calNb").value=Store.ui.nb;render();}
  const b=document.getElementById("calendarBtn");if(b)b.classList.toggle("on",!el.hidden);
}
window.Kalender={toggle,render};
})();
