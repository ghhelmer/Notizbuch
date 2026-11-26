#!/usr/bin/env node
/* Notizbuch-Server: Anmeldung, Benutzerverwaltung und Speicher für die Familien-App.
   Ohne zusätzliche Pakete, nur Node.js (ab Version 18).

   Umgebungsvariablen:
     PORT      (Standard 8080, nur lokal erreichbar; nach außen macht Caddy https)
     DATA_DIR  (Standard ./data) Ort für Benutzer, Sitzungen und Notizbücher
     APP_DIR   (Standard ..)     Ordner mit index.html der App

   Ablage:
     DATA_DIR/users.json
     DATA_DIR/sessions.json
     DATA_DIR/notebooks/<id>/notebook.json
     DATA_DIR/notebooks/<id>/pages/<seiten-id>.json
*/
"use strict";
const http=require("http"),fs=require("fs"),fsp=fs.promises,path=require("path"),crypto=require("crypto");

const PORT=+process.env.PORT||8080;
const HOST=process.env.HOST||"127.0.0.1";
const DATA=path.resolve(process.env.DATA_DIR||path.join(__dirname,"data"));
const APP=path.resolve(process.env.APP_DIR||path.join(__dirname,".."));
const MAX_BODY=40*1024*1024;            // 40 MB pro Seite (Bilder sind eingebettet)
const SESSION_DAYS=60;
const SECURE_COOKIE=process.env.INSECURE_COOKIE!=="1";

/* ---------- Hilfen ---------- */
const ID_RE=/^[A-Za-z0-9_-]{4,64}$/;
const etagOf=buf=>'"'+crypto.createHash("sha1").update(buf).digest("hex").slice(0,24)+'"';
async function readJson(file,fallback){try{return JSON.parse(await fsp.readFile(file,"utf8"));}catch(e){return fallback;}}
async function writeAtomic(file,data){
  await fsp.mkdir(path.dirname(file),{recursive:true});
  const tmp=file+".tmp-"+process.pid+"-"+Date.now();
  await fsp.writeFile(tmp,data);await fsp.rename(tmp,file);
}
function hashPassword(pw,salt){salt=salt||crypto.randomBytes(16).toString("hex");return {salt,hash:crypto.scryptSync(String(pw),salt,64).toString("hex")};}
function checkPassword(pw,u){if(!u||!u.salt)return false;const h=crypto.scryptSync(String(pw),u.salt,64);const ref=Buffer.from(u.hash,"hex");return ref.length===h.length&&crypto.timingSafeEqual(h,ref);}

/* ---------- Benutzer und Sitzungen ---------- */
const USERS=path.join(DATA,"users.json"),SESS=path.join(DATA,"sessions.json");
let users=[],sessions={};
async function loadState(){users=await readJson(USERS,[]);sessions=await readJson(SESS,{});const now=Date.now();for(const k in sessions)if(sessions[k].exp<now)delete sessions[k];}
const saveUsers=()=>writeAtomic(USERS,JSON.stringify(users,null,1));
let sessTimer=null;const saveSessions=()=>{clearTimeout(sessTimer);sessTimer=setTimeout(()=>writeAtomic(SESS,JSON.stringify(sessions)).catch(console.error),500);};
const publicUser=u=>({name:u.name,display:u.display||u.name,person:u.person||"",admin:!!u.admin,created:u.created});
function findUser(name){name=String(name||"").trim().toLowerCase();return users.find(u=>u.name===name);}
async function createUser({name,password,display,person,admin}){
  name=String(name||"").trim().toLowerCase();
  if(!/^[a-z0-9äöüß._-]{2,32}$/.test(name))throw httpErr(400,"Benutzername: 2–32 Zeichen, nur Buchstaben, Ziffern, Punkt, Minus");
  if(String(password||"").length<6)throw httpErr(400,"Passwort: mindestens 6 Zeichen");
  if(findUser(name))throw httpErr(409,"Diesen Benutzernamen gibt es schon");
  const u={name,display:display||name,person:person||"",admin:!!admin,created:Date.now(),...hashPassword(password)};
  users.push(u);await saveUsers();return u;
}

/* Schutz gegen Passwort-Raten: 8 Fehlversuche pro 15 Minuten und Adresse */
const fails=new Map();
function tooMany(ip){const f=fails.get(ip);return f&&f.n>=8&&Date.now()-f.t<15*60e3;}
function failed(ip){const f=fails.get(ip);if(!f||Date.now()-f.t>15*60e3)fails.set(ip,{n:1,t:Date.now()});else f.n++;}

