/* Notizbuch: Oberfläche und lokale Daten. */
(async function(){
"use strict";
const SEC_COLORS=["#e8a33d","#4f9d69","#4a7fc1","#c45a7a","#8a6cc4","#3aa3a8","#c4704a","#7a8a3d"];
const INK=["#1b2628","#1d5fbf","#c62828","#2e7d32","#8e44ad","#ef6c00"];
const MARK=["#ffe14d","#7ee08a","#7cc8ff","#ff9ec7","#ffb36b","#c9a4ff"];
const $=s=>document.querySelector(s);
const uid=()=>Date.now().toString(36).slice(-4)+Math.random().toString(36).slice(2,10);
const now=()=>Date.now();
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));

/* ---------- Daten ---------- */
const Store={notebooks:[],pages:new Map(),ui:{},uid};
window.Store=Store;
const timers=new Map();
Store.saveNotebooks=()=>{clearTimeout(timers.get("nb"));timers.set("nb",setTimeout(()=>DB.set("notebooks",Store.notebooks).catch(storageFail),300));};
Store.savePage=pid=>{clearTimeout(timers.get(pid));timers.set(pid,setTimeout(()=>{const r=Store.pages.get(pid);if(r)DB.set("page:"+pid,r).catch(storageFail);},400));};
Store.saveUi=()=>DB.set("ui",Store.ui).catch(()=>{});
let warned=false;function storageFail(){if(!warned){warned=true;toast("Speichern auf diesem Gerät fehlgeschlagen. Bitte eine Sicherung erstellen.");}}
function flushAll(){
  for(const [k,t] of timers){clearTimeout(t);}
  timers.clear();
  DB.set("notebooks",Store.notebooks).catch(()=>{});
  for(const [pid,r] of Store.pages)if(r.dirty)DB.set("page:"+pid,r).catch(()=>{});
}
window.addEventListener("pagehide",flushAll);
document.addEventListener("visibilitychange",()=>{if(document.hidden)flushAll();});

Store.indexOf=nb=>({format:1,id:nb.id,name:nb.name,nameMod:nb.nameMod||0,sections:nb.sections,pages:nb.pages});
Store.mergeIndex=(nb,remote)=>{
  let localNewer=false;
  if((remote.nameMod||0)>(nb.nameMod||0)){nb.name=remote.name;nb.nameMod=remote.nameMod;}
  else if((nb.nameMod||0)>(remote.nameMod||0))localNewer=true;
  for(const kind of ["sections","pages"]){
    const L=new Map((nb[kind]||[]).map(x=>[x.id,x])),R=new Map((remote[kind]||[]).map(x=>[x.id,x]));
    const out=[];
    for(const id of new Set([...L.keys(),...R.keys()])){
      const l=L.get(id),r=R.get(id);
      if(!l)out.push(r);
      else if(!r){out.push(l);localNewer=true;}
      else if((r.mod||0)>(l.mod||0))out.push(r);
      else{out.push(l);if((l.mod||0)>(r.mod||0))localNewer=true;}
    }
    nb[kind]=out;
  }
  return localNewer;
};
Store.touchIndex=nb=>{
  nb.indexVer=(nb.indexVer||0)+1;
  if(nb.source==="onedrive"){nb.indexDirty=true;Sync.schedule();}
  Store.saveNotebooks();
};
function touchPage(){
  const p=page();if(!p)return;const r=Store.pages.get(p.id);if(!r)return;
  r.ver=(r.ver||0)+1;r.content.mod=now();
  const n=nb();if(n.source==="onedrive"){r.dirty=true;Sync.schedule(2500);}
  Store.savePage(p.id);
}
Store.toast=t=>toast(t);
Store.refresh=()=>{renderNav();const p=page();if(!p||p.id!==shownPage)renderPage();updateStatus();};
let pendingRender=false;
Store.pageArrived=pid=>{
  const p=page();if(!p||p.id!==pid)return;
  if(sheet.contains(document.activeElement)||cur){pendingRender=true;return;}
  renderPage();
};

function newNotebook(name,source){return {id:uid(),name,nameMod:now(),sections:[],pages:[],source:source||"local",indexVer:0};}
function addSection(n,name){
  const vis=sections(n);const s={id:uid(),name,color:SEC_COLORS[vis.length%SEC_COLORS.length],pos:(vis.length?vis[vis.length-1].pos:0)+1,mod:now()};
  n.sections.push(s);return s;
}
function addPage(n,secId,title,content){
  const vis=pagesOf(n,secId);
  const p={id:uid(),sec:secId,title:title||"",level:0,pos:(vis.length?vis[vis.length-1].pos:0)+1,created:now(),mod:now()};
  n.pages.push(p);
  Store.pages.set(p.id,{content:content||{bg:"lined",boxes:[],images:[],strokes:[],mod:now()},etag:null,fileId:null,dirty:n.source==="onedrive",nb:n.id,ver:1});
  Store.savePage(p.id);return p;
}
const sections=n=>n.sections.filter(s=>!s.deleted).sort((a,b)=>a.pos-b.pos);
const pagesOf=(n,secId)=>n.pages.filter(p=>p.sec===secId&&!p.deleted).sort((a,b)=>a.pos-b.pos);

