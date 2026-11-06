const $=s=>document.querySelector(s);
let doc=null,originalDoc=null,selected=null,custom=[],history=[],changes=0;
let db={categories:[]},dbIndex={},nameIndex={},customIndex={},addCatName='all';
let selectedSector=null,iconTargetId=null,iconBust=Date.now();
const CATS=['Оружие','Патроны','Материалы','Еда и напитки','Медицина','Одежда','Инструменты','Транспортные детали','Разное'];
const DEFS={'base-purchase-price':'-1','base-sell-price':'-1','delta-price':'-1','required-famepoints':'-1','available-after-sale-only':'default','can-be-purchased':'default'};
const FIELDS=['base-purchase-price','base-sell-price','delta-price','required-famepoints','available-after-sale-only','can-be-purchased'];
const MASS=[['#mass-buy','base-purchase-price'],['#mass-sell','base-sell-price'],['#mass-delta','delta-price'],['#mass-fame','required-famepoints'],['#mass-avail','available-after-sale-only'],['#mass-vis','can-be-purchased']];
const AVAIL_OPTS=[['default','По умолчанию'],['true','После продажи'],['false','Доступно всегда']];
const VIS_OPTS=[['default','Открыт'],['true','Открыт (true)'],['false','Скрыт']];
const STANDARD=['ОРУЖЕЙНИК','РЫБОЛОВ','МЕХАНИК','ГЛАВНЫЙ ТРЕЙДЕР','БАР','ГОСПИТАЛЬ','БАРБЕР','ОХОТНИК','MASTER HUNTER'];
const ROLES=['Armory','Barber','Saloon','BoatShop','Hospital','Mechanic','Trader','Hunter','Master_Hunter'];
const ROLE_RU={Armory:'ОРУЖЕЙНИК',BoatShop:'РЫБОЛОВ',Mechanic:'МЕХАНИК',Trader:'ГЛАВНЫЙ ТРЕЙДЕР',Saloon:'БАР',Hospital:'ГОСПИТАЛЬ',Barber:'БАРБЕР',Hunter:'ОХОТНИК',Master_Hunter:'MASTER HUNTER'};
const SECTOR_ORDER=['A_0','B_4','C_2','Z_3'];
const SECTOR_RE=/^([A-Za-z])_(\d+)_(.+)$/;
const RU_LABELS={'economy-reset-time-hours':'Сброс экономики (часы)','prices-randomization-time-hours':'Рандомизация цен (часы)','tradeable-rotation-time-ingame-hours-min':'Ротация: мин. игровые часы','tradeable-rotation-time-ingame-hours-max':'Ротация: макс. игровые часы','tradeable-rotation-time-of-day-min':'Ротация: мин. время суток','tradeable-rotation-time-of-day-max':'Ротация: макс. время суток','fully-restock-tradeable-hours':'Полное пополнение (часы)','trader-funds-change-rate-per-hour-multiplier':'Множитель изменения средств трейдера','prices-subject-to-delta':'Цены зависят от дельты','prices-subject-to-player-count':'Цены зависят от числа игроков','gold-price-subject-to-global-multiplier':'Цена золота от глобального множителя','gold-base-price':'Базовая цена золота','gold-sale-price-modifier':'Модификатор продажи золота','gold-price-change-percentage-step':'Шаг изменения цены золота (%)','gold-price-change-per-step':'Изменение цены золота за шаг','economy-logging':'Логирование экономики','traders-unlimited-funds':'Безлимитные средства трейдеров','traders-unlimited-stock':'Безлимитный склад трейдеров','global-only-after-player-sale-tradeable-availability-enabled':'Доступность после продажи игроком','tradeable-rotation-enabled':'Ротация ассортимента','enable-fame-point-requirement':'Требование очков славы'};

function parseTrader(key){let m=SECTOR_RE.exec(key||'');if(m)return{sector:m[1].toUpperCase()+'_'+m[2],role:m[3],label:ROLE_RU[m[3]]||m[3]};return{sector:'ПРОЧИЕ',role:'',label:key||'—'}}

function toast(s){let t=$('#toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function updateFlag(){let f=$('#changes-flag');if(changes>0){f.hidden=false;f.textContent='● Есть изменения · '+changes}else f.hidden=true}
function log(s){history.unshift({at:new Date().toLocaleTimeString(),text:s});changes++;$('#change-total').textContent=changes;updateFlag();renderHistory();renderPreview();renderDiff()}
function go(v){document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('#'+v).classList.add('active')}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>go(b.dataset.view));
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));

