const $=s=>document.querySelector(s);
let doc=null,originalDoc=null,selected=null,custom=[],history=[],changes=0;
let db={categories:[]},dbIndex={},nameIndex={},customIndex={},addCatName='all';
let showNameDups=false;
let selectedSector=null,iconTargetId=null,iconBust=Date.now();
let serverDoc=null,srvSyncTime=null,undoStack=[],iconAutoLast=0;
const CATS=['Оружие','Патроны','Материалы','Еда и напитки','Медицина','Одежда','Инструменты','Транспортные детали','Разное'];
const DEFS={'base-purchase-price':'-1','base-sell-price':'-1','delta-price':'-1','required-famepoints':'-1','available-after-sale-only':'default','can-be-purchased':'default'};
const FIELDS=['base-purchase-price','base-sell-price','delta-price','required-famepoints','available-after-sale-only','can-be-purchased'];
const CODE_FIELDS=['tradeable-code','TradeableCode','tradeableCode','code','id','ID','class','ClassName','className'];
const AVAIL_OPTS=[['default','По умолчанию'],['true','После продажи'],['false','Доступно всегда']];
const VIS_OPTS=[['default','Открыт'],['true','Открыт (true)'],['false','Скрыт']];
const STANDARD=['ОРУЖЕЙНИК','РЫБОЛОВ','МЕХАНИК','ГЛАВНЫЙ ТРЕЙДЕР','БАР','ГОСПИТАЛЬ','БАРБЕР','ОХОТНИК','MASTER HUNTER'];
const ROLES=['Armory','Barber','Saloon','BoatShop','Hospital','Mechanic','Trader','Hunter','Master_Hunter'];
const ROLE_RU={Armory:'ОРУЖЕЙНИК',BoatShop:'РЫБОЛОВ',Mechanic:'МЕХАНИК',Trader:'ГЛАВНЫЙ ТРЕЙДЕР',Saloon:'БАР',Hospital:'ГОСПИТАЛЬ',Barber:'БАРБЕР',Hunter:'ОХОТНИК',Master_Hunter:'MASTER HUNTER'};
const TRADER_CATS={Armory:['Оружие — Пистолеты','Оружие — Винтовки','Оружие — Дробовики','Оружие — Магазины','Оружие — Обвес и оптика','Оружие — Детали','Оружие — Краски','Патроны'],Hunter:['Оружие — Луки и стрелы','Оружие — Холодное оружие','Оружие — Ловушки','Одежда — Колчаны'],Master_Hunter:['Оружие — Луки и стрелы','Оружие — Холодное оружие','Оружие — Ловушки','Одежда — Колчаны'],BoatShop:['Рыбалка — Крючки','Рыбалка — Удочки','Рыбалка — Поплавки','Рыбалка — Лески','Рыбалка — Прочее','Транспорт — Транспортные средства'],Saloon:['Еда и напитки — Напитки','Еда и напитки — Упакованная еда','Еда и напитки — Консервы','Еда и напитки — Прочее'],Hospital:['Медицина'],Mechanic:['Транспорт — Запчасти','Транспорт — Услуги механика','Транспорт — Транспортные средства','Инструменты'],Trader:['Инструменты','Материалы','Разное'],Barber:[]};
const SECTOR_ORDER=['A_0','B_4','C_2','Z_3'];
const SECTOR_RE=/^([A-Za-z])_(\d+)_(.+)$/;
const RU_LABELS={'economy-reset-time-hours':'Сброс экономики (часы)','prices-randomization-time-hours':'Рандомизация цен (часы)','tradeable-rotation-time-ingame-hours-min':'Ротация: мин. игровые часы','tradeable-rotation-time-ingame-hours-max':'Ротация: макс. игровые часы','tradeable-rotation-time-of-day-min':'Ротация: мин. время суток','tradeable-rotation-time-of-day-max':'Ротация: макс. время суток','fully-restock-tradeable-hours':'Полное пополнение (часы)','trader-funds-change-rate-per-hour-multiplier':'Множитель изменения средств трейдера','prices-subject-to-delta':'Цены зависят от множителя (дельты)','prices-subject-to-player-count':'Цены зависят от числа игроков','gold-price-subject-to-global-multiplier':'Цена золота от глобального множителя','gold-base-price':'Базовая цена золота','gold-sale-price-modifier':'Модификатор продажи золота','gold-price-change-percentage-step':'Шаг изменения цены золота (%)','gold-price-change-per-step':'Изменение цены золота за шаг','economy-logging':'Логирование экономики','traders-unlimited-funds':'Безлимитные средства трейдеров','traders-unlimited-stock':'Безлимитный склад трейдеров','global-only-after-player-sale-tradeable-availability-enabled':'Доступность после продажи игроком','tradeable-rotation-enabled':'Ротация ассортимента','enable-fame-point-requirement':'Требование очков славы'};

function parseTrader(key){let m=SECTOR_RE.exec(key||'');if(m)return{sector:m[1].toUpperCase()+'_'+m[2],role:m[3],label:ROLE_RU[m[3]]||m[3]};return{sector:'ПРОЧИЕ',role:'',label:key||'—'}}
function traderAssortment(){if(!selected)return null;let p=parseTrader(selected);if(p.sector==='ПРОЧИЕ')return null;let c=TRADER_CATS[p.role];if(!c)return null;let names=new Set(catNames());return c.filter(x=>names.has(x))}

function toast(s){let t=$('#toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function updateFlag(){let f=$('#changes-flag');if(changes>0){f.hidden=false;f.textContent='● Есть изменения · '+changes}else f.hidden=true}
function log(s){history.unshift({at:new Date().toLocaleTimeString(),text:s});changes++;$('#change-total').textContent=changes;updateFlag();renderHistory();renderPreview();renderDiff()}
function snapUndo(label){if(!doc)return;undoStack.push({doc:JSON.parse(JSON.stringify(doc)),originalDoc:JSON.parse(JSON.stringify(originalDoc||doc)),selected,label});if(undoStack.length>50)undoStack.shift();updateUndoBtn()}
function undoLast(){let s=undoStack.pop();if(!s)return toast('Нечего отменять');doc=JSON.parse(JSON.stringify(s.doc));originalDoc=JSON.parse(JSON.stringify(s.originalDoc));selected=s.selected&&doc.traders&&doc.traders[s.selected]?s.selected:(Object.keys(doc.traders||{})[0]||null);renderAll();log('Отменено: '+(s.label||'действие'));toast('Отменено: '+(s.label||'действие'))}
function updateUndoBtn(){let b=$('#undo-btn');if(b)b.disabled=!undoStack.length}
$('#undo-btn').onclick=undoLast;
function go(v){document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('#'+v).classList.add('active')}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>go(b.dataset.view));
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));

function askText(title,placeholder){return new Promise(res=>{let d=$('#ask-dialog');$('#ask-title').textContent=title;let inp=$('#ask-input');inp.placeholder=placeholder||'';inp.value='';let done=v=>{d.close();res(v)};$('#ask-form').onsubmit=e=>{e.preventDefault();done(inp.value)};$('#ask-cancel').onclick=()=>done(null);d.showModal();inp.focus()})}
function askConfirm(title,text){return new Promise(res=>{let d=$('#confirm-dialog');$('#confirm-title').textContent=title;$('#confirm-text').textContent=text||'';let done=v=>{d.close();res(v)};$('#confirm-form').onsubmit=e=>{e.preventDefault();done(true)};$('#confirm-cancel').onclick=()=>done(false);d.showModal()})}

function catNames(){let s=new Set(CATS);(db.categories||[]).forEach(c=>s.add(c.name));custom.forEach(x=>x.category&&s.add(x.category));return [...s]}
function populateCats(){let opts=catNames().map(c=>'<option>'+c+'</option>').join('');$('#category').innerHTML='<option value="all">Все категории</option>'+opts;$('#goods-cat').innerHTML='<option value="all">Все категории</option>'+opts;$('#item-category').innerHTML=opts;$('#vis-cat').innerHTML='<option value="all">Все категории</option>'+opts}
function flatDb(){let out=[];(db.categories||[]).forEach(c=>(c.items||[]).forEach(i=>out.push({name:i.name||i.id,id:i.id,cat:c.name})));return out}
function rebuildCustomIndex(){customIndex={};custom.forEach(x=>{if(x.id)customIndex[x.id]=x})}
function rebuildNameIndex(){nameIndex={};(db.categories||[]).forEach(c=>(c.items||[]).forEach(i=>{nameIndex[i.id]=i.name||i.id}))}
function rowCategory(code){return dbIndex[code]||(customIndex[code]?customIndex[code].category||'Разное':'—')}
function rowName(code){return customIndex[code]?customIndex[code].name:''}
function rowCode(r){if(!r||typeof r!=='object')return '';for(const f of CODE_FIELDS){let v=r[f];if(v!=null&&String(v).trim()!=='')return String(v).trim()}return ''}

