/* Kleiner Schlüssel-Wert-Speicher auf Basis von IndexedDB (mit Ersatz im Arbeitsspeicher). */
(function(){
  const mem=new Map();let db=null;
  function tx(mode){return db.transaction("kv",mode).objectStore("kv");}
  function wrap(req){return new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});}
  window.DB={
    persistent:false,
    async open(){
      try{
        db=await new Promise((res,rej)=>{const r=indexedDB.open("notizbuch",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
        this.persistent=true;
        if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
      }catch(e){db=null;}
    },
    async get(k){if(!db)return mem.get(k);return wrap(tx("readonly").get(k));},
    async set(k,v){if(!db){mem.set(k,v);return;}return wrap(tx("readwrite").put(v,k));},
    async del(k){if(!db){mem.delete(k);return;}return wrap(tx("readwrite").delete(k));},
    async all(prefix){
      if(!db)return [...mem.entries()].filter(([k])=>k.startsWith(prefix));
      const keys=await wrap(tx("readonly").getAllKeys());const out=[];
      for(const k of keys)if(String(k).startsWith(prefix))out.push([k,await this.get(k)]);
      return out;
    }
  };
})();
