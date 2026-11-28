const {chromium}=require('playwright');
/* ---- Fake OneDrive ---- */
let n=0;const items=new Map();const D="D1";
const mk=(o)=>{const id="i"+(++n);const it=Object.assign({id,etag:1},o);items.set(id,it);return it;};
const roots={Anna:mk({name:"root",folder:true,parent:null}),Bert:mk({name:"rootB",folder:true,parent:null})};const root=roots.Anna;
const kids=pid=>[...items.values()].filter(i=>i.parent===pid);
const view=i=>({id:i.id,name:i.name,eTag:'"e'+i.id+'.'+i.etag+'"',parentReference:{driveId:D,id:i.parent},webUrl:"https://od/"+i.id,
  ...(i.folder?{folder:{childCount:kids(i.id).length}}:{file:{},"@microsoft.graph.downloadUrl":"https://dl.test/"+i.id})});
const log=[];const readOnly=new Set();
let perms=[{id:'p0',roles:['owner'],grantedToV2:{user:{displayName:'Anna',email:'anna@example.com'}}},
  {id:'p1',roles:['write'],grantedToV2:{user:{displayName:'Bert',email:'bert@example.com'}}},
  {id:'p2',roles:['write'],link:{type:'edit',scope:'anonymous'}}];
async function graph(route){
  const req=route.request();const u=new URL(req.url());const m=req.method();let path=decodeURIComponent(u.pathname.replace('/v1.0',''));
  const send=(st,body)=>route.fulfill({status:st,contentType:'application/json',body:body==null?'':JSON.stringify(body)});
  log.push(m+' '+path);
  if(path==='/me/drive')return send(200,{id:D});
  if(path==='/me/drive/root')return send(200,view(roots[req.headers()['authorization'].split(' ')[1]]));
  const who=req.headers()['authorization'].split(' ')[1];
  // Microsoft hat sharedWithMe abgeschaltet: liefert nichts mehr
  if(path==='/me/drive/sharedWithMe')return send(200,{value:[]});
  if(path==='/me/drive/root/children')return send(200,{value:kids(roots[who].id).map(view)});
  if(path.startsWith('/shares/u!')){
    const b64=path.slice(10).replace('/driveItem','').replace(/-/g,'+').replace(/_/g,'/');const url=Buffer.from(b64,'base64').toString();
    const nbf=kids(root.id).find(i=>i.name==='Notizbuch');
    const it=url.endsWith('/alle')?nbf:kids(nbf.id).find(i=>i.name===url.split('/').pop());
    return it?send(200,view(it)):send(404,{});
  }
  // Leserecht: wer in readOnly steht, darf in Annas Ordnern nichts schreiben
  if(m!=='GET'&&readOnly.has(who)&&path.startsWith('/drives/')){
    const owned=id=>{let it=items.get(id);while(it&&it.parent)it=items.get(it.parent);return it===root;};
    const mm=path.match(/\/items\/([^/:]+)/);if(mm&&owned(mm[1]))return send(403,{error:{code:'accessDenied'}});
  }
  let mm;
  if(mm=path.match(/^\/drives\/D1\/items\/([^/:]+):\/([^:]+):\/content$/)){ // PUT by path
    let ex=kids(mm[1]).find(i=>i.name===mm[2]);
    if(ex&&u.searchParams.get('@microsoft.graph.conflictBehavior')==='fail')return send(409,{error:{code:'nameAlreadyExists'}});
    if(!ex)ex=mk({name:mm[2],parent:mm[1]});else ex.etag++;
    ex.data=req.postData();return send(200,view(ex));
  }
  if(mm=path.match(/^\/drives\/D1\/items\/([^/:]+):\/([^:]+)$/)){const c=kids(mm[1]).find(i=>i.name===mm[2]);return c?send(200,view(c)):send(404,{error:{code:'itemNotFound'}});}
  if(mm=path.match(/^\/drives\/D1\/items\/([^/:]+)\/children$/)){
    if(m==='GET')return send(200,{value:kids(mm[1]).map(view)});
    const b=JSON.parse(req.postData());let ex=kids(mm[1]).find(i=>i.name===b.name);
    if(ex&&b['@microsoft.graph.conflictBehavior']==='fail')return send(409,{error:{}});
    let name=b.name;if(ex){let k=1;while(kids(mm[1]).some(i=>i.name===name))name=b.name+' '+(k++);}
    return send(201,view(mk({name,folder:true,parent:mm[1]})));
  }
  if(mm=path.match(/^\/drives\/D1\/items\/([^/:]+)\/content$/)){
    const it=items.get(mm[1]);if(!it)return send(404,{});
    const im=req.headers()['if-match'];if(im&&im!=='*'&&im!==view(it).eTag)return send(412,{error:{code:'resourceModified'}});
    it.etag++;it.data=req.postData();return send(200,view(it));
  }
  if(mm=path.match(/^\/drives\/D1\/items\/([^/:]+)$/)){const it=items.get(mm[1]);if(m==='DELETE'){items.delete(mm[1]);return send(204);}return it?send(200,view(it)):send(404,{});}
  if(mm=path.match(/^\/drives\/D1\/items\/([^/:]+)\/permissions(?:\/([^/]+))?$/)){
    if(m==='GET')return send(200,{value:perms});
    if(m==='DELETE'){perms=perms.filter(p=>p.id!==mm[2]);return send(204);}
    if(m==='PATCH'){const p=perms.find(p=>p.id===mm[2]);p.roles=JSON.parse(req.postData()).roles;return send(200,p);}
  }
  if(mm=path.match(/^\/drives\/D1\/items\/([^/:]+)\/(invite|createLink)$/))return send(200,mm[2]==='invite'?{value:[]}:{link:{webUrl:'https://1drv.ms/f/x'}});
  return send(500,{error:'unhandled '+path});
}
async function dl(route){const id=route.request().url().split('/').pop();const it=items.get(id);route.fulfill({status:it?200:404,contentType:'application/json',body:it?it.data:''});}

