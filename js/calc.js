/* Wissenschaftlicher Taschenrechner: eigener Rechenkern (kein eval), Grad/Bogenmaß, Ans, Verlauf. */
(function(){
"use strict";

/* ---------- Rechenkern ---------- */
const FUNCS={
  sin:(x,d)=>Math.sin(d?x*Math.PI/180:x), cos:(x,d)=>Math.cos(d?x*Math.PI/180:x), tan:(x,d)=>tanSafe(d?x*Math.PI/180:x,d?x:null),
  asin:(x,d)=>d?Math.asin(x)*180/Math.PI:Math.asin(x), acos:(x,d)=>d?Math.acos(x)*180/Math.PI:Math.acos(x), atan:(x,d)=>d?Math.atan(x)*180/Math.PI:Math.atan(x),
  sinh:Math.sinh, cosh:Math.cosh, tanh:Math.tanh,
  ln:Math.log, log:Math.log10, lg:Math.log10, ld:Math.log2, exp:Math.exp,
  sqrt:Math.sqrt, cbrt:Math.cbrt, abs:Math.abs
};
function tanSafe(r,deg){if(deg!==null&&Math.abs(((deg%180)+180)%180-90)<1e-12)return NaN;return Math.tan(r);}
const CONSTS={pi:Math.PI,"π":Math.PI,e:Math.E};
function fact(n){
  if(n<0||!Number.isInteger(n))return gamma(n+1);
  if(n>170)return Infinity;let r=1;for(let i=2;i<=n;i++)r*=i;return r;
}
function gamma(z){ // Lanczos-Näherung für nicht ganzzahlige Fakultäten
  if(z<0.5)return Math.PI/(Math.sin(Math.PI*z)*gamma(1-z));
  z-=1;const g=7,c=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61503916999185,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  let x=c[0];for(let i=1;i<g+2;i++)x+=c[i]/(z+i);const t=z+g+0.5;
  return Math.sqrt(2*Math.PI)*Math.pow(t,z+0.5)*Math.exp(-t)*x;
}
function tokenize(src){
  const s=src.replace(/×|·/g,"*").replace(/÷|:/g,"/").replace(/−/g,"-").replace(/²/g,"^2").replace(/³/g,"^3").replace(/√/g,"sqrt").replace(/∛/g,"cbrt");
  const out=[];let i=0;
  while(i<s.length){
    const ch=s[i];
    if(/\s/.test(ch)){i++;continue;}
    const num=/^(\d+(?:[.,]\d*)?|[.,]\d+)(?:E[+-]?\d+)?/.exec(s.slice(i));
    if(num){out.push({t:"num",v:parseFloat(num[0].replace(",","."))});i+=num[0].length;continue;}
    const id=/^(asin|acos|atan|sinh|cosh|tanh|sin|cos|tan|ln|log|lg|ld|exp|sqrt|cbrt|abs|ans|pi|π|e)/i.exec(s.slice(i));
    if(id){out.push({t:"id",v:id[0].toLowerCase()});i+=id[0].length;continue;}
    if("+-*/^()!%".includes(ch)){out.push({t:"op",v:ch});i++;continue;}
    throw new Error("Unbekanntes Zeichen „"+ch+"“");
  }
  return out;
}
function evaluate(src,opt){
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
      else if(startsPrimary()){v*=power();} // 2π, 3(4+1), 2sin(30)
      else return v;
    }
  }
  function unary(){if(isOp("-")){take();return -unary();}if(isOp("+")){take();return unary();}return power();}
  function power(){const b=postfix();if(isOp("^")){take();return Math.pow(b,unary());}return b;}
  function postfix(){let v=primary();for(;;){if(isOp("!")){take();v=fact(v);}else if(isOp("%")){take();v/=100;}else return v;}}
  function primary(){
    const x=take();if(!x)throw new Error("Ausdruck unvollständig");
    if(x.t==="num")return x.v;
    if(x.t==="op"&&x.v==="("){const v=expr();if(isOp(")"))take();return v;} // fehlende Klammer am Ende ist erlaubt
    if(x.t==="id"){
      if(x.v==="ans")return opt.ans||0;
      if(x.v in CONSTS)return CONSTS[x.v];
      const f=FUNCS[x.v];
      const arg=isOp("(")?primary():power();
      return f(arg,opt.deg);
    }
    throw new Error("Unerwartetes „"+x.v+"“");
  }
  const v=expr();
  if(p<tk.length)throw new Error("Unerwartetes „"+tk[p].v+"“");
  return v;
}
function fmt(v){
  if(!isFinite(v))return isNaN(v)?"nicht definiert":(v>0?"∞":"−∞");
  if(Math.abs(v)<1e-15)v=0;
  let s;
  if(v!==0&&(Math.abs(v)>=1e12||Math.abs(v)<1e-6)){s=v.toExponential(9).replace(/\.?0+e/,"e");const [m,e]=s.split("e");s=m+" · 10^"+(+e);}
  else s=String(parseFloat(v.toPrecision(12)));
  return s.replace(".",",").replace("-","−");
}
window.Calc={evaluate,fmt};

