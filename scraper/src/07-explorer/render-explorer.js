/** Item Explorer — pagina Artifact autonoma (client-side) sui dati del dump. */
export function renderExplorer(data) {
  const strip = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029\\uFFFD]', 'g');
  const enc = (obj) => JSON.stringify(obj)
    .replace(strip, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1')
    .replace(/</g, '\\u003c');
  const payload = enc(data);
  const gen = new Date(data.generatedAt).toLocaleString('it-IT');

  return `<style>
  :root{
    --bg:#e9e3d6; --surface:#f5f0e6; --surface2:#efe8d9; --ink:#211d15; --muted:#6c6353;
    --line:#d6ccb8; --accent:#8a6110; --accent-soft:#b98a2a;
    --add:#3a7d44; --remove:#a5322f; --cyan:#2f6d7a; --panel:#efe9dc;
    --alb:#b1483f; --mid:#456fa8; --hib:#3f8f57;
    --shadow:0 1px 2px rgba(30,24,12,.06),0 4px 14px rgba(30,24,12,.05);
  }
  @media (prefers-color-scheme:dark){:root{
    --bg:#14110c; --surface:#1d1912; --surface2:#241f16; --ink:#ece4d4; --muted:#988e7c;
    --line:#332c21; --accent:#d7a441; --accent-soft:#b98a2a; --add:#77c288; --remove:#df8078;
    --cyan:#6fb3c2; --panel:#181410; --alb:#d47a71; --mid:#7ea3d6; --hib:#6bbd81;
    --shadow:0 1px 2px rgba(0,0,0,.3),0 6px 18px rgba(0,0,0,.28);
  }}
  :root[data-theme="light"]{--bg:#e9e3d6;--surface:#f5f0e6;--surface2:#efe8d9;--ink:#211d15;--muted:#6c6353;--line:#d6ccb8;--accent:#8a6110;--accent-soft:#b98a2a;--add:#3a7d44;--remove:#a5322f;--cyan:#2f6d7a;--panel:#efe9dc;--alb:#b1483f;--mid:#456fa8;--hib:#3f8f57;--shadow:0 1px 2px rgba(30,24,12,.06),0 4px 14px rgba(30,24,12,.05);}
  :root[data-theme="dark"]{--bg:#14110c;--surface:#1d1912;--surface2:#241f16;--ink:#ece4d4;--muted:#988e7c;--line:#332c21;--accent:#d7a441;--accent-soft:#b98a2a;--add:#77c288;--remove:#df8078;--cyan:#6fb3c2;--panel:#181410;--alb:#d47a71;--mid:#7ea3d6;--hib:#6bbd81;--shadow:0 1px 2px rgba(0,0,0,.3),0 6px 18px rgba(0,0,0,.28);}

  *{box-sizing:border-box}
  .app{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;padding:0 0 4rem;line-height:1.5;-webkit-font-smoothing:antialiased;}
  .serif{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;}
  .mono{font-family:ui-monospace,"SF Mono",Consolas,monospace;}
  header.top{position:sticky;top:0;z-index:20;background:var(--surface);border-bottom:1px solid var(--line);box-shadow:var(--shadow);padding:1rem clamp(1rem,4vw,2.5rem) .85rem;}
  h1{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-size:1.4rem;font-weight:600;margin:0;}
  h1 .mk{color:var(--accent);}
  .sub{color:var(--muted);font-size:.8rem;margin:.2rem 0 0;}
  .controls{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-top:.85rem;}
  .search{flex:1 1 260px;min-width:200px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:.55rem .75rem;font-size:.95rem;}
  .search:focus{outline:2px solid var(--accent-soft);border-color:var(--accent-soft);}
  .lvl{width:130px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:.55rem .6rem;font-size:.85rem;}
  .chips{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.6rem;}
  .chip{background:var(--surface2);color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:.28rem .7rem;font-size:.76rem;cursor:pointer;}
  .chip[aria-pressed="true"]{background:var(--accent);color:#fff;border-color:var(--accent);}
  :root[data-theme="dark"] .chip[aria-pressed="true"]{color:#1a150c;}
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .chip[aria-pressed="true"]{color:#1a150c;}}
  main{max-width:1080px;margin:0 auto;padding:1rem clamp(1rem,4vw,2.5rem) 0;}
  .count{color:var(--muted);font-size:.82rem;margin:.2rem 0 .8rem;}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:11px;box-shadow:var(--shadow);margin-bottom:.6rem;overflow:hidden;}
  .row{display:flex;align-items:center;gap:.6rem;padding:.6rem .85rem;cursor:pointer;flex-wrap:wrap;}
  .row:hover{background:var(--surface2);}
  .row .nm{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-size:1.02rem;font-weight:600;flex:1 1 auto;min-width:160px;}
  .row .meta{color:var(--muted);font-size:.76rem;display:flex;gap:.55rem;flex-wrap:wrap;align-items:center;}
  .realm{font-weight:600;} .realm.Albion{color:var(--alb);} .realm.Midgard{color:var(--mid);} .realm.Hibernia{color:var(--hib);}
  .cpy{background:none;border:1px solid var(--line);border-radius:6px;color:var(--accent);font-size:.72rem;font-family:ui-monospace,monospace;padding:.25rem .55rem;cursor:pointer;white-space:nowrap;}
  .cpy:hover{border-color:var(--accent-soft);}
  .detail{border-top:1px solid var(--line);padding:.8rem .9rem;background:var(--panel);}
  .sec{margin:.7rem 0 0;} .sec:first-child{margin-top:0;}
  .sec h4{margin:0 0 .35rem;font-size:.68rem;text-transform:uppercase;letter-spacing:.07em;color:var(--accent);font-weight:700;}
  .grid{display:flex;flex-wrap:wrap;gap:.25rem .9rem;}
  .kv{font-size:.82rem;} .kv b{color:var(--muted);font-weight:600;font-size:.66rem;text-transform:uppercase;letter-spacing:.04em;margin-right:.3rem;}
  .kv span{font-family:ui-monospace,monospace;}
  .bon{display:inline-block;font-size:.8rem;background:var(--surface);border:1px solid var(--line);border-radius:5px;padding:.05rem .4rem;margin:.1rem .2rem .1rem 0;}
  .bon b{color:var(--accent);font-family:ui-monospace,monospace;}
  .proc{font-size:.82rem;color:var(--accent);}
  table.t{width:100%;border-collapse:collapse;font-size:.8rem;}
  table.t th{text-align:left;font-size:.64rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600;border-bottom:1px solid var(--line);padding:.25rem .4rem;}
  table.t td{padding:.25rem .4rem;border-bottom:1px solid rgba(0,0,0,.06);vertical-align:top;}
  :root[data-theme="dark"] table.t td{border-bottom-color:rgba(255,255,255,.05);}
  .num{text-align:right;font-family:ui-monospace,monospace;}
  .empty{color:var(--muted);font-style:italic;font-size:.8rem;}
  .tree{font-size:.82rem;line-height:1.7;}
  .tree .node{white-space:pre;font-family:ui-monospace,monospace;}
  .tree .nname{font-family:system-ui,sans-serif;font-weight:600;}
  .src-d{color:var(--cyan);} .src-m{color:var(--accent);} .src-c{color:var(--add);}
  .more{display:block;margin:1rem auto 0;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:.55rem 1.2rem;font-size:.88rem;cursor:pointer;}
  :root[data-theme="dark"] .more{color:#1a150c;}
  .foot{text-align:center;color:var(--muted);font-size:.72rem;margin-top:2rem;}
  .toast{position:fixed;bottom:1.1rem;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:.5rem 1rem;border-radius:8px;font-size:.8rem;box-shadow:var(--shadow);opacity:0;transition:opacity .2s;z-index:50;}
  .toast.show{opacity:1;}
</style>

<div class="app">
  <header class="top">
    <h1><span class="mk">Item Explorer</span> — Ardred</h1>
    <p class="sub">Ricerca item nel DB: nome, slot, livello. Profilo completo, drop, mercanti, ricette, comando GM.</p>
    <div class="controls">
      <input class="search" id="q" type="search" placeholder="Cerca per nome o Id_nb… (es. arcanium, director's ring)" aria-label="Cerca">
      <input class="lvl" id="lvl" type="number" min="0" placeholder="livello min" aria-label="Livello minimo">
    </div>
    <div class="chips" id="slots" role="group" aria-label="Filtra per slot"></div>
  </header>
  <main>
    <div class="count" id="count"></div>
    <div id="list"></div>
    <button class="more" id="more" hidden>Mostra altri</button>
    <p class="foot">Generato dal dump il ${gen} · snapshot statico · il comando GM va copiato ed eseguito in gioco</p>
  </main>
</div>

<script>
  const DATA = JSON.parse(${JSON.stringify(payload)});
  const IT = DATA.items, PROP = DATA.PROP, OT = DATA.OBJECT_TYPE;
  const REALM = {0:'Tutti',1:'Albion',2:'Midgard',3:'Hibernia'};
  const CRAFT_SKILL = {1:'Weaponcraft',2:'Armorcraft',3:'Siegecraft',4:'Alchemy',6:'Fletching',8:'Spellcraft',11:'Tailoring',12:'Metalworking',13:'Leatherworking',14:'Clothworking',15:'Gemcutting',16:'Herbcraft'};
  const SLOT_FLAGS = {head:[21],chest:[25],legs:[27],arms:[28],hands:[22],boots:[23],cloak:[26],neck:[29],belt:[32],wrist:[33,34],ring:[35,36],jewel:[24],mythical:[37],'2h':[12],mainhand:[10],offhand:[11],ranged:[13]};

  const norm = s => String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,'');
  const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const propName = c => PROP[c] || ('prop#'+c);
  const otName = c => OT[c] || ('type#'+c);
  const gmCreate = id => '/item create ' + (/\\s/.test(id) ? '"'+id+'"' : id);

  // --- indici ---
  const byNormId = new Map(); IT.forEach((it,idx)=>{ if(!byNormId.has(norm(it.i))) byNormId.set(norm(it.i), idx); });
  const idToIdx = new Map(); IT.forEach((it,idx)=>idToIdx.set(it.i, idx));
  const lootByItem = new Map(); // exact itemId -> [[tpl,chance,count]]
  for(const [tpl,item,ch,cnt] of DATA.loot){ if(!lootByItem.has(item)) lootByItem.set(item,[]); lootByItem.get(item).push([tpl,ch,cnt]); }
  const tplToMobs = new Map();
  for(const [mob,tpl] of DATA.mobx){ if(!tplToMobs.has(tpl)) tplToMobs.set(tpl,[]); tplToMobs.get(tpl).push(mob); }
  const merchByItem = new Map(); // itemIdx -> [listId]
  for(const [ii,li] of DATA.merchPairs){ if(!merchByItem.has(ii)) merchByItem.set(ii,[]); merchByItem.get(ii).push(DATA.listDict[li]); }
  const cxiByProduct = new Map(), cxiByIngr = new Map();
  for(const [prod,ing,cnt] of DATA.craft){
    const kp=norm(prod); if(!cxiByProduct.has(kp)) cxiByProduct.set(kp,[]); cxiByProduct.get(kp).push([ing,cnt]);
    const ki=norm(ing); if(!cxiByIngr.has(ki)) cxiByIngr.set(ki,[]); cxiByIngr.get(ki).push([prod,cnt]);
  }
  const recipeOf = idn => cxiByProduct.get(idn) || [];

  function dropMobCount(itemId){ let n=0; for(const [tpl] of (lootByItem.get(itemId)||[])) n += (tplToMobs.get(tpl)||[]).length; return n; }
  function merchCountNorm(idn){ const idx = byNormId.get(idn); if(idx==null) return 0; return (merchByItem.get(idx)||[]).length; }
  function dropCountNorm(idn){ const idx = byNormId.get(idn); if(idx==null) return 0; return dropMobCount(IT[idx].i); }

  // --- ramificazione ---
  function srcTag(idn){
    const d=dropCountNorm(idn), m=merchCountNorm(idn), r=recipeOf(idn).length, p=[];
    if(d) p.push('<span class="src-d">drop '+d+' mob</span>');
    if(m) p.push('<span class="src-m">vend. '+m+'</span>');
    if(r) p.push('<span class="src-c">craft '+r+' reag</span>');
    if(!p.length) return byNormId.has(idn)? '<span class="empty">nessuna fonte</span>' : '<span class="empty">materia prima</span>';
    return p.join(' · ');
  }
  function ramify(idn, depth, seen, prefix){
    const rec = recipeOf(idn); let out='';
    rec.forEach((r,i)=>{
      const [ing,cnt]=r, ingN=norm(ing), last=i===rec.length-1;
      const idx=byNormId.get(ingN); const nm = idx!=null? IT[idx].n : ing;
      out += '<div class="node">'+esc(prefix+(last?'└─ ':'├─ '))+'<span class="nname">'+cnt+'× '+esc(nm)+'</span>   '+srcTag(ingN)+'</div>';
      if(recipeOf(ingN).length && depth<5 && !seen.has(ingN)){ seen.add(ingN); out += ramify(ingN, depth+1, seen, prefix+(last?'    ':'│   ')); }
    });
    return out;
  }

  // --- copia GM ---
  function toast(m){ let t=document.querySelector('.toast'); if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);} t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); }
  function copyText(txt){ const ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.top='-9999px'; document.body.appendChild(ta); ta.select(); let ok=false; try{ok=document.execCommand('copy');}catch(e){} ta.remove(); return ok; }

  // --- dettaglio ---
  function detailHtml(it){
    const g=[];
    g.push('<span class="kv"><b>Livello</b><span>'+it.l+'</span></span>');
    if(it.q) g.push('<span class="kv"><b>Qualità</b><span>'+it.q+'%</span></span>');
    g.push('<span class="kv"><b>Reame</b><span>'+(REALM[it.rl]||it.rl)+'</span></span>');
    g.push('<span class="kv"><b>Tipo</b><span>'+esc(otName(it.ot))+'</span></span>');
    g.push('<span class="kv"><b>Slot</b><span>'+it.it+'</span></span>');
    if(it.d) g.push('<span class="kv"><b>DPS/AF</b><span>'+it.d+'</span></span>');
    if(it.s) g.push('<span class="kv"><b>SPD/ABS</b><span>'+it.s+'</span></span>');
    if(it.pr) g.push('<span class="kv"><b>Prezzo</b><span>'+it.pr+'</span></span>');
    g.push('<span class="kv"><b>Drop</b><span>'+(it.dr?'sì':'no')+'</span></span>');
    let h='<div class="sec"><h4>Cos\\u2019è</h4><div class="grid">'+g.join('')+'</div>';
    if(it.b&&it.b.length) h+='<div style="margin-top:.4rem">'+it.b.map(([t,v])=>'<span class="bon"><b>'+(v>0?'+':'')+v+'</b> '+esc(propName(t))+'</span>').join('')+'</div>';
    // spell
    const sp=[]; if(it.ps) sp.push(['Proc',it.ps]); if(it.sp) sp.push(['Use/Charge',it.sp]);
    if(sp.length){ h+='<div class="sec"><h4>Spell</h4>'+sp.map(([k,v])=>'<div class="proc">⚡ '+k+' #'+v+(DATA.spells[v]?' — '+esc(DATA.spells[v]):'')+'</div>').join('')+'</div>'; }
    h+='</div>';
    // droppato da
    const drops=[]; for(const [tpl,ch,cnt] of (lootByItem.get(it.i)||[])){ const mobs=tplToMobs.get(tpl)||['(nessun mob usa questo template)']; for(const mb of mobs) drops.push([mb,tpl,ch,cnt]); }
    h+='<div class="sec"><h4>Droppato da ('+drops.length+')</h4>'+(drops.length? tbl(['mob','template','chance','count'], drops.slice(0,40)) : '<div class="empty">nessuno</div>')+(drops.length>40?'<div class="empty">… e altri '+(drops.length-40)+'</div>':'')+'</div>';
    // venduto da
    const ms = merchByItem.get(idToIdx.get(it.i))||[];
    h+='<div class="sec"><h4>Venduto da ('+ms.length+')</h4>'+(ms.length? tbl(['lista mercante'], ms.slice(0,30).map(x=>[x])) : '<div class="empty">nessuno</div>')+(ms.length>30?'<div class="empty">… e altri '+(ms.length-30)+'</div>':'')+'</div>';
    // ingrediente in
    const asIng = cxiByIngr.get(norm(it.i))||[];
    h+='<div class="sec"><h4>Usato come ingrediente in ('+asIng.length+')</h4>'+(asIng.length? tbl(['ricetta','qta'], asIng.slice(0,30).map(([p,c])=>[p,c])) : '<div class="empty">nessuno</div>')+'</div>';
    // ricetta e ramificazione
    const rec = recipeOf(norm(it.i));
    h+='<div class="sec"><h4>Ricetta e ramificazione</h4>';
    if(!rec.length) h+='<div class="empty">Non craftabile: nessuna ricetta produce questo item.</div>';
    else{
      const meta = DATA.craftMeta[it.i] || Object.entries(DATA.craftMeta).find(([k])=>norm(k).replace(/\\d+$/,'')===norm(it.i).replace(/\\d+$/,''))?.[1];
      if(meta) h+='<div class="kv" style="margin-bottom:.3rem"><b>skill</b><span>'+(CRAFT_SKILL[meta[1]]||meta[1])+'</span>  <b>lvl</b><span>'+meta[0]+'</span></div>';
      h+='<div class="tree"><div class="node"><span class="nname">'+esc(it.n)+'</span> (prodotto)</div>'+ramify(norm(it.i),1,new Set([norm(it.i)]),'')+'</div>';
    }
    h+='</div>';
    // riferimenti
    const refs=[['itemtemplate',1]];
    const lc=(lootByItem.get(it.i)||[]).length; if(lc) refs.push(['loottemplate',lc]);
    if(ms.length) refs.push(['merchantitem',ms.length]);
    const cc=rec.length+asIng.length; if(cc) refs.push(['craftedxitem',cc]);
    h+='<div class="sec"><h4>Tabelle che citano questo Id_nb (modellate)</h4>'+tbl(['tabella','occorrenze'],refs)+'</div>';
    return '<div class="detail">'+h+'</div>';
  }
  function tbl(headers, rows){
    if(!rows.length) return '<div class="empty">(nessuno)</div>';
    let h='<table class="t"><thead><tr>'+headers.map((x,i)=>'<th'+(i>0&&i===headers.length-1&&headers.length>2?' class="num"':'')+'>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>';
    for(const r of rows) h+='<tr>'+r.map((c,i)=>'<td'+(typeof c==='number'?' class="num"':'')+'>'+esc(c)+'</td>').join('')+'</tr>';
    return h+'</tbody></table>';
  }

  // --- ricerca + render ---
  const q=document.getElementById('q'), lvlEl=document.getElementById('lvl'), listEl=document.getElementById('list'),
        countEl=document.getElementById('count'), moreBtn=document.getElementById('more'), slotsEl=document.getElementById('slots');
  const activeSlots=new Set();
  Object.keys(SLOT_FLAGS).forEach(name=>{ const b=document.createElement('button'); b.className='chip'; b.textContent=name; b.setAttribute('aria-pressed','false'); b.dataset.slot=name; slotsEl.appendChild(b); });
  slotsEl.addEventListener('click',e=>{ const b=e.target.closest('.chip'); if(!b) return; const on=b.getAttribute('aria-pressed')==='true'; b.setAttribute('aria-pressed', String(!on)); if(on) activeSlots.delete(b.dataset.slot); else activeSlots.add(b.dataset.slot); run(); });

  let filtered=[], shown=0; const PAGE=60;
  function search(){
    const query=q.value.trim(), qn=norm(query), minL=parseInt(lvlEl.value,10);
    const slotTypes=new Set(); activeSlots.forEach(s=>SLOT_FLAGS[s].forEach(t=>slotTypes.add(t)));
    let base;
    if(query){
      base=IT.filter(i=>norm(i.i)===qn||norm(i.n)===qn);
      if(!base.length) base=IT.filter(i=>norm(i.n).includes(qn)||norm(i.i).includes(qn));
      if(!base.length){ const terms=query.split(/\\s+/).map(norm).filter(Boolean); if(terms.length>1) base=IT.filter(i=>{const n=norm(i.n),d=norm(i.i);return terms.every(t=>n.includes(t)||d.includes(t));}); }
    } else base = slotTypes.size||!isNaN(minL) ? IT.slice() : [];
    if(slotTypes.size) base=base.filter(i=>slotTypes.has(i.it));
    if(!isNaN(minL)) base=base.filter(i=>i.l>=minL);
    return base;
  }
  function run(){ filtered=search(); shown=0; listEl.innerHTML=''; if(!filtered.length){ countEl.textContent = (q.value||activeSlots.size||lvlEl.value)?'Nessun item trovato.':'Digita un nome, o scegli uno slot / livello.'; moreBtn.hidden=true; return; } countEl.textContent=filtered.length+' item'; render(); }
  function render(){
    const next=filtered.slice(shown,shown+PAGE);
    const frag=document.createElement('div');
    frag.innerHTML=next.map(it=>{
      const rl=REALM[it.rl]||it.rl;
      return '<div class="card" data-id="'+esc(it.i)+'"><div class="row"><span class="nm">'+esc(it.n)+'</span>'+
        '<span class="meta"><span class="realm '+rl+'">'+rl+'</span><span>lv '+it.l+'</span><span class="mono">'+esc(it.i)+'</span></span>'+
        '<button class="cpy" data-cmd="'+esc(gmCreate(it.i))+'">copia /item create</button></div></div>';
    }).join('');
    while(frag.firstChild) listEl.appendChild(frag.firstChild);
    shown+=next.length; moreBtn.hidden=shown>=filtered.length;
    countEl.textContent=filtered.length+' item · mostrati '+shown;
  }
  listEl.addEventListener('click',e=>{
    const cpy=e.target.closest('.cpy');
    if(cpy){ e.stopPropagation(); toast(copyText(cpy.dataset.cmd)?'Copiato: '+cpy.dataset.cmd:'Copia non riuscita'); return; }
    const card=e.target.closest('.card'); if(!card) return;
    const open=card.querySelector('.detail');
    if(open){ open.remove(); return; }
    const it=IT[idToIdx.get(card.dataset.id)]; card.insertAdjacentHTML('beforeend', detailHtml(it));
  });
  moreBtn.addEventListener('click',render);
  q.addEventListener('input',run); lvlEl.addEventListener('input',run);
  run();
</script>`;
}
