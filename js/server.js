/* Anbindung an den eigenen Familien-Server (server/server.js).
   Läuft die App auf dem Server, ersetzt dieses Modul die OneDrive-Anmeldung und den OneDrive-Abgleich.
   Intern heißen Notizbücher im Netz weiterhin source:"onedrive" (= „im Netz gespeichert“). */
(function(){
"use strict";
async function api(method,path,opt={}){
  const headers=Object.assign({"X-Notizbuch":"1"},opt.headers||{});
  let body=opt.body;
  if(opt.json!==undefined){body=JSON.stringify(opt.json);headers["Content-Type"]="application/json";}
  else if(body!==undefined)headers["Content-Type"]="application/json";
  const r=await fetch("api/"+path,{method,headers,body,credentials:"same-origin",cache:"no-store"});
  return r;
}
async function apiJson(method,path,opt){
  const r=await api(method,path,opt);
  let j=null;try{j=await r.json();}catch(e){}
  if(!r.ok){const e=new Error((j&&j.error)||("Fehler "+r.status));e.status=r.status;throw e;}
  return j;
}

/* ---------- Anmeldung (gleiche Schnittstelle wie OD in onedrive.js) ---------- */
const Auth={
  isServer:true, enabled:true, account:null, remoteName:"Familien-Server",
  get signedIn(){return !!this.account;},
  get userName(){return this.account?(this.account.display||this.account.name):"";},
  async init(){
    try{this.account=await apiJson("GET","me");this.account.username=this.account.name;}
    catch(e){this.account=null;}
  },
  login(){showLogin();},
  async logout(){try{await api("POST","logout");}catch(e){}location.reload();},
  api,apiJson
};

function showLogin(){
  if(document.getElementById("loginScreen"))return;
  const cfg=window.NOTIZBUCH_CONFIG||{};
  const d=document.createElement("div");d.id="loginScreen";d.className="login-bg";
  d.innerHTML=`<form class="login" autocomplete="on">
      <div class="famhead login-head"><div class="eyebrow">Notizbuch &amp; Kalender</div><h1>${(cfg.titel||"Familienorganisation").replace(/[<>&]/g,"")}</h1></div>
      <label>Benutzername<input name="username" id="lgName" autocomplete="username" autocapitalize="none" required></label>
      <label>Passwort<input name="password" id="lgPw" type="password" autocomplete="current-password" required></label>
      <p class="login-err" id="lgErr" hidden></p>
      <button class="btn pri" type="submit">Anmelden</button>
      <p class="small">Zugangsdaten bekommst du vom Admin der Familie.</p>
    </form>`;
  document.body.appendChild(d);
  const f=d.querySelector("form");d.querySelector("#lgName").focus();
  f.addEventListener("submit",async e=>{
    e.preventDefault();const err=d.querySelector("#lgErr");err.hidden=true;
    try{
      await apiJson("POST","login",{json:{name:d.querySelector("#lgName").value,password:d.querySelector("#lgPw").value}});
      location.reload();
    }catch(ex){err.textContent=ex.message;err.hidden=false;}
  });
}

/* ---------- Abgleich (gleiche Schnittstelle wie Sync in onedrive.js) ---------- */
const S={
  running:false,timer:null,state:"idle",lastOk:0,lastError:"",listeners:[],again:false,
  set(state,msg){this.state=state;if(msg!==undefined)this.lastError=msg;this.listeners.forEach(f=>f());},
  schedule(delay){if(!Auth.signedIn)return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.run(),delay==null?1500:delay);},
  start(){
    if(!Auth.signedIn)return;this.run();
    setInterval(()=>{if(!document.hidden)this.run();},15000);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)this.schedule(200);});
    window.addEventListener("online",()=>this.schedule(200));
  },
  async run(){
    if(this.running){this.again=true;return;}
    if(!navigator.onLine){this.set("offline","");return;}
    this.running=true;this.set("busy");
    try{
      await this.discoverOwn(true);
      for(const nb of Store.notebooks.filter(n=>n.source==="onedrive"&&!n.broken)){await this.pull(nb);await this.push(nb);}
      this.lastOk=Date.now();this.set("ok","");
    }catch(e){
      console.error(e);
      if(e.status===401){Auth.account=null;this.set("err","Bitte neu anmelden");showLogin();}
      else this.set("err","Server nicht erreichbar, neuer Versuch folgt");
    }finally{this.running=false;if(this.again){this.again=false;this.schedule(500);}}
  },
  async pull(nb){
    const d=nb.drive;
    const r=await api("GET",`notebooks/${nb.id}/index`,{headers:d.indexEtag?{"If-None-Match":d.indexEtag}:{}});
    if(r.status===404){if(d.indexEtag){nb.broken="Auf dem Server gelöscht";Store.saveNotebooks();Store.refresh();}return;}
    if(r.status===401)throw Object.assign(new Error("401"),{status:401});
    if(r.status===200){
      const remote=await r.json();const ver=nb.indexVer;
      const localNewer=Store.mergeIndex(nb,remote);
      d.indexEtag=r.headers.get("ETag");
      if(localNewer)nb.indexDirty=true;else if(nb.indexVer===ver)nb.indexDirty=false;
      Store.saveNotebooks();Store.refresh();
    }else if(r.status!==304)throw Object.assign(new Error("index "+r.status),{status:r.status});
    const files=await apiJson("GET",`notebooks/${nb.id}/pages`);
    for(const f of files){
      const entry=nb.pages.find(p=>p.id===f.id);if(entry&&entry.deleted)continue;
      let rec=Store.pages.get(f.id);
      if(rec&&rec.etag===f.etag)continue;
      if(rec&&rec.dirty){rec.remoteChanged=true;continue;}
      const content=await apiJson("GET",`notebooks/${nb.id}/pages/${f.id}`);
      Store.pages.set(f.id,{content,etag:f.etag,fileId:f.id,dirty:false,nb:nb.id,ver:0});Store.savePage(f.id);Store.pageArrived(f.id);
    }
  },
  async push(nb){
    const d=nb.drive;
    for(const [pid,rec] of [...Store.pages.entries()]){
      if(rec.nb!==nb.id||!rec.dirty)continue;
      const entry=nb.pages.find(p=>p.id===pid);if(!entry||entry.deleted)continue;
      const ver=rec.ver;
      const r=rec.remoteChanged?{status:412}:await api("PUT",`notebooks/${nb.id}/pages/${pid}`,{body:JSON.stringify(rec.content),headers:rec.etag?{"If-Match":rec.etag}:{"If-None-Match":"*"}});
      if(r.status===412){await this.conflict(nb,pid,rec);continue;}
      if(!r.ok)throw Object.assign(new Error("PUT page "+r.status),{status:r.status});
      rec.etag=r.headers.get("ETag");rec.fileId=pid;rec.remoteChanged=false;if(rec.ver===ver)rec.dirty=false;Store.savePage(pid);
    }
    if(nb.indexDirty){
      const ver=nb.indexVer;
      const r=await api("PUT",`notebooks/${nb.id}/index`,{body:JSON.stringify(Store.indexOf(nb)),headers:d.indexEtag?{"If-Match":d.indexEtag}:{"If-None-Match":"*"}});
      if(r.status===412){d.indexEtag=null;this.again=true;}
      else if(!r.ok)throw Object.assign(new Error("PUT index "+r.status),{status:r.status});
      else{d.indexEtag=r.headers.get("ETag");if(nb.indexVer===ver)nb.indexDirty=false;Store.saveNotebooks();}
    }
    if(!nb.indexDirty){
      for(const p of nb.pages.filter(p=>p.deleted)){
        const rec=Store.pages.get(p.id);
        if(rec&&rec.fileId){await api("DELETE",`notebooks/${nb.id}/pages/${p.id}`).catch(()=>{});}
        if(rec){Store.pages.delete(p.id);DB.del("page:"+p.id);}
      }
    }
  },
  async conflict(nb,pid,rec){
    const entry=nb.pages.find(p=>p.id===pid);const copyId=Store.uid();
    const t=new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
    nb.pages.push(Object.assign({},entry,{id:copyId,title:(entry.title||"Ohne Titel")+" (meine Fassung "+t+")",pos:entry.pos+0.001,mod:Date.now(),created:Date.now()}));
    Store.pages.set(copyId,{content:JSON.parse(JSON.stringify(rec.content)),etag:null,fileId:null,dirty:true,nb:nb.id,ver:1});Store.savePage(copyId);
    const r=await api("GET",`notebooks/${nb.id}/pages/${pid}`);
    if(r.ok){rec.content=await r.json();rec.etag=r.headers.get("ETag");rec.fileId=pid;rec.dirty=false;}
    else{rec.etag=null;rec.fileId=null;rec.dirty=true;}
    rec.remoteChanged=false;rec.ver++;
    Store.savePage(pid);Store.touchIndex(nb);Store.refresh();Store.pageArrived(pid);
    Store.toast("Jemand hat „"+(entry.title||"Ohne Titel")+"“ gleichzeitig geändert. Deine Fassung liegt als Kopie daneben.");
    this.again=true;
  },
  async createNotebook(nb){
    nb.source="onedrive";nb.own=true;nb.drive={server:true,indexEtag:null};
    nb.indexDirty=true;nb.indexVer=(nb.indexVer||0)+1;
    for(const [pid,rec] of Store.pages)if(rec.nb===nb.id){rec.dirty=true;rec.fileId=null;rec.etag=null;rec.ver++;Store.savePage(pid);}
    Store.saveNotebooks();await this.push(nb);
  },
  async discoverOwn(quiet){
    const list=await apiJson("GET","notebooks");let added=0;
    for(const x of list){
      if(Store.notebooks.some(n=>n.id===x.id))continue;
      const nb={id:x.id,name:x.name,nameMod:0,sections:[],pages:[],events:[],members:[],source:"onedrive",own:true,drive:{server:true,indexEtag:null},indexDirty:false,indexVer:0};
      Store.notebooks.push(nb);added++;
      if(!quiet)await this.pull(nb);
    }
    if(added){Store.saveNotebooks();Store.refresh();}
    return added;
  }
};

/* Erkennen, ob die App auf dem Familien-Server läuft */
window.ServerMode={
  async detect(){
    if(location.protocol==="file:")return false;
    try{
      const r=await fetch("api/status",{cache:"no-store",credentials:"same-origin"});
      if(!r.ok)return false;const j=await r.json();return !!j.server;
    }catch(e){return false;}
  },
  Auth,Sync:S,showLogin
};
})();
