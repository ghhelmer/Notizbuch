/* Test des Familien-Servers: zwei Personen, Anmeldung, Notizbuch, Abgleich, Benutzerverwaltung.
   Vorher: DATA_DIR=/tmp/x node server/server.js admin-anlegen gerhard geheim123
           PORT=8090 DATA_DIR=/tmp/x node server/server.js */
const {chromium}=require('playwright');
const URL='http://localhost:8090/';
(async()=>{
  const b=await chromium.launch();
  async function client(){const ctx=await b.newContext({viewport:{width:1280,height:850}});const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.goto(URL);await p.waitForTimeout(800);return p;}
  async function login(p,n,pw){await p.fill('#lgName',n);await p.fill('#lgPw',pw);await p.click('.login button');await p.waitForTimeout(1200);}
  const G=await client();
  console.log('login shown:',!!await G.$('#loginScreen'));
  await login(G,'gerhard','falsch');console.log('error:',await G.textContent('#lgErr'));
  await login(G,'gerhard','geheim123');
  console.log('account:',await G.textContent('#account'));
  // Benutzer Karin anlegen
  await G.click('#whoBtn');await G.waitForTimeout(400);
  await G.fill('#suName','karin');await G.fill('#suPw','karin123');await G.selectOption('#suPerson','Karin');await G.click('[data-add]');await G.waitForTimeout(500);
  console.log('users:',await G.$$eval('#suList li b',l=>l.map(x=>x.textContent)));
  await G.click('[data-x]');
  // Notizbuch auf dem Server
  await G.selectOption('#nbsel','__new');await G.fill('#nbName','Familie');await G.click('[data-ok]');await G.waitForTimeout(1200);
  const bb=await (await G.$('#sheet')).boundingBox();await G.mouse.click(bb.x+200,bb.y+200);await G.keyboard.type('Einkaufsliste: Milch');
  await G.fill('#ptitle','Einkauf');await G.waitForTimeout(500);await G.evaluate(()=>Sync.run());await G.waitForTimeout(800);
  console.log('G status:',await G.textContent('#statusTxt'));
  // Termin
  await G.evaluate(()=>{const n=Store.notebooks.find(x=>x.name==='Familie');n.events=[{id:'ev1',title:'Zahnarzt',date:'2026-12-01',cat:'Anna',mod:Date.now()}];Store.touchIndex(n);});
  await G.evaluate(()=>Sync.run());await G.waitForTimeout(600);
  // Karin
  const K=await client();await login(K,'karin','karin123');await K.evaluate(()=>Sync.run());await K.waitForTimeout(1000);
  await K.selectOption('#nbsel',{label:'Familie'});await K.waitForTimeout(800);
  console.log('K sees:',await K.inputValue('#ptitle'),'|',(await K.textContent('#sheet')).trim(),'| events:',await K.evaluate(()=>Store.notebooks.find(x=>x.name==='Familie').events.length),'| me:',await K.evaluate(()=>Store.me()));
  // Karin ändert, Gerhard sieht es
  await K.click('.box .content');await K.keyboard.press('End');await K.keyboard.type(', Brot');await K.click('#search');await K.waitForTimeout(400);await K.evaluate(()=>Sync.run());await K.waitForTimeout(600);
  await G.evaluate(()=>Sync.run());await G.waitForTimeout(800);
  console.log('G sees:',(await G.textContent('#sheet')).trim());
  // Karin darf keine Benutzer anlegen
  console.log('K create user:',await K.evaluate(async()=>{const r=await fetch('api/users',{method:'POST',headers:{'X-Notizbuch':'1','Content-Type':'application/json'},body:'{"name":"x","password":"123456"}'});return r.status;}));
  console.log('no header:',await K.evaluate(async()=>(await fetch('api/notebooks/abcd/index',{method:'PUT',body:'{}'})).status));
  console.log('errors',G.errs,K.errs);
  await b.close();
})();
