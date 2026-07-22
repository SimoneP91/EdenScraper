/**
 * Genera il contenuto HTML del diff report (senza doctype/html/head/body:
 * viene incapsulato al momento della pubblicazione come Artifact).
 */
export function renderHtml({ rows, dict, stats, meta }) {
  const strip = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029\\uFFFD]', 'g');
  const enc = (obj) =>
    JSON.stringify(obj)
      .replace(strip, '')
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
      .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1')
      .replace(/</g, '\\u003c');
  const dataRows = enc(rows);
  const dataDict = enc(dict);
  const s = stats;
  const gen = new Date(meta.generatedAt).toLocaleString('it-IT');

  return `<style>
  :root {
    --bg:#e9e3d6; --surface:#f5f0e6; --surface2:#efe8d9; --ink:#211d15; --muted:#6c6353;
    --line:#d6ccb8; --accent:#8a6110; --accent-soft:#b98a2a;
    --add:#3a7d44; --add-bg:#e0ead9; --add-line:#bcd3b0;
    --remove:#a5322f; --remove-bg:#f1ddd9; --remove-line:#e2b6b0;
    --legacy:#8a6a1e; --legacy-bg:#efe6cf; --panel:#efe9dc;
    --alb:#b1483f; --mid:#456fa8; --hib:#3f8f57;
    --shadow:0 1px 2px rgba(30,24,12,.06),0 4px 14px rgba(30,24,12,.05);
  }
  @media (prefers-color-scheme:dark){
    :root{
      --bg:#14110c; --surface:#1d1912; --surface2:#241f16; --ink:#ece4d4; --muted:#988e7c;
      --line:#332c21; --accent:#d7a441; --accent-soft:#b98a2a;
      --add:#77c288; --add-bg:#1b2a1d; --add-line:#2f4a34;
      --remove:#df8078; --remove-bg:#2c1b19; --remove-line:#4a2f2b;
      --legacy:#d7b25a; --legacy-bg:#2a2413; --panel:#181410;
      --alb:#d47a71; --mid:#7ea3d6; --hib:#6bbd81;
      --shadow:0 1px 2px rgba(0,0,0,.3),0 6px 18px rgba(0,0,0,.28);
    }
  }
  :root[data-theme="light"]{
    --bg:#e9e3d6; --surface:#f5f0e6; --surface2:#efe8d9; --ink:#211d15; --muted:#6c6353;
    --line:#d6ccb8; --accent:#8a6110; --accent-soft:#b98a2a;
    --add:#3a7d44; --add-bg:#e0ead9; --remove:#a5322f; --remove-bg:#f1ddd9;
    --legacy:#8a6a1e; --legacy-bg:#efe6cf; --panel:#efe9dc; --alb:#b1483f; --mid:#456fa8; --hib:#3f8f57;
    --shadow:0 1px 2px rgba(30,24,12,.06),0 4px 14px rgba(30,24,12,.05);
  }
  :root[data-theme="dark"]{
    --bg:#14110c; --surface:#1d1912; --surface2:#241f16; --ink:#ece4d4; --muted:#988e7c;
    --line:#332c21; --accent:#d7a441; --accent-soft:#b98a2a;
    --add:#77c288; --add-bg:#1b2a1d; --remove:#df8078; --remove-bg:#2c1b19;
    --legacy:#d7b25a; --legacy-bg:#2a2413; --panel:#181410; --alb:#d47a71; --mid:#7ea3d6; --hib:#6bbd81;
    --shadow:0 1px 2px rgba(0,0,0,.3),0 6px 18px rgba(0,0,0,.28);
  }

  *{box-sizing:border-box}
  .wrap{
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    background:var(--bg); color:var(--ink); min-height:100vh; padding:0 0 4rem; line-height:1.5;
    -webkit-font-smoothing:antialiased;
  }
  header.top{
    position:sticky; top:0; z-index:20; background:var(--surface);
    border-bottom:1px solid var(--line); box-shadow:var(--shadow);
    padding:1.1rem clamp(1rem,4vw,2.5rem) 0.9rem;
  }
  .title{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif; font-size:1.5rem; font-weight:600;
    letter-spacing:.01em; margin:0; text-wrap:balance;}
  .title .mk{color:var(--accent);}
  .sub{color:var(--muted); font-size:.85rem; margin:.25rem 0 0; max-width:66ch;}
  .hint{color:var(--muted); font-size:.78rem; margin:.35rem 0 0;}
  .hint b{color:var(--accent);}

  .tiles{display:flex; flex-wrap:wrap; gap:.6rem; margin-top:.9rem;}
  .tile{background:var(--surface2); border:1px solid var(--line); border-radius:10px; padding:.55rem .8rem; min-width:104px; flex:0 0 auto;}
  .tile .n{font-family:ui-monospace,Consolas,monospace; font-size:1.35rem; font-weight:600; font-variant-numeric:tabular-nums; line-height:1.1;}
  .tile .l{font-size:.68rem; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin-top:.15rem;}
  .tile.add .n{color:var(--add);} .tile.rem .n{color:var(--remove);} .tile.accent .n{color:var(--accent);}

  .controls{display:flex; flex-wrap:wrap; gap:.55rem; align-items:center; margin-top:1rem;}
  .search{flex:1 1 240px; min-width:200px; background:var(--bg); color:var(--ink);
    border:1px solid var(--line); border-radius:8px; padding:.5rem .7rem; font-size:.9rem;}
  .search:focus{outline:2px solid var(--accent-soft); outline-offset:1px; border-color:var(--accent-soft);}
  .zonesel{flex:0 1 230px; min-width:150px; background:var(--bg); color:var(--ink); border:1px solid var(--line);
    border-radius:8px; padding:.5rem .5rem; font-size:.85rem; cursor:pointer;}
  .zonesel:focus{outline:2px solid var(--accent-soft); outline-offset:1px; border-color:var(--accent-soft);}
  .seg{display:flex; border:1px solid var(--line); border-radius:8px; overflow:hidden;}
  .seg button{background:var(--surface2); color:var(--muted); border:0; padding:.5rem .8rem; font-size:.82rem; cursor:pointer; border-right:1px solid var(--line);}
  .seg button:last-child{border-right:0;}
  .seg button:focus-visible{outline:2px solid var(--accent-soft); outline-offset:-2px;}
  .seg button[aria-pressed="true"]{background:var(--accent); color:#fff;}
  :root[data-theme="dark"] .seg button[aria-pressed="true"]{color:#1a150c;}
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .seg button[aria-pressed="true"]{color:#1a150c;}}

  main{padding:1.2rem clamp(1rem,4vw,2.5rem) 0; max-width:1180px; margin:0 auto;}
  .count-line{color:var(--muted); font-size:.82rem; margin:.2rem 0 1rem;}

  .card{background:var(--surface); border:1px solid var(--line); border-radius:12px; box-shadow:var(--shadow); margin-bottom:.85rem; overflow:hidden;}
  .card-head{display:flex; flex-wrap:wrap; align-items:baseline; gap:.5rem .7rem; padding:.75rem .95rem; border-bottom:1px solid var(--line); background:var(--surface2);}
  .mob-name{font-family:"Iowan Old Style",Palatino,Georgia,serif; font-size:1.08rem; font-weight:600;}
  .badge{font-size:.66rem; text-transform:uppercase; letter-spacing:.05em; padding:.16rem .5rem; border-radius:999px; font-weight:600;}
  .badge.new{background:var(--add-bg); color:var(--add); border:1px solid var(--add);}
  .badge.modified{background:var(--remove-bg); color:var(--remove); border:1px solid var(--remove);}
  .badge.confirmed{background:var(--surface2); color:var(--muted); border:1px solid var(--line);}
  .meta{color:var(--muted); font-size:.76rem; display:flex; gap:.6rem; flex-wrap:wrap; margin-left:auto;}
  .realm{font-weight:600;}
  .realm.Alb{color:var(--alb);} .realm.Mid{color:var(--mid);} .realm.Hib{color:var(--hib);}
  .src{font-family:ui-monospace,monospace; font-size:.7rem; border:1px solid var(--line); border-radius:5px; padding:0 .3rem; color:var(--muted);}
  .cat{font-size:.63rem; border-radius:5px; padding:.04rem .35rem; border:1px solid var(--line); color:var(--muted); background:var(--surface);}
  .cat.mk{color:var(--accent); border-color:var(--accent-soft);}

  .legend{margin-top:.85rem; border:1px solid var(--line); border-radius:9px; background:var(--surface2); padding:.2rem .7rem;}
  .legend summary{font-size:.8rem; font-weight:600; cursor:pointer; padding:.4rem 0; color:var(--accent); user-select:none;}
  .legend .lg-body{display:flex; flex-wrap:wrap; gap:.5rem 1.4rem; padding:.3rem 0 .7rem; font-size:.8rem;}
  .legend .lg-col{display:flex; flex-direction:column; gap:.28rem; min-width:200px;}
  .legend .li{display:flex; gap:.45rem; align-items:baseline;}
  .legend .sym{font-family:ui-monospace,monospace; font-weight:700; width:2.4rem; flex:0 0 auto;}
  .legend .sym.a{color:var(--add);} .legend .sym.r{color:var(--remove);} .legend .sym.m{color:var(--muted);}
  .legend .li b{color:var(--ink);}
  .legend .li .d{color:var(--muted);}

  .exp-bar{display:flex; flex-wrap:wrap; gap:.45rem; align-items:center; margin-top:.85rem;}
  .exp-bar .lbl{font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin-right:.2rem;}
  .exp-bar button{background:var(--surface); color:var(--ink); border:1px solid var(--line); border-radius:7px;
    padding:.42rem .7rem; font-size:.8rem; cursor:pointer;}
  .exp-bar button:hover{border-color:var(--accent-soft);}
  .exp-bar button:focus-visible{outline:2px solid var(--accent-soft); outline-offset:1px;}
  .card-head .mob-export{background:none; border:1px solid var(--line); border-radius:6px; color:var(--muted);
    font-size:.68rem; padding:.1rem .45rem; cursor:pointer; margin-left:.3rem;}
  .card-head .mob-export:hover{border-color:var(--accent-soft); color:var(--accent);}
  .toast{position:fixed; bottom:1.2rem; left:50%; transform:translateX(-50%); background:var(--ink); color:var(--bg);
    padding:.55rem 1rem; border-radius:8px; font-size:.82rem; box-shadow:var(--shadow); z-index:50; opacity:0; transition:opacity .2s;}
  .toast.show{opacity:1;}
  .modal-ov{position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:60; display:flex; align-items:center; justify-content:center; padding:1.2rem;}
  .modal{background:var(--surface); border:1px solid var(--line); border-radius:12px; box-shadow:var(--shadow); width:min(780px,100%); max-height:86vh; display:flex; flex-direction:column;}
  .modal-h{display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; padding:.7rem .9rem; border-bottom:1px solid var(--line);}
  .modal-h .d{color:var(--muted); font-size:.76rem; flex:1 1 auto;}
  .modal-h .modal-x{background:var(--accent); color:#fff; border:0; border-radius:7px; padding:.4rem .8rem; cursor:pointer; font-size:.8rem;}
  :root[data-theme="dark"] .modal-h .modal-x{color:#1a150c;}
  .modal textarea{flex:1 1 auto; width:100%; min-height:340px; border:0; padding:.7rem .9rem; font-family:ui-monospace,Consolas,monospace; font-size:.74rem; background:var(--bg); color:var(--ink); resize:none;}
  .exp-bar .note{width:100%; color:var(--muted); font-size:.72rem; margin-top:.2rem;}

  .chg{font-family:ui-monospace,monospace; font-size:.74rem; font-weight:700; display:inline-flex; gap:.35rem; align-items:baseline;}
  .chg .a{color:var(--add);} .chg .r{color:var(--remove);}
  .empty-state{text-align:center; color:var(--muted); padding:2.6rem 1rem; font-size:.95rem;}
  .empty-state .reset-btn{display:inline-block; margin-top:.9rem; background:var(--accent); color:#fff; border:0; border-radius:8px; padding:.55rem 1.1rem; cursor:pointer; font-size:.85rem;}
  :root[data-theme="dark"] .empty-state .reset-btn{color:#1a150c;}
  .show-more-items{display:block; width:100%; margin:.4rem 0 .1rem; background:none; border:1px dashed var(--line);
    color:var(--accent); border-radius:6px; padding:.32rem .6rem; font-size:.76rem; cursor:pointer; text-align:left;}
  .show-more-items:hover{border-color:var(--accent-soft); background:var(--surface2);}

  .cols{display:grid; grid-template-columns:1fr 1fr; gap:0;}
  @media (max-width:640px){.cols{grid-template-columns:1fr;}}
  .col{padding:.7rem .95rem;}
  .col.now{border-right:1px solid var(--line);}
  @media (max-width:640px){.col.now{border-right:0; border-bottom:1px solid var(--line);}}
  .col h4{margin:0 0 .5rem; font-size:.7rem; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); font-weight:700;}

  .iw{border-radius:6px;}
  .item{display:flex; align-items:baseline; gap:.45rem; padding:.22rem .3rem; font-size:.86rem; border-radius:6px;}
  .item.has{cursor:pointer;}
  .item.has:hover{background:var(--surface2);}
  .item .ico{width:1rem; text-align:center; flex:0 0 auto; font-weight:700; font-family:ui-monospace,monospace;}
  .item .nm{flex:1 1 auto;}
  .item .chev{color:var(--muted); font-size:.7rem; transition:transform .15s;}
  .iw.open .chev{transform:rotate(90deg);}
  .item .lv{color:var(--muted); font-size:.72rem; font-family:ui-monospace,monospace;}
  .item.rm .nm{color:var(--remove); text-decoration:line-through; text-decoration-color:var(--remove-line);}
  .item.rm .ico{color:var(--remove);}
  .item.add .nm{color:var(--add);} .item.add .ico{color:var(--add);}
  .item.keep .ico{color:var(--muted);}
  .empty{color:var(--muted); font-style:italic; font-size:.82rem; padding:.2rem 0;}
  .rog{color:var(--muted); font-size:.76rem; font-style:italic;}

  .detail{background:var(--panel); border:1px solid var(--line); border-radius:7px; margin:.15rem 0 .4rem 1.3rem; padding:.55rem .7rem;}
  .idnb{font-size:.78rem; margin-bottom:.45rem; padding:.28rem .5rem; border-radius:6px; border:1px solid var(--line); display:flex; gap:.4rem; align-items:baseline; flex-wrap:wrap;}
  .idnb b{font-size:.66rem; text-transform:uppercase; letter-spacing:.05em; color:var(--muted);}
  .idnb code{font-family:ui-monospace,Consolas,monospace; font-size:.78rem; color:var(--ink); background:var(--bg); padding:.05rem .3rem; border-radius:4px;}
  .idnb .k{font-size:.72rem; color:var(--muted);}
  .idnb.reuse{background:var(--add-bg);} .idnb.reuse .k{color:var(--add);}
  .idnb.create{background:var(--legacy-bg);} .idnb.create .k{color:var(--legacy);}
  .idnb.skip{background:var(--remove-bg);} .idnb.skip .k{color:var(--remove);}
  .stat-grid{display:flex; flex-wrap:wrap; gap:.3rem .9rem; margin-bottom:.4rem;}
  .kv{font-size:.78rem;} .kv b{color:var(--muted); font-weight:600; font-size:.68rem; text-transform:uppercase; letter-spacing:.04em; margin-right:.25rem;}
  .kv span{font-family:ui-monospace,monospace;}
  .bonuses{display:flex; flex-wrap:wrap; gap:.3rem; margin:.2rem 0;}
  .bon{font-size:.78rem; background:var(--surface); border:1px solid var(--line); border-radius:5px; padding:.08rem .4rem;}
  .bon b{color:var(--accent); font-family:ui-monospace,monospace;}
  .procs{margin:.25rem 0;}
  .proc{font-size:.78rem; color:var(--accent); }
  .proc .pk{font-family:ui-monospace,monospace; font-size:.66rem; color:var(--muted);}
  .fx{color:var(--accent); font-size:.8rem; margin-left:.1rem; cursor:help;}
  .rawwrap{margin-top:.4rem;}
  .rawwrap summary{font-size:.72rem; color:var(--muted); cursor:pointer; user-select:none;}
  .rawjson{background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:.5rem .6rem; font-size:.72rem;
    font-family:ui-monospace,Consolas,monospace; overflow-x:auto; max-height:320px; margin:.3rem 0 0; white-space:pre;}

  .more{display:block; margin:1.2rem auto 0; background:var(--accent); color:#fff; border:0; border-radius:8px; padding:.65rem 1.4rem; font-size:.9rem; cursor:pointer;}
  :root[data-theme="dark"] .more{color:#1a150c;}
  .foot{text-align:center; color:var(--muted); font-size:.75rem; margin-top:2rem;}
</style>

<div class="wrap">
  <header class="top">
    <h1 class="title"><span class="mk">Drop diff</span> — Ardred · Classic + SI + Darkness Falls</h1>
    <p class="sub">Confronto tra il loot <b>attuale nel DB</b> e la <b>proposta</b> dallo scraping (Eden + Allakhazam). Nulla è ancora applicato — questa è solo la revisione.</p>
    <p class="hint">Suggerimento: <b>clicca su un item</b> (dove c'è la freccetta ▸) per vedere le sue statistiche complete e il JSON grezzo.</p>
    <div class="tiles">
      <div class="tile accent"><div class="n">${s.changed}</div><div class="l">Mob che cambiano</div></div>
      <div class="tile"><div class="n">${s.newLoot}</div><div class="l">Nuovo loot</div></div>
      <div class="tile"><div class="n">${s.modified}</div><div class="l">Loot modificato</div></div>
      <div class="tile add"><div class="n">+${s.added}</div><div class="l">Item aggiunti</div></div>
      <div class="tile rem"><div class="n">−${s.removed}</div><div class="l">Item rimossi</div></div>
      <div class="tile"><div class="n">${s.confirmed}</div><div class="l">Confermati (nessun cambio)</div></div>
    </div>
    <div class="controls">
      <input class="search" id="q" type="search" placeholder="Cerca mob o zona…" aria-label="Cerca mob o zona">
      <select class="zonesel" id="zone" aria-label="Filtro per zona"><option value="">Tutte le zone</option></select>
      <select class="zonesel" id="sort" aria-label="Ordina">
        <option value="rel">Ordina: rilevanza</option>
        <option value="changes">Più modifiche</option>
        <option value="name">Nome A-Z</option>
        <option value="level">Livello ↑</option>
        <option value="zone">Zona A-Z</option>
      </select>
      <div class="seg" id="cat" role="group" aria-label="Filtro categoria">
        <button data-cat="all" aria-pressed="true">Tutti</button>
        <button data-cat="modified" aria-pressed="false">Modificati</button>
        <button data-cat="new" aria-pressed="false">Nuovo loot</button>
        <button data-cat="confirmed" aria-pressed="false">Confermati</button>
      </div>
      <div class="seg" id="realm" role="group" aria-label="Filtro reame">
        <button data-realm="all" aria-pressed="true">Tutti</button>
        <button data-realm="Alb" aria-pressed="false">Alb</button>
        <button data-realm="Mid" aria-pressed="false">Mid</button>
        <button data-realm="Hib" aria-pressed="false">Hib</button>
      </div>
    </div>
    <details class="legend">
      <summary>Legenda — cosa significano i simboli</summary>
      <div class="lg-body">
        <div class="lg-col">
          <div class="li"><span class="sym a">+</span><span><b>Aggiunto</b> <span class="d">— item nuovo nella loot table di questo mob</span></span></div>
          <div class="li"><span class="sym r">−</span><span><b>Rimosso</b> <span class="d">— era nella loot table, la proposta non lo include</span></span></div>
          <div class="li"><span class="sym m">=</span><span><b>Invariato</b> <span class="d">— già nella loot table e mantenuto</span></span></div>
          <div class="li"><span class="sym m">▸</span><span><b>Espandibile</b> <span class="d">— clicca per stat complete + JSON</span></span></div>
        </div>
        <div class="lg-col">
          <div class="li"><span class="sym">E</span><span><b>Eden</b> <span class="d">— dato con statistiche complete</span></span></div>
          <div class="li"><span class="sym">A</span><span><b>Allakhazam</b> <span class="d">— solo nome item, senza stat</span></span></div>
          <div class="li"><span class="sym">E+A</span><span><b>Entrambe</b> <span class="d">— confermato dalle due fonti</span></span></div>
          <div class="li"><span class="sym">lv51</span><span><b>Livello</b> <span class="d">dell'item</span></span></div>
        </div>
        <div class="lg-col">
          <div class="li"><span class="cat">in catalogo</span><span class="d">l'item esiste già in itemtemplate: si riusa l'Id_nb</span></div>
          <div class="li"><span class="cat mk">da creare</span><span class="d">item non presente in itemtemplate: va creato ex-novo</span></div>
          <div class="li"><span class="badge new">nuovo loot</span><span class="d">mob che ora ha solo RoG</span></div>
          <div class="li"><span class="badge modified">modificato</span><span class="d">loot esistente che cambia</span></div>
        </div>
      </div>
    </details>
    <div class="exp-bar">
      <span class="lbl">Copia / esporta</span>
      <button data-exp="all">Tutto (JSON)</button>
      <button data-exp="eden">Solo Eden (JSON)</button>
      <button data-exp="allakhazam">Solo Allakhazam (JSON)</button>
      <button data-exp="changed">Solo i cambiamenti (JSON)</button>
      <button data-exp="csv">CSV (Excel)</button>
      <button data-exp="filtered">Vista filtrata attuale (JSON)</button>
      <span class="note">Il download è bloccato dalla sandbox: i pulsanti <b>copiano negli appunti</b> (o aprono una finestra da cui copiare). Incolla in un file. I file completi sono anche generati nel progetto.</span>
    </div>
  </header>
  <main>
    <div class="count-line" id="count"></div>
    <div id="list"></div>
    <button class="more" id="more" hidden>Mostra altri</button>
    <p class="foot">Generato il ${gen} · ${meta.total} mob in scope · ${meta.dictSize} item con statistiche · report di sola revisione</p>
  </main>
</div>

<script>
  const ROWS = JSON.parse(${JSON.stringify(dataRows)});
  const DICT = JSON.parse(${JSON.stringify(dataDict)});
  const REALM = {0:'Tutti',1:'Albion',2:'Midgard',3:'Hibernia'};
  const PAGE = 50;
  let filtered = ROWS, shown = 0, cat='all', realm='all', zone='', sortMode='rel';
  const q=document.getElementById('q'), list=document.getElementById('list'),
        moreBtn=document.getElementById('more'), countEl=document.getElementById('count'),
        zoneSel=document.getElementById('zone'), sortSel=document.getElementById('sort');

  // popola la tendina zone con le location distinte (ordinate)
  (function(){
    const set=new Set();
    for(const r of ROWS) for(const z of r.zones) set.add(z);
    const opts=[...set].sort((a,b)=>a.localeCompare(b));
    zoneSel.insertAdjacentHTML('beforeend', opts.map(z=>'<option value="'+z.replace(/"/g,'&quot;')+'">'+z.replace(/</g,'&lt;')+'</option>').join(''));
  })();

  const esc=(t)=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function itemRow(cls,ico,name,lv,src,key,tag){
    const d = key? DICT[key]:null;
    const nm = name!=null? name : (d? d.name : '');
    const lvv = lv!=null? lv : (d? d.level : null);
    const has = key? ' has':'';
    const chev = key? '<span class="chev">▸</span>':'';
    const fx = d && d.procs && d.procs.length ? '<span class="fx" title="ha proc / use / charge">⚡</span>' : '';
    return '<div class="iw" data-key="'+(key||'')+'"><div class="item'+cls+has+'">'+chev+
      '<span class="ico">'+ico+'</span><span class="nm">'+esc(nm)+'</span>'+fx+
      (tag||'')+
      (src?'<span class="src">'+src+'</span>':'')+
      (lvv!=null&&lvv!==''?'<span class="lv">lv '+lvv+'</span>':'')+'</div></div>';
  }

  function kv(k,v){ return '<span class="kv"><b>'+k+'</b><span>'+esc(v)+'</span></span>'; }

  function idLine(it){
    if(it.resolvedId){
      const label={existing:'esistente nel DB',reuse:'riusato (già in DB)',create:'nuovo — da creare'}[it.idKind]||'';
      return '<div class="idnb '+(it.idKind==='create'?'create':'reuse')+'"><b>Id_nb</b> <code>'+esc(it.resolvedId)+'</code> <span class="k">'+label+'</span></div>';
    }
    if(it.idKind==='skip') return '<div class="idnb skip"><b>Id_nb</b> <span class="k">non creabile — solo Allakhazam, nessuna statistica</span></div>';
    return '';
  }
  function detailHtml(it){
    if(!it) return '<div class="detail"><div class="empty">Statistiche non disponibili.</div></div>';
    if(it.source==='allakhazam'){
      const url='https://camelot.allakhazam.com/db/item.html?citem='+it.citem;
      return '<div class="detail">'+idLine(it)+'<div class="empty">Item presente <b>solo su Allakhazam</b> — le statistiche non sono state scaricate (dalla pagina mob prendiamo solo il nome).</div>'+
        '<div class="stat-grid"><span class="kv"><b>citem</b><span>'+it.citem+'</span></span>'+
        '<span class="kv"><b>fonte</b><span><a href="'+url+'" target="_blank" rel="noopener">pagina Allakhazam ↗</a></span></span></div>'+
        '<div class="rog">Se servono le stat di questi item, si possono scrapare le loro pagine in un secondo momento.</div></div>';
    }
    const g=[];
    if(it.level!=null) g.push(kv('Livello',it.level));
    if(it.quality) g.push(kv('Qualità',it.quality+'%'));
    g.push(kv('Reame',REALM[it.realm]!=null?REALM[it.realm]:it.realm));
    if(it.objectTypeName) g.push(kv('Tipo',it.objectTypeName));
    if(it.dpsAf) g.push(kv('DPS/AF',it.dpsAf));
    if(it.spdAbs) g.push(kv('SPD/ABS',it.spdAbs));
    if(it.utility) g.push(kv('Utility',it.utility));
    const grid='<div class="stat-grid">'+g.join('')+'</div>';
    const bon=(it.bonuses&&it.bonuses.length)
      ? '<div class="bonuses">'+it.bonuses.map(b=>'<span class="bon"><b>'+(b.value>0?'+':'')+b.value+'</b> '+esc(b.name)+'</span>').join('')+'</div>' : '';
    let procs='';
    if(it.procs&&it.procs.length)
      procs='<div class="procs">'+it.procs.map(p=>'<div class="proc">⚡ '+esc(p.name)+(p.kind?' <span class="pk">['+esc(p.kind)+']</span>':'')+(p.type?' — '+esc(p.type):'')+(p.value?' ('+esc(p.value)+')':'')+'</div>').join('')+'</div>';
    else if(it.procSpellId) procs='<div class="procs"><div class="proc">⚡ Proc spell #'+it.procSpellId+'</div></div>';
    const raw='<details class="rawwrap"><summary>JSON grezzo</summary><pre class="rawjson">'+esc(JSON.stringify(it.raw||it,null,2))+'</pre></details>';
    return '<div class="detail">'+idLine(it)+grid+bon+procs+raw+'</div>';
  }

  const CAP=15;
  function capList(arr, noun){
    if(arr.length<=CAP) return arr.join('');
    return arr.slice(0,CAP).join('')+
      '<div class="more-items" hidden>'+arr.slice(CAP).join('')+'</div>'+
      '<button class="show-more-items">▾ mostra tutti i '+arr.length+' '+noun+'</button>';
  }
  function card(r){
    const realms=r.realm.map(x=>'<span class="realm '+x+'">'+x+'</span>').join(' ');
    const zones=r.zones.slice(0,3).join(', ')+(r.zones.length>3?'…':'');
    const nAdd=r.proposed.filter(i=>i.isNew).length;
    const nRem=r.current.filter(i=>i.removed).length;
    const chg=(nAdd||nRem)
      ? '<span class="chg">'+(nAdd?'<span class="a">+'+nAdd+'</span>':'')+(nRem?'<span class="r">−'+nRem+'</span>':'')+'</span>'
      : '';
    const nowItems=r.current.length
      ? capList(r.current.map(i=>itemRow(i.removed?' rm':' keep', i.removed?'−':'=', i.name, i.level, null, i.key)), 'item')
      : '<div class="rog">Nessun loot esplicito — solo RoG generico</div>';
    const propItems=r.proposed.length
      ? capList(r.proposed.map(i=>{
          const tag = i.isNew ? (i.inCatalog?'<span class="cat">in catalogo</span>':'<span class="cat mk">da creare</span>') : '';
          return itemRow(i.isNew?' add':' keep', i.isNew?'+':'=', i.name, i.level, i.src, i.key, tag);
        }), 'item')
      : '<div class="empty">Nessuna proposta</div>';
    const legacy=r.legacy.length
      ? '<div class="detail" style="margin:.4rem .95rem .6rem;color:var(--legacy)"><b>Item storici (nld, non più droppati su Classic):</b> '+r.legacy.map(i=>esc(i.name)).join(' · ')+'</div>'
      : '';
    return '<div class="card"><div class="card-head">'+
      '<span class="mob-name">'+esc(r.mob)+'</span>'+
      '<span class="badge '+r.category+'">'+({new:'nuovo loot',modified:'modificato',confirmed:'confermato'}[r.category])+'</span>'+
      chg+
      '<span class="meta">'+(realms||'')+'<span>lv '+r.level+'</span><span>'+esc(zones)+'</span></span>'+
      '<button class="mob-export" data-mob="'+esc(r.mob)+'">⬇ JSON</button>'+
      '</div><div class="cols">'+
      '<div class="col now"><h4>Nel DB ora</h4>'+nowItems+'</div>'+
      '<div class="col"><h4>Proposta scraping</h4>'+propItems+'</div>'+
      '</div>'+legacy+'</div>';
  }

  const lvNum=r=>{ const m=String(r.level).match(/\d+/); return m?+m[0]:0; };
  const chgCount=r=>r.proposed.filter(i=>i.isNew).length + r.current.filter(i=>i.removed).length;
  function sortRows(a){
    if(sortMode==='rel') return a; // ordine di rilevanza già in ROWS (il filtro lo preserva)
    const s=a.slice();
    if(sortMode==='name') s.sort((x,y)=>x.mob.localeCompare(y.mob));
    else if(sortMode==='level') s.sort((x,y)=>lvNum(x)-lvNum(y)||x.mob.localeCompare(y.mob));
    else if(sortMode==='changes') s.sort((x,y)=>chgCount(y)-chgCount(x)||x.mob.localeCompare(y.mob));
    else if(sortMode==='zone') s.sort((x,y)=>(x.zones[0]||'~').localeCompare(y.zones[0]||'~')||x.mob.localeCompare(y.mob));
    return s;
  }
  function applyFilter(){
    const term=q.value.trim().toLowerCase();
    filtered=sortRows(ROWS.filter(r=>{
      if(cat!=='all'&&r.category!==cat) return false;
      if(realm!=='all'&&!r.realm.includes(realm)) return false;
      if(zone&&!r.zones.includes(zone)) return false;
      if(term&&!r.mob.toLowerCase().includes(term)&&!r.zones.some(z=>z.toLowerCase().includes(term))) return false;
      return true;
    }));
    shown=0; list.innerHTML=''; render();
  }
  function render(){
    if(!filtered.length){
      list.innerHTML='<div class="empty-state">Nessun mob corrisponde ai filtri attuali.<br><button class="reset-btn">Azzera i filtri</button></div>';
      moreBtn.hidden=true; countEl.textContent='0 mob';
      return;
    }
    const next=filtered.slice(shown,shown+PAGE);
    list.insertAdjacentHTML('beforeend', next.map(card).join(''));
    shown+=next.length;
    moreBtn.hidden=shown>=filtered.length;
    countEl.textContent=filtered.length+' mob · mostrati '+shown;
  }
  function resetFilters(){
    cat='all'; realm='all'; zone=''; sortMode='rel';
    q.value=''; zoneSel.value=''; sortSel.value='rel';
    document.querySelectorAll('#cat button').forEach(b=>b.setAttribute('aria-pressed', b.dataset.cat==='all'));
    document.querySelectorAll('#realm button').forEach(b=>b.setAttribute('aria-pressed', b.dataset.realm==='all'));
    applyFilter();
  }

  // espansione stat item (delegata, lazy)
  list.addEventListener('click', e=>{
    if(e.target.closest('.detail')) return; // click dentro il pannello (es. JSON grezzo): non chiudere
    const iw=e.target.closest('.iw[data-key]'); if(!iw) return;
    const key=iw.getAttribute('data-key'); if(!key) return;
    if(iw.classList.contains('open')){
      iw.classList.remove('open'); const d=iw.querySelector('.detail'); if(d) d.remove();
    } else {
      iw.classList.add('open');
      iw.insertAdjacentHTML('beforeend', detailHtml(DICT[key]));
    }
  });

  // ---- esportazioni ----
  function toast(msg){
    let t=document.querySelector('.toast'); if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);}
    t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600);
  }
  // Il download è bloccato dalla sandbox dell'Artifact: copiamo negli appunti
  // (execCommand funziona anche in iframe sandbox). Fallback: modale con textarea.
  function copyText(text){
    const ta=document.createElement('textarea');
    ta.value=text; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.top='-9999px';
    document.body.appendChild(ta); ta.focus(); ta.select();
    let ok=false; try{ ok=document.execCommand('copy'); }catch(e){}
    ta.remove(); return ok;
  }
  function showModal(name, text){
    const ov=document.createElement('div'); ov.className='modal-ov';
    ov.innerHTML='<div class="modal"><div class="modal-h"><b>'+esc(name)+'</b><span class="d">Seleziona tutto e copia (Ctrl+A, Ctrl+C), poi incolla in un file</span><button class="modal-x">Chiudi</button></div><textarea readonly></textarea></div>';
    ov.querySelector('textarea').value=text;
    ov.querySelector('.modal-x').onclick=()=>ov.remove();
    ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
    document.body.appendChild(ov);
    const t=ov.querySelector('textarea'); t.focus(); t.select();
  }
  function download(name, text){
    const kb=Math.round(text.length/1024);
    if(kb>1500){ showModal(name, text); return; } // troppo grande per gli appunti: modale
    if(copyText(text)) toast('Copiato negli appunti: '+name+' ('+kb+' KB) — incollalo in un file');
    else showModal(name, text);
  }
  function resolveItem(it, side){
    const d=it.key?DICT[it.key]:null;
    const o={ name: it.name||(d&&d.name)||'', change: side };
    const lv=it.level!=null?it.level:(d&&d.level); if(lv!=null) o.level=lv;
    if(it.src) o.source=it.src;
    if(it.inCatalog!=null) o.inCatalog=it.inCatalog;
    if(d){ o.dataSource=d.source;
      if(d.quality) o.quality=d.quality;
      if(d.realm!=null) o.realm=d.realm;
      if(d.objectTypeName) o.type=d.objectTypeName;
      if(d.bonuses&&d.bonuses.length) o.bonuses=d.bonuses.map(b=>({stat:b.name,value:b.value}));
      if(d.procs&&d.procs.length) o.procs=d.procs.map(p=>({name:p.name,type:p.type,value:p.value}));
      if(d.citem) o.citem=d.citem;
    }
    return o;
  }
  function resolveMob(r){
    return { mob:r.mob, realm:r.realm, zones:r.zones, level:r.level, category:r.category,
      currentDb:r.current.map(i=>resolveItem(i,i.removed?'removed':'kept')),
      proposed:r.proposed.map(i=>resolveItem(i,i.isNew?'added':'kept')),
      legacy:r.legacy.map(i=>i.name) };
  }
  function edenItemList(){
    const out=[]; for(const [k,v] of Object.entries(DICT)) if(k[0]==='E') out.push(v); return out;
  }
  function allakItemList(){
    const out=[]; for(const [k,v] of Object.entries(DICT)) if(k[0]==='A') out.push({name:v.name,citem:v.citem}); return out;
  }
  function toCsv(mobs){
    const esc=s=>'"'+String(s==null?'':s).replace(/"/g,'""')+'"';
    const lines=['mob,reame,zona,categoria,lato,item,fonte,livello,in_catalogo'];
    for(const m of mobs){
      const push=(arr)=>arr.forEach(i=>lines.push([m.mob,m.realm.join('|'),m.zones.join('|'),m.category,i.change,i.name,i.source||'',i.level!=null?i.level:'',i.inCatalog!=null?i.inCatalog:''].map(esc).join(',')));
      push(m.currentDb); push(m.proposed);
    }
    return lines.join('\\n');
  }
  const stamp=new Date().toISOString().slice(0,10);
  function doExport(kind){
    if(kind==='all') return download('drop-diff_tutto_'+stamp+'.json', JSON.stringify(ROWS.map(resolveMob),null,2));
    if(kind==='changed') return download('drop-diff_cambiamenti_'+stamp+'.json', JSON.stringify(ROWS.filter(r=>r.category!=='confirmed').map(resolveMob),null,2));
    if(kind==='filtered') return download('drop-diff_filtrato_'+stamp+'.json', JSON.stringify(filtered.map(resolveMob),null,2));
    if(kind==='eden') return download('items_eden_'+stamp+'.json', JSON.stringify(edenItemList(),null,2));
    if(kind==='allakhazam') return download('items_allakhazam_'+stamp+'.json', JSON.stringify(allakItemList(),null,2));
    if(kind==='csv') return download('drop-diff_'+stamp+'.csv', toCsv(ROWS.map(resolveMob)));
  }
  document.querySelector('.exp-bar').addEventListener('click', e=>{
    const b=e.target.closest('button[data-exp]'); if(b) doExport(b.dataset.exp);
  });
  list.addEventListener('click', e=>{
    // export singolo mob
    const ex=e.target.closest('.mob-export');
    if(ex){ e.stopPropagation(); const name=ex.getAttribute('data-mob'); const r=ROWS.find(x=>x.mob===name);
      if(r) download('mob_'+name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.json', JSON.stringify(resolveMob(r),null,2)); return; }
    // mostra tutti gli item di una colonna
    const sm=e.target.closest('.show-more-items');
    if(sm){ const hidden=sm.previousElementSibling; if(hidden&&hidden.classList.contains('more-items')) hidden.hidden=false; sm.remove(); return; }
    // azzera filtri (empty-state)
    if(e.target.closest('.reset-btn')){ resetFilters(); return; }
  });

  moreBtn.addEventListener('click', render);
  q.addEventListener('input', applyFilter);
  zoneSel.addEventListener('change', ()=>{ zone=zoneSel.value; applyFilter(); });
  sortSel.addEventListener('change', ()=>{ sortMode=sortSel.value; applyFilter(); });
  document.getElementById('cat').addEventListener('click', e=>{
    const b=e.target.closest('button'); if(!b) return; cat=b.dataset.cat;
    [...e.currentTarget.children].forEach(x=>x.setAttribute('aria-pressed', x===b)); applyFilter();
  });
  document.getElementById('realm').addEventListener('click', e=>{
    const b=e.target.closest('button'); if(!b) return; realm=b.dataset.realm;
    [...e.currentTarget.children].forEach(x=>x.setAttribute('aria-pressed', x===b)); applyFilter();
  });
  applyFilter();
</script>`;
}
