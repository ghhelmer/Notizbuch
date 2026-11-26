/* Gemeinsamer Kalender: Termine gehören zu einem Notizbuch und werden mit dessen Inhaltsverzeichnis
   (notebook.json) abgeglichen. Wer das Notizbuch geteilt bekommen hat, sieht und bearbeitet die Termine.
   Ansichten: Tag, Woche, Monat. Kategorien kommen aus config.js (kategorien). */
(function(){
"use strict";
const MONTHS=["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const DAYS=["Mo","Di","Mi","Do","Fr","Sa","So"];
const DEFAULT_CATS=[{name:"Familie",farbe:"#1f6f78"},{name:"Gerhard",farbe:"#4a7fc1"},{name:"Karin",farbe:"#c45a7a"},{name:"Johannes",farbe:"#e8a33d"},{name:"Anna",farbe:"#8a6cc4"}];
const CATS=((window.NOTIZBUCH_CONFIG||{}).kategorien||DEFAULT_CATS);
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const day=k=>new Date(k+"T12:00");
const addDays=(k,n)=>{const d=day(k);d.setDate(d.getDate()+n);return iso(d);};
const monday=k=>{const d=day(k);return addDays(k,-((d.getDay()+6)%7));};
function isoWeek(k){const d=day(k);d.setDate(d.getDate()+3-((d.getDay()+6)%7));const y=new Date(d.getFullYear(),0,4);return 1+Math.round(((d-y)/864e5-3+((y.getDay()+6)%7))/7);}

let el=null,mode="month",sel=iso(new Date()),editing=null;
let hidden=new Set();try{hidden=new Set(JSON.parse(localStorage.getItem("kalender-ausgeblendet")||"[]"));}catch(e){}
try{mode=localStorage.getItem("kalender-ansicht")||"month";}catch(e){}

const catOf=e=>CATS.find(c=>c.name===e.cat)||CATS[0];
const color=e=>catOf(e).farbe;
function allEvents(){
  const out=[];
  Store.notebooks.forEach(nb=>(nb.events||[]).forEach(e=>{if(!e.deleted&&!hidden.has(catOf(e).name))out.push({e,nb});}));
  return out.sort((a,b)=>(a.e.date+(a.e.time||"")).localeCompare(b.e.date+(b.e.time||"")));
}
function build(){
  el=document.createElement("div");el.className="cal-bg";el.hidden=true;
  el.innerHTML=`<div class="cal" role="dialog" aria-label="Kalender">
    <div class="cal-head">
      <button class="iconbtn" data-prev aria-label="Zurück">‹</button>
      <h3 id="calTitle"></h3>
      <button class="iconbtn" data-next aria-label="Weiter">›</button>
      <button class="btn" data-today>Heute</button>
      <div class="seg" role="group" aria-label="Ansicht">
        <button data-mode="day">Tag</button><button data-mode="week">Woche</button><button data-mode="month">Monat</button>
      </div>
      <span style="flex:1"></span>
      <button class="iconbtn" data-close aria-label="Kalender schließen">✕</button>
    </div>
    <div class="cal-cats" id="calCats"></div>
    <div class="cal-body">
      <div class="cal-main" id="calMain"></div>
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
          <label>Kategorie<select id="calCat">${CATS.map(c=>`<option>${esc(c.name)}</option>`).join("")}</select></label>
          <label>Ort<input type="text" id="calWhere" placeholder="z. B. Schule, Raum 104"></label>
          <label>Beschreibung<textarea id="calNote" rows="4" placeholder="Was mitbringen, Telefonnummer, Hinweise …"></textarea></label>
          <label>Gespeichert im Notizbuch<select id="calNb"></select></label>
          <div class="cal-row end"><button type="button" class="btn" data-cancel hidden>Abbrechen</button><button type="button" class="btn danger" data-del hidden>Löschen</button><button class="btn pri" id="calSave">Termin speichern</button></div>
        </form>
        <h4>Nächste Termine</h4>
        <ul class="cal-list" id="calNext"></ul>
      </div>
    </div></div>`;
  document.body.appendChild(el);
  el.addEventListener("click",e=>{if(e.target===el)toggle(false);});
  el.querySelector("[data-close]").onclick=()=>toggle(false);
  const step=dir=>{if(mode==="day")sel=addDays(sel,dir);else if(mode==="week")sel=addDays(sel,7*dir);else{const d=day(sel);d.setDate(1);d.setMonth(d.getMonth()+dir);sel=iso(d);}resetForm();render();};
  el.querySelector("[data-prev]").onclick=()=>step(-1);
  el.querySelector("[data-next]").onclick=()=>step(1);
  el.querySelector("[data-today]").onclick=()=>{sel=iso(new Date());resetForm();render();};
  el.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{mode=b.dataset.mode;try{localStorage.setItem("kalender-ansicht",mode);}catch(e){}render();});
  el.querySelector("#calCats").addEventListener("click",e=>{
    const b=e.target.closest("[data-cat]");if(!b)return;const n=b.dataset.cat;
    if(hidden.has(n))hidden.delete(n);else hidden.add(n);
    try{localStorage.setItem("kalender-ausgeblendet",JSON.stringify([...hidden]));}catch(e){}
    render();
  });
  el.querySelector("#calMain").addEventListener("click",e=>{
    const ev=e.target.closest("[data-ev]");if(ev){pickEv(ev);return;}
    const slot=e.target.closest("[data-slot]");
    const d=e.target.closest("[data-d]");
    if(d){sel=d.dataset.d;resetForm();if(slot){el.querySelector("#calTime").value=slot.dataset.slot;el.querySelector("#calWhat").focus();}render();}
  });
  const pickList=e=>{const li=e.target.closest("[data-ev]");if(li){sel=li.dataset.date;pickEv(li);render();}};
  el.querySelector("#calList").addEventListener("click",pickList);
  el.querySelector("#calNext").addEventListener("click",pickList);
  el.querySelector("#calForm").addEventListener("submit",e=>{e.preventDefault();save();});
  el.querySelector("[data-cancel]").onclick=()=>{resetForm();render();};
  el.querySelector("[data-del]").onclick=e=>{
    const b=e.currentTarget;if(!b.dataset.armed){b.dataset.armed="1";b.textContent="Wirklich löschen?";return;}
    if(editing){editing.ev.deleted=true;editing.ev.mod=Date.now();Store.touchIndex(editing.nb);}
    resetForm();render();
  };
}
function pickEv(node){const [nbId,evId]=node.dataset.ev.split("|");const nb=Store.notebooks.find(n=>n.id===nbId);const ev=nb&&(nb.events||[]).find(x=>x.id===evId);if(ev){sel=ev.date;edit(nb,ev);}}
function resetForm(){
  editing=null;const f=el.querySelector("#calForm");const keepCat=el.querySelector("#calCat").value;f.reset();
  el.querySelector("#calCat").value=keepCat||CATS[0].name;
  el.querySelector("#calDate").value=sel;
  el.querySelector("#calSave").textContent="Termin speichern";
  const del=el.querySelector("[data-del]");del.hidden=true;delete del.dataset.armed;del.textContent="Löschen";
  el.querySelector("[data-cancel]").hidden=true;
  el.querySelector("#calNb").disabled=false;
}
function edit(nb,ev){
  editing={nb,ev};
  const v=(id,x)=>el.querySelector(id).value=x||"";
  v("#calWhat",ev.title);v("#calDate",ev.date);v("#calTime",ev.time);v("#calEnd",ev.end);v("#calWhere",ev.where);v("#calNote",ev.note);
  el.querySelector("#calCat").value=catOf(ev).name;
  el.querySelector("#calNb").value=nb.id;el.querySelector("#calNb").disabled=true;
  el.querySelector("#calSave").textContent="Änderung speichern";el.querySelector("[data-del]").hidden=false;el.querySelector("[data-cancel]").hidden=false;
}
function save(){
  const title=el.querySelector("#calWhat").value.trim();if(!title)return;
  const date=el.querySelector("#calDate").value||sel;
  const data={title,date,time:el.querySelector("#calTime").value,end:el.querySelector("#calEnd").value,cat:el.querySelector("#calCat").value,
    where:el.querySelector("#calWhere").value.trim(),note:el.querySelector("#calNote").value.trim(),mod:Date.now()};
  let nb;
  if(editing){nb=editing.nb;Object.assign(editing.ev,data);}
  else{
    nb=Store.notebooks.find(n=>n.id===el.querySelector("#calNb").value)||Store.notebooks[0];
    nb.events=nb.events||[];
    nb.events.push(Object.assign({id:Store.uid(),by:(window.OD&&OD.userName)||""},data));
  }
  Store.touchIndex(nb);
  if(hidden.has(data.cat)){hidden.delete(data.cat);try{localStorage.setItem("kalender-ausgeblendet",JSON.stringify([...hidden]));}catch(e){}}
  sel=date;resetForm();render();
}
const timeText=e=>e.time?(e.time+(e.end?"–"+e.end:"")):"ganztägig";
function chip(x,withTime){const e=x.e;return `<span class="cal-chip" data-ev="${x.nb.id}|${e.id}" style="--c:${color(e)}" title="${esc(e.title)}">${withTime&&e.time?esc(e.time)+" ":""}${esc(e.title)}</span>`;}
function line(x,showDate){
  const e=x.e;
  const d=showDate?day(e.date).toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"short"})+" · ":"";
  const note=e.note?`<span class="cal-note">${esc(e.note)}</span>`:"";
  return `<li data-ev="${x.nb.id}|${e.id}" data-date="${e.date}"><span class="cal-dot" style="background:${color(e)}"></span><span><b>${esc(e.title)}</b><br><span class="small">${d}${timeText(e)} · ${esc(catOf(e).name)}${e.where?" · "+esc(e.where):""}${e.by?" · eingetragen von "+esc(e.by):""}</span>${note}</span></li>`;
}
function monthView(byDay,today){
  const d0=day(sel);const m=d0.getMonth();const first=new Date(d0.getFullYear(),m,1,12);
  const start=addDays(iso(first),-((first.getDay()+6)%7));
  let h=`<div class="cal-grid">`+DAYS.map(d=>`<div class="cal-dow">${d}</div>`).join("");
  for(let i=0;i<42;i++){
    const k=addDays(start,i);const d=day(k);const list=byDay.get(k)||[];
    h+=`<div class="cal-day${d.getMonth()!==m?" out":""}${k===today?" today":""}${k===sel?" sel":""}" data-d="${k}"><span class="num">${d.getDate()}</span>${list.slice(0,3).map(x=>chip(x,true)).join("")}${list.length>3?`<span class="small">+${list.length-3} weitere</span>`:""}</div>`;
  }
  return h+"</div>";
}
function weekView(byDay,today){
  const start=monday(sel);let h=`<div class="cal-week">`;
  for(let i=0;i<7;i++){
    const k=addDays(start,i);const d=day(k);const list=byDay.get(k)||[];
    h+=`<div class="cal-wcol${k===today?" today":""}${k===sel?" sel":""}" data-d="${k}"><div class="cal-whead"><span>${DAYS[i]}</span><b>${d.getDate()}.</b></div>
      ${list.map(x=>`<div class="cal-wev" data-ev="${x.nb.id}|${x.e.id}" style="--c:${color(x.e)}"><span class="small">${timeText(x.e)}</span><br>${esc(x.e.title)}${x.e.where?`<br><span class="small">${esc(x.e.where)}</span>`:""}</div>`).join("")||`<span class="cal-empty">frei</span>`}</div>`;
  }
  return h+"</div>";
}
function dayView(byDay){
  const list=byDay.get(sel)||[];const allDay=list.filter(x=>!x.e.time);
  let h=`<div class="cal-dayview" data-d="${sel}"><div class="cal-hour"><span class="cal-hl">ganztägig</span><div>${allDay.map(x=>chip(x,false)).join("")}</div></div>`;
  const hours=new Set();for(let i=7;i<=21;i++)hours.add(i);list.forEach(x=>{if(x.e.time)hours.add(+x.e.time.slice(0,2));});
  [...hours].sort((a,b)=>a-b).forEach(hr=>{
    const evs=list.filter(x=>x.e.time&&+x.e.time.slice(0,2)===hr);
    h+=`<div class="cal-hour" data-slot="${pad(hr)}:00" data-d="${sel}"><span class="cal-hl">${pad(hr)}:00</span><div>${evs.map(x=>`<div class="cal-wev" data-ev="${x.nb.id}|${x.e.id}" style="--c:${color(x.e)}"><b>${esc(x.e.title)}</b> <span class="small">${timeText(x.e)}${x.e.where?" · "+esc(x.e.where):""}</span>${x.e.note?`<div class="cal-note">${esc(x.e.note)}</div>`:""}</div>`).join("")}</div></div>`;
  });
  return h+"</div>";
}
function render(){
  if(!el||el.hidden)return;
  const today=iso(new Date());const d=day(sel);
  el.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("on",b.dataset.mode===mode));
  el.querySelector("#calCats").innerHTML=CATS.map(c=>`<button class="cal-cat${hidden.has(c.name)?" off":""}" data-cat="${esc(c.name)}" style="--c:${c.farbe}" title="${hidden.has(c.name)?"Einblenden":"Ausblenden"}"><span class="cal-dot" style="background:${c.farbe}"></span>${esc(c.name)}</button>`).join("");
  let title;
  if(mode==="month")title=MONTHS[d.getMonth()]+" "+d.getFullYear();
  else if(mode==="week"){const a=day(monday(sel)),b=day(addDays(monday(sel),6));title="KW "+isoWeek(sel)+" · "+a.getDate()+"."+(a.getMonth()!==b.getMonth()?" "+MONTHS[a.getMonth()].slice(0,3)+".":"")+" – "+b.getDate()+". "+MONTHS[b.getMonth()].slice(0,3)+". "+b.getFullYear();}
  else title=d.toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  el.querySelector("#calTitle").textContent=title;
  const evs=allEvents();const byDay=new Map();
  evs.forEach(x=>{if(!byDay.has(x.e.date))byDay.set(x.e.date,[]);byDay.get(x.e.date).push(x);});
  el.querySelector("#calMain").innerHTML=mode==="month"?monthView(byDay,today):mode==="week"?weekView(byDay,today):dayView(byDay);
  el.querySelector("#calDay").textContent=d.toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long"});
  const dayList=byDay.get(sel)||[];
  el.querySelector("#calList").innerHTML=dayList.length?dayList.map(x=>line(x,false)).join(""):`<li class="small">Keine Termine an diesem Tag.</li>`;
  const next=evs.filter(x=>x.e.date>=today).slice(0,8);
  el.querySelector("#calNext").innerHTML=next.length?next.map(x=>line(x,true)).join(""):`<li class="small">Keine anstehenden Termine.</li>`;
  const s=el.querySelector("#calNb");const cur=s.value||Store.ui.nb;
  s.innerHTML=Store.notebooks.map(n=>`<option value="${n.id}">${esc(n.name)}${n.source==="onedrive"?(n.own?" (OneDrive)":" (geteilt)"):" (nur dieses Gerät)"}</option>`).join("");
  s.value=Store.notebooks.some(n=>n.id===cur)?cur:Store.notebooks[0].id;
  if(!editing)el.querySelector("#calDate").value=sel;
}
function toggle(show){
  if(!el)build();
  el.hidden=show===undefined?!el.hidden:!show;
  if(!el.hidden){resetForm();el.querySelector("#calNb").value=Store.ui.nb;render();}
  const b=document.getElementById("calendarBtn");if(b)b.classList.toggle("on",!el.hidden);
}
window.Kalender={toggle,render};
})();