function sampleNotebook(){
  const n=newNotebook("Mein Notizbuch");
  const s1=addSection(n,"Allgemein");const s2=addSection(n,"Ideen");
  addPage(n,s1.id,"Willkommen (Beispielseite)",{bg:"lined",mod:now(),
    boxes:[
      {id:uid(),x:40,y:32,w:560,html:"<h2>So funktioniert dein Notizbuch</h2><div>Tippe irgendwo auf das Blatt, um einen Textkasten anzulegen. Den Kasten verschiebst du am grauen Balken oben.</div><ul class=\"todo\"><li data-done=\"\">Erste Seite angelegt</li><li>Mit dem Stift etwas zeichnen</li><li>Ein Bild einfügen</li></ul><div>Melde dich unten links mit Microsoft an, um Notizbücher in OneDrive zu speichern und mit anderen zu teilen.</div>"},
      {id:uid(),x:680,y:96,w:300,html:"<div><b>Tipp:</b> Mit dem Apple Pencil zeichnest du, mit dem Finger blätterst du.</div>"}],
    images:[],
    strokes:[{tool:"pen",color:"#c62828",size:3,points:[[690,260,.5],[720,250,.5],[760,246,.5],[800,252,.5],[835,268,.5],[858,290,.5],[845,282,.5],[858,290,.5],[852,275,.5]]}]});
  addPage(n,s2.id,"Erste Idee");
  return n;
}
function fromV1(state){
  // Übernahme aus dem ersten Prototyp (alles in einem Objekt)
  return (state.notebooks||[]).map(o=>{
    const n=newNotebook(o.name);
    (o.sections||[]).forEach((s,i)=>{
      const sec={id:s.id||uid(),name:s.name,color:s.color,pos:i+1,mod:now()};n.sections.push(sec);
      (s.pages||[]).forEach(p=>{
        const e=addPage(n,sec.id,p.title,{bg:p.bg||"lined",boxes:p.boxes||[],images:p.images||[],strokes:p.strokes||[],mod:now()});
        e.level=p.level||0;if(p.created)e.created=p.created;
      });
    });
    return n;
  });
}

await DB.open();
Store.notebooks=(await DB.get("notebooks"))||[];
for(const [k,v] of await DB.all("page:"))Store.pages.set(k.slice(5),v);
Store.ui=(await DB.get("ui"))||{};
if(!Store.notebooks.length){
  let v1=null;try{v1=JSON.parse(localStorage.getItem("notizbuch-v1")||"null");}catch(e){}
  Store.notebooks=v1&&v1.notebooks?fromV1(v1):[sampleNotebook()];
  Store.saveNotebooks();
}

const nb=()=>{let n=Store.notebooks.find(x=>x.id===Store.ui.nb);if(!n){n=Store.notebooks[0];Store.ui.nb=n&&n.id;}return n;};
const sec=()=>{const n=nb();if(!n)return null;const v=sections(n);return v.find(s=>s.id===Store.ui.sec)||v[0]||null;};
const page=()=>{const n=nb(),s=sec();if(!n||!s)return null;const v=pagesOf(n,s.id);return v.find(p=>p.id===Store.ui.page)||v[0]||null;};
const pc=()=>{const p=page();const r=p&&Store.pages.get(p.id);return r?r.content:null;};
function go(nbId,secId,pageId){Store.ui={nb:nbId,sec:secId,page:pageId};Store.saveUi();}

/* ---------- Seitenleiste ---------- */
function renderNav(){
  const n=nb();
  const sel=$("#nbsel");
  const group=(label,list)=>list.length?`<optgroup label="${label}">${list.map(x=>`<option value="${x.id}"${n&&x.id===n.id?" selected":""}>${esc(x.name)}${x.broken?" (nicht erreichbar)":""}</option>`).join("")}</optgroup>`:"";
  const L=Store.notebooks;
  sel.innerHTML=group("Auf diesem Gerät",L.filter(x=>x.source!=="onedrive"))+group("In meinem OneDrive",L.filter(x=>x.source==="onedrive"&&x.own))+group("Für mich freigegeben",L.filter(x=>x.source==="onedrive"&&!x.own))
    +`<optgroup label="Hinzufügen"><option value="__new">+ Neues Notizbuch</option>${OD.signedIn?`<option value="__shared">+ Freigegebenes Notizbuch öffnen</option>`:""}</optgroup>`;
  if(!n){$("#secs").innerHTML="";$("#pages").innerHTML="";return;}
  const s=sec();Store.ui.sec=s&&s.id;
  $("#secs").innerHTML=sections(n).map(x=>`<li class="item${s&&x.id===s.id?" on":""}" data-sec="${x.id}"><span class="dot" style="background:${x.color}"></span><span class="name">${esc(x.name)}</span><button class="iconbtn more" data-secmore="${x.id}" aria-label="Abschnitt-Menü">⋯</button></li>`).join("")
    ||`<li class="hint">Noch kein Abschnitt.</li>`;
  const p=page();Store.ui.page=p&&p.id;
  $("#pages").innerHTML=s?(pagesOf(n,s.id).map(x=>`<li class="item${x.level?" sub":""}${p&&x.id===p.id?" on":""}" data-page="${x.id}"><span class="name">${esc(x.title||"Ohne Titel")}<br><span class="date">${fmtDate(x.created)}</span></span><button class="iconbtn more" data-pagemore="${x.id}" aria-label="Seiten-Menü">⋯</button></li>`).join("")||`<li class="hint">Noch keine Seite.</li>`):"";
  updateStatus();
}
function fmtDate(t){try{return new Date(t).toLocaleDateString("de-DE",{day:"numeric",month:"short",year:"numeric"});}catch(e){return "";}}

$("#nbsel").addEventListener("change",e=>{
  const v=e.target.value;
  if(v==="__new"){renderNav();newNotebookDialog();return;}
  if(v==="__shared"){renderNav();sharedDialog();return;}
  go(v,null,null);renderAll();
});
$("#secs").addEventListener("click",e=>{
  const m=e.target.closest("[data-secmore]");if(m){secMenu(m.dataset.secmore,m);return;}
  const li=e.target.closest("[data-sec]");if(!li||e.target.tagName==="INPUT")return;
  go(nb().id,li.dataset.sec,null);renderAll();
});
$("#pages").addEventListener("click",e=>{
  const m=e.target.closest("[data-pagemore]");if(m){pageMenu(m.dataset.pagemore,m);return;}
  const li=e.target.closest("[data-page]");if(!li)return;
  go(nb().id,sec().id,li.dataset.page);renderAll();closeSide();
});
$("#addSec").onclick=()=>{
  const n=nb();if(!n)return;const s=addSection(n,"Neuer Abschnitt");addPage(n,s.id,"");
  Store.touchIndex(n);go(n.id,s.id,null);renderAll();
  inlineRename(document.querySelector(`[data-sec="${s.id}"]`),s.name,v=>{s.name=v;s.mod=now();Store.touchIndex(n);});
};
$("#addPage").onclick=()=>{
  const n=nb(),s=sec();if(!s)return;const p=addPage(n,s.id,"");Store.touchIndex(n);
  go(n.id,s.id,p.id);renderAll();closeSide();$("#ptitle").focus();
};