/* ---------- HTTP ---------- */
function httpErr(status,msg){const e=new Error(msg);e.status=status;return e;}
function send(res,status,body,headers){
  const isBuf=Buffer.isBuffer(body);const data=body==null?"":isBuf||typeof body==="string"?body:JSON.stringify(body);
  res.writeHead(status,Object.assign({"Content-Type":isBuf||typeof body==="string"?"text/plain; charset=utf-8":"application/json; charset=utf-8","Cache-Control":"no-store"},headers||{}));
  res.end(data);
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0;
    req.on("data",c=>{size+=c.length;if(size>MAX_BODY){reject(httpErr(413,"Zu groß (höchstens 40 MB)"));req.destroy();}else chunks.push(c);});
    req.on("end",()=>resolve(Buffer.concat(chunks)));req.on("error",reject);
  });
}
async function jsonBody(req){const b=await readBody(req);try{return JSON.parse(b.toString("utf8")||"{}");}catch(e){throw httpErr(400,"Ungültige Daten");}}
function cookies(req){const out={};(req.headers.cookie||"").split(";").forEach(p=>{const i=p.indexOf("=");if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim());});return out;}
function currentUser(req){
  const sid=cookies(req).nb_sid;const s=sid&&sessions[sid];
  if(!s||s.exp<Date.now())return null;
  const u=findUser(s.user);if(!u)return null;
  if(s.exp-Date.now()<(SESSION_DAYS-1)*864e5){s.exp=Date.now()+SESSION_DAYS*864e5;saveSessions();}
  return u;
}
const cookieStr=(v,maxAge)=>`nb_sid=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE?"; Secure":""}`;