function askText(title,placeholder){return new Promise(res=>{let d=$('#ask-dialog');$('#ask-title').textContent=title;let inp=$('#ask-input');inp.placeholder=placeholder||'';inp.value='';let done=v=>{d.close();res(v)};$('#ask-form').onsubmit=e=>{e.preventDefault();done(inp.value)};$('#ask-cancel').onclick=()=>done(null);d.showModal();inp.focus()})}
function askConfirm(title,text){return new Promise(res=>{let d=$('#confirm-dialog');$('#confirm-title').textContent=title;$('#confirm-text').textContent=text||'';let done=v=>{d.close();res(v)};$('#confirm-form').onsubmit=e=>{e.preventDefault();done(true)};$('#confirm-cancel').onclick=()=>done(false);d.showModal()})}

function catNames(){let s=new Set(CATS);(db.categories||[]).forEach(c=>s.add(c.name));custom.forEach(x=>x.category&&s.add(x.category));return [...s]}
function populateCats(){let opts=catNames().map(c=>'<option>'+c+'</option>').join('');$('#category').innerHTML='<option value="all">Все категории</option>'+opts;$('#goods-cat').innerHTML='<option value="all">Все категории</option>'+opts;$('#item-category').innerHTML=opts}
function flatDb(){let out=[];(db.categories||[]).forEach(c=>(c.items||[]).forEach(i=>out.push({name:i.name||i.id,id:i.id,cat:c.name})));return out}
function rebuildCustomIndex(){customIndex={};custom.forEach(x=>{if(x.id)customIndex[x.id]=x})}
function rebuildNameIndex(){nameIndex={};(db.categories||[]).forEach(c=>(c.items||[]).forEach(i=>{nameIndex[i.id]=i.name||i.id}))}
function rowCategory(code){return dbIndex[code]||(customIndex[code]?customIndex[code].category||'Разное':'—')}
function rowName(code){return customIndex[code]?customIndex[code].name:''}

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
$('#st-unv').textContent=rows.filter(r=>!dbIndex[r['tradeable-code']]).length}