function inlineRename(li,val,commit){
  if(!li)return;const name=li.querySelector(".name");const inp=document.createElement("input");inp.value=val;
  name.replaceWith(inp);inp.focus();inp.select();
  let done=false;const fin=ok=>{if(done)return;done=true;if(ok&&inp.value.trim())commit(inp.value.trim());renderNav();};
  inp.addEventListener("keydown",e=>{if(e.key==="Enter")fin(true);if(e.key==="Escape")fin(false);});
  inp.addEventListener("blur",()=>fin(true));
}

/* Menüs */
let popEl=null;
function closePop(){if(popEl){popEl.remove();popEl=null;}}
document.addEventListener("pointerdown",e=>{if(popEl&&!popEl.contains(e.target))closePop();},true);
function pop(anchor,items){
  closePop();const el=document.createElement("div");el.className="pop";
  items.filter(Boolean).forEach(it=>{
    if(it.colors){const c=document.createElement("div");c.className="colors";SEC_COLORS.forEach(col=>{const sp=document.createElement("span");sp.style.background=col;sp.onclick=()=>{it.colors(col);closePop();};c.appendChild(sp);});el.appendChild(c);return;}
    const b=document.createElement("button");b.textContent=it.label;if(it.danger)b.className="danger";
    b.onclick=()=>{if(it.confirm&&!b.dataset.armed){b.dataset.armed="1";b.textContent=it.confirm;return;}closePop();it.run();};
    el.appendChild(b);});
  document.body.appendChild(el);popEl=el;
  const r=anchor.getBoundingClientRect();const w=el.offsetWidth,h=el.offsetHeight;
  el.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+"px";
  el.style.top=(r.bottom+h+8>innerHeight?Math.max(8,r.top-h-4):r.bottom+4)+"px";
}
function swapPos(a,b){const t=a.pos;a.pos=b.pos;b.pos=t;a.mod=b.mod=now();}
$("#nbmore").onclick=e=>{
  const n=nb();if(!n)return;
  const od=n.source==="onedrive";
  pop(e.currentTarget,[
    {label:"Notizbuch umbenennen",run:()=>textDialog("Notizbuch umbenennen",n.name,v=>{n.name=v;n.nameMod=now();Store.touchIndex(n);renderNav();})},
    od&&{label:"Teilen…",run:()=>shareDialog(n)},
    od&&n.drive.webUrl&&{label:"In OneDrive öffnen",run:()=>window.open(n.drive.webUrl,"_blank","noopener")},
    !od&&OD.signedIn&&{label:"In OneDrive speichern",run:async()=>{
      try{toast("Wird nach OneDrive übertragen…");await Sync.createNotebook(n);renderNav();toast("Liegt jetzt in OneDrive");}
      catch(err){console.error(err);toast("Übertragen fehlgeschlagen: "+(err.status||err.message));}}},
    od?{label:"Aus dieser App entfernen",danger:true,confirm:"Bleibt in OneDrive. Nochmal tippen",run:()=>removeNotebook(n)}
      :{label:"Notizbuch löschen",danger:true,confirm:"Wirklich löschen? Nochmal tippen",run:()=>removeNotebook(n)}
  ]);
};
function removeNotebook(n){
  if(Store.notebooks.length===1&&n.source!=="onedrive"){toast("Das letzte Notizbuch kann nicht gelöscht werden.");return;}
  Store.notebooks=Store.notebooks.filter(x=>x!==n);
  for(const [pid,r] of [...Store.pages])if(r.nb===n.id){Store.pages.delete(pid);DB.del("page:"+pid);}
  if(!Store.notebooks.length)Store.notebooks.push(sampleNotebook());
  Store.saveNotebooks();go(Store.notebooks[0].id,null,null);renderAll();
}
function secMenu(id,anchor){
  const n=nb();const v=sections(n);const s=v.find(x=>x.id===id);const i=v.indexOf(s);
  pop(anchor,[
    {label:"Umbenennen",run:()=>inlineRename(document.querySelector(`[data-sec="${id}"]`),s.name,val=>{s.name=val;s.mod=now();Store.touchIndex(n);})},
    {colors:col=>{s.color=col;s.mod=now();Store.touchIndex(n);renderNav();}},
    i>0&&{label:"Nach oben",run:()=>{swapPos(s,v[i-1]);Store.touchIndex(n);renderNav();}},
    i<v.length-1&&{label:"Nach unten",run:()=>{swapPos(s,v[i+1]);Store.touchIndex(n);renderNav();}},
    {label:"Abschnitt löschen",danger:true,confirm:`${pagesOf(n,id).length} Seite(n) löschen? Nochmal tippen`,run:()=>{
      s.deleted=true;s.mod=now();pagesOf(n,id).forEach(p=>{p.deleted=true;p.mod=now();});Store.touchIndex(n);renderAll();}}
  ]);
}
function pageMenu(id,anchor){
  const n=nb(),s=sec();const v=pagesOf(n,s.id);const p=v.find(x=>x.id===id);const i=v.indexOf(p);
  const others=sections(n).filter(x=>x.id!==s.id);
  pop(anchor,[
    {label:p.level?"Keine Unterseite mehr":"Zur Unterseite machen",run:()=>{p.level=p.level?0:1;p.mod=now();Store.touchIndex(n);renderNav();}},
    i>0&&{label:"Nach oben",run:()=>{swapPos(p,v[i-1]);Store.touchIndex(n);renderNav();}},
    i<v.length-1&&{label:"Nach unten",run:()=>{swapPos(p,v[i+1]);Store.touchIndex(n);renderNav();}},
    ...others.map(o=>({label:"Verschieben nach „"+o.name+"“",run:()=>{const t=pagesOf(n,o.id);p.sec=o.id;p.pos=(t.length?t[t.length-1].pos:0)+1;p.mod=now();Store.touchIndex(n);renderAll();}})),
    {label:"Seite löschen",danger:true,confirm:"Wirklich löschen? Nochmal tippen",run:()=>{
      p.deleted=true;p.mod=now();if(n.source!=="onedrive"){Store.pages.delete(id);DB.del("page:"+id);}Store.touchIndex(n);renderAll();}}
  ]);
}

