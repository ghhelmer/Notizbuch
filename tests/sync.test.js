const {chromium}=require('playwright');
/* ---- Fake OneDrive ---- */
let n=0;const items=new Map();const D="D1";
const mk=(o)=>{const id="i"+(++n);const it=Object.assign({id,etag:1},o);items.set(id,it);return it;};
const roots={Anna:mk({name:"root",folder:true,parent:null}),Bert:mk({name:"rootB",folder:true,parent:null})};const root=roots.Anna;
const kids=pid=>[...items.values()].filter(i=>i.parent===pid);
const view=i=>({id:i.id,name:i.name,eTag:'"e'+i.id+'.'+i.etag+'"',parentReference:{driveId:D,id:i.parent},webUrl:"https://od/"+i.id,
  ...(i.folder?{folder:{childCount:kids(i.id).length}}:{file:{},"@microsoft.graph.downloadUrl":"https://dl.test/"+i.id})});
const log=[];
let perms=[{id:'p0',roles:['owner'],grantedToV2:{user:{displayName:'Anna',email:'anna@example.com'}}},
  {id:'p1',roles:['write'],grantedToV2:{user:{displayName:'Bert',email:'bert@example.com'}}},
  {id:'p2',roles:['write'],link:{type:'edit',scope:'anonymous'}}];
async function graph(route){
  const req=route.request();const u=new URL(req.url());const m=req.method();let path=decodeURIComponent(u.pathname.replace('/v1.0',''));
  const send=(st,body)=>route.fulfill({status:st,contentType:'application/json',body:body==null?'':JSON.stringify(body)});
  log.push(m+' '+path);
  if(path==='/me/drive')return send(200,{id:D});
  if(path==='/me/drive/root')return send(200,view(roots[req.headers()['authorization'].split(' ')[1]]));
  if(path==='/me/drive/root/children')return send(200,{value:[]});
  if(path==='/me/drive/sharedWithMe')return send(200,{value:kids(kids(root.id).find(i=>i.name==='Notizbuch')?.id||'x').map(i=>({name:i.name,remoteItem:{id:i.id,name:i.name,folder:{},parentReference:{driveId:D},shared:{owner:{user:{displayName:'Anna'}}}}}))});
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
  const b=await chromium.launch();
  async function client(name){
    const ctx=await b.newContext({viewport:{width:1280,height:850}});
    await ctx.addInitScript(n=>{window.NOTIZBUCH_TEST={name:n};},name);
    await ctx.route('https://graph.microsoft.com/**',graph);await ctx.route('https://dl.test/**',dl);
    const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
    await p.goto('http://localhost:8765/');await p.waitForTimeout(800);p.errs=errs;return p;
  }
  const sync=p=>p.evaluate(()=>Sync.run());
  const A=await client('Anna');
  console.log('A account:',await A.textContent('#account'));
  // A legt OneDrive-Notizbuch an
  await A.selectOption('#nbsel','__new');await A.fill('#nbName','Team');await A.click('[data-ok]');await A.waitForTimeout(1500);
  console.log('A status:',await A.textContent('#statusTxt'));
  const bb=await (await A.$('#sheet')).boundingBox();
  await A.mouse.click(bb.x+200,bb.y+200);await A.keyboard.type('Hallo von Anna');
  await A.fill('#ptitle','Einkauf');await A.waitForTimeout(500);await sync(A);await A.waitForTimeout(300);
  console.log('A status after sync:',await A.textContent('#statusTxt'));
  console.log('files:',[...items.values()].map(i=>i.name).join(','));
  // B öffnet freigegebenes Notizbuch
  const B=await client('Bert');
  await B.selectOption('#nbsel','__shared');await B.waitForTimeout(500);
  await B.click('#shList button');await B.waitForTimeout(1000);
  console.log('B page title:',await B.inputValue('#ptitle'),'| text:',await B.textContent('#sheet'));
  // Gleichzeitige Änderung -> Konflikt
  await A.click('.box .content');await A.keyboard.press('End');await A.keyboard.type(' (A2)');await A.waitForTimeout(500);await sync(A);
  await B.click('.box .content');await B.keyboard.press('End');await B.keyboard.type(' (B2)');await B.waitForTimeout(500);
  await B.click('#search');// Fokus raus
  await sync(B);await B.waitForTimeout(500);await sync(B);await B.waitForTimeout(500);
  console.log('B pages:',await B.$$eval('#pages .name',l=>l.map(x=>x.textContent)));
  console.log('B shown text:',await B.textContent('#sheet'));
  await sync(A);await A.waitForTimeout(500);
  console.log('A pages:',await A.$$eval('#pages .name',l=>l.map(x=>x.textContent)));
  // Abschnitt bei B anlegen, A sieht ihn
  await B.click('#addSec');await B.keyboard.type('Urlaub');await B.keyboard.press('Enter');await B.waitForTimeout(400);await sync(B);await sync(A);await A.waitForTimeout(300);
  console.log('A sections:',await A.$$eval('#secs .name',l=>l.map(x=>x.textContent)));
  // Neustart von A: Daten aus IndexedDB
  await A.reload();await A.waitForTimeout(1200);
  console.log('A after reload nb:',await A.$eval('#nbsel',s=>s.selectedOptions[0].textContent),'| sections:',await A.$$eval('#secs .name',l=>l.map(x=>x.textContent)));
  // Benutzerverwaltung
  await A.click('#nbmore');await A.click('.pop button:text-is("Benutzer verwalten…")');await A.waitForTimeout(500);
  console.log('perm rows:',await A.$$eval('#permList li',l=>l.map(x=>x.innerText.split('\n')[0])));
  await A.selectOption('#meSel','Karin');
  await A.selectOption('[data-person="bert@example.com"]','Johannes');
  await A.selectOption('[data-role="p1"]','read');await A.waitForTimeout(200);
  await A.click('[data-rm="p2"]');await A.click('[data-rm="p2"]');await A.waitForTimeout(400);
  console.log('perms now:',JSON.stringify(perms.map(p=>p.id+':'+p.roles)));
  console.log('me:',await A.evaluate(()=>Store.me()),'| bert ->',await A.evaluate(()=>Store.personFor('bert@example.com')));
  await A.screenshot({path:'A.png'});
  console.log('errors A:',A.errs,'B:',B.errs);
  console.log('unhandled:',log.filter(l=>0).length);
  await b.close();
})();