function fshort(f){if(f.includes('purchase'))return 'покупка';if(f.includes('sell'))return 'продажа';if(f.includes('delta'))return 'дельта';if(f.includes('fame'))return 'слава';if(f==='available-after-sale-only')return 'после продажи';if(f==='can-be-purchased')return 'видимость';return f}
function renderGoods(){let body=$('#goods');body.innerHTML='';let lgC=$('#lg-chg'),lgA=$('#lg-add');lgC.hidden=lgA.hidden=true;
if(!doc||!selected){renderHead();body.innerHTML='<tr><td colspan="10" class="empty">Импортируйте EconomyOverride.json — кнопка «← ИМПОРТ ФАЙЛА» сверху</td></tr>';return}
let rows=doc.traders[selected]||[];let orig=rowIndexOf(originalDoc&&originalDoc.traders?originalDoc.traders[selected]:null);
let addedN=0,chgN=0;rows.forEach(r=>{let code=String(r['tradeable-code']??'');let o=orig.get(code);if(!o)addedN++;else if(FIELDS.some(f=>String(o[f]??'')!==String(r[f]??'')))chgN++});
lgC.hidden=!chgN;if(!lgC.hidden)lgC.querySelector('b').textContent=chgN;
lgA.hidden=!addedN;if(!lgA.hidden)lgA.querySelector('b').textContent=addedN;
renderHead();let q=$('#goods-search').value.toLowerCase(),cat=$('#goods-cat').value;
let shown=rows.map((row,i)=>({row,i})).filter(({row})=>{let code=String(row['tradeable-code']??'');let c=rowCategory(code);return (code+' '+(nameIndex[code]||rowName(code))).toLowerCase().includes(q)&&(cat==='all'||c===cat)});
if(!rows.length){body.innerHTML='<tr><td colspan="10" class="empty">Нет товаров — нажмите «ДОБАВИТЬ» или «ДОБАВИТЬ ТОВАРЫ ПО КАТЕГОРИЯМ»</td></tr>';return}
if(!shown.length){body.innerHTML='<tr><td colspan="10" class="empty">Под фильтр ничего не попало</td></tr>';return}
shown.forEach(({row,i})=>{let code=String(row['tradeable-code']??'');let tr=document.createElement('tr');
let o=orig.get(code),diff=null;
if(!o){tr.className='row-added';tr.title='Строка добавлена (нет в оригинале)'}
else{diff=FIELDS.filter(f=>String(o[f]??'')!==String(row[f]??''));if(diff.length){tr.className='row-changed';tr.title='Изменено с оригинала: '+diff.map(fshort).join(', ')}}
let tdP=document.createElement('td');let wrap=document.createElement('span');wrap.className='cell-wrap';
let nm=nameIndex[code]||rowName(code);
let img=document.createElement('img');img.className='thumb';img.alt='';img.style.cursor='zoom-in';img.title='Иконка: '+code;img.src='/api/icon/'+encodeURIComponent(code)+'?t='+iconBust;img.onerror=()=>{let ph=document.createElement('span');ph.className='thumb-ph';ph.textContent=(nm||code).charAt(0).toUpperCase();ph.style.cursor='pointer';ph.title='Добавить иконку: '+code;ph.onclick=()=>openIconDialog(code);img.replaceWith(ph)};img.onclick=()=>openIconDialog(code);wrap.append(img);
let codeInp=document.createElement('input');codeInp.className='code';codeInp.value=code;codeInp.onchange=()=>{row['tradeable-code']=codeInp.value.trim();log('Обновлён tradeable-code у '+selected);renderGoods()};
let sub=document.createElement('span');sub.className='item-name';sub.textContent=nm||'нет в каталоге';
let inpCol=document.createElement('span');inpCol.style.display='flex';inpCol.style.flexDirection='column';inpCol.style.gap='2px';inpCol.append(codeInp,sub);
wrap.append(inpCol);tdP.append(wrap);tr.append(tdP);
let tdC=document.createElement('td');tdC.className='cat';tdC.textContent=rowCategory(code);tr.append(tdC);
[['base-purchase-price','num in-buy','базовая цена покупки'],['base-sell-price','num in-sell','базовая цена продажи'],['delta-price','num','множитель к базовой цене (итог = базовая × множитель)'],['required-famepoints','num','требуемые очки славы']].forEach(([f,cls,tip])=>{let td=document.createElement('td'),inp=document.createElement('input');inp.className=cls;inp.title=f+': '+tip;inp.value=row[f]??'';inp.onchange=()=>{row[f]=inp.value;log('Обновлено поле '+f+' у '+selected);renderGoods()};td.append(inp);tr.append(td)});
[[AVAIL_OPTS,'available-after-sale-only','sel-avail'],[VIS_OPTS,'can-be-purchased','sel-vis']].forEach(([opts,f,cls])=>{let td=document.createElement('td'),sel=document.createElement('select');sel.className='sel '+cls;sel.title='available-after-sale-only'===f?'available-after-sale-only: работает при включённом «Доступность после продажи игроком» (сейчас выключено)':'can-be-purchased: видимость товара — true: виден, false: скрыт (не продаётся торговцем)';opts.forEach(([v,l])=>{let o=document.createElement('option');o.value=v;o.textContent=l;sel.append(o)});let v=String(row[f]??'default');if(!opts.some(([ov])=>ov===v))v='default';sel.value=v;sel.onchange=()=>{row[f]=sel.value;log('Обновлено поле '+f+' ('+fshort(f)+': '+opts.find(([ov])=>ov===sel.value)[1]+') у '+selected);renderGoods()};td.append(sel);tr.append(td)});
let tdSt=document.createElement('td');let st=document.createElement('span');st.className='badge '+(dbIndex[code]?'base':'unv');st.textContent=dbIndex[code]?'БАЗА':'UNVERIFIED';tdSt.append(st);tr.append(tdSt);
let td=document.createElement('td');let del=document.createElement('button');del.className='del';del.textContent='×';del.onclick=()=>{rows.splice(i,1);log('Удалена строка '+code+' у '+selected);renderGoods();renderTraderList()};td.append(del);tr.append(td);body.append(tr)})}