/* Handy-Schublade */
function closeSide(){$("#app").classList.remove("open");}
$("#openSide").onclick=()=>$("#app").classList.add("open");
$("#closeSide").onclick=closeSide;

/* ---------- Konto und Status ---------- */
function renderAccount(){
  const a=$("#account");
  if(!OD.enabled){a.innerHTML=`<span class="who">${(window.NOTIZBUCH_CONFIG||{}).clientId?"Anmeldung nur über https möglich":"OneDrive noch nicht eingerichtet"}</span>`;return;}
  if(!OD.signedIn){a.innerHTML=`<button class="btn pri" id="loginBtn">Mit Microsoft anmelden</button>`;$("#loginBtn").onclick=()=>OD.login();return;}
  a.innerHTML=`<span class="who" title="${esc(OD.account.username)}">${esc(OD.userName)}</span><button class="btn" id="logoutBtn">Abmelden</button>`;
  $("#logoutBtn").onclick=()=>{flushAll();OD.logout();};
}
function updateStatus(){
  const n=nb();const el=$("#status"),t=$("#statusTxt");if(!el)return;
  el.className="status";
  if(!n||n.source!=="onedrive"){t.textContent="Nur auf diesem Gerät gespeichert";return;}
  if(n.broken){el.classList.add("err");t.textContent=n.broken;return;}
  if(!OD.signedIn){el.classList.add("err");t.textContent="Zum Abgleichen anmelden";return;}
  const st=Sync.state;
  if(st==="offline"){el.classList.add("busy");t.textContent="Offline, Änderungen werden später hochgeladen";return;}
  if(st==="err"){el.classList.add("err");t.textContent=Sync.lastError;return;}
  if(st==="busy"){el.classList.add("busy");t.textContent="Wird abgeglichen…";return;}
  const dirty=n.indexDirty||[...Store.pages.values()].some(r=>r.nb===n.id&&r.dirty);
  if(dirty){el.classList.add("busy");t.textContent="Änderungen warten aufs Hochladen";return;}
  el.classList.add("ok");t.textContent="In OneDrive gespeichert"+(n.own?"":(n.owner?" (von "+n.owner+")":" (freigegeben)"));
}
Sync.listeners.push(updateStatus);

/* ---------- Suche ---------- */
function plain(html){const d=document.createElement("div");d.innerHTML=html;return d.textContent||"";}
$("#search").addEventListener("input",e=>{
  const q=e.target.value.trim().toLowerCase();
  $("#navArea").hidden=!!q;$("#resultsArea").hidden=!q;if(!q)return;
  const out=[];
  Store.notebooks.forEach(n=>sections(n).forEach(s=>pagesOf(n,s.id).forEach(p=>{
    const r=Store.pages.get(p.id);
    const body=r?r.content.boxes.map(b=>b.text||plain(b.html)).join(" "):"";const hay=(p.title+" "+body);const at=hay.toLowerCase().indexOf(q);
    if(at>=0){const st=Math.max(0,at-30);out.push({n,s,p,snip:(st?"…":"")+hay.slice(st,at+q.length+50)});}
  })));
  $("#results").innerHTML=out.length?out.slice(0,200).map(r=>`<li class="item" data-go="${r.n.id}|${r.s.id}|${r.p.id}"><span class="name">${esc(r.p.title||"Ohne Titel")}</span><span class="snip">${esc(r.n.name)} › ${esc(r.s.name)} · ${esc(r.snip)}</span></li>`).join(""):`<li class="hint">Nichts gefunden.</li>`;
});
$("#results").addEventListener("click",e=>{
  const li=e.target.closest("[data-go]");if(!li)return;const [a,b,c]=li.dataset.go.split("|");
  go(a,b,c);$("#search").value="";$("#navArea").hidden=false;$("#resultsArea").hidden=true;renderAll();closeSide();
});

/* ---------- Seite ---------- */
const sheet=$("#sheet"),canvas=$("#ink"),ctx=canvas.getContext("2d"),wrap=$("#wrap");
const SHEET_W=1400;let sheetH=0,dpr=1,shownPage=null;
function renderPage(){
  pendingRender=false;
  const p=page(),c=pc();shownPage=p&&p.id;
  sheet.querySelectorAll(".box,.img,.loading").forEach(e=>e.remove());
  $("#ptitle").disabled=!p;
  if(!p){$("#ptitle").value="";$("#pmeta").textContent="Lege links eine Seite an.";sizeSheet(true);redraw();return;}
  $("#ptitle").value=p.title;
  $("#pmeta").textContent=new Date(p.created).toLocaleString("de-DE",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});
  if(!c){
    sheet.className="sheet";const l=document.createElement("div");l.className="loading";l.textContent="Seite wird aus OneDrive geladen…";sheet.appendChild(l);
    sizeSheet(true);redraw();Sync.schedule(100);return;
  }
  sheet.className="sheet"+(c.bg==="grid"?" grid":c.bg==="plain"?" plain":"")+(tool!=="text"?" drawing":"");
  c.images.forEach(addImgEl);c.boxes.forEach(addBoxEl);
  sizeSheet(true);redraw();
}
sheet.addEventListener("focusout",()=>setTimeout(()=>{if(pendingRender&&!sheet.contains(document.activeElement)&&!cur)renderPage();},300));
function contentBottom(){
  const c=pc();if(!c)return 0;let m=0;
  c.boxes.forEach(b=>{const el=sheet.querySelector(`[data-box="${b.id}"]`);m=Math.max(m,b.y+(el?el.offsetHeight:40));});
  c.images.forEach(i=>{const el=sheet.querySelector(`[data-img="${i.id}"]`);m=Math.max(m,i.y+(el?el.offsetHeight:i.w));});
  c.strokes.forEach(s=>s.points.forEach(pt=>{if(pt[1]>m)m=pt[1];}));
  return m;
}
function sizeSheet(force){
  const h=Math.max(1600,Math.ceil((contentBottom()+900)/400)*400);
  if(h===sheetH&&!force)return;
  const changed=h!==sheetH;sheetH=h;sheet.style.height=h+"px";
  if(changed||!canvas.width){
    dpr=Math.min(window.devicePixelRatio||1,2,Math.sqrt(14e6/(SHEET_W*h)));
    canvas.width=Math.floor(SHEET_W*dpr);canvas.height=Math.floor(h*dpr);canvas.style.width=SHEET_W+"px";canvas.style.height=h+"px";
  }
  redraw();
}
$("#ptitle").addEventListener("input",e=>{const p=page();if(!p)return;p.title=e.target.value;p.mod=now();Store.touchIndex(nb());renderNav();});