/* ---------- Notizbücher ---------- */
const NB=path.join(DATA,"notebooks");
const nbDir=id=>{if(!ID_RE.test(id))throw httpErr(400,"Ungültige Kennung");return path.join(NB,id);};
async function exists(p){try{await fsp.access(p);return true;}catch(e){return false;}}
/* Schreibzugriffe pro Datei nacheinander, damit If-Match zuverlässig ist */
const locks=new Map();
async function withLock(key,fn){const prev=locks.get(key)||Promise.resolve();let release;const p=new Promise(r=>release=r);locks.set(key,prev.then(()=>p));await prev;try{return await fn();}finally{release();if(locks.get(key)===p)locks.delete(key);}}
async function putFile(req,res,file,{createOnly}={}){
  const body=await readBody(req);
  try{JSON.parse(body.toString("utf8"));}catch(e){throw httpErr(400,"Ungültige Daten");}
  return withLock(file,async()=>{
    const ifMatch=req.headers["if-match"],ifNone=req.headers["if-none-match"];
    let cur=null;try{cur=await fsp.readFile(file);}catch(e){}
    if(ifNone==="*"&&cur)return send(res,412,{error:"Gibt es schon",etag:etagOf(cur)});
    if(ifMatch&&ifMatch!=="*"&&(!cur||etagOf(cur)!==ifMatch))return send(res,412,{error:"Inzwischen geändert",etag:cur?etagOf(cur):null});
    if(createOnly&&cur&&!ifMatch)return send(res,412,{error:"Gibt es schon",etag:etagOf(cur)});
    await writeAtomic(file,body);
    send(res,200,{etag:etagOf(body)},{ETag:etagOf(body)});
  });
}
async function getFile(req,res,file){
  let buf;try{buf=await fsp.readFile(file);}catch(e){throw httpErr(404,"Nicht gefunden");}
  const tag=etagOf(buf);
  if(req.headers["if-none-match"]===tag)return send(res,304,null,{ETag:tag});
  res.writeHead(200,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",ETag:tag});res.end(buf);
}
async function listNotebooks(){
  await fsp.mkdir(NB,{recursive:true});
  const out=[];
  for(const d of await fsp.readdir(NB,{withFileTypes:true})){
    if(!d.isDirectory()||!ID_RE.test(d.name)||d.name.startsWith("_"))continue;
    try{const buf=await fsp.readFile(path.join(NB,d.name,"notebook.json"));const j=JSON.parse(buf);out.push({id:d.name,name:j.name||d.name,etag:etagOf(buf)});}catch(e){}
  }
  return out;
}
async function listPages(id){
  const dir=path.join(nbDir(id),"pages");const out=[];
  let names=[];try{names=await fsp.readdir(dir);}catch(e){return out;}
  for(const n of names){const m=/^([A-Za-z0-9_-]{4,64})\.json$/.exec(n);if(!m)continue;try{out.push({id:m[1],etag:etagOf(await fsp.readFile(path.join(dir,n)))});}catch(e){}}
  return out;
}

/* ---------- Statische Dateien (die App) ---------- */
const TYPES={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".png":"image/png",".txt":"text/plain; charset=utf-8"};
async function serveStatic(req,res,url){
  let rel=decodeURIComponent(url.pathname);if(rel.endsWith("/"))rel+="index.html";
  const file=path.join(APP,path.normalize(rel).replace(/^(\.\.[\/\\])+/,""));
  if(!file.startsWith(APP+path.sep)||/[\/\\](server|tests|\.git)[\/\\]/.test(file.slice(APP.length)))return send(res,404,"Nicht gefunden");
  let buf;try{buf=await fsp.readFile(file);}catch(e){return send(res,404,"Nicht gefunden");}
  const tag=etagOf(buf);
  if(req.headers["if-none-match"]===tag){res.writeHead(304,{ETag:tag});return res.end();}
  res.writeHead(200,{"Content-Type":TYPES[path.extname(file)]||"application/octet-stream","Cache-Control":"no-cache",ETag:tag,"X-Content-Type-Options":"nosniff"});
  res.end(buf);
}

/* ---------- Routen ---------- */
async function handle(req,res){
  const url=new URL(req.url,"http://x");const p=url.pathname;const m=req.method;
  if(!p.startsWith("/api/"))return m==="GET"||m==="HEAD"?serveStatic(req,res,url):send(res,405,"");
  const ip=(req.headers["x-forwarded-for"]||"").split(",")[0].trim()||req.socket.remoteAddress;

  if(p==="/api/status"&&m==="GET")return send(res,200,{server:true,setup:users.length===0});
  if(p==="/api/login"&&m==="POST"){
    if(tooMany(ip))throw httpErr(429,"Zu viele Fehlversuche. Bitte 15 Minuten warten.");
    const b=await jsonBody(req);const u=findUser(b.name);
    if(!checkPassword(b.password,u)){failed(ip);throw httpErr(401,"Benutzername oder Passwort falsch");}
    fails.delete(ip);
    const sid=crypto.randomBytes(32).toString("hex");sessions[sid]={user:u.name,exp:Date.now()+SESSION_DAYS*864e5};saveSessions();
    return send(res,200,publicUser(u),{"Set-Cookie":cookieStr(sid,SESSION_DAYS*86400)});
  }
  if(p==="/api/logout"&&m==="POST"){const sid=cookies(req).nb_sid;if(sid){delete sessions[sid];saveSessions();}return send(res,200,{ok:true},{"Set-Cookie":cookieStr("",0)});}

  // Ab hier nur mit Anmeldung. Schutz gegen fremde Webseiten: Schreibzugriffe nur mit eigenem Kopf
  const me=currentUser(req);if(!me)throw httpErr(401,"Bitte anmelden");
  if(m!=="GET"&&req.headers["x-notizbuch"]!=="1")throw httpErr(403,"Nicht erlaubt");

  if(p==="/api/me"&&m==="GET")return send(res,200,publicUser(me));
  if(p==="/api/me/password"&&m==="POST"){
    const b=await jsonBody(req);if(!checkPassword(b.old,me))throw httpErr(403,"Altes Passwort stimmt nicht");
    if(String(b.password||"").length<6)throw httpErr(400,"Passwort: mindestens 6 Zeichen");
    Object.assign(me,hashPassword(b.password));await saveUsers();return send(res,200,{ok:true});
  }

  // Benutzerverwaltung (nur Admin)
  if(p==="/api/users"){
    if(m==="GET")return send(res,200,users.map(publicUser));
    if(!me.admin)throw httpErr(403,"Nur für Admins");
    if(m==="POST"){const u=await createUser(await jsonBody(req));return send(res,201,publicUser(u));}
  }
  let mm;
  if((mm=/^\/api\/users\/([^/]+)$/.exec(p))){
    if(!me.admin)throw httpErr(403,"Nur für Admins");
    const u=findUser(decodeURIComponent(mm[1]));if(!u)throw httpErr(404,"Unbekannter Benutzer");
    if(m==="PATCH"){
      const b=await jsonBody(req);
      if(b.password!==undefined){if(String(b.password).length<6)throw httpErr(400,"Passwort: mindestens 6 Zeichen");Object.assign(u,hashPassword(b.password));for(const k in sessions)if(sessions[k].user===u.name&&u!==me)delete sessions[k];saveSessions();}
      if(b.display!==undefined)u.display=String(b.display).slice(0,60);
      if(b.person!==undefined)u.person=String(b.person).slice(0,60);
      if(b.admin!==undefined){if(u===me&&!b.admin)throw httpErr(400,"Du kannst dir selbst die Admin-Rechte nicht nehmen");u.admin=!!b.admin;}
      await saveUsers();return send(res,200,publicUser(u));
    }
    if(m==="DELETE"){
      if(u===me)throw httpErr(400,"Du kannst dich nicht selbst löschen");
      users=users.filter(x=>x!==u);for(const k in sessions)if(sessions[k].user===u.name)delete sessions[k];
      await saveUsers();saveSessions();return send(res,200,{ok:true});
    }
  }

  // Notizbücher (alle angemeldeten Familienmitglieder sehen alle Notizbücher)
  if(p==="/api/notebooks"&&m==="GET")return send(res,200,await listNotebooks());
  if((mm=/^\/api\/notebooks\/([^/]+)$/.exec(p))){
    const dir=nbDir(mm[1]);
    if(m==="DELETE"){
      if(!me.admin)throw httpErr(403,"Nur Admins dürfen Notizbücher löschen");
      if(await exists(dir)){const trash=path.join(NB,"_papierkorb");await fsp.mkdir(trash,{recursive:true});await fsp.rename(dir,path.join(trash,mm[1]+"-"+Date.now()));}
      return send(res,200,{ok:true});
    }
  }
  if((mm=/^\/api\/notebooks\/([^/]+)\/index$/.exec(p))){
    const file=path.join(nbDir(mm[1]),"notebook.json");
    if(m==="GET")return getFile(req,res,file);
    if(m==="PUT")return putFile(req,res,file);
  }
  if((mm=/^\/api\/notebooks\/([^/]+)\/pages$/.exec(p))&&m==="GET")return send(res,200,await listPages(mm[1]));
  if((mm=/^\/api\/notebooks\/([^/]+)\/pages\/([^/]+)$/.exec(p))){
    if(!ID_RE.test(mm[2]))throw httpErr(400,"Ungültige Kennung");
    const file=path.join(nbDir(mm[1]),"pages",mm[2]+".json");
    if(m==="GET")return getFile(req,res,file);
    if(m==="PUT")return putFile(req,res,file);
    if(m==="DELETE"){
      if(await exists(file)){const trash=path.join(nbDir(mm[1]),"geloescht");await fsp.mkdir(trash,{recursive:true});await fsp.rename(file,path.join(trash,mm[2]+"-"+Date.now()+".json"));}
      return send(res,200,{ok:true});
    }
  }
  throw httpErr(404,"Unbekannte Adresse");
}

/* ---------- Kommandozeile: Admin anlegen, Passwort zurücksetzen ---------- */
async function cli(args){
  await loadState();
  const [cmd,name,pw]=args;
  if(cmd==="admin-anlegen"||cmd==="benutzer-anlegen"){
    const u=await createUser({name,password:pw,display:args[3]||name,admin:cmd==="admin-anlegen"});
    console.log((u.admin?"Admin":"Benutzer")+" „"+u.name+"“ angelegt.");return;
  }
  if(cmd==="passwort"){const u=findUser(name);if(!u){console.error("Unbekannter Benutzer");process.exit(1);}Object.assign(u,hashPassword(pw));await saveUsers();console.log("Passwort geändert.");return;}
  if(cmd==="liste"){users.forEach(u=>console.log(u.name+(u.admin?" (Admin)":"")));return;}
  console.log("Befehle: admin-anlegen NAME PASSWORT | benutzer-anlegen NAME PASSWORT | passwort NAME NEUES-PASSWORT | liste");
}

if(require.main===module){
  if(process.argv.length>2){cli(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exit(1);});}
  else loadState().then(()=>{
    http.createServer((req,res)=>{
      handle(req,res).catch(e=>{if(!e.status)console.error(e);if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:"Interner Fehler"});});
    }).listen(PORT,HOST,()=>console.log(`Notizbuch-Server läuft auf ${HOST}:${PORT}, Daten in ${DATA}`));
  });
}
module.exports={handle,loadState};