let dlg=()=>$('#add-dialog');
$('#add-row').onclick=()=>{if(!doc)return toast('Сначала импортируйте EconomyOverride.json');if(!selected)return toast('Сначала выберите торговца');$('#add-target').textContent='→ '+selected;$('#add-status').textContent='';renderAddCats();renderAddResults();dlg().showModal()};
$('#add-close').onclick=()=>dlg().close();
function renderAddCats(){let box=$('#add-cats');box.innerHTML='';let cats=['all'].concat(catNames());cats.forEach(c=>{let b=document.createElement('button');b.type='button';b.className='cat-btn'+(addCatName===c?' active':'');b.textContent=c==='all'?'Все категории':c;b.onclick=()=>{addCatName=c;renderAddCats();renderAddResults()};box.append(b)})}
function renderAddResults(){let box=$('#add-results');box.innerHTML='';let q=$('#add-search').value.toLowerCase();let list=flatDb().filter(x=>(addCatName==='all'||x.cat===addCatName)&&(x.name+' '+x.id).toLowerCase().includes(q)).slice(0,60);if(!list.length){let p=document.createElement('p');p.className='empty';p.textContent='В базе ничего не найдено — добавьте ID вручную ниже';box.append(p);return}list.forEach(x=>{let r=document.createElement('div');r.className='res-row';let b=document.createElement('b');b.textContent=x.name;let id=document.createElement('span');id.className='id';id.textContent=x.id+' · '+x.cat;r.append(b,id);r.onclick=()=>addCode(x.id,true);box.append(r)})}
$('#add-search').oninput=renderAddResults;
function addCode(code,isBase){code=code.trim();if(!code)return;let rows=doc.traders[selected];if(rows.some(r=>r['tradeable-code']===code))return toast('Этот ID уже добавлен');rows.push({...DEFS,'tradeable-code':code});$('#add-status').textContent='Добавлено: '+code+(isBase?'':' · UNVERIFIED');log('Добавлен товар '+code+(isBase?'':' (Unverified)'));renderGoods();renderTraderList()}
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
$('#copy-apply').onclick=()=>{if(!doc||!selected)return;let targets=[...document.querySelectorAll('#copy-box input:checked')].map(i=>i.value);if(!targets.length)return toast('Отметьте торговцев');let src=doc.traders[selected]||[];let copied=0;targets.forEach(t=>{let have=new Set((doc.traders[t]||[]).map(r=>r['tradeable-code']));src.forEach(r=>{if(!have.has(r['tradeable-code'])){doc.traders[t].push(JSON.parse(JSON.stringify(r)));have.add(r['tradeable-code']);copied++}})});$('#copy-dialog').close();log('Скопировано строк: '+copied+' → '+targets.join(', '));renderGoods();renderTraderList()};

$('#add-by-cats').onclick=()=>{if(!doc)return toast('Сначала импортируйте файл');if(!selected)return toast('Выберите торговца');$('#cats-target').textContent='→ '+selected;let box=$('#cats-box');box.innerHTML='';catNames().forEach(c=>{let n=flatDb().filter(x=>x.cat===c).length+custom.filter(x=>(x.category||'Разное')===c).length;if(!n)return;let l=document.createElement('label');let cb=document.createElement('input');cb.type='checkbox';cb.value=c;l.append(cb,document.createTextNode(c));let sm=document.createElement('small');sm.textContent=n+' записей';l.append(sm);box.append(l)});$('#cats-status').textContent='';$('#cats-dialog').showModal()};
$('#cats-close').onclick=()=>$('#cats-dialog').close();
$('#cats-apply').onclick=()=>{if(!doc||!selected)return;let cats=[...document.querySelectorAll('#cats-box input:checked')].map(i=>i.value);if(!cats.length)return toast('Отметьте категории');let rows=doc.traders[selected],have=new Set(rows.map(r=>r['tradeable-code'])),added=0;cats.forEach(c=>{flatDb().filter(x=>x.cat===c).forEach(x=>{if(!have.has(x.id)){rows.push({...DEFS,'tradeable-code':x.id});have.add(x.id);added++}});custom.filter(x=>(x.category||'Разное')===c).forEach(x=>{if(!have.has(x.id)){rows.push({...DEFS,'tradeable-code':x.id});have.add(x.id);added++}})});$('#cats-dialog').close();log('Добавлено по категориям: '+added+' строк → '+selected);renderGoods();renderTraderList()};