/* Textkästen */
function addBoxEl(b){
  const el=document.createElement("div");el.className="box";el.dataset.box=b.id;
  el.style.left=b.x+"px";el.style.top=b.y+"px";el.style.width=b.w+"px";
  el.innerHTML=`<div class="grip" title="Verschieben"></div><div class="content" contenteditable="true" spellcheck="true"></div><div class="wgrip" title="Breite ändern"></div>`;
  const c=el.querySelector(".content");c.innerHTML=b.html;
  c.addEventListener("input",()=>{b.html=c.innerHTML;b.text=c.textContent;touchPage();});
  c.addEventListener("blur",()=>{setTimeout(()=>{if(!c.textContent.trim()&&!c.querySelector("img,li")&&document.activeElement!==c){const pcc=pc();if(pcc){pcc.boxes=pcc.boxes.filter(x=>x.id!==b.id);touchPage();}el.remove();}},150);});
  c.addEventListener("pointerdown",e=>{const li=e.target.closest("ul.todo > li");if(li){const r=li.getBoundingClientRect();if(e.clientX<r.left){e.preventDefault();li.toggleAttribute("data-done");b.html=c.innerHTML;touchPage();}}});
  drag(el.querySelector(".grip"),(dx,dy,st)=>{b.x=Math.max(0,st.x+dx);b.y=Math.max(0,st.y+dy);el.style.left=b.x+"px";el.style.top=b.y+"px";},()=>({x:b.x,y:b.y}));
  drag(el.querySelector(".wgrip"),(dx,dy,st)=>{b.w=Math.max(120,st.w+dx);el.style.width=b.w+"px";},()=>({w:b.w}));
  sheet.appendChild(el);return el;
}
function drag(handle,move,start){
  handle.addEventListener("pointerdown",e=>{
    if(e.target!==handle&&e.target.closest(".rz,.del"))return;
    e.preventDefault();e.stopPropagation();const st=start();const x0=e.clientX,y0=e.clientY;handle.setPointerCapture(e.pointerId);
    let moved=false;
    const mv=ev=>{moved=true;move(ev.clientX-x0,ev.clientY-y0,st);};
    const up=()=>{handle.removeEventListener("pointermove",mv);handle.removeEventListener("pointerup",up);handle.removeEventListener("pointercancel",up);if(moved){touchPage();sizeSheet();}};
    handle.addEventListener("pointermove",mv);handle.addEventListener("pointerup",up);handle.addEventListener("pointercancel",up);
  });
}
sheet.addEventListener("click",e=>{
  if(tool!=="text"||e.target!==sheet)return;
  sheet.querySelectorAll(".img.sel").forEach(x=>x.classList.remove("sel"));
  const c=pc();if(!c)return;
  const r=sheet.getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top;
  const b={id:uid(),x:Math.max(0,x-8),y:Math.max(0,Math.floor((y-4)/32)*32),w:Math.min(480,SHEET_W-x),html:"",text:""};
  c.boxes.push(b);const el=addBoxEl(b);el.querySelector(".content").focus();
});

/* Formatieren */
let lastBox=null;
document.addEventListener("selectionchange",()=>{const s=getSelection();if(s.rangeCount){const n=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement);const c=n&&n.closest&&n.closest(".content");if(c)lastBox=c;}});
document.querySelectorAll(".fmt").forEach(btn=>{
  btn.addEventListener("pointerdown",e=>e.preventDefault());
  btn.addEventListener("click",()=>{
    if(!lastBox||!document.contains(lastBox)){toast("Tippe zuerst in einen Textkasten.");return;}
    lastBox.focus();const cmd=btn.dataset.cmd;
    if(cmd==="h2"){const blk=document.queryCommandValue("formatBlock");document.execCommand("formatBlock",false,/h2/i.test(blk)?"div":"h2");}
    else if(cmd==="ul"||cmd==="todo"){
      const ul=curList();
      if(ul&&cmd==="todo"&&!ul.classList.contains("todo"))ul.classList.add("todo");
      else if(ul&&cmd==="ul"&&ul.classList.contains("todo"))ul.classList.remove("todo");
      else{document.execCommand("insertUnorderedList");const n=curList();if(n&&cmd==="todo")n.classList.add("todo");}
    } else document.execCommand(cmd);
    lastBox.dispatchEvent(new Event("input"));
  });
});
function curList(){const s=getSelection();if(!s.rangeCount)return null;let n=s.anchorNode;n=n&&(n.nodeType===1?n:n.parentElement);return n&&n.closest("ul");}