/* ---------- Oberfläche ---------- */
const KEYS=[
  ["2nd","2nd","fn"],["π","π"],["e","e"],["(","("],[")",")"],
  ["sin","sin(",null,"sin⁻¹","asin("],["cos","cos(",null,"cos⁻¹","acos("],["tan","tan(",null,"tan⁻¹","atan("],["ln","ln(",null,"eˣ","exp("],["log","log(",null,"10ˣ","10^"],
  ["x²","^2",null,"x³","^3"],["xʸ","^"],["√","sqrt(",null,"∛","cbrt("],["1/x","^(-1)",null,"|x|","abs("],["n!","!"],
  ["7","7","n"],["8","8","n"],["9","9","n"],["÷","÷"],["AC","AC","clr"],
  ["4","4","n"],["5","5","n"],["6","6","n"],["×","×"],["⌫","DEL"],
  ["1","1","n"],["2","2","n"],["3","3","n"],["−","−"],["Ans","Ans"],
  ["0","0","n"],[",",",","n"],["·10ˣ","E"],["+","+"],["=","=","eq"]
];
let deg=true,second=false,ans=0,hist=[],el=null;
function build(){
  el=document.createElement("div");el.className="calc";el.hidden=true;
  el.innerHTML=`<div class="calc-head"><b>Taschenrechner</b><button class="calc-mode" data-mode title="Winkelmaß umschalten">DEG</button><button class="iconbtn" data-close aria-label="Taschenrechner schließen">✕</button></div>
    <input class="calc-in" id="calcIn" autocomplete="off" spellcheck="false" inputmode="none" aria-label="Rechnung" placeholder="z. B. 2·sin(30)+√16">
    <div class="calc-out" id="calcOut">&nbsp;</div>
    <div class="calc-keys">${KEYS.map((k,i)=>`<button data-k="${i}" class="${k[2]||""}">${k[0]}</button>`).join("")}</div>
    <div class="calc-foot"><div class="calc-hist" id="calcHist"></div><button class="btn pri" data-ins>Ins Blatt übernehmen</button></div>`;
  document.body.appendChild(el);
  const inp=el.querySelector("#calcIn");
  if(matchMedia("(pointer:fine)").matches)inp.removeAttribute("inputmode");
  el.querySelector("[data-close]").onclick=()=>toggle(false);
  el.querySelector("[data-mode]").onclick=e=>{deg=!deg;e.currentTarget.textContent=deg?"DEG":"RAD";preview();};
  el.querySelector(".calc-keys").addEventListener("pointerdown",e=>{if(e.target.closest("button"))e.preventDefault();});
  el.querySelector(".calc-keys").addEventListener("click",e=>{
    const b=e.target.closest("[data-k]");if(!b)return;const k=KEYS[+b.dataset.k];
    let v=second&&k[4]?k[4]:k[1];
    if(v==="2nd"){second=!second;relabel();return;}
    if(v==="AC"){inp.value="";preview();return;}
    if(v==="DEL"){delAt(inp);preview();return;}
    if(v==="="){calc();return;}
    if(second){second=false;relabel();}
    insertAt(inp,v);preview();
  });
  inp.addEventListener("input",preview);
  inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();calc();}if(e.key==="Escape")toggle(false);});
  el.querySelector("[data-ins]").onclick=()=>{
    const r=current();if(!r)return;
    if(window.NotizApp)window.NotizApp.insertCalc(r.expr,r.text);
  };
  el.querySelector("#calcHist").addEventListener("click",e=>{const h=e.target.closest("[data-h]");if(h){inp.value=hist[+h.dataset.h].expr;preview();}});
  // Fenster verschieben
  const head=el.querySelector(".calc-head");
  head.addEventListener("pointerdown",e=>{
    if(e.target.closest("button"))return;e.preventDefault();head.setPointerCapture(e.pointerId);
    const r=el.getBoundingClientRect(),x0=e.clientX-r.left,y0=e.clientY-r.top;
    const mv=ev=>{el.style.left=Math.max(0,Math.min(innerWidth-r.width,ev.clientX-x0))+"px";el.style.top=Math.max(0,Math.min(innerHeight-60,ev.clientY-y0))+"px";el.style.right="auto";el.style.bottom="auto";};
    const up=()=>{head.removeEventListener("pointermove",mv);head.removeEventListener("pointerup",up);};
    head.addEventListener("pointermove",mv);head.addEventListener("pointerup",up);
  });
}
function relabel(){el.querySelectorAll("[data-k]").forEach(b=>{const k=KEYS[+b.dataset.k];b.textContent=second&&k[3]?k[3]:k[0];if(k[1]==="2nd")b.classList.toggle("on",second);});}
function insertAt(inp,v){const a=inp.selectionStart??inp.value.length,b=inp.selectionEnd??inp.value.length;inp.value=inp.value.slice(0,a)+v+inp.value.slice(b);const c=a+v.length;inp.setSelectionRange(c,c);}
function delAt(inp){let a=inp.selectionStart??inp.value.length,b=inp.selectionEnd??inp.value.length;if(a===b&&a>0)a--;inp.value=inp.value.slice(0,a)+inp.value.slice(b);inp.setSelectionRange(a,a);}
function current(){
  const expr=el.querySelector("#calcIn").value.trim();if(!expr)return null;
  try{const v=evaluate(expr,{deg,ans});return {expr,value:v,text:fmt(v)};}catch(e){return {expr,error:e.message};}
}
function preview(){const r=current();const o=el.querySelector("#calcOut");o.classList.remove("err");o.innerHTML=r?(r.error?"…":"= "+r.text):"&nbsp;";}
function calc(){
  const r=current();const o=el.querySelector("#calcOut");if(!r)return;
  if(r.error){o.textContent=r.error;o.classList.add("err");return;}
  ans=r.value;hist.unshift({expr:r.expr,text:r.text});hist=hist.slice(0,6);
  el.querySelector("#calcHist").innerHTML=hist.map((h,i)=>`<button data-h="${i}" title="Wieder verwenden">${h.expr.replace(/[<>&]/g,"")} = ${h.text}</button>`).join("");
  o.textContent="= "+r.text;
}
function toggle(show){
  if(!el)build();
  el.hidden=show===undefined?!el.hidden:!show;
  if(!el.hidden&&matchMedia("(pointer:fine)").matches)el.querySelector("#calcIn").focus();
  const btn=document.getElementById("calcBtn");if(btn)btn.classList.toggle("on",!el.hidden);
}
window.Calc.toggle=toggle;
})();