function readMass(){let v={};MASS.forEach(([id,f])=>{let val=$(id).value.trim();if(val!=='')v[f]=val});return Object.keys(v).length?v:null}
function applyMass(names,vals){names.forEach(n=>(doc.traders[n]||[]).forEach(r=>Object.assign(r,vals)));log('Массовое применение: '+Object.keys(vals).join(', ')+' → '+(names.length===1?names[0]:names.length+' трейдеров'));renderGoods()}
$('#mass-apply-current').onclick=()=>{let v=readMass();if(!v)return toast('Введите хотя бы одно значение');if(!doc||!selected)return toast('Выберите торговца');applyMass([selected],v)};
$('#mass-apply-sector').onclick=()=>{let v=readMass();if(!v)return toast('Введите хотя бы одно значение');if(!doc)return toast('Сначала импортируйте файл');let names=traderSectors()[selectedSector]||[];if(!names.length)return toast('В секторе нет торговцев');applyMass(names,v)};
$('#mass-apply-all').onclick=()=>{let v=readMass();if(!v)return toast('Введите хотя бы одно значение');if(!doc)return toast('Сначала импортируйте файл');let all=Object.keys(doc.traders);if(!all.length)return toast('Нет торговцев');applyMass(all,v)};
$('#mass-reset-current').onclick=async()=>{if(!doc||!selected)return toast('Выберите торговца');if(!(await askConfirm('Сброс значений','Все поля «'+selected+'» получат -1 / default.')))return;applyMass([selected],{...DEFS})};

$('#goods-search').oninput=()=>renderGoods();
$('#goods-cat').onchange=()=>renderGoods();

function renderRules(){let box=$('#rule-fields');box.innerHTML='';if(!doc){box.textContent='Импортируйте конфигурацию экономики.';return}Object.keys(doc).filter(k=>k!=='traders').forEach(k=>{let v=doc[k],orig=String(v),boolish=orig==='true'||orig==='false'||orig==='0'||orig==='1';let wrap=document.createElement(boolish?'div':'label');wrap.className='rule-'+(boolish?'bool':'val');let cap=document.createElement('span');cap.textContent=RU_LABELS[k]||k;cap.title=k;if(RU_LABELS[k]){let small=document.createElement('small');small.className='rule-key';small.textContent=k;cap.append(document.createElement('br'),small)}if(boolish){wrap.append(cap);let pair=document.createElement('div');pair.className='toggle-pair';pair.dataset.key=k;let on=document.createElement('button'),off=document.createElement('button');on.type=off.type='button';on.textContent='ВКЛЮЧЕНО';off.textContent='ВЫКЛЮЧЕНО';let truthy=orig==='true'||orig==='1';let paint=()=>{on.className='tg'+(pair.dataset.v==='1'?' on-true':'');off.className='tg'+(pair.dataset.v==='0'?' on-false':'')};pair.dataset.v=truthy?'1':'0';on.onclick=()=>{pair.dataset.v='1';paint()};off.onclick=()=>{pair.dataset.v='0';paint()};paint();pair.append(on,off);wrap.append(pair)}else{let input=document.createElement('input');input.value=v??'';input.dataset.key=k;wrap.append(input)}box.append(wrap)})}
$('#save-rules').onclick=()=>{if(!doc)return;document.querySelectorAll('#rule-fields .rule-val input').forEach(i=>doc[i.dataset.key]=i.value);document.querySelectorAll('#rule-fields .rule-bool .toggle-pair').forEach(p=>{let cur=String(doc[p.dataset.key]);doc[p.dataset.key]=p.dataset.v==='1'?(cur==='true'||cur==='false'?'true':'1'):(cur==='true'||cur==='false'?'false':'0')});log('Обновлены глобальные параметры');toast('Параметры обновлены в документе')};

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

function renderPreview(){$('#json-preview').value=doc?JSON.stringify(doc,null,2):''}

function rowIndexOf(rows){let m=new Map();(rows||[]).forEach(r=>{if(r&&r['tradeable-code']!=null)m.set(String(r['tradeable-code']),r)});return m}
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