/* Bilder */
$("#imgBtn").onclick=()=>$("#imgFile").click();
$("#imgFile").addEventListener("change",e=>{const f=e.target.files[0];if(f)insertImage(f);e.target.value="";});
document.addEventListener("paste",e=>{const it=[...((e.clipboardData||{}).items||[])].find(i=>i.type.startsWith("image/"));if(it){e.preventDefault();insertImage(it.getAsFile());}});
function insertImage(file){
  const c=pc();if(!c){toast("Lege zuerst eine Seite an.");return;}
  const fr=new FileReader();fr.onload=()=>{const im=new Image();im.onload=()=>{
    const max=1400,sc=Math.min(1,max/Math.max(im.width,im.height));const cv=document.createElement("canvas");cv.width=Math.round(im.width*sc);cv.height=Math.round(im.height*sc);
    cv.getContext("2d").drawImage(im,0,0,cv.width,cv.height);const src=cv.toDataURL("image/jpeg",.82);
    const w=Math.min(480,cv.width);const y=Math.max(20,wrap.scrollTop-sheet.offsetTop+60);
    const i={id:uid(),x:Math.max(20,wrap.scrollLeft+40),y,w,src};c.images.push(i);addImgEl(i).classList.add("sel");touchPage();sizeSheet();
  };im.src=fr.result;};fr.readAsDataURL(file);
}
function addImgEl(i){
  const el=document.createElement("div");el.className="img";el.dataset.img=i.id;el.style.left=i.x+"px";el.style.top=i.y+"px";el.style.width=i.w+"px";
  el.innerHTML=`<img alt="" src="${i.src}"><div class="rz"></div><button class="del" aria-label="Bild löschen">×</button>`;
  el.addEventListener("pointerdown",e=>{if(e.target.closest(".rz,.del"))return;sheet.querySelectorAll(".img.sel").forEach(x=>x!==el&&x.classList.remove("sel"));el.classList.add("sel");});
  drag(el,(dx,dy,st)=>{i.x=Math.max(0,st.x+dx);i.y=Math.max(0,st.y+dy);el.style.left=i.x+"px";el.style.top=i.y+"px";},()=>({x:i.x,y:i.y}));
  drag(el.querySelector(".rz"),(dx,dy,st)=>{i.w=Math.max(60,st.w+dx);el.style.width=i.w+"px";},()=>({w:i.w}));
  el.querySelector(".del").onclick=()=>{const c=pc();if(c){c.images=c.images.filter(x=>x.id!==i.id);touchPage();}el.remove();};
  sheet.appendChild(el);return el;
}

/* ---------- Stift ---------- */
let tool="text",penColor=INK[0],markColor=MARK[0],penSize=3,penSeen=false;
document.querySelectorAll("[data-tool]").forEach(b=>b.addEventListener("click",()=>setTool(b.dataset.tool)));
function setTool(t){
  tool=t;document.querySelectorAll("[data-tool]").forEach(b=>b.classList.toggle("on",b.dataset.tool===t));
  sheet.classList.toggle("drawing",t!=="text");if(t!=="text"&&document.activeElement&&document.activeElement.blur)document.activeElement.blur();renderSwatches();
}
function renderSwatches(){
  const list=tool==="marker"?MARK:INK;const c=tool==="marker"?markColor:penColor;
  $("#swatches").innerHTML=list.map(x=>`<button class="sw${x===c?" on":""}" data-c="${x}" style="background:${x}" aria-label="Farbe ${x}"></button>`).join("");
}
$("#swatches").addEventListener("pointerdown",e=>e.preventDefault());
$("#swatches").addEventListener("click",e=>{
  const b=e.target.closest("[data-c]");if(!b)return;
  if(tool==="text"&&lastBox&&document.contains(lastBox)){lastBox.focus();document.execCommand("foreColor",false,b.dataset.c);lastBox.dispatchEvent(new Event("input"));return;}
  if(tool==="marker")markColor=b.dataset.c;else{penColor=b.dataset.c;if(tool==="eraser")setTool("pen");}
  renderSwatches();
});
$("#size").addEventListener("input",e=>penSize=+e.target.value);