async function saveCustom(){try{await fetch('/api/custom-items/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:custom})})}catch(e){}}
async function loadCustom(){try{let d=await fetch('/api/custom-items').then(r=>r.json()).catch(()=>null);if(d&&d.ok&&Array.isArray(d.items)){custom=d.items;rebuildCustomIndex()}}catch(e){}}

function renderStats(){$('#st-catalog').textContent=flatDb().length+custom.length}
function traderSectors(){let map={};Object.keys(doc?.traders||{}).forEach(k=>{let s=parseTrader(k).sector;(map[s]=map[s]||[]).push(k)});return map}
function sectorLabel(s){return s==='ПРОЧИЕ'?'ПРОЧИЕ':s.replace('_','')}
function renderSectors(){let box=$('#sector-list');box.innerHTML='';let map=traderSectors();let keys=Object.keys(map);
if(!keys.length){box.innerHTML='<p class="empty">Нет данных</p>';$('#sector-title').textContent='ТРЕЙДЕРЫ';selectedSector=null;return}
let order=SECTOR_ORDER.filter(s=>map[s]).concat(keys.filter(s=>!SECTOR_ORDER.includes(s)));
if(!selectedSector||!map[selectedSector])selectedSector=order[0];
order.forEach(s=>{let b=document.createElement('button');b.className='sector-btn'+(s===selectedSector?' active':'');b.title=s;let nm=document.createElement('span');nm.textContent=sectorLabel(s);let c=document.createElement('span');c.className='cnt';c.textContent=map[s].length;b.append(nm,c);b.onclick=()=>{selectedSector=s;renderSectors();renderTraderList()};box.append(b)})}
function renderTraderList(){let box=$('#trader-list');box.innerHTML='';$('#sector-title').textContent='ТРЕЙДЕРЫ · '+(selectedSector?sectorLabel(selectedSector):'—');
let keys=(traderSectors()[selectedSector]||[]);
if(!keys.length){box.innerHTML='<p class="empty">Нет торговцев</p>';return}
keys.forEach(k=>{let p=parseTrader(k);let b=document.createElement('button');b.className='trow'+(k===selected?' active':'');b.title=k;
let nm=document.createElement('span');nm.className='tname';let l=document.createElement('b');l.textContent=p.label;let sub=document.createElement('small');sub.textContent=k;nm.append(l,sub);
let cnt=document.createElement('span');cnt.className='cnt';cnt.textContent=(doc.traders[k]||[]).length;b.append(nm,cnt);b.onclick=()=>{selected=k;renderTraderList();renderGoods()};box.append(b)})}
function renderHead(){$('#selected-name').textContent=selected||'—';let cls=$('#selected-class');cls.hidden=!(selected&&STANDARD.includes(selected));
let rows=doc&&selected?(doc.traders[selected]||[]):[];$('#st-items').textContent=rows.length;
$('#st-unv').textContent=rows.filter(r=>!dbIndex[rowCode(r)]).length}

function fshort(f){if(f.includes('purchase'))return 'покупка';if(f.includes('sell'))return 'продажа';if(f.includes('delta'))return 'множитель';if(f.includes('fame'))return 'слава';if(f==='available-after-sale-only')return 'после продажи';if(f==='can-be-purchased')return 'видимость';return f}
function renderGoods(){let body=$('#goods');body.innerHTML='';let lgC=$('#lg-chg'),lgA=$('#lg-add');lgC.hidden=lgA.hidden=true;
if(!doc||!selected){renderHead();body.innerHTML='<tr><td colspan="10" class="empty">Импортируйте EconomyOverride.json — кнопка «← ИМПОРТ ФАЙЛА» сверху</td></tr>';return}
let rows=doc.traders[selected]||[];let orig=rowIndexOf(originalDoc&&originalDoc.traders?originalDoc.traders[selected]:null);
let addedN=0,chgN=0;rows.forEach(r=>{let code=rowCode(r);let o=orig.get(code);if(!o)addedN++;else if(FIELDS.some(f=>String(o[f]??'')!==String(r[f]??'')))chgN++});
lgC.hidden=!chgN;if(!lgC.hidden)lgC.querySelector('b').textContent=chgN;
lgA.hidden=!addedN;if(!lgA.hidden)lgA.querySelector('b').textContent=addedN;
renderHead();let q=$('#goods-search').value.toLowerCase(),cat=$('#goods-cat').value;
let shown=rows.map((row,i)=>({row,i})).filter(({row})=>{let code=rowCode(row);let c=rowCategory(code);return (code+' '+(nameIndex[code]||rowName(code))).toLowerCase().includes(q)&&(cat==='all'||c===cat)});
if(!rows.length){body.innerHTML='<tr><td colspan="10" class="empty">Нет товаров — нажмите «ДОБАВИТЬ» или «ДОБАВИТЬ ТОВАРЫ ПО КАТЕГОРИЯМ»</td></tr>';return}
if(!shown.length){body.innerHTML='<tr><td colspan="10" class="empty">Под фильтр ничего не попало</td></tr>';return}
let srvRows=serverDoc&&serverDoc.traders&&Array.isArray(serverDoc.traders[selected])?serverDoc.traders[selected]:null;let smap=srvRows?new Map(srvRows.map(r=>[rowCode(r),r])):null;
shown.forEach(({row,i})=>{let code=rowCode(row);let tr=document.createElement('tr');
let o=orig.get(code),diff=null;
if(!o){tr.className='row-added';tr.title='Строка добавлена (нет в оригинале)'}
else{diff=FIELDS.filter(f=>String(o[f]??'')!==String(row[f]??''));if(diff.length){tr.className='row-changed';tr.title='Изменено с оригинала: '+diff.map(fshort).join(', ')}}
if(String(row['can-be-purchased']??'default')==='false'){tr.classList.add('row-hidden');tr.title=(tr.title?tr.title+' · ':'')+'товар скрыт у торговца (can-be-purchased=false)'}
let tdP=document.createElement('td');let wrap=document.createElement('span');wrap.className='cell-wrap';
let nm=nameIndex[code]||rowName(code);
let img=document.createElement('img');img.className='thumb';img.alt='';img.style.cursor='zoom-in';img.title='Иконка: '+code;img.src='/api/icon/'+encodeURIComponent(code)+'?t='+iconBust;img.onerror=()=>{let ph=document.createElement('span');ph.className='thumb-ph';ph.textContent=(nm||code).charAt(0).toUpperCase();ph.style.cursor='pointer';ph.title='Добавить иконку: '+code;ph.onclick=()=>openIconDialog(code);img.replaceWith(ph)};img.onclick=()=>openIconDialog(code);wrap.append(img);
let codeInp=document.createElement('input');codeInp.className='code';codeInp.value=code;codeInp.onchange=()=>{snapUndo('переименование '+code);CODE_FIELDS.forEach(f=>{delete row[f]});row['tradeable-code']=codeInp.value.trim();log('Обновлён tradeable-code у '+selected);renderGoods()};
let sub=document.createElement('span');sub.className='item-name';sub.textContent=nm||'нет в каталоге';
let inpCol=document.createElement('span');inpCol.style.display='flex';inpCol.style.flexDirection='column';inpCol.style.gap='2px';inpCol.append(codeInp,sub);
wrap.append(inpCol);tdP.append(wrap);tr.append(tdP);
let tdC=document.createElement('td');tdC.className='cat';tdC.textContent=rowCategory(code);tr.append(tdC);
let srow=smap?smap.get(code)||null:null;
[['base-purchase-price','num in-buy','базовая цена покупки'],['base-sell-price','num in-sell','базовая цена продажи'],['delta-price','num','множитель цены (итог в игре = база × (1 + множитель); −1 по умолчанию, 2.0 → ×3)'],['required-famepoints','num','требуемые очки славы']].forEach(([f,cls,tip])=>{let td=document.createElement('td'),inp=document.createElement('input');inp.className=cls;inp.title=f+': '+tip;inp.value=row[f]??'';inp.onchange=()=>{snapUndo('правка '+fshort(f)+' у '+code);row[f]=inp.value;log('Обновлено поле '+f+' у '+selected);renderGoods()};if(srow&&String(srow[f]??'')!==String(row[f]??'')){let sv=document.createElement('span');sv.className='srv-val';sv.textContent='сервер: '+(srow[f]??'');td.append(inp,sv)}else td.append(inp);tr.append(td)});
[[AVAIL_OPTS,'available-after-sale-only','sel-avail'],[VIS_OPTS,'can-be-purchased','sel-vis']].forEach(([opts,f,cls])=>{let td=document.createElement('td'),sel=document.createElement('select');sel.className='sel '+cls;sel.title='available-after-sale-only'===f?'available-after-sale-only: работает при включённом «Доступность после продажи игроком» (сейчас выключено)':'can-be-purchased: видимость товара — true: виден, false: скрыт (не продаётся торговцем)';opts.forEach(([v,l])=>{let o=document.createElement('option');o.value=v;o.textContent=l;sel.append(o)});let v=String(row[f]??'default');if(!opts.some(([ov])=>ov===v))v='default';sel.value=v;if(srow&&String(srow[f]??'default')!==v){sel.classList.add('srv-diff');sel.title+=' · на сервере: '+(srow[f]??'default')}sel.onchange=()=>{snapUndo('правка '+fshort(f)+' у '+code);row[f]=sel.value;log('Обновлено поле '+f+' ('+fshort(f)+': '+opts.find(([ov])=>ov===sel.value)[1]+') у '+selected);renderGoods()};td.append(sel);tr.append(td)});
let tdSt=document.createElement('td');let st=document.createElement('span');st.className='badge '+(dbIndex[code]?'base':'unv');st.textContent=dbIndex[code]?'БАЗА':'UNVERIFIED';tdSt.append(st);if(smap&&!srow){let sa=document.createElement('span');sa.className='srv-absent';sa.textContent='нет на сервере';sa.title='Синхронизация: этого ID нет у торговца в файле сервера';tdSt.append(sa)}tr.append(tdSt);
let td=document.createElement('td');let del=document.createElement('button');del.className='del';del.textContent='×';del.onclick=()=>{snapUndo('удаление '+code);rows.splice(i,1);log('Удалена строка '+code+' у '+selected);renderGoods();renderTraderList()};td.append(del);tr.append(td);body.append(tr)})}

let dlg=()=>$('#add-dialog');
$('#add-row').onclick=()=>{if(!doc)return toast('Сначала импортируйте EconomyOverride.json');if(!selected)return toast('Сначала выберите торговца');let ass=traderAssortment();if(ass&&ass.length&&addCatName!=='all'&&!ass.includes(addCatName))addCatName='all';showNameDups=false;$('#add-target').textContent='→ '+selected+(ass&&ass.length?' · ассортимент SCUM':'');$('#add-status').textContent='';renderAddCats();renderAddResults();dlg().showModal()};
$('#add-close').onclick=()=>dlg().close();
function renderAddCats(){let box=$('#add-cats');box.innerHTML='';let ass=traderAssortment();let cats=ass?['all'].concat(catNames().filter(c=>ass.includes(c))):['all'].concat(catNames());cats.forEach(c=>{let b=document.createElement('button');b.type='button';b.className='cat-btn'+(addCatName===c?' active':'');b.textContent=c==='all'?(ass?'Весь ассортимент':'Все категории'):c;b.onclick=()=>{addCatName=c;renderAddCats();renderAddResults()};box.append(b)})}
function renderAddResults(){let box=$('#add-results');box.innerHTML='';let q=$('#add-search').value.toLowerCase();let rows=(doc&&selected&&doc.traders[selected])||[];let have=new Set(rows.map(r=>rowCode(r)));let haveNames={};rows.forEach(r=>{let c=rowCode(r);let nm=(nameIndex[c]||rowName(c)||'').toLowerCase();if(nm&&!haveNames[nm])haveNames[nm]=c});let ass=traderAssortment();let all=flatDb().filter(x=>(x.id==='Copper_Coins'||!ass||ass.includes(x.cat))&&!have.has(x.id)&&(addCatName==='all'||x.cat===addCatName)&&(x.name+' '+x.id).toLowerCase().includes(q));let fresh=all.filter(x=>!haveNames[x.name.toLowerCase()]);let dups=all.filter(x=>haveNames[x.name.toLowerCase()]);let list=(showNameDups?all:fresh).slice(0,60);let toggle=()=>{if(!dups.length)return;let bar=document.createElement('p');bar.className='empty';let t=document.createElement('button');t.type='button';t.className='cat-btn';t.textContent=showNameDups?'Скрыть совпадения по названию ('+dups.length+')':'Показать совпадения по названию ('+dups.length+') — такие товары уже есть у торговца под другим ID';t.onclick=()=>{showNameDups=!showNameDups;renderAddResults()};bar.append(t);box.append(bar)};if(!list.length){let p=document.createElement('p');p.className='empty';p.textContent=q?'В базе ничего не найдено — добавьте ID вручную ниже':(ass&&!ass.length?'У этого торговца нет стандартного ассортимента в SCUM — добавьте ID вручную ниже':(ass?'Стандартный ассортимент SCUM в этой категории уже у торговца — выберите другую категорию или добавьте ID вручную ниже':'Все предметы этой категории уже есть у торговца — добавьте ID вручную ниже или выберите другую категорию'));box.append(p);toggle();return}list.forEach(x=>{let r=document.createElement('div');r.className='res-row';let dup=haveNames[x.name.toLowerCase()];if(dup){r.classList.add('name-dup');r.title='Предмет с таким названием уже есть у торговца (ID '+dup+') — это другой ID, добавится вторая позиция с тем же названием'}let b=document.createElement('b');b.textContent=x.name;let id=document.createElement('span');id.className='id';id.textContent=x.id+' · '+x.cat;r.append(b,id);if(dup){let dn=document.createElement('span');dn.className='dup-note';dn.textContent='название уже есть: '+dup;r.append(dn)}r.onclick=()=>addCode(x.id,true);box.append(r)});toggle()}
$('#add-search').oninput=renderAddResults;
function addCode(code,isBase){code=code.trim();if(!code)return;let rows=doc.traders[selected];if(rows.some(r=>rowCode(r)===code))return toast('Этот ID уже добавлен');snapUndo('добавление '+code);rows.push({...DEFS,'tradeable-code':code});let dup=null,nm=(nameIndex[code]||rowName(code)||'').toLowerCase();if(nm)rows.forEach(r=>{let c=rowCode(r);if(c&&c!==code&&!dup&&(nameIndex[c]||rowName(c)||'').toLowerCase()===nm)dup=c});let msg='Добавлено: '+code+(isBase?'':' · UNVERIFIED')+(dup?' · название уже есть у '+dup:'');$('#add-status').textContent=msg;if(dup)toast('ID добавлен, но такое название уже есть у '+dup);log('Добавлен товар '+code+(isBase?'':' (Unverified)')+(dup?' — совпадение названия с '+dup:''));renderGoods();renderTraderList();if($('#add-dialog').open)renderAddResults()}
$('#add-manual').onsubmit=e=>{e.preventDefault();addCode($('#add-id').value,false);$('#add-id').value='';$('#add-name').value=''};

$('#add-trader').onclick=async()=>{if(!doc)return toast('Сначала импортируйте файл');let def=selectedSector&&selectedSector!=='ПРОЧИЕ'?selectedSector+'_':'';let name=(await askText('Имя нового торговца','Например: '+def+'Armory')||'').trim();if(!name)return;if(name in doc.traders)return toast('Торговец с таким именем уже есть');doc.traders[name]=[];selected=name;log('Создан торговец '+name);renderSectors();renderTraderList();renderGoods()};
$('#add-all-traders').onclick=()=>{if(!doc)return toast('Сначала импортируйте файл');let sectors=new Set();Object.keys(doc.traders).forEach(k=>{let s=parseTrader(k).sector;if(s!=='ПРОЧИЕ')sectors.add(s)});let added=0;
if(sectors.size){sectors.forEach(s=>ROLES.forEach(r=>{let key=s+'_'+r;if(!(key in doc.traders)){doc.traders[key]=[];added++}}))}
else{STANDARD.forEach(n=>{if(!(n in doc.traders)){doc.traders[n]=[];added++}})}
if(!added)return toast('Все стандартные торговцы уже есть');if(!selectedSector&&sectors.size)selectedSector=[...sectors][0];if(!selected)selected=Object.keys(doc.traders)[0];log('Добавлены стандартные торговцы: '+added);renderSectors();renderTraderList();renderGoods()};
$('#del-trader').onclick=async()=>{if(!doc||!selected)return toast('Выберите торговца');if(!(await askConfirm('Удалить торговца','Список «'+selected+'» ('+(doc.traders[selected]||[]).length+' строк) будет удалён из документа.')))return;delete doc.traders[selected];log('Удалён торговец '+selected);selected=Object.keys(doc.traders)[0]||null;renderSectors();renderTraderList();renderGoods()};
$('#clear-list').onclick=async()=>{if(!doc||!selected)return toast('Выберите торговца');if(!(await askConfirm('Очистить список','Все строки торговца «'+selected+'» будут удалены.')))return;doc.traders[selected]=[];log('Список '+selected+' очищен');renderGoods();renderTraderList()};

$('#copy-list').onclick=()=>{if(!doc||!selected)return toast('Выберите торговца');let others=Object.keys(doc.traders).filter(k=>k!==selected);if(!others.length)return toast('Нет других торговцев для копирования');$('#copy-source').textContent='из «'+selected+'»';let box=$('#copy-box');box.innerHTML='';others.forEach(k=>{let p=parseTrader(k);let l=document.createElement('label');let c=document.createElement('input');c.type='checkbox';c.value=k;l.append(c,document.createTextNode(p.label+(p.sector!=='ПРОЧИЕ'?' ('+sectorLabel(p.sector)+')':'')));let sm=document.createElement('small');sm.textContent=(doc.traders[k]||[]).length+' строк';l.append(sm);box.append(l)});$('#copy-status').textContent='';$('#copy-dialog').showModal()};
$('#copy-close').onclick=()=>$('#copy-dialog').close();
$('#copy-apply').onclick=()=>{if(!doc||!selected)return;let targets=[...document.querySelectorAll('#copy-box input:checked')].map(i=>i.value);if(!targets.length)return toast('Отметьте торговцев');let src=doc.traders[selected]||[];snapUndo('копирование строк');let copied=0;targets.forEach(t=>{let have=new Set((doc.traders[t]||[]).map(r=>rowCode(r)));src.forEach(r=>{let c=rowCode(r);if(!have.has(c)){doc.traders[t].push(JSON.parse(JSON.stringify(r)));have.add(c);copied++}})});$('#copy-dialog').close();log('Скопировано строк: '+copied+' → '+targets.join(', '));renderGoods();renderTraderList()};

$('#add-by-cats').onclick=()=>{if(!doc)return toast('Сначала импортируйте файл');if(!selected)return toast('Выберите торговца');let ass=traderAssortment();$('#cats-target').textContent='→ '+selected+(ass&&ass.length?' · ассортимент SCUM':'');let box=$('#cats-box');box.innerHTML='';let rowsC=doc.traders[selected]||[];let have=new Set(rowsC.map(r=>rowCode(r)));let haveNames={};rowsC.forEach(r=>{let c=rowCode(r);let nm=(nameIndex[c]||rowName(c)||'').toLowerCase();if(nm&&!haveNames[nm])haveNames[nm]=c});catNames().filter(c=>!ass||ass.includes(c)).forEach(c=>{let n=flatDb().filter(x=>x.cat===c&&!have.has(x.id)&&!haveNames[x.name.toLowerCase()]).length+custom.filter(x=>(x.category||'Разное')===c&&!have.has(x.id)&&!haveNames[(x.name||'').toLowerCase()]).length;if(!n)return;let l=document.createElement('label');let cb=document.createElement('input');cb.type='checkbox';cb.value=c;l.append(cb,document.createTextNode(c));let sm=document.createElement('small');sm.textContent='доступно: '+n+' записей';l.append(sm);box.append(l)});if(!box.children.length)box.innerHTML='<p class="empty">'+(ass&&!ass.length?'У этого торговца нет стандартного ассортимента в SCUM — используйте ручной ввод ID':'Все позиции уже у торговца — добавлять нечего')+'</p>';$('#cats-status').textContent='';$('#cats-dialog').showModal()};
$('#cats-close').onclick=()=>$('#cats-dialog').close();
$('#cats-apply').onclick=()=>{if(!doc||!selected)return;let cats=[...document.querySelectorAll('#cats-box input:checked')].map(i=>i.value);if(!cats.length)return toast('Отметьте категории');snapUndo('добавление по категориям');let rows=doc.traders[selected],have=new Set(rows.map(r=>rowCode(r))),haveNames={};rows.forEach(r=>{let c=rowCode(r);let nm=(nameIndex[c]||rowName(c)||'').toLowerCase();if(nm&&!haveNames[nm])haveNames[nm]=c});let added=0,skipped=0;cats.forEach(c=>{flatDb().filter(x=>x.cat===c).forEach(x=>{if(have.has(x.id)||haveNames[x.name.toLowerCase()]){skipped++;return}rows.push({...DEFS,'tradeable-code':x.id});have.add(x.id);added++});custom.filter(x=>(x.category||'Разное')===c).forEach(x=>{if(have.has(x.id)||haveNames[(x.name||'').toLowerCase()]){skipped++;return}rows.push({...DEFS,'tradeable-code':x.id});have.add(x.id);added++})});$('#cats-dialog').close();log('Добавлено по категориям: '+added+' строк → '+selected+(skipped?' · пропущено уже имеющихся: '+skipped:''));renderGoods();renderTraderList()};

function applyMass(names,vals){snapUndo('масс-правка ('+names.length+' трейдеров)');names.forEach(n=>(doc.traders[n]||[]).forEach(r=>Object.assign(r,vals)));log('Массовое применение: '+Object.keys(vals).join(', ')+' → '+(names.length===1?names[0]:names.length+' трейдеров'));renderGoods()}
function targetNames(scope){if(scope==='current')return selected?[selected]:[];if(scope==='sector')return traderSectors()[selectedSector]||[];return Object.keys(doc?.traders||{})}
function parseNum(v){let x=parseFloat(String(v??'').trim().replace(',','.'));return isFinite(x)?x:null}
function applyTool(field,scope){if(!doc)return toast('Сначала импортируйте EconomyOverride.json');let names=targetNames(scope);if(!names.length)return toast(scope==='sector'?'В секторе нет торговцев':'Выберите торговца');let t=field==='base-purchase-price'?'buy':field==='base-sell-price'?'sell':'fame';let pv=$('#pct-'+t).value.trim().replace(',','.'),av=$('#abs-'+t).value.trim();if(pv===''&&av==='')return toast('Введите процент или точное значение');if(pv!==''&&!/^-?\d+(\.\d+)?$/.test(pv))return toast('Процент — число, например 20 или -10');if(av!==''&&!okNum(av))return toast('Точное значение — число, например 9999 или -1');if(pv!==''&&av!=='')return toast('Заполните процент ИЛИ точное значение — не оба');let lab=field==='base-purchase-price'?'Наценка (покупка)':field==='base-sell-price'?'Цена продажи':'Очки славы';snapUndo(lab+' ('+names.length+' трейдеров)');let upd=0,skip=0;names.forEach(n=>(doc.traders[n]||[]).forEach(r=>{if(av!==''){r[field]=av;upd++;return}let cur=parseNum(r[field]);if(cur===null||cur<0){skip++;return}r[field]=String(Math.round(cur*(1+parseFloat(pv)/100)));upd++}));log(lab+': '+($('#pct-'+t).value.trim()!==''?pv+'% от текущих':'точно '+av)+' → обновлено '+upd+(skip?' · пропущено (−1/default): '+skip:'')+' → '+(names.length===1?names[0]:names.length+' трейдеров'));renderGoods()}
[['buy','base-purchase-price'],['sell','base-sell-price'],['fame','required-famepoints']].forEach(([t,f])=>['current','sector','all'].forEach(s=>{$('#tool-'+t+'-'+s).onclick=()=>applyTool(f,s)}));
document.querySelectorAll('.tool-tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tool-tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.tool-pane').forEach(p=>p.classList.toggle('active',p.dataset.tool===b.dataset.tool))});
$('#vis-apply-list').onclick=()=>{let v=$('#vis-status').value;if(!doc||!selected)return toast('Выберите торговца');if(!v)return toast('Выберите статус');applyMass([selected],{'can-be-purchased':v})};
$('#vis-apply-cat').onclick=()=>{let v=$('#vis-cat-status').value,c=$('#vis-cat').value;if(!doc||!selected)return toast('Выберите торговца');if(!v)return toast('Выберите статус');let n=0;snapUndo('видимость категории');(doc.traders[selected]||[]).forEach(r=>{if(c==='all'||rowCategory(rowCode(r))===c){r['can-be-purchased']=v;n++}});log('Видимость «'+((VIS_OPTS.find(o=>o[0]===v)||['',''])[1])+'» → '+n+' строк категории «'+(c==='all'?'все категории':c)+'» у '+selected);renderGoods()};
$('#delta-current').onclick=()=>{let v=$('#mass-delta').value.trim();if(!doc||!selected)return toast('Выберите торговца');if(v===''||!okNum(v))return toast('Введите множитель числом, например -1 или 2.0');applyMass([selected],{'delta-price':v})};
$('#delta-sector').onclick=()=>{let v=$('#mass-delta').value.trim();if(!doc)return toast('Сначала импортируйте файл');let names=traderSectors()[selectedSector]||[];if(!names.length)return toast('В секторе нет торговцев');if(v===''||!okNum(v))return toast('Введите множитель числом, например -1 или 2.0');applyMass(names,{'delta-price':v})};
$('#mass-reset-current').onclick=async()=>{if(!doc||!selected)return toast('Выберите торговца');if(!(await askConfirm('Сброс значений','Все поля «'+selected+'» получат -1 / default.')))return;applyMass([selected],{...DEFS})};

$('#goods-search').oninput=()=>renderGoods();
$('#goods-cat').onchange=()=>renderGoods();

function renderRules(){let box=$('#rule-fields');box.innerHTML='';if(!doc){box.textContent='Импортируйте конфигурацию экономики.';return}Object.keys(doc).filter(k=>k!=='traders').forEach(k=>{let v=doc[k],orig=String(v),boolish=orig==='true'||orig==='false'||orig==='0'||orig==='1';let wrap=document.createElement(boolish?'div':'label');wrap.className='rule-'+(boolish?'bool':'val');let cap=document.createElement('span');cap.textContent=RU_LABELS[k]||k;cap.title=k;if(RU_LABELS[k]){let small=document.createElement('small');small.className='rule-key';small.textContent=k;cap.append(document.createElement('br'),small)}if(boolish){wrap.append(cap);let pair=document.createElement('div');pair.className='toggle-pair';pair.dataset.key=k;let on=document.createElement('button'),off=document.createElement('button');on.type=off.type='button';on.textContent='ВКЛЮЧЕНО';off.textContent='ВЫКЛЮЧЕНО';let truthy=orig==='true'||orig==='1';let paint=()=>{on.className='tg'+(pair.dataset.v==='1'?' on-true':'');off.className='tg'+(pair.dataset.v==='0'?' on-false':'')};pair.dataset.v=truthy?'1':'0';on.onclick=()=>{pair.dataset.v='1';paint()};off.onclick=()=>{pair.dataset.v='0';paint()};paint();pair.append(on,off);wrap.append(pair)}else{let input=document.createElement('input');input.value=v??'';input.dataset.key=k;wrap.append(input)}box.append(wrap)})}
$('#save-rules').onclick=()=>{if(!doc)return;snapUndo('глобальные параметры');document.querySelectorAll('#rule-fields .rule-val input').forEach(i=>doc[i.dataset.key]=i.value);document.querySelectorAll('#rule-fields .rule-bool .toggle-pair').forEach(p=>{let cur=String(doc[p.dataset.key]);doc[p.dataset.key]=p.dataset.v==='1'?(cur==='true'||cur==='false'?'true':'1'):(cur==='true'||cur==='false'?'false':'0')});log('Обновлены глобальные параметры');toast('Параметры обновлены в документе')};

function renderCatalog(){let body=$('#catalog-rows');body.innerHTML='';let q=$('#search').value.toLowerCase(),cat=$('#category').value;let base=flatDb().map(x=>({...x,base:true}));let list=base.concat(custom.map(x=>({...x,cat:x.category||'Разное',base:false}))).filter(x=>(x.name+' '+x.id).toLowerCase().includes(q)&&(cat==='all'||cat===x.cat));let meta=db.meta||{};$('#db-status').textContent='База: '+flatDb().length+' записей · свои записи: '+custom.length+' (сохраняются в data\\custom-items.json)'+(meta.note?' · '+meta.note.split('.')[0]:'');if(!list.length){body.innerHTML='<tr><td colspan="5" class="empty">Ничего не найдено</td></tr>';return}list.forEach(x=>{let tr=document.createElement('tr');let n=document.createElement('td');let nwrap=document.createElement('span');nwrap.className='cell-wrap';let th=document.createElement('img');th.className='thumb';th.alt='';th.style.cursor='zoom-in';th.src='/api/icon/'+encodeURIComponent(x.id)+'?t='+iconBust;th.onerror=()=>{let ph=document.createElement('span');ph.className='thumb-ph';ph.textContent=(x.name||x.id).charAt(0).toUpperCase();ph.style.cursor='pointer';ph.onclick=()=>openIconDialog(x.id);th.replaceWith(ph)};th.onclick=()=>openIconDialog(x.id);let ntext=document.createElement('span');ntext.textContent=x.name;nwrap.append(th,ntext);n.append(nwrap);let i=document.createElement('td');i.innerHTML='<i class="id">'+x.id+'</i>';let c=document.createElement('td');c.textContent=x.cat;let s=document.createElement('td');s.innerHTML='<span class="badge '+(x.base?'base':'unv')+'">'+(x.base?'БАЗА':'UNVERIFIED')+'</span>';tr.append(n,i,c,s);let d=document.createElement('td');d.className='row-actions';let ib=document.createElement('button');ib.className='mini';ib.textContent='ИКОНКА';ib.title='Иконка для '+x.id;ib.onclick=()=>openIconDialog(x.id);d.append(ib);if(!x.base){let b=document.createElement('button');b.className='del';b.textContent='×';b.onclick=async()=>{custom=custom.filter(y=>y!==x);rebuildCustomIndex();await saveCustom();renderCatalog();renderStats()};d.append(b)}tr.append(d);body.append(tr)})}
$('#search').oninput=renderCatalog;$('#category').onchange=renderCatalog;
$('#new-item').onclick=()=>$('#dialog').showModal();$('#cancel').onclick=()=>$('#dialog').close();
$('#item-icon').onchange=()=>{let f=$('#item-icon').files[0];if(!f)return;$('#item-icon-url').value='';let img=$('#item-icon-preview');img.src=URL.createObjectURL(f);img.hidden=false};
$('#item-icon-url').oninput=()=>{let u=$('#item-icon-url').value.trim();if(!u)return;$('#item-icon').value='';let img=$('#item-icon-preview');img.src=u;img.hidden=false};
$('#item-form').onsubmit=async e=>{e.preventDefault();let id=$('#item-id').value.trim();let f=$('#item-icon').files[0],u=$('#item-icon-url').value.trim();
if(f||u){let r=await uploadIcon(id,f,u);if(!r.ok)toast('Иконка не сохранена: '+r.error)}
custom.push({name:$('#item-name').value.trim(),id,category:$('#item-category').value});rebuildCustomIndex();await saveCustom();e.target.reset();$('#item-icon-preview').hidden=true;$('#item-icon-preview').removeAttribute('src');$('#dialog').close();renderCatalog();renderStats();log('Создана пользовательская запись Unverified'+((f||u)?' + иконка':''))};

async function uploadIcon(id,file,url){try{let body,route;if(file){if(file.size>2*1024*1024)return{ok:false,error:'Файл больше 2 МБ'};let bytes=new Uint8Array(await file.arrayBuffer());let bin=Array.from(bytes,x=>String.fromCharCode(x)).join('');let ext='.'+((file.name.split('.').pop()||'png').toLowerCase());body={id,dataB64:btoa(bin),ext};route='/api/icons/upload'}else{body={id,url};route='/api/icons/fetch_url'}
let r=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let d=await r.json();if(!r.ok||!d.ok)return{ok:false,error:d.error||'Ошибка загрузки иконки'};iconBust=Date.now();return{ok:true}}catch(e){return{ok:false,error:e.message}}}

function openIconDialog(id){iconTargetId=id;$('#icon-target').textContent=id;$('#icon-file').value='';$('#icon-url').value='';$('#icon-status').textContent='';
let img=$('#icon-current-img'),none=$('#icon-current-none');let src='/api/icon/'+encodeURIComponent(id)+'?t='+Date.now();let probe=new Image();
probe.onload=()=>{img.src=src;img.hidden=false;none.hidden=true};probe.onerror=()=>{img.hidden=true;none.hidden=false};probe.src=src;
$('#icon-dialog').showModal()}
$('#icon-close').onclick=()=>$('#icon-dialog').close();
$('#icon-apply').onclick=async()=>{let f=$('#icon-file').files[0],u=$('#icon-url').value.trim();if(!f&&!u)return $('#icon-status').textContent='Выберите файл или вставьте URL';let r=await uploadIcon(iconTargetId,f,u);if(!r.ok)return $('#icon-status').textContent=r.error;$('#icon-status').textContent='Иконка обновлена';$('#icon-dialog').close();refreshIcons()};
$('#icon-remove').onclick=async()=>{try{await fetch('/api/icons/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:iconTargetId})})}catch(e){}iconBust=Date.now();$('#icon-status').textContent='Иконка удалена';$('#icon-dialog').close();refreshIcons()};
function refreshIcons(){renderGoods();renderCatalog()}

$('#db-import-btn').onclick=()=>$('#db-import').click();
$('#db-import').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let text=await f.text();if(f.name.toLowerCase().endsWith('.csv')){let n=0;text.split(/\r?\n/).forEach(line=>{if(!line.trim())return;let p=line.split(',');if(p.length<2)return;let nm=p[0].trim(),id=p[1].trim(),cat=(p[2]||'Разное').trim();if(nm.toLowerCase()==='name'&&id.toLowerCase()==='id')return;if(!id)return;custom.push({name:nm,id,category:cat});n++});rebuildCustomIndex();await saveCustom();log('Импортировано записей в каталог (UNVERIFIED): '+n);toast('CSV импортирован: '+n+' записей')}else{let parsed=JSON.parse(text);if(Array.isArray(parsed)){parsed.forEach(x=>{if(x&&x.id)custom.push({name:x.name||x.id,id:x.id,category:x.category||'Разное'})});rebuildCustomIndex();await saveCustom();log('Импортированы свои записи (UNVERIFIED): '+parsed.length);toast('Импортировано записей: '+custom.length)}else if(parsed&&Array.isArray(parsed.categories)){let seen=new Set();db.categories.forEach(c=>c.items.forEach(i=>seen.add(i.id)));parsed.categories.forEach(c=>{let items=(c.items||[]).filter(i=>i&&i.id&&!seen.has(i.id));items.forEach(i=>seen.add(i.id));if(items.length){let ex=db.categories.find(y=>y.name===c.name);if(ex)ex.items=ex.items.concat(items);else db.categories.push({name:c.name,items})}});dbIndex={};db.categories.forEach(c=>c.items.forEach(i=>{dbIndex[i.id]=c.name}));rebuildNameIndex();log('Импортирована база предметов: '+f.name);toast('База обновлена')}else return toast('Формат JSON не распознан: ожидается {categories:[...]} или массив записей')}populateCats();renderCatalog();renderStats();renderGoods()}catch(err){toast('Ошибка импорта базы: '+err.message)}e.target.value=''};

function renderHistory(){let box=$('#history-list');box.innerHTML='';if(!history.length){box.innerHTML='<p class="empty">Изменений пока нет.</p>';return}history.forEach(x=>{let d=document.createElement('div');d.className='history-row';let t=document.createElement('time');t.textContent=x.at;d.append(t,document.createTextNode(x.text));box.append(d)})}
$('#clear-history').onclick=()=>{history=[];renderHistory()};

function renderPreview(){$('#json-preview').value=doc?serverDocText():''}

function rowIndexOf(rows){let m=new Map();(rows||[]).forEach(r=>{let c=rowCode(r);if(c)m.set(c,r)});return m}
function normalizeRows(d){Object.values(d&&d.traders||{}).forEach(rows=>{if(!Array.isArray(rows))return;rows.forEach(r=>{if(!r||typeof r!=='object')return;if(!('can-be-purchased'in r))r['can-be-purchased']='default';if(!('available-after-sale-only'in r))r['available-after-sale-only']='default'})})}
function buildDiff(){if(!originalDoc||!doc)return null;let out={keys:[],traders:[]};let a=originalDoc,b=doc;
Object.keys(doc).forEach(k=>{if(k!=='traders'&&!(k in a))out.keys.push(['add',k,''])});
Object.keys(a).forEach(k=>{if(k==='traders')return;if(!(k in b))out.keys.push(['rem',k,'']);else if(String(a[k])!==String(b[k]))out.keys.push(['chg',k,String(a[k])+' → '+String(b[k])])});
let ta=a.traders||{},tb=b.traders||{};
Object.keys(tb).forEach(name=>{if(!(name in ta)){out.traders.push({name,added:(tb[name]||[]).length,removed:0,changed:0,fields:{}});return}
let A=rowIndexOf(ta[name]),B=rowIndexOf(tb[name]);let added=0,removed=0,changed=0,fields={};
B.forEach((row,code)=>{let ra=A.get(code);if(!ra){added++;return}let f=FIELDS.filter(fl=>String(ra[fl]??'')!==String(row[fl]??''));if(f.length){changed++;f.forEach(x=>fields[x]=(fields[x]||0)+1)}});
A.forEach((_,code)=>{if(!B.has(code))removed++});
if(added||removed||changed)out.traders.push({name,added,removed,changed,fields})});
Object.keys(ta).forEach(name=>{if(!(name in tb))out.traders.push({name,added:0,removed:(ta[name]||[]).length,changed:0,fields:{}})});
return out}
function renderDiff(){let d=buildDiff(),sum=$('#diff-summary'),list=$('#diff-list');if(!d){sum.textContent='Нет загруженного документа.';list.innerHTML='';return}
let tAdd=d.traders.reduce((n,t)=>n+t.added,0),tRem=d.traders.reduce((n,t)=>n+t.removed,0),tChg=d.traders.reduce((n,t)=>n+t.changed,0);
let empty=!d.keys.length&&!d.traders.length;
sum.innerHTML=empty?'<b style="color:var(--green)">Различий нет</b> — документ совпадает с базой.':'Строк добавлено: <b>'+tAdd+'</b> · удалено: <b>'+tRem+'</b> · изменено: <b>'+tChg+'</b>'+(d.keys.length?' · ключей верхнего уровня: <b>'+d.keys.length+'</b>':'');
list.innerHTML='';if(empty){list.innerHTML='<p class="hint-inline">База: последний импорт, применённый JSON, загруженный пресет или скачанный файл.</p>';return}
d.keys.forEach(([t,k,detail])=>{let r=document.createElement('div');r.className='diff-row';let s=document.createElement('span');s.className=t==='add'?'add':t==='rem'?'rem':'chg';s.textContent=(t==='add'?'+ ':t==='rem'?'− ':'~ ')+k;if(detail){let dm=document.createElement('span');dm.className='hint-inline';dm.textContent=detail;r.append(s,dm)}else r.append(s);list.append(r)});
d.traders.forEach(t=>{let r=document.createElement('div');r.className='diff-row';let nm=document.createElement('span');nm.className='nm';nm.textContent=t.name;
let parts=[];if(t.added)parts.push('<span class="add">+'+t.added+'</span>');if(t.removed)parts.push('<span class="rem">−'+t.removed+'</span>');if(t.changed)parts.push('<span class="chg">~'+t.changed+'</span>');
let fld=Object.entries(t.fields).map(([f,c])=>fshort(f)+': '+c).join(', ');
let val=document.createElement('span');val.innerHTML=parts.join(' · ')+(fld?' <span class="hint-inline">('+fld+')</span>':'');
r.append(nm,val);list.append(r)})}

async function applyDoc(parsed,label,note){let check=await fetch('/api/economy/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(parsed)}).then(r=>r.json()).catch(()=>null);if(check&&!check.ok)return toast(check.issues[0]);if(doc)snapUndo('документ до «'+label+'»');
doc=JSON.parse(JSON.stringify(parsed));normalizeRows(doc);originalDoc=JSON.parse(JSON.stringify(doc));selected=Object.keys(doc.traders||{})[0]||null;selectedSector=null;changes=0;updateFlag();renderAll();updateUndoBtn();
let warn=(check&&Array.isArray(check.warnings)&&check.warnings.length)?' · предупреждение: '+check.warnings[0]+(check.warnings.length>1?' (+'+(check.warnings.length-1)+')':''):'';
log(label+(note?' ('+note+')':'')+warn);toast(label+(note?' · '+note:'')+warn);autoIconSync().catch(()=>{})}

$('#export-download').onclick=async()=>{if(!doc)return toast('Сначала импортируйте JSON');let iss=docIssues();if((iss.bad||iss.dups)&&!(await askConfirm('Проверка файла','В документе возможные проблемы: нечисловых значений: '+iss.bad+' · дублей кода: '+iss.dups+(iss.samples.length?'\n'+iss.samples.join('\n'):'')+'\n\nВсё равно сохранить?')))return;let payload=serverDocText();try{let d=await fetch('/api/export/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:payload})}).then(r=>r.json());if(!d.ok)return toast(d.error||'Ошибка сохранения');originalDoc=JSON.parse(JSON.stringify(doc));changes=0;updateFlag();log('JSON сохранён (формат economy-override): '+d.path+' — дифф сброшен');toast('JSON сохранён: '+d.path)}catch(e){toast('Сохранение: '+e.message)}};
$('#export-open').onclick=async()=>{try{let d=await fetch('/api/export/open',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json());if(!d.ok)toast(d.error||'Не удалось открыть папку')}catch(e){toast('Открыть папку: '+e.message)}};
$('#export-apply').onclick=()=>{let txt=$('#json-import').value.trim();if(!txt)return toast('Вставьте технический JSON');let parsed;try{parsed=JSON.parse(txt)}catch(e){return toast('Ошибка JSON: '+e.message)}let norm=normalizeImport(parsed);if(!norm.doc)return toast(norm.note);applyDoc(norm.doc,'Применён технический JSON',norm.note)};

function normalizeImport(parsed){if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){if(parsed.traders&&typeof parsed.traders==='object')return{doc:parsed,note:null};
for(const w of ['economy-override','economy','EconomyOverride','data']){let inner=parsed[w];if(inner&&typeof inner==='object'&&!Array.isArray(inner)&&inner.traders)return{doc:inner,note:'снята обёртка «'+w+'»'}}
let keys=Object.keys(parsed);let arrs=keys.filter(k=>Array.isArray(parsed[k]));
if(arrs.length&&arrs.length===keys.length){let traders={};let ok=true;arrs.forEach(k=>{let arr=parsed[k];if(!arr.length)return;let sample=arr.find(x=>x&&typeof x==='object');if(!sample&&typeof arr[0]!=='string')return ok=false;traders[k]=arr.map(it=>{if(typeof it==='string'||typeof it==='number')return{...DEFS,'tradeable-code':String(it)};let code=['tradeable-code','TradeableCode','tradeableCode','code','id','ID','class','ClassName','className'].map(f=>it[f]).find(v=>typeof v==='string'&&v.trim()||typeof v==='number');if(code===undefined)return null;let row={...DEFS,'tradeable-code':String(code).trim()};Object.entries(it).forEach(([fk,fv])=>{if(fk!=='tradeable-code'&&typeof fv!=='object')row[fk]=String(fv)});return row}).filter(Boolean)});if(ok&&Object.keys(traders).length)return{doc:{traders},note:'формат нормализован — проверьте ID'}}
if(Array.isArray(parsed)){let traders={};let ok=true;parsed.forEach(t=>{if(!t||typeof t!=='object')return ok=false;let name=t.name??t.Name??t.trader??t.traderName??t.className??t.ClassName;let items=t.items??t.Items??t.goods??t.stock;if(typeof name!=='string'||!Array.isArray(items))return ok=false;traders[name]=items.map(it=>{if(typeof it==='string'||typeof it==='number')return{...DEFS,'tradeable-code':String(it)};if(it&&typeof it==='object'){let code=['tradeable-code','TradeableCode','tradeableCode','code','id','ID','class','ClassName','className'].map(f=>it[f]).find(v=>typeof v==='string'&&v.trim()||typeof v==='number');if(code===undefined)return null;let row={...DEFS,'tradeable-code':String(code).trim()};Object.entries(it).forEach(([fk,fv])=>{if(fk!=='tradeable-code'&&typeof fv!=='object')row[fk]=String(fv)});return row}return null}).filter(Boolean)});if(ok&&Object.keys(traders).length)return{doc:{traders},note:'список торговцев нормализован — проверьте ID'}}}
return{doc:null,note:'формат не распознан: ожидается {"traders":{...}}'}}

$('#import').onclick=()=>{if(qModule)return $('#qfile').click();$('#file').click()};
$('#file').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let parsed=JSON.parse(await f.text());let norm=normalizeImport(parsed);if(!norm.doc)return toast(norm.note);await applyDoc(norm.doc,'Импортирован '+f.name,norm.note)}catch(err){toast('Ошибка JSON: '+err.message)}e.target.value=''};

async function presetsRefresh(){try{let r=await fetch('/api/presets');let d=await r.json();let box=$('#preset-list');box.innerHTML='';if(!(d.presets||[]).length){box.innerHTML='<p class="empty">Пресетов пока нет</p>';return}
d.presets.forEach(p=>{let row=document.createElement('div');row.className='preset-item';let info=document.createElement('div');let nm=document.createElement('b');nm.textContent=p.name;let sm=document.createElement('small');sm.textContent=(p.savedAt?'сохранён '+p.savedAt.replace('T',' ').slice(0,16)+' UTC':'')+' · торговцев: '+p.traders+', строк: '+p.items;info.append(nm,sm);
let act=document.createElement('div');act.className='actions';
let ex=document.createElement('button');ex.textContent='ЭКСПОРТ';ex.onclick=async()=>{try{let rr=await fetch('/api/presets/load',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:p.name})});let dd=await rr.json();if(!dd.ok)return toast(dd.error||'Ошибка экспорта');let payload={app:'MIDWAY Economy Control',format:'midway-preset-v1',name:p.name,savedAt:p.savedAt||dd.savedAt||'',doc:dd.doc};let blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=p.name.replace(/[^\w\-. ]/g,'').trim()+'.preset.json';a.click();URL.revokeObjectURL(url);toast('Файл пресета сохранён — можно передать другому пользователю')}catch(e){toast('Экспорт: '+e.message)}};
let lb=document.createElement('button');lb.textContent='ЗАГРУЗИТЬ';lb.onclick=async()=>{if(doc&&!(await askConfirm('Загрузить пресет','Текущий документ будет заменён пресетом «'+p.name+'».')))return;try{let rr=await fetch('/api/presets/load',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:p.name})});let dd=await rr.json();if(!dd.ok)return toast(dd.error||'Ошибка загрузки');applyDoc(dd.doc,'Загружен пресет «'+p.name+'»')}catch(e){toast('Пресет: '+e.message)}};
let dl=document.createElement('button');dl.textContent='УДАЛИТЬ';dl.onclick=async()=>{if(!(await askConfirm('Удалить пресет','«'+p.name+'» будет удалён с диска.')))return;await fetch('/api/presets/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:p.name})});presetsRefresh();toast('Пресет удалён')};
act.append(ex,lb,dl);row.append(info,act);box.append(row)})}catch(e){$('#preset-list').innerHTML='<p class="empty">Сервер пресетов недоступен</p>'}}
$('#preset-save').onclick=async()=>{if(!doc)return toast('Нет документа для сохранения');let name=$('#preset-name').value.trim();if(!name)return toast('Введите имя пресета');try{let r=await fetch('/api/presets/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,doc})});let d=await r.json();if(!d.ok)return toast(d.error||'Ошибка сохранения');$('#preset-name').value='';presetsRefresh();toast('Пресет «'+d.name+'» сохранён')}catch(e){toast('Пресет: '+e.message)}};
$('#preset-import-btn').onclick=()=>$('#preset-import').click();
$('#preset-import').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let parsed=JSON.parse(await f.text());let docPart=null,name=f.name.replace(/\.preset\.json$|\.json$/i,'');
if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){if(parsed.doc&&typeof parsed.doc==='object'){docPart=parsed.doc;if(typeof parsed.name==='string'&&parsed.name.trim())name=parsed.name}else{let norm=normalizeImport(parsed);docPart=norm.doc;if(!docPart)return toast('Файл пресета не распознан: '+norm.note)}}
if(!docPart)return toast('Файл пресета не распознан: ожидается {name,doc} или документ с traders');
let r=await fetch('/api/presets/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,doc:docPart})});let d=await r.json();if(!d.ok)return toast(d.error||'Ошибка импорта');presetsRefresh();toast('Пресет «'+d.name+'» добавлен в список')}catch(err){toast('Импорт пресета: '+err.message)}e.target.value=''};

function renderAll(){renderStats();renderSectors();renderTraderList();renderGoods();renderRules();renderCatalog();renderPreview();updateFlag();renderDiff()}

function ftpCredentials(){return {host:$('#ftp-host').value.trim(),port:Number($('#ftp-port').value||21),username:$('#ftp-user').value,password:$('#ftp-pass').value,remotePath:$('#ftp-path').value.trim()}}
async function ftpRequest(route,extra={}){let r=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...ftpCredentials(),...extra})});let d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'FTP request failed');return d}
async function saveConnection(type,data){try{await fetch('/api/connections/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,data})})}catch(e){}}
async function deleteConnection(type){try{await fetch('/api/connections/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type})})}catch(e){}}
async function loadConnections(){try{let d=await fetch('/api/connections').then(r=>r.json());let c=d.connections||{};
if(c.ftp){$('#ftp-host').value=c.ftp.host||'';$('#ftp-port').value=c.ftp.port||21;$('#ftp-user').value=c.ftp.username||'';$('#ftp-pass').value=c.ftp.password||'';let rp=String(c.ftp.remotePath||'').trim()||'/Server/SCUM/Saved/Config/WindowsServer';if(/^\/SCUM\/Saved\/Config\/WindowsServer\/?$/i.test(rp)){rp='/Server/SCUM/Saved/Config/WindowsServer';saveConnection('ftp',Object.assign({},c.ftp,{remotePath:rp}))}$('#ftp-path').value=rp;$('#ftp-save').checked=true}
if(c.rcon){$('#rcon-host').value=c.rcon.host||'';$('#rcon-port').value=c.rcon.port||'';$('#rcon-pass').value=c.rcon.password||'';$('#rcon-save').checked=true}}catch(e){}}
function syncFtpSave(){if($('#ftp-save').checked)saveConnection('ftp',ftpCredentials());else deleteConnection('ftp')}
$('#rcon-save-btn').onclick=()=>{if($('#rcon-save').checked){saveConnection('rcon',{host:$('#rcon-host').value.trim(),port:Number($('#rcon-port').value||0),password:$('#rcon-pass').value});toast('Данные RCON сохранены локально')}else{deleteConnection('rcon');toast('Сохранённые данные RCON удалены')}};

function srvStatus(s){$('#srv-status').textContent=s+' · '+new Date().toLocaleTimeString()}
function serverDocText(){return JSON.stringify({'economy-override':doc},null,2)}
function okNum(v){return /^-?\d+(\.\d+)?$/.test(String(v).trim())}
function docIssues(){let bad=0,dups=0,samples=[];Object.keys(doc.traders||{}).forEach(t=>{let seen=new Set();(doc.traders[t]||[]).forEach(r=>{let c=rowCode(r);if(c){if(seen.has(c)){dups++;if(samples.length<3)samples.push(t+': дубль '+c)}seen.add(c)}['base-purchase-price','base-sell-price','delta-price','required-famepoints'].forEach(f=>{let v=String(r[f]??'').trim();if(v!==''&&!okNum(v)){bad++;if(samples.length<3)samples.push(t+' / '+c+': '+f+' = '+v)}})})});return{bad,dups,samples}}
async function pushDocToServer(c){let iss=docIssues();if((iss.bad||iss.dups)&&!(await askConfirm('Проверка файла','В документе возможные проблемы: нечисловых значений: '+iss.bad+' · дублей кода: '+iss.dups+(iss.samples.length?'\n'+iss.samples.join('\n'):'')+'\n\nSCUM может отвергнуть такой файл и перезаписать его стандартным. Выгрузить всё равно?')))throw new Error('выгрузка отменена');let payload=serverDocText(),bytes=Array.from(new TextEncoder().encode(payload),x=>String.fromCharCode(x)).join(''),content=btoa(bytes);let d=await ftpRequest('/api/ftp/upload',{fileName:'EconomyOverride.json',content,confirm:true});log('Документ выгружен на сервер в формате economy-override; backup='+d.backupCreated);return d}
$('#srv-download').onclick=async()=>{let c=ftpCredentials();if(!c.host)return toast('Заполните FTP-профиль во вкладке «FTP / ФАЙЛЫ»');let btn=$('#srv-download');btn.disabled=true;srvStatus('Скачиваю EconomyOverride.json…');
try{let d=await ftpRequest('/api/ftp/download',{fileName:'EconomyOverride.json',remotePath:c.remotePath||'/'});
try{await fetch('/api/snapshots/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:'EconomyOverride.json',content:d.content})})}catch(e){}
let bytes=Uint8Array.from(atob(d.content),ch=>ch.charCodeAt(0));let parsed=JSON.parse(new TextDecoder().decode(bytes));let norm=normalizeImport(parsed);if(!norm.doc)throw new Error('формат файла не распознан: '+(norm.note||''));
srvStatus('Скачано с '+c.host+' · снапшот в data\\server-files');await applyDoc(norm.doc,'Загружено с сервера','снапшот в data\\server-files')}
catch(e){srvStatus('Ошибка скачивания');toast('Сервер: '+e.message)}
finally{btn.disabled=false}};
$('#srv-upload').onclick=async()=>{if(!doc)return toast('Сначала импортируйте документ');let c=ftpCredentials();if(!c.host)return toast('Заполните FTP-профиль во вкладке «FTP / ФАЙЛЫ»');if(!(await askConfirm('Выгрузка на сервер','Отправить текущий документ как EconomyOverride.json в '+(c.remotePath||'/')+'? Существующий файл будет скопирован в .backup-метку. Отсутствующие папки будут созданы.')))return;let btn=$('#srv-upload');btn.disabled=true;
try{let d=await pushDocToServer(c);srvStatus('Документ выгружен на сервер (backup='+(d.backupCreated?'создан':'нет')+(d.dirsCreated&&d.dirsCreated.length?', папки: '+d.dirsCreated.join(', '):'')+')');toast((d.backupCreated?'Документ выгружен, резервная копия создана':'Документ выгружен (новый файл)')+' → '+(c.remotePath||'/')+'/EconomyOverride.json');ftpGo(c.remotePath||'/').catch(()=>{})}
catch(e){srvStatus('Ошибка выгрузки');toast('Выгрузка: '+e.message)}
finally{btn.disabled=false}};

function parentPath(p){p=p.replace(/\/+$/,'');let i=p.lastIndexOf('/');return i<=0?'/':p.slice(0,i)}
function joinPath(p,n){return (p==='/'||p==='.'?p.replace(/^\.$/,''):p.replace(/\/+$/,''))+'/'+n}
async function ftpGo(p){try{renderFtpFiles(await ftpRequest('/api/ftp/list',{remotePath:p}));syncFtpSave()}catch(e){toast('FTPS: '+e.message)}}
function renderFtpFiles(d){let box=$('#ftp-files');box.innerHTML='';
if(d.note){let n=document.createElement('p');n.className='note';n.style.color='var(--amber)';n.textContent=d.note;box.append(n)}
if(d.tls===false){let n=document.createElement('p');n.className='note';n.textContent='Подключение без шифрования (plain FTP): пароль передаётся открытым текстом.';box.append(n)}
if(d.path!==undefined)$('#ftp-path').value=d.path;
if(d.path&&d.path!=='/'&&d.path!=='.'){let up=document.createElement('div');up.className='file-row';let b=document.createElement('button');b.textContent='↑ НА УРОВЕНЬ ВЫШЕ';b.onclick=()=>ftpGo(parentPath(d.path));up.append(b);box.append(up)}
(d.files||[]).slice().sort((a,b)=>(a.type==='dir'?0:1)-(b.type==='dir'?0:1)||a.name.localeCompare(b.name)).forEach(f=>{let row=document.createElement('div');row.className='file-row';let name=document.createElement('span');name.textContent=(f.type==='dir'?'[ПАПКА] ':'')+f.name+(f.size&&!f.type.includes('dir')?' · '+f.size:'');row.append(name);
if(f.type==='dir'){let b=document.createElement('button');b.textContent='Открыть';b.onclick=()=>ftpGo(joinPath(d.path,f.name));row.append(b)}
else{let b=document.createElement('button');b.textContent='Скачать';b.onclick=async()=>{try{let file=await ftpRequest('/api/ftp/download',{fileName:f.name,remotePath:d.path}),bytes=Uint8Array.from(atob(file.content),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes])),a=document.createElement('a');a.href=url;a.download=file.fileName;a.click();URL.revokeObjectURL(url);toast('Файл скачан')}catch(e){toast(e.message)}};row.append(b)}
if(/\.json$/i.test(f.name)&&f.type!=='dir'){let ob=document.createElement('button');ob.className='q-only';ob.textContent='→ Редактор';ob.title='Открыть как квест в модуле Q';ob.onclick=()=>qOpenFromServer(f.name,d.path).catch(e=>toast('Открыть: '+e.message));row.append(ob)}
box.append(row)});
if(!(d.files||[]).length&&!d.note){box.innerHTML='<p class="empty">Папка пуста</p>'}}
$('#ftp-list').onclick=()=>ftpGo($('#ftp-path').value.trim()||'/');
$('#ftp-find').onclick=async()=>{let q=$('#ftp-find-q').value.trim();if(!q)return toast('Введите имя файла или часть имени');if(!ftpCredentials().host)return toast('Заполните параметры FTP');let btn=$('#ftp-find');btn.disabled=true;btn.textContent='ИЩУ…';let box=$('#ftp-find-results');box.hidden=false;box.innerHTML='<p class="empty">Ищу на сервере (до 25 секунд)…</p>';try{let d=await ftpRequest('/api/ftp/find',{query:q});box.innerHTML='';(d.results||[]).forEach(r=>{let row=document.createElement('div');row.className='file-row';let name=document.createElement('span');name.textContent=r.name+(r.size?' · '+r.size:'')+' · '+r.dir;name.title=r.path;row.append(name);
let open=document.createElement('button');open.textContent='Открыть папку';open.onclick=()=>{box.hidden=true;ftpGo(r.dir)};row.append(open);
let dl=document.createElement('button');dl.textContent='Скачать';dl.onclick=async()=>{try{let file=await ftpRequest('/api/ftp/download',{fileName:r.name,remotePath:r.dir}),bytes=Uint8Array.from(atob(file.content),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes])),a=document.createElement('a');a.href=url;a.download=file.fileName;a.click();URL.revokeObjectURL(url);toast('Файл скачан')}catch(e){toast('Скачивание: '+e.message)}};row.append(dl);
if(/\.json$/i.test(r.name)){let ob=document.createElement('button');ob.className='q-only';ob.textContent='→ Редактор';ob.title='Открыть как квест в модуле Q';ob.onclick=()=>qOpenFromServer(r.name,r.dir).catch(e=>toast('Открыть: '+e.message));row.append(ob)}
box.append(row)});
if(!(d.results||[]).length)box.innerHTML='<p class="empty">Ничего не найдено'+(d.truncated?' — обход прерван по лимиту времени':'')+'</p>';
else if(d.truncated){let p=document.createElement('p');p.className='empty';p.textContent='Показаны первые найденные — обход сервера остановлен по лимиту';box.append(p)}
else{let p=document.createElement('p');p.className='empty';p.textContent='Найдено: '+(d.results||[]).length;box.append(p)}}
catch(e){box.innerHTML='<p class="empty">Ошибка: '+e.message+'</p>'}
finally{btn.disabled=false;btn.textContent='НАЙТИ ФАЙЛ'}};
$('#ftp-find-q').onkeydown=e=>{if(e.key==='Enter'){$('#ftp-find').click()}};
$('#ftp-icon-scan').onclick=async()=>{if(!ftpCredentials().host)return toast('Заполните параметры FTP');let ids=[...flatDb().map(x=>x.id),...custom.map(x=>x.id)].slice(0,400);if(!ids.length)return toast('Каталог пуст');toast('Сканирую сервер, это может занять до минуты…');try{let d=await fetch('/api/icons/scan_ftp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...ftpCredentials(),ids})}).then(r=>r.json());if(!d.ok)return toast(d.error||'Ошибка поиска');let n=Object.keys(d.found||{}).length;toast('Найдено миниатюр: '+n+' · скачано: '+(d.downloaded||0)+' · папок обойдено: '+(d.stats&&d.stats.dirs||0));if(d.downloaded){iconBust=Date.now();renderGoods();renderCatalog()}}catch(e){toast('Поиск миниатюр: '+e.message)}};
$('#ftp-push-doc').onclick=async()=>{if(!doc)return toast('Сначала импортируйте документ');let c=ftpCredentials();if(!c.host)return toast('Заполните параметры FTP');if(!(await askConfirm('Выгрузка на сервер','Отправить текущий документ как EconomyOverride.json в '+(c.remotePath||'/')+'? Существующий файл будет скопирован в .backup-метку. Отсутствующие папки будут созданы.')))return;try{let d=await pushDocToServer(c);toast((d.backupCreated?'Документ выгружен, резервная копия создана':'Документ выгружен (новый файл)')+' → '+(c.remotePath||'/')+'/EconomyOverride.json'+(d.dirsCreated&&d.dirsCreated.length?' · созданы папки: '+d.dirsCreated.join(', '):''));log('Выгружено на сервер: '+(c.remotePath||'/')+'/EconomyOverride.json');ftpGo(c.remotePath||'/')}catch(e){toast('Выгрузка: '+e.message)}};
$('#ftp-upload').onclick=async()=>{let f=$('#ftp-upload-file').files[0];if(!f)return toast('Выберите файл для загрузки');if(f.size>5*1024*1024)return toast('Максимальный размер — 5 МБ');if(!(await askConfirm('Загрузка на сервер','Загрузить '+f.name+' в '+(ftpCredentials().remotePath||'/')+'? Если файл уже существует — сначала будет создана резервная копия; новый файл загружается без копии. Отсутствующие папки будут созданы.')))return;try{let bytes=new Uint8Array(await f.arrayBuffer()),binary=Array.from(bytes,x=>String.fromCharCode(x)).join(''),content=btoa(binary);let d=await ftpRequest('/api/ftp/upload',{fileName:f.name,content,confirm:true});log('Загружен '+f.name+'; backup='+d.backupCreated+(d.dirsCreated&&d.dirsCreated.length?', созданы папки: '+d.dirsCreated.join(', '):''));toast('Загрузка завершена → '+($('#ftp-path').value.trim()||'/')+'/'+f.name+(d.dirsCreated&&d.dirsCreated.length?' · созданы папки: '+d.dirsCreated.join(', '):''));ftpGo($('#ftp-path').value.trim()||'/')}catch(e){toast('Загрузка: '+e.message)}};
let ftpWatchTimer=null,ftpSnapshot=null;
async function ftpPoll(silent=true){let d=await ftpRequest('/api/ftp/list');let snap=JSON.stringify(d.files.map(x=>({name:x.name,type:x.type,size:x.size,modified:x.modified})).sort((a,b)=>a.name.localeCompare(b.name)));if(ftpSnapshot!==null&&snap!==ftpSnapshot){log('Обнаружено изменение списка удалённых файлов');$('#ftp-watch-status').textContent='Обнаружены изменения · '+new Date().toLocaleTimeString();if(!silent)toast('Список файлов изменился')}else if(ftpSnapshot===null){$('#ftp-watch-status').textContent='Наблюдение активно · '+new Date().toLocaleTimeString()}ftpSnapshot=snap}
$('#ftp-watch').onclick=async()=>{if(ftpWatchTimer){clearInterval(ftpWatchTimer);ftpWatchTimer=null;ftpSnapshot=null;$('#ftp-watch').textContent='Начать мониторинг · 30 сек';$('#ftp-watch-status').textContent='Мониторинг выключен';return}try{await ftpPoll();ftpWatchTimer=setInterval(()=>ftpPoll().catch(e=>{$('#ftp-watch-status').textContent='Ошибка мониторинга: '+e.message}),30000);$('#ftp-watch').textContent='Остановить мониторинг';toast('Мониторинг списка файлов включён')}catch(e){toast('Мониторинг: '+e.message)}};

$('#srv-sync').onclick=async()=>{let c=ftpCredentials();if(!c.host)return toast('Заполните FTP-профиль во вкладке «FTP / ФАЙЛЫ»');let btn=$('#srv-sync');btn.disabled=true;srvStatus('Синхронизирую цены с сервера…');try{let d=await ftpRequest('/api/ftp/download',{fileName:'EconomyOverride.json',remotePath:c.remotePath||'/'});let bytes=Uint8Array.from(atob(d.content),ch=>ch.charCodeAt(0));let parsed=JSON.parse(new TextDecoder().decode(bytes));let norm=normalizeImport(parsed);if(!norm.doc)throw new Error(norm.note||'формат файла не распознан');serverDoc=JSON.parse(JSON.stringify(norm.doc));srvSyncTime=new Date().toLocaleTimeString();let tKeys=serverDoc.traders?Object.keys(serverDoc.traders):[];let srows=Array.isArray(serverDoc.traders&&serverDoc.traders[selected])?serverDoc.traders[selected]:null;let msg;if(!tKeys.length)msg='В файле сервера нет секции traders — сравнивать не с чем';else if(!doc||!doc.traders||!selected)msg='Файл сервера получен — импортируйте документ и выберите торговца, чтобы сравнить цены';else if(!srows)msg='Торговца «'+selected+'» нет в файле сервера (там '+tKeys.length+' торговцев) — сравнение невозможно';else{let rows=doc.traders[selected]||[];let smap=new Map(srows.map(r=>[rowCode(r),r]));let local=new Set(rows.map(r=>rowCode(r)));let matched=0,diffN=0,absentN=0;rows.forEach(r=>{let sr=smap.get(rowCode(r));if(!sr){absentN++;return}matched++;if(FIELDS.some(f=>String(sr[f]??'')!==String(r[f]??'')))diffN++});let serverOnly=0;smap.forEach((v,c)=>{if(!local.has(c))serverOnly++});if(!matched)msg='Файл сервера получен, но совпадений нет: в «'+selected+'» нет ни одной позиции из файла сервера (на сервере позиций: '+smap.size+' — например, '+srows.slice(0,3).map(r=>rowCode(r)).filter(Boolean).join(', ')+')';else if(!diffN&&!absentN&&!serverOnly)msg='Все позиции «'+selected+'» совпадают с сервером ('+matched+') — расхождений нет';else msg='Серверные цены получены: совпадают '+matched+' · расхождений '+diffN+' · нет на сервере '+absentN+(serverOnly?' · на сервере ещё '+serverOnly+' позиций вне списка':'')}renderGoods();srvStatus('Цены сервера получены · '+srvSyncTime);log('Синхронизировано с сервером: '+(c.remotePath||'/')+'/EconomyOverride.json — '+msg);toast(msg)}catch(e){srvStatus('Ошибка синхронизации');toast('Синхронизация: '+e.message)}finally{btn.disabled=false}};
$('#ftp-test').onclick=async()=>{let c=ftpCredentials();if(!c.host)return toast('Заполните хост FTP');let btn=$('#ftp-test');btn.disabled=true;$('#ftp-watch-status').textContent='Проверяю подключение…';try{let d=await fetch('/api/ftp/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)}).then(r=>r.json());let box=$('#ftp-files');box.innerHTML='';(d.steps||[]).forEach(s=>{let row=document.createElement('div');row.className='file-row';if(!s.ok)row.style.color='var(--red)';row.textContent=(s.ok?'✓ ':'✗ ')+s.step+' — '+s.detail;box.append(row)});$('#ftp-watch-status').textContent='Тест: '+(d.ok?'подключение работает':'есть проблемы')+' · '+new Date().toLocaleTimeString();toast(d.ok?'Подключение работает':'Есть проблемы — детали в списке файлов')}catch(e){$('#ftp-watch-status').textContent='Ошибка теста';toast('Тест: '+e.message)}finally{btn.disabled=false}};
let iconAutoBusy=false;
async function autoIconSync(){let now=Date.now();if(iconAutoBusy||now-iconAutoLast<60000)return;iconAutoLast=now;let ids=[...flatDb().map(x=>x.id),...custom.map(x=>x.id)].filter(Boolean).slice(0,2000);if(!ids.length)return;let miss=null;try{miss=await fetch('/api/icons/missing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})}).then(r=>r.json())}catch(e){return}if(!miss||!miss.ok||!miss.missingCount)return;let c=ftpCredentials();if(!c.host)return;iconAutoBusy=true;toast('Автозагрузка иконок: не хватает '+miss.missingCount+' — сканирую FTP…');try{let d=await fetch('/api/icons/scan_ftp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...c,ids})}).then(r=>r.json());if(d.ok){if(d.downloaded){iconBust=Date.now();renderGoods();renderCatalog();log('Автозагрузка иконок с FTP: скачано '+d.downloaded)}toast('Автозагрузка иконок: найдено '+Object.keys(d.found||{}).length+' · скачано '+(d.downloaded||0))}}catch(e){}finally{iconAutoBusy=false}}

fetch('/api/health').then(r=>r.json()).catch(()=>toast('Запустите start.bat'));
fetch('/items-db.json').then(r=>{if(!r.ok)throw 0;return r.json()}).then(d=>{db=d;if(!db.categories)db.categories=[];db.categories.forEach(c=>(c.items||[]).forEach(i=>{dbIndex[i.id]=c.name}));rebuildNameIndex();populateCats();renderCatalog();renderStats();renderGoods()}).catch(()=>{$('#db-status').textContent='items-db.json не найден — доступен ручной ввод ID'});
populateCats();renderCatalog();presetsRefresh();loadConnections();
loadCustom().then(()=>{populateCats();renderCatalog();renderStats();setTimeout(()=>autoIconSync().catch(()=>{}),1500)});

let updLatest=null,updPath=null,updDismissed=false;
async function updateCheck(manual=false){try{let d=await fetch('/api/update/check',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json());
if(d.ok&&d.update){updLatest=d;if(!updDismissed){$('#upd-version').textContent='v'+d.latest;$('#upd-info').textContent='Текущая: v'+d.current+(d.size?' · размер ~'+Math.round(d.size/1048576)+' МБ':'')+' · скачается в папку updates рядом с программой';$('#upd-launch').hidden=true;$('#update-banner').hidden=false}if(manual)toast('Доступно обновление: v'+d.latest)}
else{if(manual)toast(d.ok?'У вас последняя версия (v'+d.current+')':'GitHub недоступен: '+(d.error||'')+' — проверьте интернет')}}catch(e){if(manual)toast('Проверка обновлений: '+e.message)}}
$('#upd-check').onclick=()=>updateCheck(true);
$('#upd-close').onclick=()=>{updDismissed=true;$('#update-banner').hidden=true};
let updTimer=null;
function updFmtMB(n){return (n/1048576).toFixed(1)}
function updPollStart(){if(updTimer)clearInterval(updTimer);$('#upd-progress').hidden=false;$('#update-banner').hidden=false;updTimer=setInterval(updPollTick,500);updPollTick()}
async function updPollTick(){try{let d=await fetch('/api/update/progress').then(r=>r.json());if(!d.ok)return;if(!d.running&&!d.done){if(updTimer){clearInterval(updTimer);updTimer=null}return}if(d.total>0){let p=Math.min(100,Math.max(0,Math.round(d.downloaded*100/d.total)));$('#upd-bar-fill').style.width=p+'%';$('#upd-pct').textContent=p+'%';$('#upd-info').textContent='Скачано '+updFmtMB(d.downloaded)+' из '+updFmtMB(d.total)+' МБ…'}else{$('#upd-pct').textContent='…';$('#upd-info').textContent='Скачано '+updFmtMB(d.downloaded)+' МБ…'}if(d.done){if(updTimer){clearInterval(updTimer);updTimer=null}let btn=$('#upd-download');btn.disabled=false;btn.textContent='СКАЧАТЬ';if(d.dl_ok){updPath=d.path;$('#upd-bar-fill').style.width='100%';$('#upd-pct').textContent='100%';$('#upd-info').textContent='Загружено: '+d.path+' · SHA256 '+String(d.sha256).slice(0,16)+'…';$('#upd-launch').hidden=false;log('Скачано обновление '+d.version+' → '+d.path);toast('Обновление v'+d.version+' скачано');showNotesDialog(updLatest,d.version)}else{$('#upd-progress').hidden=true;toast('Скачивание: '+(d.error||'ошибка'))}}}catch(e){}}
$('#upd-download').onclick=async()=>{if(!updLatest)return;let btn=$('#upd-download');btn.disabled=true;btn.textContent='СКАЧИВАЮ…';try{let d=await fetch('/api/update/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag:'v'+updLatest.latest})}).then(r=>r.json());if(!d.ok){if((d.error||'').includes('выполняется')){updPollStart();return}throw new Error(d.error||'ошибка')}updPollStart()}catch(e){toast('Скачивание: '+e.message);btn.disabled=false;btn.textContent='СКАЧАТЬ'}};
$('#upd-launch').onclick=async()=>{if(!updPath)return;try{let d=await fetch('/api/update/launch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:updPath})}).then(r=>r.json());if(!d.ok)throw new Error(d.error||'ошибка');toast('Новая версия запущена — закройте это окно')}catch(e){toast('Запуск: '+e.message)}};
function showNotesDialog(rel,version){if(!rel)return;$('#notes-version').textContent='v'+(version||rel.latest||'');$('#notes-body').innerHTML=rel.notesHtml||'<p class="note">Описание обновления не указано — подробности на странице релиза.</p>';$('#notes-launch').hidden=!updPath;$('#notes-status').textContent='';$('#notes-dialog').showModal()}
$('#notes-close').onclick=()=>$('#notes-dialog').close();
$('#notes-launch').onclick=()=>$('#upd-launch').click();
updateCheck();
fetch('/api/update/progress').then(r=>r.json()).then(d=>{if(d.ok&&(d.running||(d.done&&d.dl_ok))){updDismissed=false;$('#upd-version').textContent='v'+(d.version||'—');$('#update-banner').hidden=false;if(d.done&&d.dl_ok){updPath=d.path;$('#upd-info').textContent='Загружено: '+d.path+' · SHA256 '+String(d.sha256).slice(0,16)+'…';$('#upd-launch').hidden=false}else if(d.running){updLatest=updLatest||{latest:d.version};updPollStart()}}}).catch(()=>{});
setInterval(()=>updateCheck(false),30*60*1000);
window.addEventListener('beforeunload',()=>{$('#ftp-pass').value='';if(ftpWatchTimer)clearInterval(ftpWatchTimer)});

/* ===== QUEST MODULE (Q) ===== */
const Q_NPCS=['GeneralGoods','Doctor','Armorer','Mechanic'];
const Q_TYPES=['Elimination','Fetch'];
const Q_TIER_REWARD={1:{money:[1000,5000],fame:[10,20]},2:{money:[2000,3500],fame:[15,20]},3:{money:[5000,7500],fame:[25,30]}};
const Q_NAME_RE=/^STORY_[A-Za-z0-9_\-]{1,96}\.json$/;
let qModule=false,lModule=false,qQuests=[],qDoc=null,qName=null,qDirty=false,qDiff=null;

function qFlag(){let f=$('#changes-flag');if(qModule){if(qDirty){f.hidden=false;f.textContent='● Есть изменения'}else f.hidden=true}else{if(changes>0){f.hidden=false;f.textContent='● Есть изменения · '+changes}else f.hidden=true}}
function setModule(m){qModule=(m==='q');lModule=(m==='l');document.body.classList.toggle('mod-q',qModule);document.body.classList.toggle('mod-l',lModule);
$('#prof-tc').classList.toggle('active',m==='tc');$('#prof-q').classList.toggle('active',qModule);$('#prof-l').classList.toggle('active',lModule);
$('#import').textContent=qModule?'← ИМПОРТ ФАЙЛОВ':'← ИМПОРТ ФАЙЛА';$('#import').hidden=lModule;
if(qModule)qRefresh().then(()=>go('q-editor'));else if(lModule){go('l-browse');lootInit()}else go('items');
qFlag()}
$('#prof-tc').onclick=()=>{if(qModule||lModule)setModule('tc')};
$('#prof-q').onclick=()=>{if(!qModule)setModule('q')};
$('#prof-l').onclick=()=>{if(!lModule)setModule('l')};

function qClone(o){return JSON.parse(JSON.stringify(o))}
function qTemplate(){return{AssociatedNPC:'GeneralGoods',Tier:1,Title:'Новый квест | New Quest',Description:'RU: \nEN: ',TimeLimitHours:24.0,RewardPool:[{CurrencyNormal:1000,Fame:10}],Conditions:[{TrackingCaption:'Цель | Goal',SequenceIndex:0,CanBeAutoCompleted:true,Type:'Elimination',TargetCharacters:['Puppet'],Amount:1}]}}
function qNewGroup(){return{AcceptedItems:[],RequiredNum:1,MinAcceptedItemHealth:0.0}}
function qDefaultElim(){return{TrackingCaption:'Цель | Goal',SequenceIndex:0,CanBeAutoCompleted:true,Type:'Elimination',TargetCharacters:['Puppet'],Amount:1}}
function qSanitizeItems(d){(d&&Array.isArray(d.Conditions)?d.Conditions:[]).forEach(c=>{if(c&&c.Type==='Fetch'&&Array.isArray(c.RequiredItems))c.RequiredItems.forEach(g=>{if(g&&Array.isArray(g.AcceptedItems))g.AcceptedItems=g.AcceptedItems.filter(x=>typeof x==='string'&&x.trim())})});return d}

function qAutoName(){let used=new Set(qQuests.map(q=>q.fileName));let n=1,slug='Quest';
let title=String(qDoc&&qDoc.Title||'');let en=title.includes(' | ')?title.split(' | ').slice(1).join(' | '):title;
let s=en.replace(/^[^A-Za-z0-9]+/,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);
if(s)slug=s;let name;do{name='STORY_'+String(n).padStart(2,'0')+'_'+slug+'.json';n++}while(used.has(name));return name}

function qValidate(d){
 let issues=[],warnings=[];
 const isInt=v=>typeof v==='number'&&Number.isInteger(v);
 const isNum=v=>typeof v==='number'&&Number.isFinite(v);
 if(!d||typeof d!=='object'||Array.isArray(d))return{issues:['Корень должен быть объектом'],warnings};
 let npc=d.AssociatedNPC;
 if(typeof npc!=='string'||!npc.trim())issues.push('AssociatedNPC: требуется строка с именем NPC');
 else if(!Q_NPCS.includes(npc))warnings.push("AssociatedNPC '"+npc+"' не входит в подтверждённый список ("+Q_NPCS.join(', ')+") — корректность в игре не проверена");
 if(!isInt(d.Tier))issues.push('Tier: требуется целое число');
 else if(d.Tier<1||d.Tier>3)issues.push('Tier: значение '+d.Tier+' вне диапазона 1–3');
 let title=d.Title;
 if(typeof title!=='string'||!title.trim())issues.push('Title: требуется строка');
 else if(!title.includes(' | '))issues.push('Title: ожидается одна строка формата «RU | EN» с разделителем " | "');
 else{let p=title.split(' | ');if(!p[0].trim())issues.push('Title: пустая русская часть перед « | »');if(!p.slice(1).join(' | ').trim())issues.push('Title: пустая английская часть после « | »')}
 let desc=d.Description;
 if(typeof desc!=='string'||!desc.trim())issues.push('Description: требуется строка');
 else if(!desc.includes('\nEN:'))warnings.push('Description: рекомендуется формат «RU: …\nEN: …» с переводом строки');
 if(!isNum(d.TimeLimitHours))issues.push('TimeLimitHours: требуется число (например 24.0)');
 else if(d.TimeLimitHours<=0)issues.push('TimeLimitHours: значение должно быть больше нуля');
  let rp=d.RewardPool;
  if(!Array.isArray(rp)||!rp.length){issues.push('RewardPool: требуется непустой массив')}else{
   rp.forEach((r,i)=>{
    if(!r||typeof r!=='object'||Array.isArray(r)){issues.push('RewardPool['+(i+1)+']: ожидается объект');return}
    ['CurrencyNormal','Fame'].forEach(k=>{
     if(!isInt(r[k])){issues.push('RewardPool['+(i+1)+'].'+k+': требуется целое число');return}
     if(r[k]<0){warnings.push('RewardPool['+(i+1)+'].'+k+': отрицательное значение ('+r[k]+') не подтверждено эталонами');return}
     let tr=Q_TIER_REWARD[d.Tier];
     if(tr){let rg=k==='CurrencyNormal'?tr.money:tr.fame;
      if(r[k]<rg[0]||r[k]>rg[1])warnings.push('RewardPool['+(i+1)+'].'+k+': '+r[k]+' вне диапазона, типичного для Tier '+d.Tier+' по эталонам ('+rg[0]+'–'+rg[1]+')')}
    })
   })
  }
 let conds=d.Conditions;
 if(!Array.isArray(conds)||!conds.length){issues.push('Conditions: требуется непустой массив условий');return{issues,warnings}}
 let seen={};
 conds.forEach((c,i0)=>{let i=i0+1;
  if(!c||typeof c!=='object'||Array.isArray(c)){issues.push('Conditions['+i+']: ожидается объект');return}
  let t=c.Type;
  if(!Q_TYPES.includes(t)){issues.push("Conditions["+i+"].Type: '"+t+"' — тип не подтверждён форматом игры (известны: Elimination, Fetch)");return}
  let tc=c.TrackingCaption;
  if(typeof tc!=='string'||!tc.trim())issues.push('Conditions['+i+'].TrackingCaption: требуется строка');
  else if(!tc.includes(' | '))issues.push('Conditions['+i+'].TrackingCaption: ожидается формат «RU | EN»');
  if(!isInt(c.SequenceIndex))issues.push('Conditions['+i+'].SequenceIndex: требуется целое число');
  else{if(c.SequenceIndex in seen)warnings.push('SequenceIndex '+c.SequenceIndex+' повторяется в условиях '+(seen[c.SequenceIndex]+1)+' и '+i);seen[c.SequenceIndex]=i0}
  if(typeof c.CanBeAutoCompleted!=='boolean')issues.push('Conditions['+i+'].CanBeAutoCompleted: требуется true/false');
  if(t==='Elimination'){
   let targets=c.TargetCharacters;
   if(!Array.isArray(targets)||!targets.length)issues.push('Conditions['+i+'].TargetCharacters: требуется непустой массив');
   else targets.forEach(x=>{if(typeof x!=='string'||!x.trim())issues.push('Conditions['+i+'].TargetCharacters: элементы должны быть непустыми строками');else if(x!=='Puppet')warnings.push("Conditions["+i+"].TargetCharacters: '"+x+"' не входит в подтверждённый список (Puppet)")});
   if(!isInt(c.Amount))issues.push('Conditions['+i+'].Amount: требуется целое число');
   else if(c.Amount<=0)issues.push('Conditions['+i+'].Amount: значение должно быть больше нуля');
  }else{
   let req=c.RequiredItems;
   if(!Array.isArray(req)||!req.length){issues.push('Conditions['+i+'].RequiredItems: требуется непустой массив групп');return}
   req.forEach((g,j0)=>{let j=j0+1;
    if(!g||typeof g!=='object'||Array.isArray(g)){issues.push('Conditions['+i+'].RequiredItems['+j+']: ожидается объект');return}
    let acc=g.AcceptedItems;
    if(!Array.isArray(acc)||!acc.length||acc.some(x=>typeof x!=='string'||!x.trim()))issues.push('Conditions['+i+'].RequiredItems['+j+'].AcceptedItems: требуется непустой массив строк');
    if(!isInt(g.RequiredNum))issues.push('Conditions['+i+'].RequiredItems['+j+'].RequiredNum: требуется целое число');
    else if(g.RequiredNum<=0)issues.push('Conditions['+i+'].RequiredItems['+j+'].RequiredNum: значение должно быть больше нуля');
    if(!isNum(g.MinAcceptedItemHealth))issues.push('Conditions['+i+'].RequiredItems['+j+'].MinAcceptedItemHealth: требуется число');
    else if(g.MinAcceptedItemHealth<0)issues.push('Conditions['+i+'].RequiredItems['+j+'].MinAcceptedItemHealth: не может быть отрицательным');
    ['DisablePurchaseOfRequiredItems','PlayerKeepsItems','CanBeAutoCompleted'].forEach(f=>{if(f in g&&typeof g[f]!=='boolean')issues.push('Conditions['+i+'].RequiredItems['+j+'].'+f+': требуется true/false')})})}});
 return{issues,warnings}}

function qMarkDirty(){if(!qDoc)return;qDirty=true;qFlag();qRenderCheck();qRenderPreview()}
async function qRefresh(){try{let d=await fetch('/api/quests').then(r=>r.json());if(d&&d.ok)qQuests=d.quests||[]}catch(e){}qRenderList();$('#q-delete').disabled=!qName}
function qRenderList(){let box=$('#quest-list');box.innerHTML='';if(!qQuests.length){box.innerHTML='<p class="empty">Папка data\\quests пуста</p>';return}
qQuests.forEach(q=>{let row=document.createElement('button');row.type='button';row.className='trow'+(qName===q.fileName?' active':'');
let nm=document.createElement('span');nm.className='tname';let b=document.createElement('b');b.textContent=q.fileName.replace(/\.json$/i,'');
let sm=document.createElement('small');sm.textContent=(q.npc||'—')+' · Tier '+(q.tier!=null?q.tier:'—')+' · условий: '+(q.conditions!=null?q.conditions:0);
nm.append(b,sm);row.append(nm);
if(qDiff&&qDiff[q.fileName]){let bd=qDiffBadge(qDiff[q.fileName]);let bs=document.createElement('span');bs.className=bd.cls;bs.title=bd.title;bs.textContent=bd.txt;row.append(bs)}
row.onclick=async()=>{if(qName===q.fileName)return go('q-editor');
 if(qDirty&&!(await askConfirm('Открыть квест','Несохранённые изменения текущего квеста будут потеряны. Продолжить?')))return;
 qOpen(q);go('q-editor')};
box.append(row)})}

function qSplitPair(s){s=String(s==null?'':s);let i=s.indexOf(' | ');if(i<0)return{ru:s,en:''};return{ru:s.slice(0,i),en:s.slice(i+3)}}
function qRenderEditor(){if(!qDoc)return;
$('#q-npc').value=qDoc.AssociatedNPC!=null?qDoc.AssociatedNPC:'';
$('#q-tier').value=String(qDoc.Tier!=null?qDoc.Tier:1);
let tp=qSplitPair(qDoc.Title);
$('#q-title-ru').value=tp.ru;$('#q-title-en').value=tp.en;
$('#q-desc').value=qDoc.Description!=null?qDoc.Description:'';
$('#q-timelimit').value=qDoc.TimeLimitHours!=null?qDoc.TimeLimitHours:'';
qRenderRewards();qRenderConditions()}

function qOpen(q){qDoc=qSanitizeItems(qClone(q.doc));qName=q.fileName;$('#q-filename').value=q.fileName;qDirty=false;qFlag();qRenderEditor();qRenderCheck();qRenderPreview();$('#q-delete').disabled=!qName}
async function qNew(){if(qDoc&&qDirty&&!(await askConfirm('Новый квест','Текущие несохранённые изменения будут потеряны. Продолжить?')))return;
qDoc=qTemplate();qName=null;$('#q-filename').value='';qDirty=false;qFlag();qRenderEditor();qRenderCheck();qRenderPreview();$('#q-delete').disabled=true;go('q-editor')}

function qDelBtn(fn){let b=document.createElement('button');b.type='button';b.className='del-mini';b.textContent='×';b.title='Удалить';b.onclick=fn;return b}
function qNumInput(obj,key){let i=document.createElement('input');i.type='number';i.step='any';i.value=obj[key]!=null?obj[key]:'';
i.oninput=()=>{let v=parseFloat(i.value);obj[key]=Number.isFinite(v)?v:0;qMarkDirty()};return i}
function qIntInput(obj,key){let i=document.createElement('input');i.type='number';i.step='1';i.value=obj[key]!=null?obj[key]:'';
i.oninput=()=>{let v=parseInt(i.value,10);obj[key]=Number.isFinite(v)?v:0;qMarkDirty()};return i}
function qPairInput(obj,key,cap){let l=document.createElement('label');l.textContent=cap;
let lr=document.createElement('input');lr.spellcheck=false;lr.placeholder='RU';
let le=document.createElement('input');le.spellcheck=false;le.placeholder='EN';
let upd=()=>{let ru=lr.value.trim(),en=le.value.trim();obj[key]=en?(ru+' | '+en):ru;qMarkDirty()};
lr.oninput=upd;le.oninput=upd;
let p=qSplitPair(obj[key]);lr.value=p.ru;le.value=p.en;
l.append(lr,le);return l}
function qListInput(obj,key,label){let l=document.createElement('label');l.textContent=label;let i=document.createElement('input');i.spellcheck=false;
i.value=Array.isArray(obj[key])?obj[key].join(', '):'';
i.oninput=()=>{obj[key]=i.value.split(',').map(x=>x.trim()).filter(Boolean);qMarkDirty()};l.append(i);return l}
function qNumField(obj,key,label){let l=document.createElement('label');l.textContent=label;l.append(qNumInput(obj,key));return l}
function qIntField(obj,key,label){let l=document.createElement('label');l.textContent=label;l.append(qIntInput(obj,key));return l}
function qBoolSel(obj,key,label){let l=document.createElement('label');l.textContent=label;let s=document.createElement('select');
[['true','true'],['false','false']].forEach(p=>{let o=document.createElement('option');o.value=p[0];o.textContent=p[1];if(obj[key]===true&&p[0]==='true')o.selected=true;if(obj[key]===false&&p[0]==='false')o.selected=true;s.append(o)});
s.onchange=()=>{obj[key]=s.value==='true';qMarkDirty()};l.append(s);return l}

function qRenderRewards(){let box=$('#rewards');box.innerHTML='';if(!qDoc||!Array.isArray(qDoc.RewardPool)){box.innerHTML='<p class="empty">—</p>';return}
qDoc.RewardPool.forEach((r,i)=>{let row=document.createElement('div');row.className='cond-grid';
let tag=document.createElement('span');tag.className='cond-tag';tag.textContent='НАГРАДА '+(i+1);
let l1=document.createElement('label');l1.textContent='ДЕНЬГИ';let i1=qNumInput(r,'CurrencyNormal');l1.append(i1);
let l2=document.createElement('label');l2.textContent='СЛАВА';let i2=qNumInput(r,'Fame');l2.append(i2);
row.append(tag,l1,l2,qDelBtn(()=>{qDoc.RewardPool.splice(i,1);if(!qDoc.RewardPool.length)qDoc.RewardPool.push({CurrencyNormal:1000,Fame:10});qRenderRewards();qMarkDirty()}));
box.append(row)})}
$('#reward-add').onclick=()=>{if(!qDoc)return;qDoc.RewardPool.push({CurrencyNormal:1000,Fame:10});qRenderRewards();qMarkDirty()};
$('#reward-apply-tier').onclick=()=>{if(!qDoc)return toast('Нет квеста');
let tr=Q_TIER_REWARD[qDoc.Tier]||Q_TIER_REWARD[1];
if(!Array.isArray(qDoc.RewardPool)||!qDoc.RewardPool.length)qDoc.RewardPool=[{CurrencyNormal:tr.money[0],Fame:tr.fame[0]}];
else{qDoc.RewardPool[0].CurrencyNormal=tr.money[0];qDoc.RewardPool[0].Fame=tr.fame[0]}
qRenderRewards();qMarkDirty();toast('Типовая награда Tier '+(qDoc.Tier||1)+': '+tr.money[0]+' / '+tr.fame[0]+' славы')};

function qRenderConditions(){let box=$('#conditions');box.innerHTML='';if(!qDoc||!Array.isArray(qDoc.Conditions)){box.innerHTML='<p class="empty">—</p>';return}
qDoc.Conditions.forEach((c,i)=>{let wrap=document.createElement('div');wrap.className='cond';
let head=document.createElement('div');head.className='cond-head-row';
let tag=document.createElement('span');tag.className='cond-tag';tag.textContent='УСЛОВИЕ '+(i+1);
let sel=document.createElement('select');Q_TYPES.forEach(t=>{let o=document.createElement('option');o.value=t;o.textContent=t+(t==='Elimination'?' · убийство':' · сбор');if(c.Type===t)o.selected=true;sel.append(o)});
sel.onchange=()=>{let t=sel.value;let keep={TrackingCaption:c.TrackingCaption,SequenceIndex:c.SequenceIndex};
let nc;if(t==='Elimination'){nc={TrackingCaption:keep.TrackingCaption,SequenceIndex:keep.SequenceIndex,CanBeAutoCompleted:true,Type:'Elimination',TargetCharacters:['Puppet'],Amount:c.Amount||1}}
else{nc={TrackingCaption:keep.TrackingCaption,SequenceIndex:keep.SequenceIndex,CanBeAutoCompleted:false,Type:'Fetch',DisablePurchaseOfRequiredItems:false,PlayerKeepsItems:true,RequiredItems:[qNewGroup()]}}
qDoc.Conditions[i]=nc;qRenderConditions();qMarkDirty()};
head.append(tag,sel,qDelBtn(()=>{qDoc.Conditions.splice(i,1);if(!qDoc.Conditions.length)qDoc.Conditions.push(qDefaultElim());qRenderConditions();qMarkDirty()}));
wrap.append(head);
let grid=document.createElement('div');grid.className='cond-grid';
grid.append(qPairInput(c,'TrackingCaption','TRACKING CAPTION «RU | EN»'));
grid.append(qIntField(c,'SequenceIndex','ПОРЯДОК · SEQUENCEINDEX'));
grid.append(qBoolSel(c,'CanBeAutoCompleted','АВТОЗАВЕРШЕНИЕ'));
wrap.append(grid);
if(c.Type==='Fetch'){
 let keep=document.createElement('div');keep.className='cond-grid';
 keep.append(qBoolSel(c,'DisablePurchaseOfRequiredItems','ЗАПРЕТ ПОКУПКИ НУЖНОГО'));
 keep.append(qBoolSel(c,'PlayerKeepsItems','ИГРОК ОСТАВЛЯЕТ ПРЕДМЕТЫ'));
 wrap.append(keep);
 let groups=document.createElement('div');groups.className='groups';
 (c.RequiredItems||[]).forEach((g,j)=>{let gh=document.createElement('div');gh.className='group-head';
  let gt=document.createElement('span');gt.className='cond-tag';gt.textContent='ГРУППА ПРЕДМЕТОВ '+(j+1);
  gh.append(gt,qDelBtn(()=>{c.RequiredItems.splice(j,1);if(!c.RequiredItems.length)c.RequiredItems.push(qNewGroup());qRenderConditions();qMarkDirty()}));
  let gg=document.createElement('div');gg.className='cond-grid';
  let ll=document.createElement('label');ll.textContent='ID ПРЕДМЕТОВ (ЧЕРЕЗ ЗАПЯТУЮ)';
  let roww=document.createElement('div');roww.className='q-item-row';
  let ii=document.createElement('input');ii.spellcheck=false;ii.value=Array.isArray(g.AcceptedItems)?g.AcceptedItems.join(', '):'';
  ii.oninput=()=>{g.AcceptedItems=ii.value.split(',').map(x=>x.trim()).filter(Boolean);qMarkDirty()};
  let bb=document.createElement('button');bb.type='button';bb.className='mini';bb.textContent='КАТАЛОГ';bb.title='Выбрать из каталога предметов';
  bb.onclick=()=>qOpenItems(g,ii);
  roww.append(ii,bb);ll.append(roww);gg.append(ll);
  gg.append(qIntField(g,'RequiredNum','КОЛИЧЕСТВО · REQUIREDNUM'));
  gg.append(qNumField(g,'MinAcceptedItemHealth','МИН. ПРОЧНОСТЬ'));
  groups.append(gh,gg)});
 wrap.append(groups);
 let add=document.createElement('button');add.type='button';add.className='btn-dark';add.textContent='+ ДОБАВИТЬ ГРУППУ ПРЕДМЕТОВ';
 add.onclick=()=>{if(!Array.isArray(c.RequiredItems))c.RequiredItems=[];c.RequiredItems.push(qNewGroup());qRenderConditions();qMarkDirty()};
 wrap.append(add);
}else{
 let eg=document.createElement('div');eg.className='cond-grid';
 eg.append(qListInput(c,'TargetCharacters','ЦЕЛИ · TARGETCHARACTERS (ЧЕРЕЗ ЗАПЯТУЮ)'));
 eg.append(qIntField(c,'Amount','КОЛИЧЕСТВО · AMOUNT'));
 wrap.append(eg);
}
box.append(wrap)})}
$('#cond-add').onclick=()=>{if(!qDoc)return;qDoc.Conditions.push(qDefaultElim());qRenderConditions();qMarkDirty()};

function qRenderCheck(){let box=$('#check-status'),ib=$('#check-issues'),wb=$('#check-warnings');ib.innerHTML='';wb.innerHTML='';
if(!qDoc){box.textContent='—';return}
let v=qValidate(qDoc);
let catN=0;
if(db&&Array.isArray(db.categories)){
 (qDoc.Conditions||[]).forEach((c,i)=>{if(c.Type!=='Fetch'||!Array.isArray(c.RequiredItems))return;
  c.RequiredItems.forEach((g,j)=>{(g.AcceptedItems||[]).forEach(x=>{if(x&&x.trim()&&!dbIndex[x]&&!customIndex[x]){catN++;
   let p=document.createElement('p');p.className='ck warn';p.textContent='Conditions['+(i+1)+'].RequiredItems['+(j+1)+'].AcceptedItems: '+x+' — нет в каталоге (непроверенный ID)';wb.append(p)}})})})}
let warnTotal=v.warnings.length+catN;
if(v.issues.length)box.innerHTML='<span class="bad">Ошибок: '+v.issues.length+'</span> · предупреждений: '+warnTotal;
else if(warnTotal)box.innerHTML='<span class="warn">Формат корректен</span> · предупреждений: '+warnTotal;
else box.innerHTML='<span class="good">ФОРМАТ КОРРЕКТЕН</span>';
v.issues.forEach(s=>{let p=document.createElement('p');p.className='ck bad';p.textContent=s;ib.append(p)});
v.warnings.forEach(s=>{let p=document.createElement('p');p.className='ck warn';p.textContent=s;wb.append(p)});
if(!v.issues.length&&!warnTotal)wb.innerHTML='<p class="ck good">Подтверждённых проблем нет</p>'}
function qRenderPreview(){$('#q-json-preview').value=qDoc?JSON.stringify(qDoc,null,2):''}

async function qSave(){if(!qDoc)return toast('Нет квеста');
let fileName=$('#q-filename').value.trim()||qAutoName();
if(!Q_NAME_RE.test(fileName))return toast('Имя файла должно быть вида STORY_имя.json (латиница, цифры, _ и -)');
let v=qValidate(qDoc),force=false;
if(v.issues.length){if(!(await askConfirm('Проверка формата','В квесте ошибок: '+v.issues.length+'\n'+v.issues.slice(0,4).join('\n')+'\n\nСохранить несмотря на ошибки?')))return;force=true}
let d;try{d=await fetch('/api/quests/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName,doc:qDoc,force})}).then(r=>r.json())}catch(e){return toast('Сохранение: '+e.message)}
if(!d.ok)return toast(d.error||(d.issues&&d.issues.length?'Сервер отклонил сохранение: '+d.issues[0]:'Ошибка сохранения'));
qDoc=qClone(d.doc);$('#q-filename').value=d.fileName;qName=d.fileName;qDirty=false;qFlag();qRenderEditor();qRenderCheck();qRenderPreview();
await qRefresh();toast('Сохранено: data\\quests\\'+d.fileName)}
$('#q-save').onclick=qSave;
$('#q-new').onclick=qNew;
$('#q-duplicate').onclick=()=>{if(!qDoc)return toast('Нет квеста');
let used=new Set(qQuests.map(q=>q.fileName));let name=null;
let m=/^(STORY_)(\d+)(_.*)?\.json$/i.exec(qName||'');
if(m){let n=parseInt(m[2],10);do{n++;name=m[1]+String(n).padStart(2,'0')+(m[3]||'')+'.json'}while(used.has(name))}
else name=qAutoName();
$('#q-filename').value=name;qName=null;$('#q-delete').disabled=true;
toast('Копия подготовлена: '+name+' — проверьте и нажмите «СОХРАНИТЬ В data\\quests»')};
$('#q-delete').onclick=async()=>{let name=qName||$('#q-filename').value.trim();
if(!name)return toast('Нет сохранённого файла для удаления');
if(!(await askConfirm('Удалить квест','Файл '+name+' будет удалён из data\\quests. Продолжить?')))return;
let d;try{d=await fetch('/api/quests/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:name})}).then(r=>r.json())}catch(e){return toast('Удаление: '+e.message)}
if(!d.ok)return toast(d.error||'Ошибка удаления');
if(qName===name){qName=null;$('#q-filename').value='';$('#q-delete').disabled=true}
await qRefresh();toast('Удалено: '+name)};

$('#q-npc').oninput=e=>{if(!qDoc)return;qDoc.AssociatedNPC=e.target.value;qMarkDirty()};
$('#q-tier').onchange=e=>{if(!qDoc)return;qDoc.Tier=parseInt(e.target.value,10)||1;qMarkDirty()};
function qTitleCompose(){if(!qDoc)return;let ru=$('#q-title-ru').value.trim(),en=$('#q-title-en').value.trim();qDoc.Title=en?(ru+' | '+en):ru;qMarkDirty()}
$('#q-title-ru').oninput=qTitleCompose;
$('#q-title-en').oninput=qTitleCompose;
$('#q-desc').oninput=e=>{if(!qDoc)return;qDoc.Description=e.target.value;qMarkDirty()};
$('#q-timelimit').oninput=e=>{if(!qDoc)return;let v=parseFloat(e.target.value);qDoc.TimeLimitHours=Number.isFinite(v)?v:0;qMarkDirty()};

$('#qfile').onchange=async e=>{let files=[...e.target.files];e.target.value='';if(!files.length)return;
let okN=0,last=null;
for(const f of files){try{let parsed=JSON.parse(await f.text());
if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)){toast(f.name+': корень должен быть объектом');continue}
let name=Q_NAME_RE.test(f.name)?f.name:qAutoName();
let d=await fetch('/api/quests/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:name,doc:parsed,force:true})}).then(r=>r.json());
if(!d.ok){toast(f.name+': '+(d.error||'ошибка сохранения'));continue}
okN++;last={fileName:d.fileName,doc:d.doc};
if(d.warnings&&d.warnings.length)toast(f.name+': предупреждений — '+d.warnings.length)}catch(err){toast(f.name+': ошибка JSON — '+err.message)}}
await qRefresh();
if(okN){toast('Импортировано: '+okN+' из '+files.length+' → data\\quests');if(last){qOpen(last);go('q-editor')}}
else toast('Ничего не импортировано')};

$('#q-export-download').onclick=async()=>{if(!qDoc)return toast('Нет квеста');
let v=qValidate(qDoc);
if(v.issues.length&&!(await askConfirm('Проверка формата','В квесте ошибок: '+v.issues.length+'\n'+v.issues.slice(0,4).join('\n')+'\n\nЭкспортировать несмотря на ошибки?')))return;
let fileName=(qName&&Q_NAME_RE.test(qName))?qName:qAutoName();
let d;try{d=await fetch('/api/export/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName,content:JSON.stringify(qDoc,null,2)})}).then(r=>r.json())}catch(e){return toast('Экспорт: '+e.message)}
if(!d.ok)return toast(d.error||'Ошибка сохранения');
toast('JSON сохранён: '+d.path)};
$('#q-export-open').onclick=async()=>{try{let d=await fetch('/api/export/open',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json());if(!d.ok)toast(d.error||'Не удалось открыть папку')}catch(e){toast('Открыть папку: '+e.message)}};
$('#q-export-apply').onclick=async()=>{let txt=$('#q-json-import').value.trim();if(!txt)return toast('Вставьте технический JSON');
let parsed;try{parsed=JSON.parse(txt)}catch(e){return toast('Ошибка JSON: '+e.message)}
if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return toast('Корень должен быть объектом');
if(qDoc&&qDirty&&!(await askConfirm('Применить JSON','Текущие несохранённые изменения будут потеряны. Продолжить?')))return;
qDoc=qSanitizeItems(parsed);qDirty=true;qFlag();qRenderEditor();qRenderCheck();qRenderPreview();toast('JSON применён — проверьте результаты и сохраните')};

async function qPushToServer(c){
let v=qValidate(qDoc);
if(v.issues.length)throw new Error('формат содержит ошибки — публикация заблокирована: '+v.issues[0]);
if(v.warnings.length&&!(await askConfirm('Проверка формата','Предупреждений: '+v.warnings.length+'\n'+v.warnings.slice(0,4).join('\n')+'\n\nВыгрузить всё равно?')))throw new Error('выгрузка отменена');
let fileName=(qName&&Q_NAME_RE.test(qName))?qName:$('#q-filename').value.trim();
if(!Q_NAME_RE.test(fileName))throw new Error('имя файла должно быть STORY_имя.json — сохраните квест с корректным именем');
let rp=String(c.remotePath||'').trim();
if(/^\/Server\/SCUM\/Saved\/Config\/WindowsServer\/?$/i.test(rp)){
let target=rp.replace(/\/+$/,'')+'/Quests/Override';
if(await askConfirm('Папка квестов','Сейчас указана базовая папка WindowsServer. Опубликовать квест в '+target+'?'))rp=target}
let payload=JSON.stringify(qDoc,null,2),bytes=Array.from(new TextEncoder().encode(payload),x=>String.fromCharCode(x)).join(''),content=btoa(bytes);
return await ftpRequest('/api/ftp/upload',{fileName,content,remotePath:rp,confirm:true})}

async function qPublish(){if(!qDoc)return toast('Нет квеста');
let c=ftpCredentials();if(!c.host)return toast('Заполните параметры FTP во вкладке «FTP / ФАЙЛЫ»');
if(!(await askConfirm('Выгрузка на сервер','Отправить текущий квест на сервер? Существующий файл будет скопирован в .backup-метку. Отсутствующие папки будут созданы.')))return;
let btns=[$('#q-srv-upload'),$('#q-ftp-push')];btns.forEach(b=>b.disabled=true);
try{let d=await qPushToServer(c);
$('#q-srv-status').textContent='Квест выгружен (backup='+(d.backupCreated?'создан':'нет')+') · '+new Date().toLocaleTimeString();
toast((d.backupCreated?'Квест выгружен, резервная копия создана':'Квест выгружен (новый файл)')+' → '+(d.fileName||''));
ftpGo(ftpCredentials().remotePath||'/').catch(()=>{})}
catch(e){$('#q-srv-status').textContent='Ошибка выгрузки · '+new Date().toLocaleTimeString();toast('Выгрузка: '+e.message)}
finally{btns.forEach(b=>b.disabled=false)}}
$('#q-srv-upload').onclick=qPublish;
$('#q-ftp-push').onclick=qPublish;

async function qOpenFromServer(fileName,dir){return ftpRequest('/api/ftp/download',{fileName,remotePath:dir}).then(async file=>{
let bytes=Uint8Array.from(atob(file.content),ch=>ch.charCodeAt(0));
let parsed=JSON.parse(new TextDecoder().decode(bytes));
if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('корень файла не объект');
if(qDoc&&qDirty&&!(await askConfirm('Открыть с сервера','Несохранённые изменения будут потеряны. Продолжить?')))throw new Error('отменено');
qDoc=qSanitizeItems(parsed);qName=null;$('#q-filename').value=Q_NAME_RE.test(fileName)?fileName:'';$('#q-delete').disabled=true;
qDirty=false;qFlag();qRenderEditor();qRenderCheck();qRenderPreview();go('q-editor');
 toast('Открыт '+fileName+' с сервера — сохраните, чтобы держать локальную копию')})}

/* Сервер · снапшот, сверка, пакетная публикация квестов */
function qDiffBadge(st){if(st==='sync')return{cls:'badge qsync',txt:'СИНХРОН',title:'Локальный файл и файл на сервере совпадают по содержимому'};
if(st==='diff')return{cls:'badge qdif',txt:'ОТЛИЧАЕТСЯ',title:'Файл на сервере отличается от локального — опубликуйте или откройте с сервера'};
if(st==='local-only')return{cls:'badge qloc',txt:'НЕТ НА СЕРВЕРЕ',title:'Квест есть только локально в data\\quests'};
return{cls:'badge qsrv',txt:'НЕТ ЛОКАЛЬНО',title:'Файл есть на сервере, локально в data\\quests отсутствует'}}
function qRenderDiffBox(err,d){let sum=$('#q-diff-summary'),list=$('#q-diff-list');if(!sum)return;
if(err){sum.textContent=err;list.innerHTML='';return}
if(!d||!d.items||!d.items.length){sum.textContent=(d&&d.note)?d.note:'';list.innerHTML='';return}
let c=d.counts||{};sum.textContent='Сверка со снапшотом: синхронны '+(c.sync||0)+' · отличаются '+(c.diff||0)+' · нет на сервере '+(c['local-only']||0)+' · нет локально '+(c['server-only']||0)+' · '+new Date().toLocaleTimeString();
list.innerHTML='';d.items.forEach(it=>{let row=document.createElement('div');row.className='q-diff-row';
let nm=document.createElement('span');nm.className='nm';nm.textContent=it.fileName;
if(it.invalidLocal||it.invalidServer){nm.title='Файл не читается как JSON — сравнение выполнено по байтам';nm.style.color='var(--amber)'}
let bd=document.createElement('span');let b=qDiffBadge(it.status);bd.className=b.cls;bd.textContent=b.txt;bd.title=b.title;
row.append(nm,bd);list.append(row)})}
async function qDiffRun(){let d;
try{d=await fetch('/api/quests/diff',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json())}catch(e){qDiff=null;qRenderDiffBox('Сверка: '+e.message);return null}
if(!d.ok){qDiff=null;qRenderDiffBox(d.error||'Ошибка сверки');return null}
qDiff={};(d.items||[]).forEach(it=>{qDiff[it.fileName]=it.status});
qRenderDiffBox(null,d);qRenderList();return d}
$('#q-srv-snapshot').onclick=async()=>{let c=ftpCredentials();if(!c.host)return toast('Заполните параметры FTP во вкладке «FTP / ФАЙЛЫ»');
let btn=$('#q-srv-snapshot');btn.disabled=true;$('#q-srv-status').textContent='Снимаю снапшот квестов сервера…';
try{let d=await ftpRequest('/api/ftp/snapshot',{});
$('#q-srv-status').textContent='Снапшот: скачано '+d.count+' → data\\quests-server · '+new Date().toLocaleTimeString();
toast('Скачано с сервера: '+d.count+(d.errors&&d.errors.length?' · с ошибками: '+d.errors.length:'')+' · из '+(d.remotePath||''));
await qDiffRun()}
catch(e){$('#q-srv-status').textContent='Ошибка снапшота · '+new Date().toLocaleTimeString();toast('Снапшот: '+e.message)}
finally{btn.disabled=false}};
$('#q-srv-diff').onclick=async()=>{let btn=$('#q-srv-diff');btn.disabled=true;$('#q-srv-status').textContent='Сверяю локальные квесты со снапшотом…';
try{let d=await qDiffRun();if(d&&d.items&&d.items.length)$('#q-srv-status').textContent='Сверка выполнена · '+new Date().toLocaleTimeString()}catch(e){toast('Сверка: '+e.message)}
finally{btn.disabled=false}};
$('#q-srv-batch').onclick=async()=>{let c=ftpCredentials();if(!c.host)return toast('Заполните параметры FTP во вкладке «FTP / ФАЙЛЫ»');
if(!qDiff)return toast('Сначала снимите снапшот сервера и выполните сверку');
let names=Object.keys(qDiff).filter(n=>qDiff[n]==='diff'||qDiff[n]==='local-only');
if(!names.length)return toast('Расхождений нет — все локальные квесты синхронны с сервером');
let missing=names.filter(n=>!qQuests.some(q=>q.fileName===n));
if(missing.length)return toast('Нет локальных данных для: '+missing.join(', '));
let vfail=[];names.forEach(n=>{let qq=qQuests.find(x=>x.fileName===n);let v=qValidate(qq.doc);if(v.issues.length)vfail.push(n+' — '+v.issues[0])});
if(vfail.length&&!(await askConfirm('Проверка формата','Файлы с ошибками формата:\n'+vfail.slice(0,5).join('\n')+'\n\nВыгрузить всё равно?')))return;
if(!(await askConfirm('Публикация на сервер','Будет выгружено файлов: '+names.length+'\n'+names.slice(0,10).join('\n')+(names.length>10?'\n… и ещё '+(names.length-10):'')+'\n\nСуществующие файлы сервера копируются в .backup-метку, нехватающие папки создаются. Продолжить?')))return;
let btn=$('#q-srv-batch');btn.disabled=true;$('#q-srv-status').textContent='Публикую пакет: '+names.length+' файл(ов)…';
try{let files=names.map(n=>{let qq=qQuests.find(x=>x.fileName===n);
let payload=JSON.stringify(qq.doc,null,2),bytes=Array.from(new TextEncoder().encode(payload),x=>String.fromCharCode(x)).join('');
return{fileName:n,content:btoa(bytes)}});
let d=await ftpRequest('/api/ftp/upload-batch',{files,confirm:true});
$('#q-srv-status').textContent='Пакет выгружен: '+d.uploaded+(d.failed&&d.failed.length?' · с ошибками: '+d.failed.length:'')+' · '+new Date().toLocaleTimeString();
toast('Выгружено: '+d.uploaded+' → '+(d.remotePath||'')+(d.failed&&d.failed.length?' · ошибок: '+d.failed.length+' ('+d.failed[0].fileName+': '+d.failed[0].error+')':''));
await qDiffRun()}
catch(e){$('#q-srv-status').textContent='Ошибка пакетной выгрузки · '+new Date().toLocaleTimeString();toast('Пакет: '+e.message)}
finally{btn.disabled=false}};

/* Каталог предметов для AcceptedItems */
let qItemsCtx=null;
function qOpenItems(group,inputEl){qItemsCtx={group,input:inputEl};
$('#q-items-target').textContent='→ группа предметов';
$('#q-items-search').value='';qItemsFillCats();qItemsRender();
$('#q-items-dialog').showModal();$('#q-items-search').focus()}
function qItemsFillCats(){let opts=['all'].concat(catNames());$('#q-items-cat').innerHTML=opts.map(c=>'<option value="'+c.replace(/"/g,'')+'">'+c+'</option>').join('')}
function qItemsRender(){let q=$('#q-items-search').value.toLowerCase(),cat=$('#q-items-cat').value;
let list=flatDb().concat(custom.map(x=>({name:x.name||x.id,id:x.id,cat:x.category||'Разное'})))
.filter(x=>(x.name+' '+x.id).toLowerCase().includes(q)&&(cat==='all'||x.cat===cat)).slice(0,60);
let box=$('#q-items-results');box.innerHTML='';
if(!list.length){box.innerHTML='<p class="empty">Ничего не найдено — введите ID вручную в поле группы</p>';return}
list.forEach(x=>{let r=document.createElement('div');r.className='res-row';
let w=document.createElement('span');w.className='cell-wrap';
let img=document.createElement('img');img.className='thumb';img.alt='';img.src='/api/icon/'+encodeURIComponent(x.id)+'?t='+iconBust;
img.onerror=()=>{let ph=document.createElement('span');ph.className='thumb-ph';ph.textContent=(x.name||x.id).charAt(0).toUpperCase();img.replaceWith(ph)};
let t=document.createElement('span');t.textContent=x.name||x.id;w.append(img,t);r.append(w);
let id=document.createElement('span');id.className='id';id.textContent=x.id+' · '+x.cat;r.append(id);
r.onclick=()=>{if(!qItemsCtx)return;let g=qItemsCtx.group;
g.AcceptedItems=(Array.isArray(g.AcceptedItems)?g.AcceptedItems:[]).filter(v=>typeof v==='string'&&v.trim());
if(g.AcceptedItems.includes(x.id)){$('#q-items-status').textContent=x.id+' — уже в группе';return}
g.AcceptedItems.push(x.id);if(qItemsCtx.input)qItemsCtx.input.value=g.AcceptedItems.join(', ');
$('#q-items-status').textContent='Добавлено: '+x.id;qMarkDirty()};
box.append(r)})}
$('#q-items-search').oninput=qItemsRender;
$('#q-items-cat').onchange=qItemsRender;
$('#q-items-close').onclick=()=>$('#q-items-dialog').close();

/* ===== CLIENT DIAG JOURNAL ===== */
let clQ=[],clT=null;
function clSend(){clearTimeout(clT);clT=null;if(!clQ.length)return;let lines=clQ.slice(0,40);clQ=clQ.slice(40);
fetch('/api/client-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lines})}).catch(()=>{});
if(clQ.length)clT=setTimeout(clSend,2000)}
function clLog(msg){clQ.push(new Date().toISOString().slice(11,19)+' | '+String(msg).slice(0,450));if(!clT)clT=setTimeout(clSend,1200)}
window.addEventListener('error',ev=>clLog('JS-ERROR '+(ev.message||'?')+' @ '+String(ev.filename||'?').split('/').pop()+':'+(ev.lineno||0)));
window.addEventListener('unhandledrejection',ev=>{let r=ev.reason;clLog('PROMISE-REJECT '+((r&&r.message)||String(r)).slice(0,300))});

/* ===== LOOT MODULE (L) ===== */
let lootStatus=null,lootSec='overview';
let lootSp={off:0,scope:'default',mod:'all',group:'all',q:''};
let lootIt={off:0,q:'',loc:'all',cd:'all'};
let lootSpCur=null,lootPubList=[];
let lootWork={presets:[],items:[],cooldowns:[],nodes:[],zones:[]};
let lootItTotal=0;
let lootItCur=null,lootNCur=null,lootCdCur=null,lootZdMod=null,lootNEd=null,lootCdEd=null;
const lootEsc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function lootApi(path){return fetch(path).then(r=>r.json()).then(d=>{if(!d||!d.ok)throw new Error((d&&d.error)||'Ошибка запроса');return d})}
function lootRun(p){if(!p||!p.catch){clLog('LOOT-RUN-NONPROMISE');return p}return p.catch(e=>{clLog('LOOT-FAIL '+e.message);toast('Loot: '+e.message)})}
function lootDeb(fn){let t;return()=>{clearTimeout(t);t=setTimeout(fn,300)}}
function lootCell(tr,text,cls){let td=document.createElement('td');if(cls)td.className=cls;td.textContent=text;tr.append(td);return td}

const LOOT_HELP={
keys:{
 Items:'Прямой список предметов пресета: записи {Id, Rarity}. Добавить Id → новый предмет в точке лута; снизить Rarity-класс → предмет выпадает чаще.',
 Nodes:'Записи выдачи через ДЕРЕВО ЛУТА: Ids (пути узлов) + Rarity + шансы. Основной механизм спавна: игра спускается по дереву и выбирает предметы.',
 FixedItems:'Гарантированные предметы: спавнятся при каждом респауне контейнера. Удалить строку → убрать гарантированный лут.',
 Subpresets:'Вложенные пресеты: их содержимое добавляется в этот спавнер. Удалить ссылку → убрать вложенный набор.',
 Probability:'Шанс срабатывания записи, %. ↑ — запись срабатывает чаще (богаче лут); ↓ или 0 — реже / фактически выключена.',
 QuantityMin:'Минимум предметов за срабатывание записи.',
 QuantityMax:'Максимум предметов за срабатывание записи. ↑ — больше предметов за раз.',
 AllowDuplicates:'true — один и тот же предмет может выпасть несколько раз за одно срабатывание; false — без повторов.',
 ShouldGiveItemsByGone:'true — учитывать «уже взятое»: предмет, который забрали с этого места, не вернётся до истечения кулдауна его группы (наблюдение). false — выдавать независимо от взятия.',
 ShouldApplyLocationSpecificProbabilityModifier:'true — применять серверные/зонные множители шанса к этой записи. Рекомендуется true: иначе теряются серверные настройки лута.',
 ShouldApplyLocationSpecificDamageModifier:'true — применять множители износа по локации к выдаваемым предметам.',
 ShouldApplyLocationSpecificProbabilityModifiers:'То же, что ShouldApplyLocationSpecificProbabilityModifier — написание на уровне записи Nodes (наблюдаемое в данных).',
 ShouldFilterItemsByZone:'true — спавн только внутри зон из Zones.json этого мода. Если true, а файла нет — лут может не появляться (валидатор предупреждает).',
 MinCashAmount:'Минимальная сумма денег для записей с Id "Cash".',
 MaxCashAmount:'Максимальная сумма денег для записей с Id "Cash".',
 InitialDamage:'Начальный износ выдаваемых предметов (0..1).',
 RandomDamage:'Случайный износ выдаваемых предметов (0..1).',
 InitialStack:'Начальный размер стака предметов.',
 RandomStack:'Случайный размер стака предметов.',
 InitialUsage:'Начальный ресурс использования предмета (сколько «использований» осталось).',
 RandomUsage:'Случайный ресурс использования предмета.',
 PostSpawnActions:'Пост-действия после спавна: дозаполнение содержимого (патроны, деньги, грязь одежды, ключ-карты). Полный список с описаниями — во вкладке СПРАВКА.',
 Id:'Item ID предмета.',
 Ids:'Пути узлов дерева лута (ItemLootTreeNodes.*). Матч путей — без учёта регистра, как читает игра.',
 Rarity:'Класс редкости: Abundant → Common → Uncommon → Rare → VeryRare → ExtremelyRare (от «часто» к «почти никогда»). Понижение класса = предмет выпадает чаще.'
},
itemParams:{
 AllowedLocations:'География спавна: Coastal (побережье), Continental (континент), Mountain (горы). Вне своих локаций предмет не появится.',
 CooldownGroup:'Группа кулдауна: взятый предмет вернётся в спавн только после таймера группы (вкладка КУЛДАУНЫ). Больше групп с большим таймером = реже возврат.',
 CooldownPerSquadMemberMin:'Нижняя граница таймера на члена отряда (наблюдение).',
 CooldownPerSquadMemberMax:'Верхняя граница таймера на члена отряда (наблюдение).',
 Variations:'Варианты модели (цвет/версия): при спавне выбирается один из списка.',
 ShouldOverrideInitialAndRandomUsage:'true — переопределить ресурс использования значениями InitialUsageOverride/RandomUsageOverride.',
 InitialUsageOverride:'Фиксированный ресурс использования вместо дефолтного.',
 RandomUsageOverride:'Случайный ресурс использования вместо дефолтного.',
 ShouldOverrideInitialAndRandomStack:'true — переопределить размер стака значениями InitialStackOverride/RandomStackOverride.',
 InitialStackOverride:'Фиксированный размер стака вместо дефолтного.',
 RandomStackOverride:'Случайный размер стака вместо дефолтного.',
 IsDisabledForSpawning:'true — предмет исключён из спавна ПО ВСЕЙ КАРТЕ (глобальный выключатель; используйте осторожно для понижения лута).'
},
postActions:{
 AbandonedBunkerKeycard:'Добавить ключ-карту заброшенного бункера.',
 ApexKeycard_Cargo:'Добавить ключ-карту Apex (вариант Cargo).',
 ApexKeycard_Police:'Добавить ключ-карту Apex (вариант Police).',
 ApexKeycard_Radiation:'Добавить ключ-карту Apex (вариант Radiation).',
 ApexKeycard_Sentry:'Добавить ключ-карту Apex (вариант Sentry).',
 KillboxKeycard_Cargo:'Добавить ключ-карту Killbox (вариант Cargo).',
 KillboxKeycard_Police:'Добавить ключ-карту Killbox (вариант Police).',
 KillboxKeycard_Radiation:'Добавить ключ-карту Killbox (вариант Radiation).',
 KillboxKeycard_Sentry:'Добавить ключ-карту Killbox (вариант Sentry).',
 SetAmmoAmount_Arrows_Full:'Задать содержимое: стрелы/болты — полный запас.',
 SetAmmoAmount_BigStash:'Задать боеприпасы: большой запас.',
 SetAmmoAmount_SmallStash:'Задать боеприпасы: малый запас.',
 SetCashAmount_BigStash:'Задать деньги: большая сумма (работает вместе с Id "Cash").',
 SetCashAmount_SmallStash:'Задать деньги: малая сумма (работает вместе с Id "Cash").',
 SetClothesDirtiness_DeadPuppets:'Задать грязность одежды как у трупов.',
 SetClothesDirtiness_DirtyClothes:'Задать грязную одежду.',
 SetClothesDirtiness_ResidentialClothes:'Задать одежду в состоянии «из жилого дома» (слегка ношеная).',
 SetResourceAmount_CargoDropGasolineCanister:'Канистра из карго-дропа: задать количество бензина.'
}};
function lootHelpRow(k,v){let r=document.createElement('div');r.className='l-hk';let b=document.createElement('b');b.textContent=k;let s=document.createElement('span');s.textContent=v;r.append(b,s);return r}
function lootHelpRender(){
 let fill=(id,obj)=>{let box=$(id);if(!box)return;box.innerHTML='';
  Object.keys(obj).sort().forEach(k=>box.append(lootHelpRow(k,obj[k])))};
 fill('#l-help-dict',LOOT_HELP.keys);
 fill('#l-help-items',LOOT_HELP.itemParams);
 fill('#l-help-post',LOOT_HELP.postActions)}

function lootHeader(st){$('#l-root-path').textContent=st.root;$('#l-built').textContent=String(st.built).replace('T',' ');
let c=st.counts,box=$('#l-stats');box.innerHTML='';
[['Пресеты (vanilla)',c.spawners],['Пресеты (override)',c.overridePresets+' · модов: '+c.overrideMods],
 ['Дерево Default / Current',c.nodesDefault+' / '+c.nodesCurrent],['Предметы (Parameters)',c.items],
 ['Группы кулдаунов',c.cooldownGroups],['Zones.json (моды)',c.zonesFiles]]
.forEach(([t,v])=>{let d=document.createElement('div');d.className='l-stat';let b=document.createElement('b');b.textContent=v;let s=document.createElement('span');s.textContent=t;d.append(b,s);box.append(d)});
let er=$('#l-over-errors');er.innerHTML='';if(!st.errors.length)er.innerHTML='<p class="empty">Все файлы читаются</p>';
st.errors.forEach(e=>{let p=document.createElement('p');p.className='note';p.textContent=e.file+': '+e.error;er.append(p)});
let tags=(sel,arr)=>{let b=$(sel);b.innerHTML='';if(!arr.length){b.innerHTML='<p class="empty">Нет</p>';return}
arr.forEach(x=>{let s=document.createElement('span');s.className='l-tag';s.textContent=x;b.append(s)})};
tags('#l-over-actions',st.postActions);tags('#l-over-keys',(st.spawnerKeys||[]).concat(st.itemEntryKeys||[]))}

function lootFillSelects(){let st=lootStatus;if(!st)return;
$('#l-sp-group').innerHTML='<option value="all">Все группы</option>'+st.groups.map(g=>'<option value="'+lootEsc(g)+'">'+lootEsc(g)+'</option>').join('');
$('#l-sp-mod').innerHTML='<option value="all">Все моды</option>'+st.mods.map(m=>'<option value="'+lootEsc(m)+'">'+lootEsc(m)+'</option>').join('')}

function lootItemsFillCd(){lootRun(lootApi('/api/loot/cooldowns').then(d=>{$('#l-it-cd').innerHTML='<option value="all">Все кулдауны</option><option value="none">Без группы</option>'+
d.groups.map(g=>'<option value="'+lootEsc(g.Name)+'">'+lootEsc(g.Name)+'</option>').join('')}))}

async function lootInit(){if(lootStatus)return;try{let st=await lootApi('/api/loot/status');lootStatus=st;lootHeader(st);lootFillSelects();lootItemsFillCd();lootRun(lootPubRefresh())}catch(e){clLog('LOOT-INIT-FAIL '+e.message);$('#l-root-path').textContent='LootBP не найден';$('#l-built').textContent='—';
$('#l-root-input').value='';toast('LootBP: '+e.message+' — укажите путь вручную выше или нажмите «СКАЧАТЬ БАЗУ ЛУТА С СЕРВЕРА»')}}

function lootSecGo(sec){lootSec=sec;document.querySelectorAll('.l-tab').forEach(b=>b.classList.toggle('active',b.dataset.lsec===sec));
document.querySelectorAll('.l-pane').forEach(p=>p.classList.toggle('active',p.id==='l-pane-'+sec));
if(sec==='spawners'){lootRun(lootSpawnersLoad());lootRun(lootPubRefresh())}else if(sec==='nodes')lootRun(lootNodesLoad());
else if(sec==='items')lootRun(lootItemsLoad());else if(sec==='cooldowns')lootRun(lootCooldownsLoad());
else if(sec==='zones')lootRun(lootZonesLoad())}

async function lootSpawnersLoad(){let s=lootSp;
let d=await lootApi('/api/loot/spawners?scope='+s.scope+'&mod='+encodeURIComponent(s.mod)+'&group='+encodeURIComponent(s.group)+'&q='+encodeURIComponent(s.q)+'&offset='+s.off+'&limit=60');
$('#l-sp-count').textContent='Найдено: '+d.total;
$('#l-sp-prev').disabled=d.offset<=0;$('#l-sp-next').disabled=d.offset+d.limit>=d.total;
$('#l-sp-page').textContent=d.total?'стр. '+(Math.floor(d.offset/d.limit)+1)+' из '+Math.max(1,Math.ceil(d.total/d.limit)):'—';
let body=$('#l-sp-rows');body.innerHTML='';
if(!d.items.length){body.innerHTML='<tr><td colspan="9" class="empty">Ничего не найдено</td></tr>';return}
d.items.forEach(x=>{let tr=document.createElement('tr');
let td=document.createElement('td');let b=document.createElement('button');b.type='button';b.className='link';b.textContent=x.id+(x.edited?' ✎':'');b.title=x.edited?'Есть WORKING-правка':'';b.onclick=()=>lootRun(lootSpawnerOpen(x));td.append(b);tr.append(td);
lootCell(tr,x.group);lootCell(tr,x.mod||'—');lootCell(tr,x.families.items);lootCell(tr,x.families.nodes);lootCell(tr,x.families.fixed);lootCell(tr,x.families.subpresets);
lootCell(tr,x.zone?'да':'—',x.zone?'warn':'');
lootCell(tr,x.vanilla?'да':'нет',x.vanilla?'':'warn');
body.append(tr)})}

async function lootSpawnerOpen(x){let s=lootSp;
let d=await lootApi('/api/loot/spawner?scope='+s.scope+'&mod='+encodeURIComponent(x.mod||'')+'&id='+encodeURIComponent(x.id));
lootSpCur={id:d.id,mod:d.mod||'',working:!!d.working,doc:d.doc,key:(d.mod?d.mod+'/':'')+d.id};
$('#l-sp-detail').hidden=false;$('#l-sp-detail-title').textContent=x.id+(x.mod?' · мод '+x.mod:' · vanilla')+(d.working?' · WORKING':'');
$('#l-sp-reset').hidden=!d.working;$('#l-sp-publish').hidden=!d.working;
let issues=[],r=d.resolved;
if(r.unknownNodes.length)issues.push(['ERROR','Ссылки на дерево не найдены ('+r.unknownNodes.length+' из '+r.nodeRefs+')',r.unknownNodes]);
if(r.unknownItems.length)issues.push(['WARNING','Id нет в Parameters.json ('+r.unknownItems.length+' из '+r.itemRefs+')',r.unknownItems]);
if(r.missingSubpresets.length)issues.push(['ERROR','Subpreset не найден',r.missingSubpresets]);
let box=$('#l-sp-detail-issues');box.innerHTML='';
if(!issues.length)box.innerHTML='<p class="empty">Все ссылки резолвятся</p>';
issues.forEach(([lv,tx,refs])=>{let row=document.createElement('div');row.className='l-issue '+(lv==='ERROR'?'error':'warning');
let bd=document.createElement('span');bd.className='badge '+(lv==='ERROR'?'lv-err':'lv-warn');bd.textContent=lv;
let t=document.createElement('span');t.className='tx';t.textContent=tx;row.append(bd,t);
let rf=document.createElement('div');rf.className='refs';rf.textContent='примеры: '+refs.slice(0,12).join(' · ');row.append(rf);box.append(row)});
let hb=$('#l-sp-detail-help');hb.innerHTML='';let ks=Object.keys(d.doc||{}).filter(k=>LOOT_HELP.keys[k]);
if(Array.isArray(d.doc.Nodes)&&d.doc.Nodes.some(e=>e&&typeof e==='object'))['Ids','Rarity','Probability','QuantityMin','QuantityMax','AllowDuplicates','ShouldGiveItemsByGone','ShouldApplyLocationSpecificProbabilityModifiers'].forEach(k=>{if(ks.indexOf(k)<0)ks.push(k)});
if(ks.length){let h=document.createElement('h4');h.textContent='ПАРАМЕТРЫ ЭТОГО ПРЕСЕТА — ЧТО ОНИ ДЕЛАЮТ';hb.append(h);
ks.sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase())).forEach(k=>hb.append(lootHelpRow(k,LOOT_HELP.keys[k])))}
let txt=JSON.stringify(d.doc,null,2);$('#l-sp-detail-doc').textContent=txt.length>60000?txt.slice(0,60000)+'\n… (обрезано)':txt}

function lootTreeRender(node,box,depth){let children=node.Children||[];
if(children.length){let det=document.createElement('details');det.open=depth<2;
let sum=document.createElement('summary');sum.append(lootNodeChip(node));det.append(sum);
children.forEach(ch=>lootTreeRender(ch,det,depth+1));box.append(det)}
else{let leaf=document.createElement('div');leaf.className='l-leaf'+(node.known===false?' unk':'');leaf.textContent=node.Name||'—';
if(node.known===false)leaf.title='Лист отсутствует в Parameters.json';
if(node.Rarity)leaf.title+=(leaf.title?' · ':'')+node.Rarity;box.append(leaf)}}

function lootNodeChip(node){let sp=document.createElement('span');sp.className='l-nname';sp.textContent=node.Name||'—';
let rar=document.createElement('span');rar.className='l-tag';rar.textContent=node.Rarity||'';
let w=document.createElement('span');w.append(sp,rar);
if(node.PostSpawnActions&&node.PostSpawnActions.length){let a=document.createElement('span');a.className='l-tag act';a.textContent=node.PostSpawnActions.join(' · ');w.append(a)}
return w}

async function lootNodesLoad(){let scope=$('#l-n-scope').value,q=$('#l-n-q').value.toLowerCase();
let d=await lootApi('/api/loot/nodes?scope='+scope+'&q='+encodeURIComponent(q));
$('#l-n-count').textContent='Файлов: '+d.total+' · область: '+d.scope;
let body=$('#l-n-rows');body.innerHTML='';
if(!d.items.length){body.innerHTML='<tr><td colspan="5" class="empty">Ничего не найдено</td></tr>';return}
d.items.forEach(x=>{let tr=document.createElement('tr');
let td=document.createElement('td');let b=document.createElement('button');b.type='button';b.className='link';b.textContent=x.name;b.onclick=()=>lootRun(lootNodeOpen(x.name,$('#l-n-scope').value));td.append(b);tr.append(td);
lootCell(tr,x.leaves);lootCell(tr,x.internal);lootCell(tr,x.depth);lootCell(tr,x.unknown||'—',x.unknown?'warn':'');body.append(tr)})}

async function lootNodeOpen(name,scope){let d=await lootApi('/api/loot/node?scope='+scope+'&name='+encodeURIComponent(name));
$('#l-n-title').textContent=d.name+' ('+d.scope+')';$('#l-n-view').hidden=false;
lootNCur={name:d.name,scope:d.scope,key:d.name+'.json'};
$('#l-n-edit').hidden=false;$('#l-n-reset').hidden=!lootEdited('nodes',lootNCur.key);
let tree=$('#l-n-tree');tree.innerHTML='';lootTreeRender(d.tree||{},tree,0)}

async function lootItemsLoad(){let s=lootIt;
let d=await lootApi('/api/loot/items?q='+encodeURIComponent(s.q)+'&location='+encodeURIComponent(s.loc)+'&cooldown='+encodeURIComponent(s.cd)+'&offset='+s.off+'&limit=100');
$('#l-it-count').textContent='Найдено: '+d.total;
lootItTotal=d.total;let ab=$('#l-itb-apply');ab.disabled=!d.total;ab.textContent='МАССОВО ИЗМЕНИТЬ НАЙДЕННЫЕ ('+d.total+')';
$('#l-it-prev').disabled=d.offset<=0;$('#l-it-next').disabled=d.offset+d.limit>=d.total;
$('#l-it-page').textContent=d.total?'стр. '+(Math.floor(d.offset/d.limit)+1)+' из '+Math.max(1,Math.ceil(d.total/d.limit)):'—';
let body=$('#l-it-rows');body.innerHTML='';
if(!d.items.length){body.innerHTML='<tr><td colspan="7" class="empty">Ничего не найдено</td></tr>';return}
d.items.forEach(e=>{let tr=document.createElement('tr');
let td=document.createElement('td');let wrap=document.createElement('span');wrap.className='l-it-id';
let th=document.createElement('img');th.className='thumb';th.alt='';th.loading='lazy';th.src='/api/icon/'+encodeURIComponent(e.Id)+'?t='+iconBust;
th.onerror=()=>{let ph=document.createElement('span');ph.className='thumb-ph';ph.textContent=e.Id.charAt(0);th.replaceWith(ph)};
wrap.append(th);
let b=document.createElement('button');b.type='button';b.className='link';
b.textContent=e.Id+(lootEdited('items',e.Id)?' ✎':'');if(lootEdited('items',e.Id))b.title='Есть WORKING-правка';
b.onclick=()=>lootItemOpen(e.Id,e);wrap.append(b);td.append(wrap);tr.append(td);
lootCell(tr,(e.AllowedLocations||[]).join(', ')||'—');
let cdl=e.CooldownGroup;lootCell(tr,cdl?cdl+(e.CooldownPerSquadMemberMax?' ('+e.CooldownPerSquadMemberMin+'–'+e.CooldownPerSquadMemberMax+')':''):'—');
lootCell(tr,(e.Variations||[]).length);
lootCell(tr,e.ShouldOverrideInitialAndRandomUsage?(e.InitialUsageOverride+' / '+e.RandomUsageOverride):'—');
lootCell(tr,e.ShouldOverrideInitialAndRandomStack?(e.InitialStackOverride+' / '+e.RandomStackOverride):'—');
lootCell(tr,e.IsDisabledForSpawning?'ДА':'—',e.IsDisabledForSpawning?'warn':'');
body.append(tr)})}

function lootItemOpen(id,entry){
 lootItCur={id,entry:JSON.parse(JSON.stringify(entry||{}))};
 let e=lootItCur.entry,locs=e.AllowedLocations||[];
 $('#l-itd-loc-coastal').checked=locs.includes('Coastal');
 $('#l-itd-loc-continental').checked=locs.includes('Continental');
 $('#l-itd-loc-mountain').checked=locs.includes('Mountain');
 $('#l-itd-cdg').value=e.CooldownGroup||'';
 $('#l-itd-cdmin').value=e.CooldownPerSquadMemberMin??'';
 $('#l-itd-cdmax').value=e.CooldownPerSquadMemberMax??'';
 $('#l-itd-uset').checked=!!e.ShouldOverrideInitialAndRandomUsage;
 $('#l-itd-usage-i').value=e.ShouldOverrideInitialAndRandomUsage?(e.InitialUsageOverride??0):0;
 $('#l-itd-usage-r').value=e.ShouldOverrideInitialAndRandomUsage?(e.RandomUsageOverride??0):0;
 $('#l-itd-stset').checked=!!e.ShouldOverrideInitialAndRandomStack;
 $('#l-itd-sti').value=e.ShouldOverrideInitialAndRandomStack?(e.InitialStackOverride??0):0;
 $('#l-itd-str').value=e.ShouldOverrideInitialAndRandomStack?(e.RandomStackOverride??0):0;
 $('#l-itd-dis').checked=!!e.IsDisabledForSpawning;
 $('#l-itd-base').textContent='В базе: Id='+(e.Id||id)+' · полей: '+Object.keys(e).length+(Object.keys(e).length>13?' (включая нестандартные — сохранятся)':'');
 $('#l-itd-title').textContent=id;
 $('#l-itd-status').textContent='';$('#l-itd-reset').hidden=!lootEdited('items',id);
 $('#l-itd-dialog').showModal()}

function lootItemPatch(){
 let e=lootItCur.entry,patch={},num=(id)=>{let v=$('#'+id).value.trim();return v===''?null:parseFloat(v.replace(',','.'))};
 let locs=['Coastal','Continental','Mountain'].filter(l=>$('#l-itd-loc-'+l.toLowerCase()).checked);
 if(!locs.length)return{err:'AllowedLocations: выберите хотя бы одну локацию'};
 if(JSON.stringify(locs)!==JSON.stringify(e.AllowedLocations||[]))patch.AllowedLocations=locs;
 let cdg=$('#l-itd-cdg').value.trim();
 if((e.CooldownGroup||'')!==cdg)patch.CooldownGroup=cdg||null;
 [['l-itd-cdmin','CooldownPerSquadMemberMin'],['l-itd-cdmax','CooldownPerSquadMemberMax']].forEach(([id,k])=>{
  let v=num(id),b=e[k];
  if(v!==null&&(!Number.isFinite(v)||v<0))return;
  if(v!==null&&(b===undefined||Number(v)!==Number(b)))patch[k]=v});
 if($('#l-itd-uset').checked!==!!e.ShouldOverrideInitialAndRandomUsage)patch.ShouldOverrideInitialAndRandomUsage=$('#l-itd-uset').checked;
 if($('#l-itd-stset').checked!==!!e.ShouldOverrideInitialAndRandomStack)patch.ShouldOverrideInitialAndRandomStack=$('#l-itd-stset').checked;
 if($('#l-itd-uset').checked){[['l-itd-usage-i','InitialUsageOverride'],['l-itd-usage-r','RandomUsageOverride']].forEach(([id,k])=>{
  let v=num(id);if(v===null)v=0;if(!Number.isFinite(v)||v<0)v=0;
  if(Number(v)!==Number(e[k]??0))patch[k]=v})}
 if($('#l-itd-stset').checked){[['l-itd-sti','InitialStackOverride'],['l-itd-str','RandomStackOverride']].forEach(([id,k])=>{
  let v=num(id);if(v===null)v=0;if(!Number.isFinite(v)||v<0)v=0;
  if(Number(v)!==Number(e[k]??0))patch[k]=v})}
 if($('#l-itd-dis').checked!==!!e.IsDisabledForSpawning)patch.IsDisabledForSpawning=$('#l-itd-dis').checked;
 return{patch}}

async function lootCooldownsLoad(){let d=await lootApi('/api/loot/cooldowns');
$('#l-cd-meta').textContent=d.meta?('DeleteAllDefaultCooldownGroups='+(d.meta.deleteAll?'true':'false')+' · DefaultCooldownGroupsToDelete: '+(d.meta.toDelete.join(', ')||'нет')):'Файл CooldownGroups.json не найден';
let body=$('#l-cd-rows');body.innerHTML='';
if(!d.groups.length){body.innerHTML='<tr><td colspan="5" class="empty">Групп нет</td></tr>';return}
d.groups.forEach(g=>{let tr=document.createElement('tr');lootCell(tr,g.Name);lootCell(tr,g.CooldownMin);lootCell(tr,g.CooldownMax);
lootCell(tr,g.IsAffectedByLowerGroups?'да':'—');lootCell(tr,g.usedBy||'—');body.append(tr)})}

async function lootZonesLoad(){let d=await lootApi('/api/loot/zones');
let body=$('#l-z-rows');body.innerHTML='';
if(!d.mods.length){body.innerHTML='<tr><td colspan="7" class="empty">Override-модов нет — добавьте мод кнопкой «ДОБАВИТЬ МОД»</td></tr>';return}
d.mods.forEach(m=>{let tr=document.createElement('tr');lootCell(tr,m.mod+(lootEdited('zones',m.mod)?' ✎':''));
lootCell(tr,m.zonesFile?'есть':'—',m.zonesFile?'':'warn');lootCell(tr,m.zones.length);lootCell(tr,m.presets);lootCell(tr,m.spawnersWithZone,m.spawnersWithZone?'':'warn');
let coords=m.zones.map(z=>(z.TopLeft||'?')+' → '+(z.BottomRight||'?')).join(' | ');
lootCell(tr,coords.length>120?coords.slice(0,120)+'…':(coords||'—'));
let ta=document.createElement('td');let eb=document.createElement('button');eb.type='button';eb.className='link';eb.textContent='ПРАВИТЬ (WORKING)';eb.title='Отдельное окно с картой';eb.onclick=()=>lootZoneWindow(m.mod);ta.append(eb);tr.append(ta);
body.append(tr)})}

async function lootValidateRun(){let btn=$('#l-val-run');btn.disabled=true;$('#l-val-status').textContent='Выполняю проверку…';
try{let d=await lootApi('/api/loot/validate'),c=d.counts;
$('#l-val-counts').innerHTML='<span class="badge lv-err">ERROR: '+c.ERROR+'</span><span class="badge lv-warn">WARNING: '+c.WARNING+'</span><span class="badge lv-info">INFO: '+c.INFO+'</span>';
$('#l-val-status').textContent='Записей: '+d.total+' · база построена '+String(d.built).replace('T',' ');
let box=$('#l-val-list');box.innerHTML='';
if(!d.issues.length)box.innerHTML='<p class="empty">Проблем не найдено</p>';
d.issues.forEach(it=>{let row=document.createElement('div');row.className='l-issue';
let bd=document.createElement('span');bd.className='badge '+(it.level==='ERROR'?'lv-err':it.level==='WARNING'?'lv-warn':'lv-info');bd.textContent=it.level;
let t=document.createElement('span');t.className='tx';t.textContent=it.message+(it.count>1?' · ×'+it.count:'');
row.append(bd,t);
if(it.refs&&it.refs.length){let rf=document.createElement('div');rf.className='refs';rf.textContent='примеры: '+it.refs.slice(0,12).join(' · ');row.append(rf)}
box.append(row)})}
catch(e){$('#l-val-status').textContent='Ошибка: '+e.message}
finally{btn.disabled=false}}

function lootPubBtn(sec,el,ids,label){let b=$(el);if(!b)return;b.disabled=!ids.length;b.textContent=label+' ('+ids.length+')'}
function lootEdited(sec,key){return (lootWork[sec]||[]).some(x=>x.key===key)}

async function lootPubRefresh(){
 try{lootWork=await lootApi('/api/loot/working')}catch(e){clLog('LOOT-WORK-FAIL '+e.message);return}
 lootPubList=lootWork.presets.map(x=>x.key);
 lootPubBtn('sp','#l-sp-publish-all',lootPubList,'ОТПРАВИТЬ ВСЁ НА СЕРВЕР');
 lootPubBtn('it','#l-it-publish',lootWork.items.map(x=>x.key),'ОТПРАВИТЬ ПРЕДМЕТЫ');
 lootPubBtn('cd','#l-cd-publish',lootWork.cooldowns.map(x=>x.key),'ОТПРАВИТЬ КУЛДАУНЫ');
 lootPubBtn('n','#l-n-publish',lootWork.nodes.map(x=>x.key),'ОТПРАВИТЬ ДЕРЕВО');
 lootPubBtn('z','#l-z-publish',lootWork.zones.map(x=>x.key),'ОТПРАВИТЬ ЗОНЫ');
 let hasAny=lootPubList.length||lootWork.items.length||lootWork.cooldowns.length||lootWork.nodes.length||lootWork.zones.length;
 let zb=$('#l-export-zip');if(zb)zb.disabled=!hasAny;
 lootCdWRender();
 if(lootNCur)$('#l-n-reset').hidden=!lootEdited('nodes',lootNCur.key);
 if(!lootPubList.length)$('#l-sp-pub-status').textContent='';
}

function lootCdWRender(){
 let body=$('#l-cd-w-rows');if(!body)return;body.innerHTML='';
 let rows=lootWork.cooldowns||[];
 if(!rows.length){body.innerHTML='<tr><td colspan="4" class="empty">Файлов нет — создайте первый кнопкой «НОВЫЙ OVERRIDE-ФАЙЛ»</td></tr>';return}
 rows.forEach(w=>{let tr=document.createElement('tr');
  let td=document.createElement('td');let b=document.createElement('button');b.type='button';b.className='link';b.textContent=w.name+(w.doc&&w.doc.DeleteAllDefaultCooldownGroups?' ⚠':'');b.title='ПРАВИТЬ (WORKING)';b.onclick=()=>lootCdOpen(w.key);td.append(b);tr.append(td);
  lootCell(tr,w.groups||0);
  lootCell(tr,String(w.saved||'').replace('T',' '));
  let ta=document.createElement('td');let rb=document.createElement('button');rb.type='button';rb.className='link';rb.textContent='СБРОСИТЬ';rb.onclick=()=>lootCdReset(w.key);ta.append(rb);tr.append(ta);
  body.append(tr)});
}

const LOOT_PUB_CONFIRM={
 preset:'Выгрузить на сервер: {label}? Ванильные пресеты → Spawners\\Presets\\Default\\<имя>.json, модовые → Spawners\\Presets\\Override\\<Мод>\\<имя>.json.',
 items:'Выгрузить на сервер: ПРЕДМЕТЫ (WORKING)? Будет записан один файл Items\\Override\\Parameters.json: локальная база + правки + текущий Override сервера (слияние по Id). Существующий файл получит метку .backup-<дата>.',
 cooldowns:'Выгрузить на сервер: КУЛДАУНЫ (WORKING)? Файлы → CooldownGroups\\Override\\<файл>.json.',
 nodes:'Выгрузить на сервер: ДЕРЕВО ЛУТА (WORKING)? Файлы → Nodes\\Override\\<файл>.json.',
 zones:'Выгрузить на сервер: ЗОНЫ (WORKING)? Файлы → Spawners\\Presets\\Override\\<мод>\\Zones.json.'};

async function lootPublish(keys,type){
 let c=ftpCredentials();if(!c.host)return toast('Заполните параметры FTP во вкладке «FTP / ФАЙЛЫ»');
 type=type||'preset';
 let label=type==='preset'?(keys.length===1?'выбранный пресет (1 файл)':keys.length+' файлов WORKING-правок')
  :type==='items'?'предметы (1 файл)':keys.length+' файл(ов)';
 if(!(await askConfirm('Публикация на сервер',LOOT_PUB_CONFIRM[type].replace('{label}',label)+' Существующие файлы получат метку .backup-<дата> (откат — переименовать обратно). Сервер применит файлы после рестарта спавнеров (#ReloadLootCustomizationsAndResetSpawners) или перезапуска.')))return;
 let stEl={preset:'#l-sp-pub-status',items:'#l-it-pub-status',cooldowns:'#l-cd-pub-status',nodes:'#l-n-pub-status',zones:'#l-z-pub-status'}[type];
 let st=stEl?$(stEl):null;if(st)st.textContent='Публикую…';
 try{let d=await ftpRequest('/api/loot/publish',{keys:keys,type:type,confirm:true});
 if(st)st.textContent='На сервер: '+d.uploaded+' · бэкапов: '+d.backups+(d.dirsCreated&&d.dirsCreated.length?' · папок: '+d.dirsCreated.length:'')+(type==='items'&&d.items?' · предметов: '+d.items:'')+(d.failed.length?' · ОШИБОК: '+d.failed.length:'')+' · '+d.base;
 if(d.failed.length)toast('Публикация: ошибки — '+d.failed.map(f=>f.key+': '+f.error).slice(0,3).join(' | '));
 else toast('Опубликовано на сервер: '+d.uploaded+' файл(ов)')}
 catch(e){if(st)st.textContent='Ошибка: '+e.message;toast('Публикация: '+e.message)}}

$('#l-sp-publish-all').onclick=()=>{if(lootPubList.length)lootRun(lootPublish(lootPubList,'preset'))};
$('#l-sp-publish').onclick=()=>{if(lootSpCur&&lootSpCur.working)lootRun(lootPublish([lootSpCur.key],'preset'))};

function lootCalcWeights(){
 let m={Abundant:6,Common:5,Uncommon:4,Rare:3,VeryRare:2,ExtremelyRare:1};
 [['ab','Abundant'],['co','Common'],['un','Uncommon'],['ra','Rare'],['ve','VeryRare'],['ex','ExtremelyRare']].forEach(([s,k])=>{
  let v=parseInt($('#l-cw-'+s).value,10);
  if(Number.isFinite(v)&&v>=1&&v<=20)m[k]=v});
 return m}
function lootCalcNum(v,d){v=parseFloat(v);return Number.isFinite(v)?v:d}
function lootCalcP(v,d){return Math.min(100,Math.max(0,lootCalcNum(v,d)))/100}
function lootCalcRun(){
 let box=$('#l-calc-status');
 if(!lootSpCur){box.textContent='Откройте пресет во вкладке СПАВНЕРЫ';return}
 let doc=lootSpCur.doc||{},W=lootCalcWeights();
 let P=lootCalcP(doc.Probability,100);
 let qmin=lootCalcNum(doc.QuantityMin,1),qmax=lootCalcNum(doc.QuantityMax,1);
 let qAvg=(qmin+qmax)/2,qFac=qmin>=1?1:(qmax>0?qmax/(qmax+1):0);
 let items=Array.isArray(doc.Items)?doc.Items:[];
 let nodes=Array.isArray(doc.Nodes)?doc.Nodes:[];
 let fixed=Array.isArray(doc.FixedItems)?doc.FixedItems:[];
 let subs=Array.isArray(doc.Subpresets)?doc.Subpresets:[];
 if(!items.length&&!nodes.length&&!fixed.length&&!subs.length){box.textContent='В пресете нет записей выдачи';return}
 let wsum=items.reduce((s,e)=>s+(W[e&&e.Rarity]||W.Common),0);
 let agg={};
 items.forEach(e=>{if(!e||!e.Id)return;
  let w=W[e.Rarity]||W.Common,share=wsum?w/wsum:0;
  let ch=P*share*qFac,ex=P*share*qAvg;
  let a=agg[e.Id]||(agg[e.Id]={ch:0,ex:0,rar:e.Rarity||'',recs:0});
  a.ch=Math.min(1,a.ch+ch);a.ex+=ex;a.recs++;if(e.Rarity)a.rar=e.Rarity});
 let any=0;
 if(fixed.length)any=1;
 else{let pAny=1;
  if(items.length)pAny*=(1-P);
  nodes.forEach(r=>{if(!r)return;pAny*=(1-lootCalcP(r.Probability,P))});
  any=1-pAny}
 let expTotal=P*qAvg+nodes.reduce((s,r)=>{if(!r)return s;let rp=lootCalcP(r.Probability,P);
  return s+rp*((lootCalcNum(r.QuantityMin,qmin)+lootCalcNum(r.QuantityMax,qmax))/2)},0)+fixed.length;
 let sm=$('#l-calc-summary');sm.innerHTML='';
 [['Шанс ≥1 предмета',fixed.length?'100 %':Math.round(any*1000)/10+' %'],
  ['Ср. кол-во за респавн',Math.round(expTotal*100)/100],
  ['Записи','Items '+items.length+' · Nodes '+nodes.length+' · Fixed '+fixed.length+' · Sub '+subs.length]]
 .forEach(([t,v])=>{let d2=document.createElement('div');d2.className='l-stat';
  let b=document.createElement('b');b.textContent=v;let s2=document.createElement('span');s2.textContent=t;d2.append(b,s2);sm.append(d2)});
 let body=$('#l-calc-rows');body.innerHTML='';
 let ids=Object.keys(agg).sort((a,b)=>agg[b].ch-agg[a].ch);
 if(!ids.length)body.innerHTML='<tr><td colspan="6" class="empty">Прямых Items-записей нет — выдача через Nodes/Subpresets</td></tr>';
 ids.forEach(id=>{let a=agg[id],tr=document.createElement('tr');
  lootCell(tr,id+(lootSpCur.working&&lootEdited('items',id)?' (правлен в ПРЕДМЕТАХ)':''));
  lootCell(tr,a.recs);lootCell(tr,a.rar||'—');
  lootCell(tr,W[a.rar]||W.Common);
  lootCell(tr,(Math.round(a.ch*1000)/10)+' %',a.ch>0?'':'');
  lootCell(tr,Math.round(a.ex*100)/100);
  body.append(tr)});
 let ex=$('#l-calc-extra');ex.innerHTML='';
 if(nodes.length){let h='<b>NODES-ЗАПИСИ (агрегированно):</b> ';
  nodes.forEach((r,i)=>{if(!r)return;let rp=lootCalcP(r.Probability,P);
   let rq=(lootCalcNum(r.QuantityMin,qmin)+lootCalcNum(r.QuantityMax,qmax))/2;
   h+='<br>#'+(i+1)+': шанс срабатывания ≈ '+Math.round(rp*1000)/10+' % · путей: '+((r.Ids||[]).length)+' · ср. кол-во: '+Math.round(rq*100)/100+(r.Rarity?' · Rarity: '+r.Rarity:'')});
  let d3=document.createElement('div');d3.innerHTML=h;ex.append(d3)}
 if(fixed.length){let d4=document.createElement('div');d4.innerHTML='<b>FIXEDITEMS (100 %):</b> '+fixed.map(f=>f&&f.Id).filter(Boolean).join(', ');ex.append(d4)}
 if(subs.length){let d5=document.createElement('div');d5.innerHTML='<b>SUBPRESETS (не разворачиваются в расчёте):</b> '+subs.map(s=>s&&s.Id).filter(Boolean).join(', ');ex.append(d5)}
 box.textContent='Оценка для '+lootSpCur.id+(lootSpCur.mod?' (мод '+lootSpCur.mod+')':'')+(lootSpCur.working?' · по WORKING-правке':' · по ванильному вариант')}
$('#l-sp-calc').onclick=()=>{if(!lootSpCur)return;
 $('#l-calc-title').textContent='Калькулятор · '+lootSpCur.id+(lootSpCur.mod?' · мод '+lootSpCur.mod:'')+(lootSpCur.working?' · WORKING':'');
 $('#l-calc-status').textContent='';
 lootCalcRun();
 $('#l-calc-dialog').showModal()};
$('#l-calc-run').onclick=lootCalcRun;
$('#l-calc-close').onclick=()=>$('#l-calc-dialog').close();

async function lootWorkReset(type,key,after){
 if(!(await askConfirm('Сброс правки','Удалить WORKING-правку «'+key+'»? Значения вернутся к базе.')))return;
 try{let r=await fetch('/api/loot/working-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:type,key:key})}).then(v=>v.json());
 if(!r||!r.ok)throw new Error((r&&r.error)||'Не удалось сбросить');
 toast('Правка сброшена: '+key);lootRun(lootPubRefresh());if(after)lootRun(after())}catch(e){toast('Loot: '+e.message)}}

$('#l-it-publish').onclick=()=>{let ks=(lootWork.items||[]).map(x=>x.key);if(ks.length)lootRun(lootPublish(ks,'items'))};
$('#l-cd-publish').onclick=()=>{let ks=(lootWork.cooldowns||[]).map(x=>x.key);if(ks.length)lootRun(lootPublish(ks,'cooldowns'))};
$('#l-n-publish').onclick=()=>{let ks=(lootWork.nodes||[]).map(x=>x.key);if(ks.length)lootRun(lootPublish(ks,'nodes'))};
$('#l-z-publish').onclick=()=>{let ks=(lootWork.zones||[]).map(x=>x.key);if(ks.length)lootRun(lootPublish(ks,'zones'))};

$('#l-export-zip').onclick=async()=>{
 if(!(await askConfirm('Экспорт OVERRIDE (ZIP)','Собрать все WORKING-правки (пресеты, предметы, кулдауны, дерево, зоны) в ZIP-архив в папке exports? Предметы берутся из локальной базы + правки, серверный Override не подмешивается. После сборки папка exports откроется.')))return;
 try{let r=await fetch('/api/loot/export-zip',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(v=>v.json());
 if(!r||!r.ok)throw new Error((r&&r.error)||'Не удалось собрать ZIP');
 $('#l-sp-pub-status').textContent='ZIP: '+r.files+' файл(ов) · '+Math.round(r.bytes/1024)+' КБ · '+r.path;
 toast('ZIP собран: '+r.files+' файл(ов)');
 fetch('/api/export/open',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})}
 catch(e){toast('ZIP: '+e.message)}};

$('#l-itd-cancel').onclick=()=>$('#l-itd-dialog').close();
$('#l-itd-save').onclick=async()=>{if(!lootItCur)return;let st=$('#l-itd-status');
 let r2=lootItemPatch();
 if(r2.err){st.textContent=r2.err;return}
 if(!Object.keys(r2.patch).length){st.textContent='Нет изменений — правка не нужна';return}
 st.textContent='Сохраняю…';
 try{let r=await fetch('/api/loot/working-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'item',id:lootItCur.id,patch:r2.patch})}).then(v=>v.json());
 if(!r||!r.ok)throw new Error((r&&r.error)||'Не удалось сохранить');
 let wn=(r.warnings||[]).join(' · ');
 st.textContent='Сохранено в WORKING: '+r.key+(wn?' · ВНИМАНИЕ: '+wn:' · изменено полей: '+Object.keys(r.patch||{}).length);
 $('#l-itd-reset').hidden=false;lootRun(lootItemsLoad());lootRun(lootPubRefresh())}catch(e){st.textContent='Ошибка: '+e.message}};
$('#l-itd-reset').onclick=()=>{if(lootItCur)lootWorkReset('item',lootItCur.id,lootItemsLoad)};

$('#l-cd-new').onclick=async()=>{let name=await askText('Имя нового override-файла кулдаунов','Например: MyCooldowns.json');name=(name||'').trim();if(!name)return;
 if(!/\.json$/i.test(name))name+='.json';
 lootCdEdOpen(name,{DeleteAllDefaultCooldownGroups:false,DefaultCooldownGroupsToDelete:[],CooldownGroups:[]})};
function lootCdJsonOpen(name,doc){lootCdCur=name;
 $('#l-cdd-title').textContent=name+(lootEdited('cooldowns',name)?' · WORKING':'');
 $('#l-cdd-doc').value=JSON.stringify(doc,null,2);$('#l-cdd-status').textContent='';
 $('#l-cdd-dialog').showModal()}
function lootCdOpen(key){lootCdEdOpen(key)}
function lootCdEdDl(){let dl=$('#l-cde-groups-dl');if(dl.dataset.loaded)return;
 lootRun(lootApi('/api/loot/cooldowns').then(d=>{d.groups.forEach(g=>{let o=document.createElement('option');o.value=g.Name;dl.append(o)});dl.dataset.loaded='1'}))}
function lootCdEdOpen(key,doc){
 let d2=doc||((lootWork.cooldowns||[]).find(x=>x.key===key)||{}).doc||null;
 if(!d2)d2={DeleteAllDefaultCooldownGroups:false,DefaultCooldownGroupsToDelete:[],CooldownGroups:[]};
 lootCdEd={key:key,doc:JSON.parse(JSON.stringify(d2))};
 $('#l-cde-title').textContent=key+(lootEdited('cooldowns',key)?' · WORKING':'');
 $('#l-cde-name').value=key;
 $('#l-cde-status').textContent='';
 lootCdEdDl();lootCdEdRender();
 $('#l-cde-dialog').showModal()}
function lootCdEdRender(){
 let d=lootCdEd.doc;
 if(!Array.isArray(d.CooldownGroups))d.CooldownGroups=[];
 if(!Array.isArray(d.DefaultCooldownGroupsToDelete))d.DefaultCooldownGroupsToDelete=[];
 if(typeof d.DeleteAllDefaultCooldownGroups!=='boolean')d.DeleteAllDefaultCooldownGroups=false;
 $('#l-cde-delall').checked=d.DeleteAllDefaultCooldownGroups;
 let box=$('#l-cde-groups');box.innerHTML='';
 d.CooldownGroups.forEach(g=>box.append(lootCdEdCard(g)));
 let dl2=$('#l-cde-del-list');dl2.innerHTML='';
 if(!d.DefaultCooldownGroupsToDelete.length)dl2.innerHTML='<p class="empty">Нет</p>';
 d.DefaultCooldownGroupsToDelete.forEach((nm,i)=>{let s=document.createElement('span');s.className='l-tag';s.textContent=nm;
  let x=document.createElement('button');x.type='button';x.className='link';x.textContent=' ×';x.title='Убрать из списка';
  x.onclick=()=>{d.DefaultCooldownGroupsToDelete.splice(i,1);lootCdEdRender()};s.append(x);dl2.append(s)})}
function lootCdEdCard(g){
 let c=document.createElement('div');c.className='l-cde-card';
 let nm=document.createElement('input');nm.className='l-ned-name';nm.setAttribute('list','l-cde-groups-dl');nm.spellcheck=false;
 nm.placeholder='Имя группы (Name)';nm.value=g.Name||'';
 nm.oninput=()=>{g.Name=nm.value};c.append(nm);
 let num=(ph,key)=>{let i=document.createElement('input');i.type='number';i.step='any';i.min='0';i.placeholder=ph;i.className='l-cde-num';i.value=(g[key]??'');
  i.oninput=()=>{let v=parseFloat(String(i.value).replace(',','.'));g[key]=(Number.isFinite(v)&&v>=0)?v:0};return i};
 c.append(num('Min','CooldownMin'),num('Max','CooldownMax'));
 let lb=document.createElement('label');lb.className='chk';lb.style.cssText='display:flex;gap:6px;align-items:center;white-space:nowrap;font-size:11px;color:var(--muted)';
 let cb=document.createElement('input');cb.type='checkbox';cb.checked=g.IsAffectedByLowerGroups===true;
 cb.onchange=()=>{if(cb.checked)g.IsAffectedByLowerGroups=true;else delete g.IsAffectedByLowerGroups};
 lb.append(cb,document.createTextNode('нижние'));c.append(lb);
 c.append(lootNEdBtn('×','Удалить группу',()=>{let arr=lootCdEd.doc.CooldownGroups,i=arr.indexOf(g);if(i>=0)arr.splice(i,1);lootCdEdRender()}));
 return c}
$('#l-cde-cancel').onclick=()=>$('#l-cde-dialog').close();
$('#l-cde-delall').onchange=()=>{if(lootCdEd)lootCdEd.doc.DeleteAllDefaultCooldownGroups=$('#l-cde-delall').checked};
$('#l-cde-del-add-btn').onclick=()=>{if(!lootCdEd)return;let inp=$('#l-cde-del-input'),v=(inp.value||'').trim();if(!v)return;
 let arr=lootCdEd.doc.DefaultCooldownGroupsToDelete;if(!Array.isArray(arr))arr=lootCdEd.doc.DefaultCooldownGroupsToDelete=[];
 if(!arr.includes(v.slice(0,120)))arr.push(v.slice(0,120));inp.value='';lootCdEdRender()};
$('#l-cde-add').onclick=()=>{if(!lootCdEd)return;
 if(!Array.isArray(lootCdEd.doc.CooldownGroups))lootCdEd.doc.CooldownGroups=[];
 lootCdEd.doc.CooldownGroups.push({Name:'',CooldownMin:0,CooldownMax:0});lootCdEdRender()};
$('#l-cde-save').onclick=async()=>{if(!lootCdEd)return;let st=$('#l-cde-status');
 let name=$('#l-cde-name').value.trim();
 if(!/\.json$/i.test(name))name+='.json';
 st.textContent='Сохраняю…';
 try{let r=await fetch('/api/loot/working-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'cooldown',name:name,doc:lootCdEd.doc})}).then(v=>v.json());
 if(!r||!r.ok)throw new Error((r&&r.error)||'Не удалось сохранить');
 let wn=(r.warnings||[]).join(' · ');
 st.textContent='Сохранено в WORKING: '+r.key+(wn?' · ВНИМАНИЕ: '+wn:' · групп: '+((lootCdEd.doc.CooldownGroups||[]).length));
 lootCdEd.key=r.key;lootRun(lootPubRefresh())}catch(e){st.textContent='Ошибка: '+e.message}};
$('#l-cde-json').onclick=()=>{if(!lootCdEd)return;
 let name=$('#l-cde-name').value.trim()||lootCdEd.key;
 if(!/\.json$/i.test(name))name+='.json';
 lootCdJsonOpen(name,lootCdEd.doc);
 $('#l-cde-dialog').close()};
$('#l-cdd-cancel').onclick=()=>$('#l-cdd-dialog').close();
$('#l-cdd-save').onclick=async()=>{if(!lootCdCur)return;let st=$('#l-cdd-status');let doc;
 try{doc=JSON.parse($('#l-cdd-doc').value)}catch(e){st.textContent='JSON не разобран: '+e.message;return}
 st.textContent='Сохраняю…';
 try{let r=await fetch('/api/loot/working-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'cooldown',name:lootCdCur,doc})}).then(v=>v.json());
 if(!r||!r.ok)throw new Error((r&&r.error)||'Не удалось сохранить');
 let wn=(r.warnings||[]).join(' · ');
 st.textContent='Сохранено в WORKING: '+r.key+(wn?' · ВНИМАНИЕ: '+wn:' · групп: '+((doc.CooldownGroups||[]).length));
 lootRun(lootPubRefresh())}catch(e){st.textContent='Ошибка: '+e.message}};

$('#l-n-back').onclick=()=>{$('#l-n-view').hidden=true;lootNCur=null};
$('#l-n-edit').onclick=async()=>{if(!lootNCur)return;
 try{let d=await lootApi('/api/loot/node?scope='+lootNCur.scope+'&name='+encodeURIComponent(lootNCur.name)+'&raw=1');
 lootNEd={name:lootNCur.name,scope:lootNCur.scope,key:lootNCur.key,doc:JSON.parse(JSON.stringify(d.doc||{}))};
 $('#l-ned-title').textContent=lootNCur.name+(lootEdited('nodes',lootNCur.key)?' · WORKING':'');
 $('#l-ned-name-file').value=lootNCur.key;
 $('#l-ned-status').textContent='';
 lootNEdRender();
 $('#l-ned-dialog').showModal()}catch(e){toast('Loot: '+e.message)}};
function lootNEdBtn(txt,title,fn){let b=document.createElement('button');b.type='button';b.className='btn-dark l-ned-btn';b.textContent=txt;b.title=title;b.onclick=fn;return b}
function lootNEdParent(path){let n=lootNEd.doc;for(let i=0;i<path.length-1;i++)n=n.Children[path[i]];return n}
function lootNEdRender(){
 let dl=$('#l-ned-items');
 if(!dl.dataset.loaded)lootRun(lootApi('/api/loot/item-ids').then(d=>{d.ids.forEach(id=>{let o=document.createElement('option');o.value=id;dl.append(o)});dl.dataset.loaded='1'}));
 let box=$('#l-ned-tree');box.innerHTML='';
 box.append(lootNEdNode(lootNEd.doc,[],true))}
function lootNEdNode(node,path,isRoot){
 let wrap=document.createElement('div');wrap.className='l-ned-node';
 wrap.append(lootNEdRow(node,path,isRoot));
 if(Array.isArray(node.Children)&&node.Children.length){
  let kids=document.createElement('div');kids.className='l-ned-kids';
  node.Children.forEach((ch,i)=>kids.append(lootNEdNode(ch,path.concat(i),false)));
  wrap.append(kids)}
 return wrap}
function lootNEdRow(node,path,isRoot){
 let r=document.createElement('div');r.className='l-ned-row';
 let name=document.createElement('input');name.className='l-ned-name';name.setAttribute('list','l-ned-items');name.spellcheck=false;
 name.placeholder=isRoot?'Имя дерева (ItemLootTreeNodes.…)':'Item ID или имя группы';
 name.value=node.Name||'';
 name.oninput=()=>{node.Name=name.value};
 r.append(name);
 let rar=document.createElement('select');rar.className='l-ned-rar';
 ['','Abundant','Common','Uncommon','Rare','VeryRare','ExtremelyRare'].forEach(v=>{let o=document.createElement('option');o.value=v;o.textContent=v||'Rarity: —';if((node.Rarity||'')===v)o.selected=true;rar.append(o)});
 rar.onchange=()=>{if(rar.value)node.Rarity=rar.value;else delete node.Rarity};
 r.append(rar);
 let mm=document.createElement('select');mm.className='l-ned-mm';
 ['','Replace','Append'].forEach(v=>{let o=document.createElement('option');o.value=v;o.textContent=v||'Merge: —';if((node.ChildrenMergeMode||'')===v)o.selected=true;mm.append(o)});
 mm.onchange=()=>{if(mm.value)node.ChildrenMergeMode=mm.value;else delete node.ChildrenMergeMode};
 r.append(mm);
 let act=document.createElement('div');act.className='l-ned-act';
 act.append(lootNEdBtn('+','Добавить ребёнка',()=>{if(!Array.isArray(node.Children))node.Children=[];node.Children.push({Name:''});lootNEdRender()}));
 let cp=lootNEdBtn('⧉','Копировать узел',()=>{if(isRoot)return;let p=lootNEdParent(path),i=path[path.length-1];p.Children.splice(i+1,0,JSON.parse(JSON.stringify(node)));lootNEdRender()});
 let del=lootNEdBtn('×','Удалить узел',()=>{if(isRoot)return;let p=lootNEdParent(path),i=path[path.length-1];p.Children.splice(i,1);lootNEdRender()});
 if(isRoot){cp.disabled=true;del.disabled=true}
 act.append(cp,del);r.append(act);
 return r}
$('#l-ned-cancel').onclick=()=>$('#l-ned-dialog').close();
$('#l-ned-save').onclick=async()=>{if(!lootNEd)return;let st=$('#l-ned-status');
 if(!String(lootNEd.doc.Name||'').trim()){st.textContent='Имя дерева (Name) обязательно';return}
 let name=$('#l-ned-name-file').value.trim();
 if(!/\.json$/i.test(name))name+='.json';
 st.textContent='Сохраняю…';
 try{let r=await fetch('/api/loot/working-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'node',name:name,doc:lootNEd.doc})}).then(v=>v.json());
 if(!r||!r.ok)throw new Error((r&&r.error)||'Не удалось сохранить');
 st.textContent='Сохранено в WORKING: '+r.key;
 lootNEd.key=r.key;lootNCur.key=r.key;$('#l-n-reset').hidden=false;lootRun(lootPubRefresh())}catch(e){st.textContent='Ошибка: '+e.message}};
$('#l-ned-json').onclick=()=>{if(!lootNEd)return;
 $('#l-nd-title').textContent=lootNEd.name+(lootEdited('nodes',lootNEd.key)?' · WORKING':'');
 $('#l-nd-name').value=$('#l-ned-name-file').value.trim()||lootNEd.key;
 $('#l-nd-merge').value=(lootNEd.doc.ChildrenMergeMode==='Replace'||lootNEd.doc.ChildrenMergeMode==='Append')?lootNEd.doc.ChildrenMergeMode:'';
 $('#l-nd-doc').value=JSON.stringify(lootNEd.doc,null,2);
 $('#l-nd-status').textContent='';
 $('#l-ned-dialog').close();
 $('#l-nd-dialog').showModal()};
$('#l-nd-cancel').onclick=()=>$('#l-nd-dialog').close();
$('#l-nd-save').onclick=async()=>{if(!lootNCur)return;let st=$('#l-nd-status');let doc;
 try{doc=JSON.parse($('#l-nd-doc').value)}catch(e){st.textContent='JSON не разобран: '+e.message;return}
 let mv=$('#l-nd-merge').value;
 if(mv)doc.ChildrenMergeMode=mv;else delete doc.ChildrenMergeMode;
 let name=$('#l-nd-name').value.trim();
 if(!/\.json$/i.test(name))name+='.json';
 st.textContent='Сохраняю…';
 try{let r=await fetch('/api/loot/working-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'node',name:name,doc})}).then(v=>v.json());
 if(!r||!r.ok)throw new Error((r&&r.error)||'Не удалось сохранить');
 st.textContent='Сохранено в WORKING: '+r.key;
 lootNCur.key=r.key;$('#l-n-reset').hidden=false;lootRun(lootPubRefresh())}catch(e){st.textContent='Ошибка: '+e.message}};
$('#l-n-reset').onclick=()=>{if(lootNCur)lootWorkReset('node',lootNCur.key,lootNodesLoad)};

$('#l-z-add').onclick=async()=>{let mod=await askText('Имя нового мода (папки)','Например: MyMod');mod=(mod||'').trim();if(!mod)return;lootZoneWindow(mod)};
async function lootZoneWindow(mod){
 try{let r=await fetch('/api/loot/zone-window',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mod:mod})}).then(v=>v.json());
 if(!r||!r.ok)throw new Error((r&&r.error)||'Не удалось открыть окно');
 toast('Редактор зон открыт в отдельном окне'+(r.mode==='browser'?' (браузер)':''))}
 catch(e){toast('Зоны: '+e.message)}}
function lootZdJsonOpen(mod,doc){
 lootZdMod=mod;
 $('#l-zd-title').textContent='Zones.json · '+mod+(lootEdited('zones',mod)?' · WORKING':'');
 $('#l-zd-doc').value=JSON.stringify(doc,null,2);
 $('#l-zd-status').textContent='';
 $('#l-zd-reset').hidden=!lootEdited('zones',mod);
 $('#l-zd-dialog').showModal()}
$('#l-zd-reset').onclick=()=>{if(lootZdMod)lootWorkReset('zone',lootZdMod,lootZonesLoad)};
$('#l-zd-cancel').onclick=()=>$('#l-zd-dialog').close();
$('#l-zd-save').onclick=async()=>{if(!lootZdMod)return;let st=$('#l-zd-status');let doc;
 try{doc=JSON.parse($('#l-zd-doc').value)}catch(e){st.textContent='JSON не разобран: '+e.message;return}
 st.textContent='Сохраняю…';
 try{let r=await fetch('/api/loot/working-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'zone',mod:lootZdMod,doc})}).then(v=>v.json());
 if(!r||!r.ok)throw new Error((r&&r.error)||'Не удалось сохранить');
 let wn=(r.warnings||[]).join(' · ');
 st.textContent='Сохранено в WORKING: '+r.key+(wn?' · ВНИМАНИЕ: '+wn:' · зон: '+((doc.Zones||[]).length));
 lootRun(lootPubRefresh())}catch(e){st.textContent='Ошибка: '+e.message}};

document.querySelectorAll('.l-tab').forEach(b=>b.onclick=()=>lootSecGo(b.dataset.lsec));
$('#l-refresh').onclick=()=>lootRun(async()=>{lootStatus=null;$('#l-sp-detail').hidden=true;lootSpCur=null;
let st=await lootApi('/api/loot/status?refresh=1');lootStatus=st;lootHeader(st);lootFillSelects();lootItemsFillCd();lootSecGo(lootSec);toast('База лута пересканирована')});
$('#l-root-apply').onclick=()=>lootRun(async()=>{let p=$('#l-root-input').value.trim();if(!p)return toast('Укажите путь к папке LootBP');
let r=await fetch('/api/loot/root',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:p})}).then(r=>r.json());
if(!r||!r.ok)throw new Error((r&&r.error)||'Не удалось применить путь');
lootStatus=null;$('#l-sp-detail').hidden=true;
let st=await lootApi('/api/loot/status?refresh=1');lootStatus=st;lootHeader(st);lootFillSelects();lootItemsFillCd();lootSecGo(lootSec);
toast('База лута подключена: '+st.root)});
$('#l-srv-download').onclick=async()=>{let c=ftpCredentials();if(!c.host)return toast('Заполните параметры FTP во вкладке «FTP / ФАЙЛЫ»');
if(!(await askConfirm('Загрузка базы лута','Скачать базу лута с сервера? Каталог ищется как '+(c.remotePath||'')+'\\LootBP (или сама папка профиля, если в ней есть Loot и CooldownGroups). Будет скачано до ~1400 файлов — это может занять несколько минут. Приложение переключится на копию data\\loot-server.')))return;
let btn=$('#l-srv-download');btn.disabled=true;$('#l-srv-status').textContent='Скачиваю базу лута с сервера…';
try{let d=await ftpRequest('/api/loot/snapshot',{});
$('#l-srv-status').textContent='Скачано: '+d.stats.files+' файлов ('+Math.round(d.stats.bytes/1024)+' КБ) · ошибок: '+d.stats.errors+(d.stats.truncated?' · ЛИМИТ ОБРЕЗАН':'')+' → '+d.root+(d.backup?' · старая копия: '+d.backup.split('\\').pop():'')+' · '+new Date().toLocaleTimeString();
toast('База лута скачана: '+d.stats.files+' файлов');
lootStatus=null;$('#l-sp-detail').hidden=true;
let st=await lootApi('/api/loot/status?refresh=1');lootStatus=st;lootHeader(st);lootFillSelects();lootItemsFillCd();lootSecGo(lootSec)}
catch(e){clLog('LOOT-DOWNLOAD-FAIL '+e.message);$('#l-srv-status').textContent='Ошибка загрузки · '+new Date().toLocaleTimeString();toast('База лута: '+e.message)}
finally{btn.disabled=false}};
$('#l-sp-scope').onchange=()=>{lootSp.scope=$('#l-sp-scope').value;lootSp.off=0;$('#l-sp-mod').hidden=lootSp.scope!=='override';lootRun(lootSpawnersLoad())};
$('#l-sp-mod').onchange=()=>{lootSp.mod=$('#l-sp-mod').value;lootSp.off=0;lootRun(lootSpawnersLoad())};
$('#l-sp-group').onchange=()=>{lootSp.group=$('#l-sp-group').value;lootSp.off=0;lootRun(lootSpawnersLoad())};
$('#l-sp-q').addEventListener('input',lootDeb(()=>{lootSp.q=$('#l-sp-q').value.trim();lootSp.off=0;lootRun(lootSpawnersLoad())}));
$('#l-sp-prev').onclick=()=>{lootSp.off=Math.max(0,lootSp.off-60);lootRun(lootSpawnersLoad())};
$('#l-sp-next').onclick=()=>{lootSp.off+=60;lootRun(lootSpawnersLoad())};
$('#l-sp-detail-close').onclick=()=>{$('#l-sp-detail').hidden=true;lootSpCur=null};
$('#l-sp-edit').onclick=()=>{if(!lootSpCur)return;
$('#l-edit-title').textContent=lootSpCur.id;$('#l-edit-target').textContent=lootSpCur.mod?('мод: '+lootSpCur.mod):'vanilla';
$('#l-edit-status').textContent='';$('#l-edit-doc').value=JSON.stringify(lootSpCur.doc,null,2);
$('#l-edit-dialog').showModal()};
$('#l-edit-cancel').onclick=()=>$('#l-edit-dialog').close();
$('#l-edit-save').onclick=async()=>{if(!lootSpCur)return;let st=$('#l-edit-status');let doc;
try{doc=JSON.parse($('#l-edit-doc').value)}catch(e){st.textContent='JSON не разобран: '+e.message;return}
st.textContent='Сохраняю…';
try{let r=await fetch('/api/loot/working-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:lootSpCur.id,mod:lootSpCur.mod,doc})}).then(v=>v.json());
if(!r||!r.ok)throw new Error((r&&r.error)||'Не удалось сохранить');
let wn=[],rs=r.resolved||{};
let nm=a=>a.slice(0,6).join(' · ')+(a.length>6?' … +'+(a.length-6):'');
if((rs.unknownNodes||[]).length)wn.push('дерева нет в базе ('+rs.unknownNodes.length+' из '+rs.nodeRefs+'): '+nm(rs.unknownNodes));
if((rs.unknownItems||[]).length)wn.push('Id вне Parameters ('+rs.unknownItems.length+' из '+rs.itemRefs+'): '+nm(rs.unknownItems));
if((rs.missingSubpresets||[]).length)wn.push('subpresets не найдены: '+nm(rs.missingSubpresets));
st.textContent='Сохранено в WORKING: '+r.key+(wn.length?' · ВНИМАНИЕ: '+wn.join(' · '):' · все ссылки резолвятся');
lootSpCur.working=true;lootSpCur.doc=doc;lootSpCur.key=(lootSpCur.mod?lootSpCur.mod+'/':'')+lootSpCur.id;$('#l-sp-reset').hidden=false;$('#l-sp-publish').hidden=false;
lootRun(lootSpawnerOpen(lootSpCur));lootRun(lootSpawnersLoad());lootRun(lootPubRefresh())}catch(e){st.textContent='Ошибка: '+e.message}};
$('#l-sp-reset').onclick=async()=>{if(!lootSpCur)return;
if(!(await askConfirm('Сброс правки','Вернуть '+lootSpCur.id+' к ванильному варианту из базы? WORKING-копия будет удалена.')))return;
try{let r=await fetch('/api/loot/working-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:(lootSpCur.mod?lootSpCur.mod+'/':'')+lootSpCur.id})}).then(v=>v.json());
if(!r||!r.ok)throw new Error((r&&r.error)||'Не удалось сбросить');
toast('Правка сброшена: '+lootSpCur.id);lootRun(lootSpawnerOpen(lootSpCur));lootRun(lootSpawnersLoad());lootRun(lootPubRefresh())}catch(e){toast('Loot: '+e.message)}};
$('#l-n-scope').onchange=()=>{$('#l-n-view').hidden=true;lootRun(lootNodesLoad())};
$('#l-n-q').addEventListener('input',lootDeb(()=>lootRun(lootNodesLoad())));
$('#l-it-q').addEventListener('input',lootDeb(()=>{lootIt.q=$('#l-it-q').value.trim();lootIt.off=0;lootRun(lootItemsLoad())}));
$('#l-it-loc').onchange=()=>{lootIt.loc=$('#l-it-loc').value;lootIt.off=0;lootRun(lootItemsLoad())};
$('#l-it-cd').onchange=()=>{lootIt.cd=$('#l-it-cd').value;lootIt.off=0;lootRun(lootItemsLoad())};
$('#l-it-prev').onclick=()=>{lootIt.off=Math.max(0,lootIt.off-100);lootRun(lootItemsLoad())};
$('#l-it-next').onclick=()=>{lootIt.off+=100;lootRun(lootItemsLoad())};
$('#l-itb-cdg').onchange=()=>{let set=$('#l-itb-cdg').value==='SET';$('#l-itb-cdg-name').hidden=!set;
 if(set){let dl=$('#l-itb-dl');if(!dl.dataset.loaded)lootRun(lootApi('/api/loot/cooldowns').then(d=>{d.groups.forEach(g=>{let o=document.createElement('option');o.value=g.Name;dl.append(o)});dl.dataset.loaded='1'}))}};
function lootItbNum(sel){let e=$(sel);if(!e)return null;let v=e.value.trim();if(v==='')return null;
 v=parseFloat(v.replace(',','.'));return (Number.isFinite(v)&&v>=0)?v:null}
function lootItbPatch(){
 let p={},d=[];
 let loc=$('#l-itb-loc').value;
 if(loc){p.AllowedLocations=loc==='ALL3'?['Coastal','Continental','Mountain']:[loc];d.push('AllowedLocations='+p.AllowedLocations.join('+'))}
 let cdg=$('#l-itb-cdg').value;
 if(cdg==='NONE'){p.CooldownGroup=null;d.push('убрать CooldownGroup')}
 else if(cdg==='SET'){let v=$('#l-itb-cdg-name').value.trim();if(!v)return{err:'Укажите имя группы для CooldownGroup'};p.CooldownGroup=v;d.push('CooldownGroup='+v)}
 let dis=$('#l-itb-dis').value;
 if(dis){p.IsDisabledForSpawning=dis==='on';d.push('IsDisabledForSpawning='+p.IsDisabledForSpawning)}
 let mn=lootItbNum('#l-itb-cdmin'),mx=lootItbNum('#l-itb-cdmax');
 if(mn!==null){p.CooldownPerSquadMemberMin=mn;d.push('CD Min='+mn)}
 if(mx!==null){p.CooldownPerSquadMemberMax=mx;d.push('CD Max='+mx)}
 let us=$('#l-itb-use').value;
 if(us){p.ShouldOverrideInitialAndRandomUsage=us==='on';let i=lootItbNum('#l-itb-use-i'),r=lootItbNum('#l-itb-use-r');if(i!==null)p.InitialUsageOverride=i;if(r!==null)p.RandomUsageOverride=r;d.push('Usage OVR='+(us==='on'?'вкл':'выкл'))}
 let stv=$('#l-itb-st').value;
 if(stv){p.ShouldOverrideInitialAndRandomStack=stv==='on';let i=lootItbNum('#l-itb-st-i'),r=lootItbNum('#l-itb-st-r');if(i!==null)p.InitialStackOverride=i;if(r!==null)p.RandomStackOverride=r;d.push('Stack OVR='+(stv==='on'?'вкл':'выкл'))}
 if(!Object.keys(p).length)return{err:'Все поля «— не менять» — нечего применять'};
 return{patch:p,desc:d.join(' · ')}}
$('#l-itb-apply').onclick=async()=>{
 let r=lootItbPatch();if(r.err)return toast('Bulk: '+r.err);
 let total=lootItTotal||0;
 if(!total)return toast('Bulk: под фильтр ничего не найдено');
 if(!(await askConfirm('Массовое изменение предметов',r.desc+' — применить ко всем предметам под текущим фильтром ('+total+' шт.)? У выбранных предметов перезаписываются только затронутые поля WORKING-правок. Публикация — кнопкой «ОТПРАВИТЬ ПРЕДМЕТЫ».')))return;
 let st=$('#l-itb-status');st.textContent='Применяю…';
 try{let r2=await fetch('/api/loot/working-bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({patch:r.patch,q:lootIt.q,location:lootIt.loc,cooldown:lootIt.cd})}).then(v=>v.json());
 if(!r2||!r2.ok)throw new Error((r2&&r2.error)||'Не удалось применить');
 let wn=(r2.warnings||[]).join(' · ');
 st.textContent='Массово изменено: '+r2.updated+' предмет(ов)'+(wn?' · ВНИМАНИЕ: '+wn:'');
 lootRun(lootItemsLoad());lootRun(lootPubRefresh())}catch(e){st.textContent='Ошибка: '+e.message}};
$('#l-val-run').onclick=lootValidateRun;
lootHelpRender();
window.addEventListener('storage',e=>{if(e.key==='loot-work-bump'&&lootStatus)lootRun(lootPubRefresh())});
window.addEventListener('focus',()=>{if(lootStatus)lootRun(lootPubRefresh())});
$('#cat-icons-fetch').onclick=async()=>{
 if(!(await askConfirm('Догрузка иконок','Скачать общую базу иконок (≈130 МБ) из последнего релиза на GitHub и извлечь отсутствующие? Файл кэшируется в data\\icons — повторный запуск работает из кэша мгновенно. Требуется интернет.')))return;
 let btn=$('#cat-icons-fetch'),st=$('#db-status'),old=st.textContent;
 try{let r=await fetch('/api/icons/auto-fetch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})}).then(v=>v.json());
 if(!r||!r.ok)throw new Error((r&&r.error)||'Не удалось запустить догрузку');
 if(r.started===false){st.textContent=old;toast('Все иконки уже на месте');return}
 btn.disabled=true;
 const mb=x=>Math.round(x/1048576)+' МБ';
 let timer=setInterval(async()=>{
  try{let s=await fetch('/api/icons/auto-fetch/status').then(v=>v.json());
  if(s.phase==='download'){let p=s.total?(Math.round(s.got/s.total*100)+' %'):'…';
   st.textContent='Догрузка иконок: скачивание '+p+' ('+mb(s.got)+(s.total?' из '+mb(s.total):'')+')';return}
  if(s.phase==='extract'){st.textContent='Догрузка иконок: извлечение '+Math.round(s.got/Math.max(1,s.total)*100)+' % · найдено новых: '+s.fetched;return}
  if(s.phase==='error'){clearInterval(timer);btn.disabled=false;st.textContent='Ошибка догрузки иконок: '+s.error;toast('Иконки: '+s.error);return}
  if(s.done){clearInterval(timer);btn.disabled=false;
   st.textContent='Иконки догружены: '+s.fetched+' из '+s.missing+' отсутствующих';
   iconBust=Date.now();renderCatalog();renderGoods();
   toast('Догружено иконок: '+s.fetched)}}catch(e){}},800);
 }
 catch(e){st.textContent='Ошибка догрузки иконок: '+e.message;toast('Иконки: '+e.message)}};

Q_NPCS.forEach(n=>{let o=document.createElement('option');o.value=n;$('#npc-list').append(o)});
qDoc=qTemplate();qRenderEditor();qRenderCheck();qRenderPreview();
qRefresh();