async function applyDoc(parsed,label,note){let check=await fetch('/api/economy/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(parsed)}).then(r=>r.json()).catch(()=>null);if(check&&!check.ok)return toast(check.issues[0]);
doc=JSON.parse(JSON.stringify(parsed));normalizeRows(doc);originalDoc=JSON.parse(JSON.stringify(doc));selected=Object.keys(doc.traders||{})[0]||null;selectedSector=null;changes=0;updateFlag();renderAll();
let warn=(check&&Array.isArray(check.warnings)&&check.warnings.length)?' · предупреждение: '+check.warnings[0]+(check.warnings.length>1?' (+'+(check.warnings.length-1)+')':''):'';
log(label+(note?' ('+note+')':'')+warn);toast(label+(note?' · '+note:'')+warn)}

$('#export-download').onclick=()=>{if(!doc)return toast('Сначала импортируйте JSON');let blob=new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='EconomyOverride.json';a.click();URL.revokeObjectURL(url);originalDoc=JSON.parse(JSON.stringify(doc));changes=0;updateFlag();log('Экспортирован EconomyOverride.json — дифф сброшен');toast('Файл сохранён, дифф сброшен')};
$('#export-apply').onclick=()=>{let txt=$('#json-import').value.trim();if(!txt)return toast('Вставьте технический JSON');let parsed;try{parsed=JSON.parse(txt)}catch(e){return toast('Ошибка JSON: '+e.message)}let norm=normalizeImport(parsed);if(!norm.doc)return toast(norm.note);applyDoc(norm.doc,'Применён технический JSON',norm.note)};

function normalizeImport(parsed){if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){if(parsed.traders&&typeof parsed.traders==='object')return{doc:parsed,note:null};
for(const w of ['economy-override','economy','EconomyOverride','data']){let inner=parsed[w];if(inner&&typeof inner==='object'&&!Array.isArray(inner)&&inner.traders)return{doc:inner,note:'снята обёртка «'+w+'»'}}
let keys=Object.keys(parsed);let arrs=keys.filter(k=>Array.isArray(parsed[k]));
if(arrs.length&&arrs.length===keys.length){let traders={};let ok=true;arrs.forEach(k=>{let arr=parsed[k];if(!arr.length)return;let sample=arr.find(x=>x&&typeof x==='object');if(!sample&&typeof arr[0]!=='string')return ok=false;traders[k]=arr.map(it=>{if(typeof it==='string'||typeof it==='number')return{...DEFS,'tradeable-code':String(it)};let code=['tradeable-code','TradeableCode','tradeableCode','code','id','ID','class','ClassName','className'].map(f=>it[f]).find(v=>typeof v==='string'&&v.trim()||typeof v==='number');if(code===undefined)return null;let row={...DEFS,'tradeable-code':String(code).trim()};Object.entries(it).forEach(([fk,fv])=>{if(fk!=='tradeable-code'&&typeof fv!=='object')row[fk]=String(fv)});return row}).filter(Boolean)});if(ok&&Object.keys(traders).length)return{doc:{traders},note:'формат нормализован — проверьте ID'}}
if(Array.isArray(parsed)){let traders={};let ok=true;parsed.forEach(t=>{if(!t||typeof t!=='object')return ok=false;let name=t.name??t.Name??t.trader??t.traderName??t.className??t.ClassName;let items=t.items??t.Items??t.goods??t.stock;if(typeof name!=='string'||!Array.isArray(items))return ok=false;traders[name]=items.map(it=>{if(typeof it==='string'||typeof it==='number')return{...DEFS,'tradeable-code':String(it)};if(it&&typeof it==='object'){let code=['tradeable-code','TradeableCode','tradeableCode','code','id','ID','class','ClassName','className'].map(f=>it[f]).find(v=>typeof v==='string'&&v.trim()||typeof v==='number');if(code===undefined)return null;let row={...DEFS,'tradeable-code':String(code).trim()};Object.entries(it).forEach(([fk,fv])=>{if(fk!=='tradeable-code'&&typeof fv!=='object')row[fk]=String(fv)});return row}return null}).filter(Boolean)});if(ok&&Object.keys(traders).length)return{doc:{traders},note:'список торговцев нормализован — проверьте ID'}}}
return{doc:null,note:'формат не распознан: ожидается {"traders":{...}}'}}