(async()=>{
  const b=await chromium.launch();let fails=0;
  const check=(ok,msg)=>{console.log((ok?'OK   ':'FEHLER ')+msg);if(!ok)fails++;};
  async function client(name){
    const ctx=await b.newContext({viewport:{width:1280,height:850}});
    await ctx.addInitScript(n=>{window.NOTIZBUCH_TEST={name:n};},name);
    await ctx.route('https://graph.microsoft.com/**',graph);await ctx.route('https://dl.test/**',dl);
    const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto('http://localhost:8765/');await p.waitForTimeout(1200);p.errs=errs;return p;
  }
  const sync=p=>p.evaluate(()=>Sync.run());
  const names=p=>p.$$eval('#nbsel option',l=>l.map(x=>x.textContent));
  const A=await client('Anna');
  for(const nm of ['Familie','Schule']){await A.selectOption('#nbsel','__new');await A.fill('#nbName',nm);await A.click('[data-ok]');await A.waitForTimeout(1500);}
  // Termin im Familien-Notizbuch
  await A.evaluate(()=>{const n=Store.notebooks.find(x=>x.name==='Familie');n.events=[{id:'ev1',title:'Zahnarzt',start:'2026-12-01T10:00',mod:Date.now()}];Store.touchIndex(n);});
  await sync(A);
  // Bert öffnet den Link zum Familien-Notizbuch
  const B=await client('Bert');
  await B.selectOption('#nbsel','__shared');await B.waitForTimeout(600);
  await B.fill('#shLink','https://1drv.ms/f/Familie');await B.click('[data-link]');await B.waitForTimeout(1500);
  check((await names(B)).includes('Familie'),'Bert hat „Familie“ über den Link geöffnet');
  check(await B.evaluate(()=>(Store.notebooks.find(x=>x.name==='Familie').events||[]).some(e=>e.title==='Zahnarzt')),'Bert sieht Annas Termin');
  await B.waitForTimeout(500);
  const fr=[...items.values()].find(i=>i.name==='freigaben.json');
  check(fr&&JSON.parse(fr.data).items.length===1,'Freigabe in Berts OneDrive gemerkt (freigaben.json)');
  // Bert trägt einen Termin ein, Anna sieht ihn
  await B.evaluate(()=>{const n=Store.notebooks.find(x=>x.name==='Familie');n.events.push({id:'ev2',title:'Fußball',start:'2026-12-02T17:00',mod:Date.now()});Store.touchIndex(n);});
  await sync(B);await sync(A);
  check(await A.evaluate(()=>Store.notebooks.find(x=>x.name==='Familie').events.some(e=>e.title==='Fußball')),'Anna sieht Berts Termin');
  // Gleichzeitig: beide tragen ohne Abgleich je einen Termin ein -> keiner geht verloren
  await A.evaluate(()=>{const n=Store.notebooks.find(x=>x.name==='Familie');n.events.push({id:'ev3',title:'Elternabend',start:'2026-12-03T19:00',mod:Date.now()});Store.touchIndex(n);});
  await B.evaluate(()=>{const n=Store.notebooks.find(x=>x.name==='Familie');n.events.push({id:'ev4',title:'Geburtstag',start:'2026-12-04T15:00',mod:Date.now()});Store.touchIndex(n);});
  await sync(A);await sync(B);await B.waitForTimeout(800);await sync(B);await sync(A);
  const evA=await A.evaluate(()=>Store.notebooks.find(x=>x.name==='Familie').events.map(e=>e.title).sort().join(','));
  const evB=await B.evaluate(()=>Store.notebooks.find(x=>x.name==='Familie').events.map(e=>e.title).sort().join(','));
  check(evA===evB&&evA.includes('Elternabend')&&evA.includes('Geburtstag'),'gleichzeitige Termine bei beiden: '+evA);
  // Zweites Gerät von Bert findet die Freigabe von selbst
  const B2=await client('Bert');await B2.waitForTimeout(1500);
  check((await names(B2)).includes('Familie'),'Berts zweites Gerät findet „Familie“ automatisch');
  // Ganzen Ordner teilen: Link auf Annas Ordner „Notizbuch“
  const C=await client('Bert');
  await C.selectOption('#nbsel','__shared');await C.waitForTimeout(600);
  await C.fill('#shLink','https://1drv.ms/f/alle');await C.click('[data-link]');await C.waitForTimeout(2000);
  const nc=await names(C);
  check(nc.includes('Familie')&&nc.includes('Schule'),'ganzer Ordner: beide Notizbücher geöffnet ('+nc.filter(x=>!x.startsWith('+')).join(', ')+')');
  // Nur-Lesen-Recht
  readOnly.add('Bert');
  await B.evaluate(()=>{const n=Store.notebooks.find(x=>x.name==='Familie');n.events.push({id:'ev5',title:'Darf nicht',start:'2026-12-05T10:00',mod:Date.now()});Store.touchIndex(n);});
  await sync(B);await B.waitForTimeout(300);await sync(B);
  const ro=await B.evaluate(()=>{const n=Store.notebooks.find(x=>x.name==='Familie');return {ro:!!n.readOnly,broken:!!n.broken,ev:n.events.map(e=>e.title).includes('Darf nicht')};});
  check(ro.ro&&!ro.broken&&!ro.ev,'Nur-Lesen: Änderung verworfen, Notizbuch bleibt lesbar '+JSON.stringify(ro));
  await A.evaluate(()=>{const n=Store.notebooks.find(x=>x.name==='Familie');n.events.push({id:'ev6',title:'Neu von Anna',start:'2026-12-06T10:00',mod:Date.now()});Store.touchIndex(n);});
  await sync(A);await sync(B);
  check(await B.evaluate(()=>Store.notebooks.find(x=>x.name==='Familie').events.some(e=>e.title==='Neu von Anna')),'Nur-Lesen: Bert bekommt weiter Annas Änderungen');
  await B.evaluate(()=>{Store.notebooks.find(x=>x.name==='Familie');});
  const errs=[...A.errs,...B.errs,...B2.errs,...C.errs];
  check(!errs.length,'keine Fehler im Browser '+errs.join(' | '));
  await b.close();
  console.log(fails?fails+' Prüfungen fehlgeschlagen':'Alle Prüfungen bestanden');process.exit(fails?1:0);
})();