function strokeWidth(s,p){return s.tool==="marker"?s.size*5:s.size*(s.pressured?(.35+p*1.3):1);}
function drawSeg(s,a,b){
  ctx.globalAlpha=s.tool==="marker"?.38:1;ctx.globalCompositeOperation=s.tool==="marker"?"multiply":"source-over";
  ctx.strokeStyle=s.color;ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=strokeWidth(s,b[2]);
  ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
}
function drawStroke(s){
  const pts=s.points;if(!pts.length)return;
  if(pts.length===1){drawSeg(s,pts[0],[pts[0][0]+.1,pts[0][1],pts[0][2]]);return;}
  if(s.tool==="marker"){ctx.globalAlpha=.38;ctx.globalCompositeOperation="multiply";ctx.strokeStyle=s.color;ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=s.size*5;
    ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.stroke();return;}
  for(let i=1;i<pts.length;i++)drawSeg(s,pts[i-1],pts[i]);
}
function redraw(){
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(dpr,0,0,dpr,0,0);
  const c=pc();if(!c)return;
  c.strokes.filter(s=>s.tool==="marker").forEach(drawStroke);
  c.strokes.filter(s=>s.tool!=="marker").forEach(drawStroke);
  ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
}
let cur=null,panning=null,undoStack=[];
function pos(e){const r=canvas.getBoundingClientRect();return [Math.round((e.clientX-r.left)*10)/10,Math.round((e.clientY-r.top)*10)/10,e.pressure||.5];}
canvas.addEventListener("pointerdown",e=>{
  if(tool==="text")return;
  if(e.pointerType==="pen")penSeen=true;
  if(e.pointerType==="touch"&&penSeen){panning={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);return;}
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  if(!pc())return;
  if(tool==="eraser"){cur={erase:true};eraseAt(pos(e));return;}
  cur={tool,color:tool==="marker"?markColor:penColor,size:penSize,pressured:e.pointerType==="pen"&&tool!=="marker",points:[pos(e)]};
});
canvas.addEventListener("pointermove",e=>{
  if(panning&&e.pointerId===panning.id){wrap.scrollBy(panning.x-e.clientX,panning.y-e.clientY);panning.x=e.clientX;panning.y=e.clientY;return;}
  if(!cur)return;
  const evs=e.getCoalescedEvents?e.getCoalescedEvents():[e];
  for(const ev of evs){
    const pt=pos(ev);
    if(cur.erase){eraseAt(pt);continue;}
    const last=cur.points[cur.points.length-1];if(Math.hypot(pt[0]-last[0],pt[1]-last[1])<1)continue;
    cur.points.push(pt);
    if(cur.tool!=="marker")drawSeg(cur,last,pt);
  }
  if(cur&&cur.tool==="marker"){redraw();drawStroke(cur);ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";}
});
function endStroke(){
  panning=null;if(!cur)return;
  const c=pc();const was=cur;cur=null;
  if(!was.erase&&c){c.strokes.push(was);undoStack.push({type:"add",stroke:was});}
  touchPage();redraw();sizeSheet();
  if(pendingRender)renderPage();
}
canvas.addEventListener("pointerup",endStroke);canvas.addEventListener("pointercancel",endStroke);
function eraseAt(pt){
  const c=pc();const r=Math.max(10,penSize*3);
  const keep=[],gone=[];
  c.strokes.forEach(s=>{(s.points.some(q=>Math.hypot(q[0]-pt[0],q[1]-pt[1])<r+strokeWidth(s,q[2])/2)?gone:keep).push(s);});
  if(gone.length){c.strokes=keep;undoStack.push({type:"erase",strokes:gone});redraw();}
}
$("#undoBtn").onclick=undo;
function undo(){
  const c=pc();const u=undoStack.pop();if(!u||!c)return;
  if(u.type==="add")c.strokes=c.strokes.filter(s=>s!==u.stroke);else c.strokes.push(...u.strokes);
  touchPage();redraw();
}
document.addEventListener("keydown",e=>{
  const a=document.activeElement;
  if((e.ctrlKey||e.metaKey)&&e.key==="z"&&!e.shiftKey&&!(a&&a.isContentEditable)&&!(a&&/INPUT|TEXTAREA/.test(a.tagName))){e.preventDefault();undo();}
});
$("#bgBtn").onclick=()=>{const c=pc();if(!c)return;c.bg=c.bg==="lined"?"grid":c.bg==="grid"?"plain":"lined";touchPage();renderPage();toast({lined:"Liniertes Papier",grid:"Kariertes Papier",plain:"Leeres Papier"}[c.bg]);};

/* ---------- Dialoge ---------- */
function modal(html){
  const bg=document.createElement("div");bg.className="modal-bg";bg.innerHTML=`<div class="modal" role="dialog">${html}</div>`;
  bg.addEventListener("click",e=>{if(e.target===bg)bg.remove();});
  bg.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>bg.remove());
  document.body.appendChild(bg);return bg;
}
function textDialog(title,value,ok){
  const m=modal(`<h3>${esc(title)}</h3><label>Name<input type="text" id="dlgName" value="${esc(value)}"></label><div class="row"><button class="btn" data-x>Abbrechen</button><button class="btn pri" data-ok>Speichern</button></div>`);
  const inp=m.querySelector("input");inp.focus();inp.select();
  const go_=()=>{if(inp.value.trim()){ok(inp.value.trim());m.remove();}};
  m.querySelector("[data-ok]").onclick=go_;inp.addEventListener("keydown",e=>{if(e.key==="Enter")go_();});
}
function newNotebookDialog(){
  const can=OD.signedIn;
  const m=modal(`<h3>Neues Notizbuch</h3>
    <label>Name<input type="text" id="nbName" value="Neues Notizbuch"></label>
    <label class="choice"><input type="radio" name="where" value="onedrive" ${can?"checked":"disabled"}> In OneDrive (auf allen Geräten, teilbar)</label>
    <label class="choice"><input type="radio" name="where" value="local" ${can?"":"checked"}> Nur auf diesem Gerät</label>
    ${can?"":`<p class="small">Für OneDrive musst du dich zuerst unten links mit Microsoft anmelden.</p>`}
    <div class="row"><button class="btn" data-x>Abbrechen</button><button class="btn pri" data-ok>Anlegen</button></div>`);
  const inp=m.querySelector("#nbName");inp.focus();inp.select();
  m.querySelector("[data-ok]").onclick=async()=>{
    const name=inp.value.trim()||"Neues Notizbuch";const where=m.querySelector("input[name=where]:checked").value;
    const n=newNotebook(name);const s=addSection(n,"Allgemein");addPage(n,s.id,"");
    Store.notebooks.push(n);Store.saveNotebooks();go(n.id,null,null);m.remove();renderAll();
    if(where==="onedrive"){
      try{toast("Wird in OneDrive angelegt…");await Sync.createNotebook(n);renderNav();toast("Notizbuch in OneDrive angelegt");}
      catch(err){console.error(err);toast("OneDrive nicht erreichbar. Das Notizbuch liegt vorerst nur auf diesem Gerät.");}
    }
  };
}
async function sharedDialog(){
  const m=modal(`<h3>Freigegebenes Notizbuch öffnen</h3>
    <p>Notizbücher, die andere mit dir geteilt haben:</p><ul id="shList"><li class="small">Wird geladen…</li></ul>
    <label>Oder Freigabe-Link einfügen<input type="url" id="shLink" placeholder="https://1drv.ms/…"></label>
    <div class="row"><button class="btn" data-x>Schließen</button><button class="btn pri" data-link>Link öffnen</button></div>`);
  const open=async ref=>{
    try{const r=await Sync.attach(ref,false);
      if(r===true){const n=Store.notebooks[Store.notebooks.length-1];go(n.id,null,null);m.remove();renderAll();toast("Notizbuch geöffnet");}
      else if(r==="exists")toast("Dieses Notizbuch ist schon in deiner Liste.");
      else toast("In diesem Ordner liegt kein Notizbuch.");
    }catch(err){console.error(err);toast("Öffnen fehlgeschlagen ("+(err.status||err.message)+")");}
  };
  m.querySelector("[data-link]").onclick=async()=>{
    const v=m.querySelector("#shLink").value.trim();if(!v)return;
    try{open(await Sync.resolveLink(v));}catch(err){console.error(err);toast("Mit diesem Link komme ich nicht an den Ordner ("+(err.status||"Fehler")+").");}
  };
  try{
    const list=await Sync.listShared();
    const ul=m.querySelector("#shList");
    ul.innerHTML=list.length?list.map((x,i)=>`<li><button data-i="${i}">${esc(x.name)}${x.owner?` <span class="small">von ${esc(x.owner)}</span>`:""}</button></li>`).join(""):`<li class="small">Keine freigegebenen Ordner gefunden. Nutze den Link aus der Einladungs-E-Mail.</li>`;
    ul.onclick=e=>{const b=e.target.closest("[data-i]");if(b)open(list[+b.dataset.i]);};
  }catch(err){console.error(err);m.querySelector("#shList").innerHTML=`<li class="small">Liste nicht abrufbar. Nutze den Link aus der Einladungs-E-Mail.</li>`;}
}
function shareDialog(n){
  const m=modal(`<h3>„${esc(n.name)}“ teilen</h3>
    <p>Die eingeladene Person bekommt eine E-Mail von Microsoft und kann das Notizbuch in dieser App unter „Freigegebenes Notizbuch öffnen“ hinzufügen und mitbearbeiten.</p>
    <label>E-Mail-Adresse (Microsoft-Konto)<input type="email" id="shMail" placeholder="name@outlook.de"></label>
    <div class="row"><button class="btn" data-copy>Link kopieren</button><button class="btn" data-x>Schließen</button><button class="btn pri" data-inv>Einladen</button></div>`);
  m.querySelector("[data-inv]").onclick=async()=>{
    const v=m.querySelector("#shMail").value.trim();if(!/.+@.+\..+/.test(v)){toast("Bitte eine gültige E-Mail-Adresse eingeben.");return;}
    try{await Sync.invite(n,v);toast("Einladung an "+v+" verschickt");m.remove();}
    catch(err){console.error(err);toast("Einladen fehlgeschlagen ("+(err.status||err.message)+")");}
  };
  m.querySelector("[data-copy]").onclick=async()=>{
    try{const url=await Sync.shareLink(n);await navigator.clipboard.writeText(url).then(()=>toast("Link kopiert"),()=>{m.querySelector("#shMail").value=url;toast("Link steht im Feld, bitte kopieren");});}
    catch(err){console.error(err);toast("Link erstellen fehlgeschlagen ("+(err.status||err.message)+")");}
  };
}

