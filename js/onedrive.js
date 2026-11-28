/* Anmeldung mit Microsoft und Abgleich der Notizbücher mit OneDrive (Microsoft Graph).
   Aufbau in OneDrive:
     Notizbuch/<Name>/notebook.json   Abschnitte und Seitenliste
     Notizbuch/<Name>/pages/<id>.json Inhalt je Seite (eine Datei pro Seite gegen Konflikte)
*/
(function(){
"use strict";
const SCOPES=["User.Read","Files.ReadWrite.All"];
const GRAPH="https://graph.microsoft.com/v1.0";
const ROOT_FOLDER="Notizbuch";

const OD={
  enabled:false, msal:null, account:null, error:null,

  async init(){
    if(window.NOTIZBUCH_TEST){ // nur für automatische Tests
      this.enabled=true;this.account={name:window.NOTIZBUCH_TEST.name,username:window.NOTIZBUCH_TEST.name};const tk=window.NOTIZBUCH_TEST.name;this.token=async()=>tk;return;
    }
    const cfg=window.NOTIZBUCH_CONFIG||{};
    if(!cfg.clientId||!window.msal)return;
    if(location.protocol!=="https:"&&location.hostname!=="localhost")return;
    try{
      this.msal=new msal.PublicClientApplication({
        auth:{clientId:cfg.clientId,authority:"https://login.microsoftonline.com/"+(cfg.authority||"common"),redirectUri:location.origin+location.pathname},
        cache:{cacheLocation:"localStorage"}
      });
      await this.msal.initialize();
      const r=await this.msal.handleRedirectPromise();
      this.account=(r&&r.account)||this.msal.getAllAccounts()[0]||null;
      this.enabled=true;
    }catch(e){this.error=e;console.error(e);}
  },
  get signedIn(){return !!this.account;},
  get userName(){return this.account?(this.account.name||this.account.username):"";},
  login(){return this.msal.loginRedirect({scopes:SCOPES,prompt:"select_account"});},
  logout(){return this.msal.logoutRedirect({account:this.account});},

  async token(){
    try{return (await this.msal.acquireTokenSilent({scopes:SCOPES,account:this.account})).accessToken;}
    catch(e){
      if(e instanceof msal.InteractionRequiredAuthError){await this.msal.acquireTokenRedirect({scopes:SCOPES,account:this.account});}
      throw e;
    }
  },
  async req(method,path,opt={}){
    const t=await this.token();
    const headers=Object.assign({Authorization:"Bearer "+t},opt.headers||{});
    let body=opt.body;
    if(opt.json!==undefined){body=JSON.stringify(opt.json);headers["Content-Type"]="application/json";}
    return fetch(path.startsWith("http")?path:GRAPH+path,{method,headers,body,cache:"no-store"});
  },
  async json(method,path,opt){
    const r=await this.req(method,path,opt);
    if(!r.ok){const err=new Error(method+" "+path+" → "+r.status);err.status=r.status;try{err.body=await r.json();}catch(_){ }throw err;}
    return r.status===204?null:r.json();
  },
  async download(item){
    // Inhalt über die vorab freigegebene Download-Adresse holen (ohne Anmelde-Header, vermeidet CORS-Probleme).
    let url=item["@microsoft.graph.downloadUrl"];
    if(!url){const full=await this.json("GET",`/drives/${item.parentReference.driveId}/items/${item.id}`);url=full["@microsoft.graph.downloadUrl"];}
    const r=await fetch(url,{cache:"no-store"});
    if(!r.ok)throw new Error("Download "+r.status);
    return r.json();
  },
  async children(driveId,itemId){
    let url=`/drives/${driveId}/items/${itemId}/children?$top=999`;const out=[];
    while(url){const j=await this.json("GET",url);out.push(...j.value);url=j["@odata.nextLink"];}
    return out;
  },
  async childByName(driveId,itemId,name){
    const r=await this.req("GET",`/drives/${driveId}/items/${itemId}:/${encodeURIComponent(name)}`);
    if(r.status===404)return null;
    if(!r.ok)throw Object.assign(new Error("GET child "+r.status),{status:r.status});
    return r.json();
  },
  async mkdir(driveId,parentId,name,behavior){
    return this.json("POST",`/drives/${driveId}/items/${parentId}/children`,{json:{name,folder:{},"@microsoft.graph.conflictBehavior":behavior||"rename"}});
  },
  async rootFolder(){
    const drive=await this.json("GET","/me/drive");
    const root=await this.json("GET","/me/drive/root");
    let f=await this.childByName(drive.id,root.id,ROOT_FOLDER);
    if(!f){
      try{f=await this.mkdir(drive.id,root.id,ROOT_FOLDER,"fail");}
      catch(e){if(e.status===409)f=await this.childByName(drive.id,root.id,ROOT_FOLDER);else throw e;}
    }
    if(!f.parentReference||!f.parentReference.driveId)f.parentReference={driveId:drive.id};
    return f;
  }
};
window.OD=OD;

/* ---------- Abgleich ---------- */
const Sync={
  running:false, timer:null, state:"idle", lastOk:0, lastError:"",
  listeners:[],
  set(state,msg){this.state=state;if(msg!==undefined)this.lastError=msg;this.listeners.forEach(f=>f());},

  schedule(delay){
    if(!OD.signedIn)return;
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>this.run(),delay==null?1500:delay);
  },
  start(){
    if(!OD.signedIn)return;
    this.run();
    setInterval(()=>{if(!document.hidden)this.run();},20000);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)this.schedule(200);});
    window.addEventListener("online",()=>this.schedule(200));
  },
  async run(){
    if(this.running){this.again=true;return;}
    if(!OD.signedIn)return;
    if(!navigator.onLine){this.set("offline","");return;}
    this.running=true;this.set("busy");
    try{
      for(const nb of Store.notebooks.filter(n=>n.source==="onedrive"&&!n.broken)){
        try{
          await this.pull(nb);
          try{const wrote=await this.push(nb);if(nb.readOnly&&wrote){nb.readOnly=false;Store.saveNotebooks();}}
          catch(e){if(e.status===403)this.readOnly(nb);else throw e;}
        }
        catch(e){
          if(e.status===404||e.status===403){nb.broken=e.status===404?"Nicht mehr in OneDrive gefunden":"Kein Zugriff mehr";Store.saveNotebooks();Store.refresh();}
          else throw e;
        }
      }
      this.lastOk=Date.now();this.set("ok","");
    }catch(e){
      console.error(e);
      this.set("err",e.status===401?"Bitte erneut anmelden":"Abgleich fehlgeschlagen, neuer Versuch folgt");
    }finally{
      this.running=false;
      if(this.again){this.again=false;this.schedule(500);}
    }
  },

  async pull(nb){
    const d=nb.drive;
    const idx=await OD.childByName(d.driveId,d.itemId,"notebook.json");
    if(!idx)throw Object.assign(new Error("notebook.json fehlt"),{status:404});
    if(idx.eTag!==d.indexEtag){
      const remote=await OD.download(idx);
      const ver=nb.indexVer;
      let localNewer;
      if(nb.resetIndex){ // nur Leserecht: lokale Änderungen am Inhaltsverzeichnis/Kalender verwerfen
        for(const kind of ["sections","pages","events","members"])nb[kind]=remote[kind]||[];
        nb.name=remote.name||nb.name;nb.nameMod=remote.nameMod||0;nb.resetIndex=false;localNewer=false;
      }else localNewer=Store.mergeIndex(nb,remote);
      d.indexEtag=idx.eTag;d.indexId=idx.id;
      if(localNewer)nb.indexDirty=true;else if(nb.indexVer===ver)nb.indexDirty=false;
      Store.saveNotebooks();Store.refresh();
    }
    if(!d.pagesId){
      let pf=await OD.childByName(d.driveId,d.itemId,"pages");
      if(!pf)pf=await OD.mkdir(d.driveId,d.itemId,"pages","fail").catch(async e=>{if(e.status===409)return OD.childByName(d.driveId,d.itemId,"pages");throw e;});
      d.pagesId=pf.id;Store.saveNotebooks();
    }
    const files=await OD.children(d.driveId,d.pagesId);
    for(const f of files){
      const m=/^(.+)\.json$/.exec(f.name);if(!m||!f.file)continue;
      const pid=m[1];
      const entry=nb.pages.find(p=>p.id===pid);
      if(entry&&entry.deleted)continue;
      let rec=Store.pages.get(pid);
      if(rec&&rec.etag===f.eTag)continue;
      if(rec&&rec.dirty){rec.remoteChanged=true;continue;}
      const content=await OD.download(f);
      rec={content,etag:f.eTag,fileId:f.id,dirty:false,nb:nb.id,ver:0};
      Store.pages.set(pid,rec);Store.savePage(pid);Store.pageArrived(pid);
    }
  },

  async push(nb){
    const d=nb.drive;let wrote=0;
    // 1. Seiteninhalte
    for(const [pid,rec] of [...Store.pages.entries()]){
      if(rec.nb!==nb.id||!rec.dirty)continue;
      const entry=nb.pages.find(p=>p.id===pid);
      if(!entry||entry.deleted)continue;
      const ver=rec.ver;
      let r;
      if(rec.remoteChanged)r={status:412};
      else if(rec.fileId)r=await OD.req("PUT",`/drives/${d.driveId}/items/${rec.fileId}/content`,{body:JSON.stringify(rec.content),headers:{"Content-Type":"application/json","If-Match":rec.etag}});
      else r=await OD.req("PUT",`/drives/${d.driveId}/items/${d.pagesId}:/${pid}.json:/content?@microsoft.graph.conflictBehavior=fail`,{body:JSON.stringify(rec.content),headers:{"Content-Type":"application/json"}});
      if(r.status===412||r.status===409){await this.conflict(nb,pid,rec);continue;}
      if(r.status===404&&rec.fileId){rec.fileId=null;rec.etag=null;continue;}
      if(!r.ok)throw Object.assign(new Error("PUT page "+r.status),{status:r.status});
      const j=await r.json();
      rec.etag=j.eTag;rec.fileId=j.id;rec.remoteChanged=false;wrote++;
      if(rec.ver===ver)rec.dirty=false;
      Store.savePage(pid);
    }
    // 2. Inhaltsverzeichnis
    if(nb.indexDirty){
      const ver=nb.indexVer;
      const body=JSON.stringify(Store.indexOf(nb));
      let r;
      if(d.indexId)r=await OD.req("PUT",`/drives/${d.driveId}/items/${d.indexId}/content`,{body,headers:{"Content-Type":"application/json","If-Match":d.indexEtag||"*"}});
      else r=await OD.req("PUT",`/drives/${d.driveId}/items/${d.itemId}:/notebook.json:/content`,{body,headers:{"Content-Type":"application/json"}});
      if(r.status===412){d.indexEtag=null;this.again=true;}
      else if(!r.ok)throw Object.assign(new Error("PUT index "+r.status),{status:r.status});
      else{const j=await r.json();d.indexEtag=j.eTag;d.indexId=j.id;wrote++;if(nb.indexVer===ver)nb.indexDirty=false;Store.saveNotebooks();}
    }
    // 3. Gelöschte Seiten aus OneDrive entfernen (landen dort im Papierkorb)
    if(!nb.indexDirty){
      for(const p of nb.pages.filter(p=>p.deleted)){
        const rec=Store.pages.get(p.id);
        if(rec&&rec.fileId){await OD.req("DELETE",`/drives/${d.driveId}/items/${rec.fileId}`).catch(()=>{});}
        if(rec){Store.pages.delete(p.id);DB.del("page:"+p.id);}
      }
    }
    return wrote;
  },

  readOnly(nb){
    // Nur Leserecht auf den freigegebenen Ordner: eigene Änderungen verwerfen und die Fassung aus OneDrive wieder laden.
    const was=nb.readOnly;nb.readOnly=true;
    let lost=false;
    for(const [pid,rec] of Store.pages){
      if(rec.nb!==nb.id||!rec.dirty)continue;
      lost=true;
      if(rec.fileId){rec.dirty=false;rec.etag=null;rec.remoteChanged=false;Store.savePage(pid);}
      else{Store.pages.delete(pid);DB.del("page:"+pid);}
    }
    if(nb.indexDirty){lost=true;nb.indexDirty=false;nb.drive.indexEtag=null;nb.resetIndex=true;}
    Store.saveNotebooks();Store.refresh();
    if(lost||!was)Store.toast("„"+nb.name+"“ darfst du nur ansehen. Änderungen werden nicht gespeichert.");
    if(lost)this.again=true;
  },

  async conflict(nb,pid,rec){
    // Jemand anderes hat die Seite inzwischen geändert: deren Fassung übernehmen, eigene als Kopie behalten.
    const d=nb.drive;
    const f=await OD.childByName(d.driveId,d.pagesId,pid+".json");
    const copyId=Store.uid();
    const entry=nb.pages.find(p=>p.id===pid);
    const t=new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
    nb.pages.push(Object.assign({},entry,{id:copyId,title:(entry.title||"Ohne Titel")+" (meine Fassung "+t+")",pos:entry.pos+0.001,mod:Date.now(),created:Date.now()}));
    Store.pages.set(copyId,{content:JSON.parse(JSON.stringify(rec.content)),etag:null,fileId:null,dirty:true,nb:nb.id,ver:1});
    Store.savePage(copyId);
    if(f){const remote=await OD.download(f);rec.content=remote;rec.etag=f.eTag;rec.fileId=f.id;}
    else{rec.fileId=null;rec.etag=null;}
    rec.dirty=!f;rec.remoteChanged=false;rec.ver++;
    Store.savePage(pid);Store.touchIndex(nb);Store.refresh();Store.pageArrived(pid);
    Store.toast("Jemand hat „"+(entry.title||"Ohne Titel")+"“ gleichzeitig geändert. Deine Fassung liegt als Kopie daneben.");
    this.again=true;
  },

  /* Notizbücher anlegen, finden, teilen */
  async createNotebook(nb){
    const root=await OD.rootFolder();
    const driveId=root.parentReference.driveId;
    const safe=(nb.name||"Notizbuch").replace(/[\\/:*?"<>|#%]/g,"-").slice(0,80);
    const folder=await OD.mkdir(driveId,root.id,safe,"rename");
    const pages=await OD.mkdir(driveId,folder.id,"pages","fail");
    nb.source="onedrive";nb.own=true;
    nb.drive={driveId,itemId:folder.id,pagesId:pages.id,indexEtag:null,indexId:null,webUrl:folder.webUrl};
    nb.indexDirty=true;nb.indexVer=(nb.indexVer||0)+1;
    for(const [pid,rec] of Store.pages)if(rec.nb===nb.id){rec.dirty=true;rec.fileId=null;rec.etag=null;rec.ver++;Store.savePage(pid);}
    Store.saveNotebooks();
    await this.push(nb);
  },
  async discoverOwn(){
    const root=await OD.rootFolder();const driveId=root.parentReference.driveId;
    const kids=await OD.children(driveId,root.id);
    let added=0;
    for(const k of kids.filter(k=>k.folder)){
      if(Store.notebooks.some(n=>n.drive&&n.drive.itemId===k.id))continue;
      const ok=await this.attach({driveId,itemId:k.id,name:k.name},true).catch(()=>false);
      if(ok)added++;
    }
    return added;
  },
  async listShared(){
    // Quellen: 1. von dir schon geöffnete Freigaben (freigaben.json in deinem OneDrive),
    // 2. Verknüpfungen, die du in OneDrive über „Zu ‚Meine Dateien‘ hinzufügen“ angelegt hast,
    // 3. die Liste „Für mich freigegeben“ (Microsoft stellt sie gerade ein, liefert oft nichts mehr).
    const out=[];const seen=new Set();
    const add=x=>{if(!x.driveId||!x.itemId||seen.has(x.driveId+"|"+x.itemId))return;seen.add(x.driveId+"|"+x.itemId);out.push(x);};
    const fromRemote=i=>({name:i.remoteItem.name||i.name,driveId:i.remoteItem.parentReference&&i.remoteItem.parentReference.driveId,itemId:i.remoteItem.id,
      owner:(i.remoteItem.shared&&i.remoteItem.shared.owner&&i.remoteItem.shared.owner.user&&i.remoteItem.shared.owner.user.displayName)||""});
    try{(await this.loadShares()).items.forEach(add);}catch(e){console.warn("freigaben.json",e);}
    try{
      let url="/me/drive/root/children?$top=999";
      while(url){const j=await OD.json("GET",url);j.value.filter(i=>i.remoteItem&&i.remoteItem.folder).forEach(i=>add(fromRemote(i)));url=j["@odata.nextLink"];}
    }catch(e){console.warn("Verknüpfungen",e);}
    try{
      let url="/me/drive/sharedWithMe?allowexternal=true&$top=200";let guard=0;
      while(url&&guard++<20){const j=await OD.json("GET",url);(j.value||[]).filter(i=>i.remoteItem&&i.remoteItem.folder).forEach(i=>add(fromRemote(i)));url=j["@odata.nextLink"];}
    }catch(e){console.warn("sharedWithMe",e);}
    return out;
  },
  /* Liste der geöffneten Freigaben in deinem eigenen OneDrive, damit deine anderen Geräte sie automatisch finden. */
  async loadShares(){
    const root=await OD.rootFolder();const driveId=root.parentReference.driveId;
    const f=await OD.childByName(driveId,root.id,"freigaben.json");
    let data={format:1,items:[]};
    if(f){try{const d=await OD.download(f);if(d&&Array.isArray(d.items))data=d;}catch(e){console.warn(e);}}
    return Object.assign(data,{_driveId:driveId,_rootId:root.id,_file:f});
  },
  async editShares(fn){
    for(let attempt=0;attempt<3;attempt++){
      const data=await this.loadShares();
      const before=JSON.stringify(data.items);
      fn(data.items);
      if(JSON.stringify(data.items)===before)return;
      const body=JSON.stringify({format:1,items:data.items});
      const r=data._file
        ?await OD.req("PUT",`/drives/${data._driveId}/items/${data._file.id}/content`,{body,headers:{"Content-Type":"application/json","If-Match":data._file.eTag}})
        :await OD.req("PUT",`/drives/${data._driveId}/items/${data._rootId}:/freigaben.json:/content?@microsoft.graph.conflictBehavior=fail`,{body,headers:{"Content-Type":"application/json"}});
      if(r.status===412||r.status===409)continue;
      if(!r.ok)throw Object.assign(new Error("PUT freigaben "+r.status),{status:r.status});
      return;
    }
  },
  rememberShare(ref){
    return this.editShares(items=>{
      if(items.some(x=>x.driveId===ref.driveId&&x.itemId===ref.itemId))return;
      items.push({driveId:ref.driveId,itemId:ref.itemId,name:ref.name||"",owner:ref.owner||"",added:new Date().toISOString()});
    }).catch(e=>console.warn("Freigabe merken",e));
  },
  forgetShare(nb){
    const d=nb.drive||{};
    return this.editShares(items=>{
      for(let i=items.length-1;i>=0;i--)if(items[i].driveId===d.driveId&&(items[i].itemId===d.itemId||items[i].itemId===d.shareRoot))items.splice(i,1);
    }).catch(e=>console.warn("Freigabe vergessen",e));
  },
  async discoverShared(){
    const list=await this.listShared();
    let added=0;
    for(const ref of list){
      const r=await this.attach(ref,false,true).catch(e=>{console.warn("Freigabe",ref.name,e);return false;});
      if(typeof r==="number")added+=r;else if(r===true)added++;
    }
    return added;
  },
  async resolveLink(url){
    const b64=btoa(unescape(encodeURIComponent(url.trim()))).replace(/=+$/,"").replace(/\//g,"_").replace(/\+/g,"-");
    const it=await OD.json("GET",`/shares/u!${b64}/driveItem`);
    return {driveId:it.parentReference.driveId,itemId:it.id,name:it.name};
  },
  /* Freigegebenen Ordner einbinden. Liegt darin kein notebook.json, werden die Unterordner durchsucht
     (so kann man auch den ganzen Ordner „Notizbuch“ mit allen Notizbüchern auf einmal teilen).
     Rückgabe: true (neu), "exists" (schon da), false (kein Notizbuch) oder bei Sammelordnern die Zahl neuer Notizbücher. */
  async attach(ref,own,quiet){
    const knownByItem=id=>Store.notebooks.find(n=>n.drive&&n.drive.driveId===ref.driveId&&n.drive.itemId===id);
    const k=knownByItem(ref.itemId);
    if(k){this.lastAttached=k;return "exists";}
    const idx=await OD.childByName(ref.driveId,ref.itemId,"notebook.json");
    if(!idx){
      if(own)return false;
      const subs=(await OD.children(ref.driveId,ref.itemId)).filter(c=>c.folder&&c.name!=="pages");
      let added=0,found=0,first=null;
      for(const c of subs){
        const kk=knownByItem(c.id);
        if(kk){found++;first=first||kk;continue;}
        const r=await this.attachOne({driveId:ref.driveId,itemId:c.id,name:c.name,owner:ref.owner,shareRoot:ref.itemId},false);
        if(r===true){added++;found++;first=first||this.lastAttached;}
        else if(r==="exists"){found++;first=first||this.lastAttached;}
      }
      if(!found)return false;
      this.lastAttached=first;
      if(!quiet||added)this.rememberShare(ref);
      return added?added:"exists";
    }
    const r=await this.attachOne(ref,own,idx);
    if(!own&&r)this.rememberShare(ref);
    return r;
  },
  async attachOne(ref,own,idx){
    idx=idx||await OD.childByName(ref.driveId,ref.itemId,"notebook.json");
    if(!idx)return false;
    const remote=await OD.download(idx);
    const known=Store.notebooks.find(n=>n.id===remote.id);
    if(known){this.lastAttached=known;return "exists";}
    const nb={id:remote.id||Store.uid(),name:remote.name||ref.name,nameMod:0,sections:[],pages:[],source:"onedrive",own:!!own,owner:ref.owner||"",
      drive:{driveId:ref.driveId,itemId:ref.itemId,shareRoot:ref.shareRoot||null,pagesId:null,indexEtag:null,indexId:null},indexDirty:false,indexVer:0};
    Store.notebooks.push(nb);Store.saveNotebooks();this.lastAttached=nb;
    await this.pull(nb);
    return true;
  },
  async invite(nb,email,role){
    return OD.json("POST",`/drives/${nb.drive.driveId}/items/${nb.drive.itemId}/invite`,{json:{
      recipients:[{email}],requireSignIn:true,sendInvitation:true,roles:[role==="read"?"read":"write"],
      message:"Ich habe ein Notizbuch mit dir geteilt. So öffnest du es: 1. Den Link „Öffnen“ in dieser E-Mail kopieren (lange drücken bzw. Rechtsklick, „Link kopieren“). 2. Die App öffnen: "+location.origin+location.pathname+" 3. Mit deinem Microsoft-Konto anmelden, oben im Notizbuch-Menü „+ Freigegebenes Notizbuch öffnen“ wählen, Link einfügen. Danach findet die App es auf all deinen Geräten von selbst."
    }});
  },
  async permissions(nb){
    const j=await OD.json("GET",`/drives/${nb.drive.driveId}/items/${nb.drive.itemId}/permissions`);
    return j.value||[];
  },
  async removePermission(nb,id){return OD.json("DELETE",`/drives/${nb.drive.driveId}/items/${nb.drive.itemId}/permissions/${id}`);},
  async setRole(nb,id,role){return OD.json("PATCH",`/drives/${nb.drive.driveId}/items/${nb.drive.itemId}/permissions/${id}`,{json:{roles:[role]}});},
  async shareLink(nb){
    const j=await OD.json("POST",`/drives/${nb.drive.driveId}/items/${nb.drive.itemId}/createLink`,{json:{type:"edit"}});
    return j.link.webUrl;
  }
};
window.Sync=Sync;
})();
