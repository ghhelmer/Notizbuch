/* Wissenschaftlicher Taschenrechner im Stil eines Schulrechners (eigenes Design).
   Eigener Rechenkern ohne eval: SHIFT-Funktionen, DEG/RAD/GRA, Brüche (S⇔D), Speicher M, Ans, nCr/nPr, ˣ√. */
(function(){
"use strict";

/* ---------- Rechenkern ---------- */
function angleIn(x,m){return m==="DEG"?x*Math.PI/180:m==="GRA"?x*Math.PI/200:x;}
function angleOut(x,m){return m==="DEG"?x*180/Math.PI:m==="GRA"?x*200/Math.PI:x;}
function trig(f,x,m){
  // exakte Werte bei Vielfachen von 90° (z. B. cos 90 = 0, tan 90 = nicht definiert)
  const deg=m==="DEG"?x:m==="GRA"?x*0.9:x*180/Math.PI;
  const q=((deg%360)+360)%360;
  if(Math.abs(q%90)<1e-10||Math.abs(q%90-90)<1e-10){
    const k=Math.round(q/90)%4;
    if(f==="sin")return [0,1,0,-1][k];
    if(f==="cos")return [1,0,-1,0][k];
    if(f==="tan")return k%2?NaN:0;
  }
  return Math[f](angleIn(x,m));
}
const FUNCS={
  sin:(x,m)=>trig("sin",x,m), cos:(x,m)=>trig("cos",x,m), tan:(x,m)=>trig("tan",x,m),
  asin:(x,m)=>angleOut(Math.asin(x),m), acos:(x,m)=>angleOut(Math.acos(x),m), atan:(x,m)=>angleOut(Math.atan(x),m),
  sinh:Math.sinh, cosh:Math.cosh, tanh:Math.tanh,
  ln:Math.log, log:Math.log10, lg:Math.log10, exp:Math.exp,
  sqrt:Math.sqrt, cbrt:Math.cbrt, abs:Math.abs
};
function fact(n){
  if(n<0||!Number.isInteger(n))return gamma(n+1);
  if(n>170)return Infinity;let r=1;for(let i=2;i<=n;i++)r*=i;return r;
}
function gamma(z){
  if(z<0.5)return Math.PI/(Math.sin(Math.PI*z)*gamma(1-z));
  z-=1;const c=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61503916999185,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  let x=c[0];for(let i=1;i<9;i++)x+=c[i]/(z+i);const t=z+7.5;
  return Math.sqrt(2*Math.PI)*Math.pow(t,z+0.5)*Math.exp(-t)*x;
}
function nCr(n,r){if(r<0||r>n||!Number.isInteger(n)||!Number.isInteger(r))return NaN;r=Math.min(r,n-r);let v=1;for(let i=1;i<=r;i++)v=v*(n-r+i)/i;return Math.round(v);}
function nPr(n,r){if(r<0||r>n||!Number.isInteger(n)||!Number.isInteger(r))return NaN;let v=1;for(let i=0;i<r;i++)v*=n-i;return v;}
function tokenize(src){
  const s=src.replace(/×|·/g,"*").replace(/÷|:/g,"/").replace(/[−–]/g,"-").replace(/⁻¹/g,"^(-1)").replace(/²/g,"^2").replace(/³/g,"^3")
    .replace(/ˣ√/g," xrt ").replace(/√/g,"sqrt").replace(/∛/g,"cbrt").replace(/×10\^|ᴇ/g,"E");
  const out=[];let i=0;
  while(i<s.length){
    const ch=s[i];const rest=s.slice(i);
    if(/\s/.test(ch)){i++;continue;}
    const num=/^(\d+(?:[.,]\d*)?|[.,]\d+)(?:E[+-]?\d+)?/.exec(rest);
    if(num){out.push({t:"num",v:parseFloat(num[0].replace(",","."))});i+=num[0].length;continue;}
    if(rest.startsWith("M")&&!/^M[a-z]/.test(rest)){out.push({t:"id",v:"M"});i++;continue;}
    const op2=/^(nCr|nPr|xrt)/.exec(rest);
    if(op2){out.push({t:"op",v:op2[0]});i+=op2[0].length;continue;}
    const id=/^(asin|acos|atan|sinh|cosh|tanh|sin|cos|tan|ln|log|lg|exp|sqrt|cbrt|abs|ans|pi|π|e)/i.exec(rest);
    if(id){out.push({t:"id",v:id[0].toLowerCase()});i+=id[0].length;continue;}
    if("+-*/^()!%".includes(ch)){out.push({t:"op",v:ch});i++;continue;}
    throw new Error("Syntaxfehler: „"+ch+"“");
  }
  return out;
}
function evaluate(src,opt){
  opt=opt||{};const m=opt.mode||(opt.deg===false?"RAD":"DEG");
  const tk=tokenize(src);let p=0;
  const peek=()=>tk[p],take=()=>tk[p++];
  const isOp=v=>peek()&&peek().t==="op"&&peek().v===v;
  const startsPrimary=()=>{const x=peek();return x&&(x.t==="num"||x.t==="id"||(x.t==="op"&&x.v==="("));};
  function expr(){let v=term();while(isOp("+")||isOp("-")){const o=take().v;const r=term();v=o==="+"?v+r:v-r;}return v;}
  function term(){
    let v=unary();
    for(;;){
      if(isOp("*")){take();v*=unary();}
      else if(isOp("/")){take();v/=unary();}
      else if(isOp("nCr")){take();v=nCr(v,unary());}
      else if(isOp("nPr")){take();v=nPr(v,unary());}
      else if(startsPrimary()){v*=power();}
      else return v;
    }
  }
  function unary(){if(isOp("-")){take();return -unary();}if(isOp("+")){take();return unary();}return power();}
  function power(){
    const b=postfix();
    if(isOp("^")){take();return Math.pow(b,unary());}
    if(isOp("xrt")){take();const y=unary();return y<0&&b%2===1?-Math.pow(-y,1/b):Math.pow(y,1/b);}
    return b;
  }
  function postfix(){let v=primary();for(;;){if(isOp("!")){take();v=fact(v);}else if(isOp("%")){take();v/=100;}else return v;}}
  function primary(){
    const x=take();if(!x)throw new Error("Syntaxfehler: Ausdruck unvollständig");
    if(x.t==="num")return x.v;
    if(x.t==="op"&&x.v==="("){const v=expr();if(isOp(")"))take();return v;}
    if(x.t==="id"){
      if(x.v==="ans")return opt.ans||0;
      if(x.v==="M")return opt.mem||0;
      if(x.v==="pi"||x.v==="π")return Math.PI;
      if(x.v==="e")return Math.E;
      const arg=isOp("(")?primary():power();
      return FUNCS[x.v](arg,m);
    }
    throw new Error("Syntaxfehler: „"+x.v+"“");
  }
  const v=expr();
  if(p<tk.length)throw new Error("Syntaxfehler: „"+tk[p].v+"“");
  return v;
}
function fmt(v){
  if(!isFinite(v))return isNaN(v)?"Mathe-Fehler":(v>0?"∞":"−∞");
  if(Math.abs(v)<1e-13)v=0;
  let s;
  if(v!==0&&(Math.abs(v)>=1e10||Math.abs(v)<1e-5)){s=v.toExponential(9).replace(/\.?0+e/,"e");const [a,e]=s.split("e");s=a+"×10^"+(+e);}
  else s=String(parseFloat(v.toPrecision(10)));
  return s.replace(".",",").replace(/^-/,"−");
}
function toFraction(v){
  if(!isFinite(v)||Number.isInteger(v))return null;
  const sign=v<0?-1:1;let x=Math.abs(v),h1=1,h0=0,k1=0,k0=1,b=x;
  for(let i=0;i<40;i++){const a=Math.floor(b);[h1,h0]=[a*h1+h0,h1];[k1,k0]=[a*k1+k0,k1];if(Math.abs(x-h1/k1)<1e-10*Math.max(1,x))break;b=1/(b-a);if(!isFinite(b))break;}
  if(k1===1)return null;
  if(k1>100000||Math.abs(x-h1/k1)>1e-9*Math.max(1,x))return null;
  return (sign<0?"−":"")+h1+"/"+k1;
}
window.Calc={evaluate,fmt,toFraction};

/* ---------- Oberfläche ---------- */
// [Beschriftung, Eingabe, SHIFT-Beschriftung, SHIFT-Eingabe, Klasse]
const FKEYS=[
  ["SHIFT","SHIFT","","", "shift"],["MODE","MODE","","", "mode"],["S⇔D","SD","","", "fn"],["x⁻¹","⁻¹","x!","!"],["nCr","nCr","nPr","nPr"],["(−)","-","Abs","abs("],
  ["a/b","/","",""],["√","√(","∛","∛("],["x²","²","x³","³"],["xʸ","^","ˣ√","ˣ√"],["log","log(","10ˣ","10^("],["ln","ln(","eˣ","e^("],
  ["sin","sin(","sin⁻¹","asin("],["cos","cos(","cos⁻¹","acos("],["tan","tan(","tan⁻¹","atan("],["(","(","",""],[")",")","",""],["%","%","",""],
  ["STO","STO","MC","MC","mem"],["RCL","M","","", "mem"],["M+","M+","M−","M-","mem"],["π","π","e","e"],["hyp","hyp","","", "fn"],["Ans","Ans","",""]
];
const NKEYS=[
  ["7","7"],["8","8"],["9","9"],["DEL","DEL","","","del"],["AC","AC","","","ac"],
  ["4","4"],["5","5"],["6","6"],["×","×"],["÷","÷"],
  ["1","1"],["2","2"],["3","3"],["+","+"],["−","−"],
  ["0","0"],[",",","],["×10ˣ","E"],["Ans","Ans"],["=","=","","","eq"]
];
const MODES=["DEG","RAD","GRA"];
let mode="DEG",shift=false,hyp=false,ans=0,mem=0,frac=false,last=null,hist=[],el=null;
try{const st=JSON.parse(localStorage.getItem("rechner")||"{}");mode=st.mode||mode;mem=st.mem||0;ans=st.ans||0;}catch(e){}
const persist=()=>{try{localStorage.setItem("rechner",JSON.stringify({mode,mem,ans}));}catch(e){}};
const keyHtml=(k,i,grp)=>`<button class="ck ${k[4]||(grp==="n"&&/^[\d,]$/.test(k[0])?"num":"")}" data-g="${grp}" data-i="${i}">${k[2]?`<span class="ck-s">${k[2]}</span>`:""}<span class="ck-m">${k[0]}</span></button>`;
function build(){
  el=document.createElement("div");el.className="calc";el.hidden=true;
  el.innerHTML=`<div class="calc-head"><span class="calc-brand">Rechner</span><span class="calc-grip" title="Verschieben">⋮⋮</span><button class="calc-x" data-close aria-label="Taschenrechner schließen">✕</button></div>
    <div class="lcd">
      <div class="lcd-ind"><span id="indS">S</span><span id="indH">hyp</span><span id="indM">M</span><span style="flex:1"></span><span id="indMode">DEG</span></div>
      <input class="lcd-in" id="calcIn" autocomplete="off" spellcheck="false" inputmode="none" aria-label="Rechnung">
      <div class="lcd-out" id="calcOut">0</div>
    </div>
    <div class="ck-grid f">${FKEYS.map((k,i)=>keyHtml(k,i,"f")).join("")}</div>
    <div class="ck-grid n">${NKEYS.map((k,i)=>keyHtml(k,i,"n")).join("")}</div>
    <div class="calc-foot"><div class="calc-hist" id="calcHist"></div><button class="btn pri" data-ins>Ins Blatt übernehmen</button></div>`;
  document.body.appendChild(el);
  const inp=el.querySelector("#calcIn");
  if(matchMedia("(pointer:fine)").matches)inp.removeAttribute("inputmode");
  el.querySelector("[data-close]").onclick=()=>toggle(false);
  el.addEventListener("pointerdown",e=>{if(e.target.closest(".ck"))e.preventDefault();});
  el.addEventListener("click",e=>{const b=e.target.closest(".ck");if(b)press((b.dataset.g==="f"?FKEYS:NKEYS)[+b.dataset.i]);});
  inp.addEventListener("input",()=>{last=null;frac=false;show();});
  inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();equals();}if(e.key==="Escape")toggle(false);});
  el.querySelector("[data-ins]").onclick=()=>{
    if(!last)equals();if(!last||last.error)return;
    if(window.NotizApp)window.NotizApp.insertCalc(last.expr,frac&&last.fraction?last.fraction:last.text);
  };
  el.querySelector("#calcHist").addEventListener("click",e=>{const h=e.target.closest("[data-h]");if(h){inp.value=hist[+h.dataset.h].expr;last=null;show();}});
  const head=el.querySelector(".calc-head");
  head.addEventListener("pointerdown",e=>{
    if(e.target.closest("button"))return;e.preventDefault();head.setPointerCapture(e.pointerId);
    const r=el.getBoundingClientRect(),x0=e.clientX-r.left,y0=e.clientY-r.top;
    const mv=ev=>{el.style.left=Math.max(0,Math.min(innerWidth-r.width,ev.clientX-x0))+"px";el.style.top=Math.max(0,Math.min(innerHeight-60,ev.clientY-y0))+"px";el.style.right="auto";el.style.bottom="auto";};
    const up=()=>{head.removeEventListener("pointermove",mv);head.removeEventListener("pointerup",up);};
    head.addEventListener("pointermove",mv);head.addEventListener("pointerup",up);
  });
  indicators();
}
function press(k){
  const inp=el.querySelector("#calcIn");
  let v=shift&&k[3]?k[3]:k[1];
  if(v==="SHIFT"){shift=!shift;indicators();return;}
  if(shift&&!k[3]&&k[1]!=="MODE"){shift=false;}
  if(v==="hyp"){hyp=!hyp;indicators();return;}
  if(v==="MODE"){mode=MODES[(MODES.indexOf(mode)+1)%3];persist();indicators();last=null;show();return;}
  if(v==="SD"){if(last&&!last.error&&last.fraction){frac=!frac;show();}return;}
  if(v==="AC"){inp.value="";last=null;frac=false;resetShift();show();return;}
  if(v==="DEL"){delAt(inp);last=null;show();return;}
  if(v==="="){equals();resetShift();return;}
  if(v==="STO"){if(!last)equals();if(last&&!last.error){mem=last.value;persist();flash("→ M");}resetShift();return;}
  if(v==="MC"){mem=0;persist();flash("M gelöscht");resetShift();return;}
  if(v==="M+"||v==="M-"){if(!last)equals();if(last&&!last.error){mem+=v==="M+"?last.value:-last.value;persist();flash("M = "+fmt(mem));}resetShift();return;}
  if(hyp&&/^(a?)(sin|cos|tan)\($/.test(v)){v=v.replace(/^a?(sin|cos|tan)/,"$1h");hyp=false;}
  // nach "=" mit Operator weiterrechnen
  if(last&&!last.error&&/^[+×÷^²³!%−]|^⁻¹|^nCr|^nPr|^ˣ√/.test(v)){inp.value="Ans";inp.setSelectionRange(3,3);}
  else if(last){inp.value="";}
  last=null;frac=false;
  insertAt(inp,v);resetShift();show();
}
function resetShift(){if(shift||hyp){shift=false;hyp=false;indicators();}}
function indicators(){
  el.querySelector("#indS").classList.toggle("on",shift);
  el.querySelector("#indH").classList.toggle("on",hyp);
  el.querySelector("#indM").classList.toggle("on",mem!==0);
  el.querySelector("#indMode").textContent=mode;
  el.classList.toggle("shifted",shift);
}
function flash(t){const o=el.querySelector("#calcOut");o.textContent=t;setTimeout(()=>show(),900);}
function insertAt(inp,v){const a=inp.selectionStart??inp.value.length,b=inp.selectionEnd??inp.value.length;inp.value=inp.value.slice(0,a)+v+inp.value.slice(b);const c=a+v.length;inp.setSelectionRange(c,c);}
function delAt(inp){let a=inp.selectionStart??inp.value.length,b=inp.selectionEnd??inp.value.length;if(a===b&&a>0)a--;inp.value=inp.value.slice(0,a)+inp.value.slice(b);inp.setSelectionRange(a,a);}
function compute(expr){
  try{const v=evaluate(expr,{mode,ans,mem});return {expr,value:v,text:fmt(v),fraction:toFraction(v)};}
  catch(e){return {expr,error:e.message};}
}
function show(){
  const o=el.querySelector("#calcOut");o.classList.remove("err","pre");
  if(last){if(last.error){o.textContent=last.error;o.classList.add("err");}else o.textContent=frac&&last.fraction?last.fraction:last.text;return;}
  const expr=el.querySelector("#calcIn").value.trim();
  if(!expr){o.textContent="0";return;}
  const r=compute(expr);o.classList.add("pre");o.textContent=r.error?"":r.text;
}
function equals(){
  const expr=el.querySelector("#calcIn").value.trim();if(!expr)return;
  last=compute(expr);
  if(!last.error){
    ans=last.value;persist();
    // Brüche bei reinen Bruchrechnungen gleich als Bruch zeigen
    frac=!!last.fraction&&/\//.test(expr)&&!/[a-zπ√∛^.,E]/i.test(expr.replace(/Ans/g,""));
    hist.unshift({expr,text:last.text});hist=hist.slice(0,6);
    el.querySelector("#calcHist").innerHTML=hist.map((h,i)=>`<button data-h="${i}" title="Wieder verwenden">${h.expr.replace(/[<>&]/g,"")} = ${h.text}</button>`).join("");
  }
  show();
}
function toggle(showIt){
  if(!el)build();
  el.hidden=showIt===undefined?!el.hidden:!showIt;
  if(!el.hidden&&matchMedia("(pointer:fine)").matches)el.querySelector("#calcIn").focus();
  const btn=document.getElementById("calcBtn");if(btn)btn.classList.toggle("on",!el.hidden);
}
window.Calc.toggle=toggle;
})();