$('#import').onclick=()=>$('#file').click();
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
if(c.ftp){$('#ftp-host').value=c.ftp.host||'';$('#ftp-port').value=c.ftp.port||21;$('#ftp-user').value=c.ftp.username||'';$('#ftp-pass').value=c.ftp.password||'';$('#ftp-path').value=c.ftp.remotePath||'/SCUM/Saved/Config/WindowsServer/';$('#ftp-save').checked=true}
if(c.rcon){$('#rcon-host').value=c.rcon.host||'';$('#rcon-port').value=c.rcon.port||'';$('#rcon-pass').value=c.rcon.password||'';$('#rcon-save').checked=true}}catch(e){}}
function syncFtpSave(){if($('#ftp-save').checked)saveConnection('ftp',ftpCredentials());else deleteConnection('ftp')}
$('#rcon-save-btn').onclick=()=>{if($('#rcon-save').checked){saveConnection('rcon',{host:$('#rcon-host').value.trim(),port:Number($('#rcon-port').value||0),password:$('#rcon-pass').value});toast('Данные RCON сохранены локально')}else{deleteConnection('rcon');toast('Сохранённые данные RCON удалены')}};

function srvStatus(s){$('#srv-status').textContent=s+' · '+new Date().toLocaleTimeString()}
async function pushDocToServer(c){let payload=JSON.stringify(doc,null,2),bytes=Array.from(new TextEncoder().encode(payload),x=>String.fromCharCode(x)).join(''),content=btoa(bytes);let d=await ftpRequest('/api/ftp/upload',{fileName:'EconomyOverride.json',content,confirm:true});log('Документ выгружен на сервер; backup='+d.backupCreated);return d}
$('#srv-download').onclick=async()=>{let c=ftpCredentials();if(!c.host)return toast('Заполните FTP-профиль во вкладке «FTP / ФАЙЛЫ»');let btn=$('#srv-download');btn.disabled=true;srvStatus('Скачиваю EconomyOverride.json…');
try{let d=await ftpRequest('/api/ftp/download',{fileName:'EconomyOverride.json',remotePath:c.remotePath||'/'});
try{await fetch('/api/snapshots/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:'EconomyOverride.json',content:d.content})})}catch(e){}
let bytes=Uint8Array.from(atob(d.content),ch=>ch.charCodeAt(0));let parsed=JSON.parse(new TextDecoder().decode(bytes));let norm=normalizeImport(parsed);if(!norm.doc)throw new Error('формат файла не распознан: '+(norm.note||''));
srvStatus('Скачано с '+c.host+' · снапшот в data\\server-files');await applyDoc(norm.doc,'Загружено с сервера','снапшот в data\\server-files')}
catch(e){srvStatus('Ошибка скачивания');toast('Сервер: '+e.message)}
finally{btn.disabled=false}};
$('#srv-upload').onclick=async()=>{if(!doc)return toast('Сначала импортируйте документ');let c=ftpCredentials();if(!c.host)return toast('Заполните FTP-профиль во вкладке «FTP / ФАЙЛЫ»');if(!(await askConfirm('Выгрузка на сервер','Отправить текущий документ как EconomyOverride.json в '+(c.remotePath||'/')+'? Существующий файл будет скопирован в .backup-метку.')))return;let btn=$('#srv-upload');btn.disabled=true;
try{let d=await pushDocToServer(c);srvStatus('Документ выгружен на сервер (backup='+(d.backupCreated?'создан':'нет')+')');toast(d.backupCreated?'Документ выгружен, резервная копия создана':'Документ выгружен (новый файл)');ftpGo(c.remotePath||'/').catch(()=>{})}
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
box.append(row)});
if(!(d.files||[]).length&&!d.note){box.innerHTML='<p class="empty">Папка пуста</p>'}}
$('#ftp-list').onclick=()=>ftpGo($('#ftp-path').value.trim()||'/');
$('#ftp-icon-scan').onclick=async()=>{if(!ftpCredentials().host)return toast('Заполните параметры FTP');let ids=[...flatDb().map(x=>x.id),...custom.map(x=>x.id)].slice(0,400);if(!ids.length)return toast('Каталог пуст');toast('Сканирую сервер, это может занять до минуты…');try{let d=await fetch('/api/icons/scan_ftp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...ftpCredentials(),ids})}).then(r=>r.json());if(!d.ok)return toast(d.error||'Ошибка поиска');let n=Object.keys(d.found||{}).length;toast('Найдено миниатюр: '+n+' · скачано: '+(d.downloaded||0)+' · папок обойдено: '+(d.stats&&d.stats.dirs||0));if(d.downloaded){iconBust=Date.now();renderGoods();renderCatalog()}}catch(e){toast('Поиск миниатюр: '+e.message)}};
$('#ftp-push-doc').onclick=async()=>{if(!doc)return toast('Сначала импортируйте документ');let c=ftpCredentials();if(!c.host)return toast('Заполните параметры FTP');if(!(await askConfirm('Выгрузка на сервер','Отправить текущий документ как EconomyOverride.json в '+(c.remotePath||'/')+'? Существующий файл будет скопирован в .backup-метку.')))return;try{let d=await pushDocToServer(c);toast(d.backupCreated?'Документ выгружен, резервная копия создана':'Документ выгружен (новый файл)');ftpGo(c.remotePath||'/')}catch(e){toast('Выгрузка: '+e.message)}};
$('#ftp-upload').onclick=async()=>{let f=$('#ftp-upload-file').files[0];if(!f)return toast('Выберите файл для загрузки');if(f.size>5*1024*1024)return toast('Максимальный размер — 5 МБ');if(!(await askConfirm('Загрузка на сервер','Загрузить '+f.name+' в '+(ftpCredentials().remotePath||'/')+'? Если файл уже существует — сначала будет создана резервная копия; новый файл загружается без копии.')))return;try{let bytes=new Uint8Array(await f.arrayBuffer()),binary=Array.from(bytes,x=>String.fromCharCode(x)).join(''),content=btoa(binary);let d=await ftpRequest('/api/ftp/upload',{fileName:f.name,content,confirm:true});log('Загружен '+f.name+'; backup='+d.backupCreated);toast(d.backupCreated?'Загрузка завершена, резервная копия создана':'Загрузка завершена (новый файл)');ftpGo($('#ftp-path').value.trim()||'/')}catch(e){toast('Загрузка: '+e.message)}};
let ftpWatchTimer=null,ftpSnapshot=null;
async function ftpPoll(silent=true){let d=await ftpRequest('/api/ftp/list');let snap=JSON.stringify(d.files.map(x=>({name:x.name,type:x.type,size:x.size,modified:x.modified})).sort((a,b)=>a.name.localeCompare(b.name)));if(ftpSnapshot!==null&&snap!==ftpSnapshot){log('Обнаружено изменение списка удалённых файлов');$('#ftp-watch-status').textContent='Обнаружены изменения · '+new Date().toLocaleTimeString();if(!silent)toast('Список файлов изменился')}else if(ftpSnapshot===null){$('#ftp-watch-status').textContent='Наблюдение активно · '+new Date().toLocaleTimeString()}ftpSnapshot=snap}
$('#ftp-watch').onclick=async()=>{if(ftpWatchTimer){clearInterval(ftpWatchTimer);ftpWatchTimer=null;ftpSnapshot=null;$('#ftp-watch').textContent='Начать мониторинг · 30 сек';$('#ftp-watch-status').textContent='Мониторинг выключен';return}try{await ftpPoll();ftpWatchTimer=setInterval(()=>ftpPoll().catch(e=>{$('#ftp-watch-status').textContent='Ошибка мониторинга: '+e.message}),30000);$('#ftp-watch').textContent='Остановить мониторинг';toast('Мониторинг списка файлов включён')}catch(e){toast('Мониторинг: '+e.message)}};

fetch('/api/health').then(r=>r.json()).catch(()=>toast('Запустите start.bat'));
fetch('/items-db.json').then(r=>{if(!r.ok)throw 0;return r.json()}).then(d=>{db=d;if(!db.categories)db.categories=[];db.categories.forEach(c=>(c.items||[]).forEach(i=>{dbIndex[i.id]=c.name}));rebuildNameIndex();populateCats();renderCatalog();renderStats();renderGoods()}).catch(()=>{$('#db-status').textContent='items-db.json не найден — доступен ручной ввод ID'});
populateCats();renderCatalog();presetsRefresh();loadConnections();
loadCustom().then(()=>{populateCats();renderCatalog();renderStats()});
window.addEventListener('beforeunload',()=>{$('#ftp-pass').value='';if(ftpWatchTimer)clearInterval(ftpWatchTimer)});