/* ---------- Sicherung ---------- */
$("#exportBtn").onclick=()=>{
  flushAll();
  const data=JSON.stringify({format:2,exported:new Date().toISOString(),notebooks:Store.notebooks.map(n=>({
    name:n.name,sections:sections(n),pages:n.pages.filter(p=>!p.deleted).map(p=>Object.assign({},p,{content:(Store.pages.get(p.id)||{}).content||null}))}))});
  const m=modal(`<h3>Sicherung erstellen</h3><p>Die Datei enthält alle Notizbücher. Größe: ${(data.length/1024).toFixed(0)} KB.</p><textarea readonly></textarea><div class="row"><button class="btn" data-x>Schließen</button><button class="btn" data-copy>Kopieren</button><button class="btn pri" data-dl>Als Datei speichern</button></div>`);
  const ta=m.querySelector("textarea");ta.value=data;
  m.querySelector("[data-copy]").onclick=()=>{navigator.clipboard.writeText(data).then(()=>toast("Kopiert")).catch(()=>{ta.focus();ta.select();toast("Bitte markierten Text kopieren");});};
  m.querySelector("[data-dl]").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type:"application/json"}));a.download="notizbuch-sicherung-"+new Date().toISOString().slice(0,10)+".json";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);};
};
$("#importBtn").onclick=()=>{
  const m=modal(`<h3>Sicherung laden</h3><p>Füge den Text einer Sicherung ein oder wähle eine Datei. Die Notizbücher daraus kommen zusätzlich auf dieses Gerät.</p><textarea placeholder="Sicherung hier einfügen"></textarea><div class="row"><button class="btn" data-file>Datei wählen</button><button class="btn" data-x>Abbrechen</button><button class="btn pri" data-load>Laden</button></div>`);
  const ta=m.querySelector("textarea");
  m.querySelector("[data-file]").onclick=()=>{const f=$("#jsonFile");f.onchange=()=>{const file=f.files[0];if(!file)return;file.text().then(t=>{ta.value=t;});f.value="";};f.click();};
  m.querySelector("[data-load]").onclick=()=>{
    try{
      const s=JSON.parse(ta.value);let list;
      if(s.format===2){
        list=s.notebooks.map(o=>{const n=newNotebook(o.name);const map={};
          o.sections.forEach(x=>{const ns=Object.assign({},x,{id:uid(),mod:now()});map[x.id]=ns.id;n.sections.push(ns);});
          o.pages.forEach(p=>{const e=addPage(n,map[p.sec],p.title,p.content||undefined);e.level=p.level||0;e.pos=p.pos;e.created=p.created||now();});
          return n;});
      }else if(s.notebooks)list=fromV1(s);
      else throw 0;
      Store.notebooks.push(...list);Store.saveNotebooks();go(list[0].id,null,null);renderAll();m.remove();toast(list.length+" Notizbuch/-bücher geladen");
    }catch(e){toast("Das ist keine gültige Sicherung.");}
  };
};

/* ---------- Start ---------- */
let toastT;function toast(t){document.querySelectorAll(".toast").forEach(x=>x.remove());const d=document.createElement("div");d.className="toast";d.textContent=t;document.body.appendChild(d);clearTimeout(toastT);toastT=setTimeout(()=>d.remove(),3200);}
function renderAll(){closePop();undoStack=[];renderNav();renderPage();Store.saveUi();}
renderSwatches();renderAll();

await OD.init();
renderAccount();renderNav();
if(OD.signedIn){
  Sync.start();
  Sync.discoverOwn().then(k=>{if(k){renderNav();toast(k+" Notizbuch/-bücher aus OneDrive geladen");}}).catch(e=>console.warn("discover",e));
}
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
