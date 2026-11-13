'use strict';
const $=s=>document.querySelector(s);
const CXP=-142798.922,CYP=-142780.359,SX=0.0007086597262557765,SY=-0.0007086778791895953;
const g2p=(gx,gy)=>({x:1080-(540+(gx-CXP)*SX),y:540+(gy-CYP)*SY});
const p2g=(px,py)=>({x:(1080-px-540)/SX+CXP,y:(py-540)/SY+CYP});
const zParse=s=>{s=String(s||'');const mx=s.match(/X=([-+]?\d+\.?\d*)/i),my=s.match(/Y=([-+]?\d+\.?\d*)/i);
 return{x:mx?parseFloat(mx[1]):0,y:my?parseFloat(my[1]):0}};
const zFmt=(x,y)=>'X='+x.toFixed(3)+' Y='+y.toFixed(3);

let mod='',doc=null,working=false,sel=-1,drag=null,pan=null,jsonMode=false;
let img=null,view={x:0,y:0},zoom=1,fit=1;
const cv=$('#cv'),ctx=cv.getContext('2d');

async function api(path,opts){let r=await fetch(path,opts);let d=await r.json().catch(()=>({}));
 if(!r.ok||d.ok===false)throw new Error(d.error||('HTTP '+r.status));return d}

function resize(){
 const w=$('#cvwrap');
 cv.width=Math.max(320,w.clientWidth);cv.height=Math.max(320,w.clientHeight);
 const k=fit;fit=Math.min(cv.width,cv.height)/1080;
 zoom=zoom===k?fit:zoom;viewFit();
 draw()}
function viewFit(){
 if(!window._fitted){zoom=fit;view={x:0,y:0};window._fitted=true}
 const maxV=1080-Math.min(1080,cv.width/zoom,cv.height/zoom);
 view.x=Math.min(Math.max(view.x,0),Math.max(0,maxV));
 view.y=Math.min(Math.max(view.y,0),Math.max(0,maxV))}
function resetView(){zoom=fit;view={x:0,y:0};draw()}

function draw(){
 ctx.fillStyle='#0e1116';ctx.fillRect(0,0,cv.width,cv.height);
 if(img&&img.complete&&img.naturalWidth)
  ctx.drawImage(img,-view.x*zoom,-view.y*zoom,1080*zoom,1080*zoom);
 const zones=(doc&&doc.Zones)||[];
 zones.forEach((z,i)=>{
  const tl=zParse(z.TopLeft),br=zParse(z.BottomRight);
  const a=g2p(tl.x,tl.y),b=g2p(br.x,br.y);
  const x=(a.x-view.x)*zoom,y=(a.y-view.y)*zoom;
  const w=(b.x-a.x)*zoom,h=(b.y-a.y)*zoom;
  ctx.fillStyle=i===sel?'rgba(255,180,40,.30)':'rgba(90,150,255,.22)';
  ctx.fillRect(x,y,w,h);
  ctx.lineWidth=i===sel?2.5:1;
  ctx.strokeStyle=i===sel?'#ffb428':'#5a96ff';
  ctx.strokeRect(x,y,w,h);
  if(w>60&&h>18){ctx.fillStyle='rgba(11,12,16,.75)';ctx.fillRect(x+3,y+3,34,13);
   ctx.fillStyle=i===sel?'#ffb428':'#fff';ctx.font='bold 10px monospace';ctx.fillText(String(i+1),x+7,y+13)}});
 if(drag&&drag.b){
  const x=Math.min(drag.a.x,drag.b.x),y=Math.min(drag.a.y,drag.b.y);
  ctx.fillStyle='rgba(255,255,255,.18)';
  ctx.fillRect(x,y,Math.abs(drag.b.x-drag.a.x),Math.abs(drag.b.y-drag.a.y));
  ctx.strokeStyle='#fff';ctx.lineWidth=1.5;
  ctx.strokeRect(x,y,Math.abs(drag.b.x-drag.a.x),Math.abs(drag.b.y-drag.a.y))}
 $('#zoomhint').textContent='зум '+Math.round(zoom/fit*100)+' %'}

function toWorld(e){const r=cv.getBoundingClientRect();
 return{x:view.x+(e.clientX-r.left)/zoom,y:view.y+(e.clientY-r.top)/zoom}}
function toScreen(wx,wy){return{x:(wx-view.x)*zoom,y:(wy-view.y)*zoom}}

function render(){
 const w=$('#wbadge');
 w.textContent=working?'WORKING':'БАЗА';w.className='badge'+(working?'':' none');
 $('#b-reset').disabled=!working;
 const box=$('#zlist');box.innerHTML='';
 const zones=(doc&&doc.Zones)||[];
 if(!zones.length){box.innerHTML='<p class="empty">Зон нет — «ДОБАВИТЬ ЗОНУ» или включите РИСОВАТЬ и протяните по карте</p>'}
 zones.forEach((z,i)=>box.append(card(z,i)));
 if(jsonMode)$('#jsondoc').value=JSON.stringify(doc,null,2);
 draw()}

function card(z,i){
 const c=document.createElement('div');c.className='zcard'+(i===sel?' sel':'');
 c.onclick=()=>{sel=i;render()};
 const hr=document.createElement('div');hr.className='hr';
 const b=document.createElement('b');b.textContent='Зона '+(i+1);
 const del=document.createElement('button');del.textContent='×';del.title='Удалить зону';
 del.onclick=e=>{e.stopPropagation();doc.Zones.splice(i,1);if(sel>=doc.Zones.length)sel=doc.Zones.length-1;render()};
 hr.append(b,del);c.append(hr);
 [['TopLeft','TL'],['BottomRight','BR']].forEach(([k,lb])=>{
  const row=document.createElement('div');row.className='zrow';
  const sp=document.createElement('span');sp.className='zlb';sp.textContent=lb;row.append(sp);
  const p=zParse(z[k]);
  ['x','y'].forEach(ax=>{
   const inp=document.createElement('input');inp.type='number';inp.step='any';inp.value=p[ax];
   inp.oninput=()=>{const cur=zParse(z[k]),v=parseFloat(inp.value.replace(',','.'));
    if(Number.isFinite(v)){cur[ax]=v;z[k]=zFmt(cur.x,cur.y);draw()}};
   inp.onclick=e=>e.stopPropagation();
   row.append(inp)});
  c.append(row)});
 return c}

async function load(){
 mod=(new URLSearchParams(location.search).get('mod')||'').trim();
 $('#title').textContent='Зоны лута · '+(mod||'?');
 document.title='Зоны лута · '+mod;
 try{
  const[wk,zn]=await Promise.all([api('/api/loot/working'),api('/api/loot/zones')]);
  const w=(wk.zones||[]).find(x=>x.key===mod);
  const m=(zn.mods||[]).find(x=>x.mod===mod);
  const base=w&&w.doc&&Object.keys(w.doc).length?w.doc:(m&&m.zonesDoc?m.zonesDoc:{Zones:[]});
  doc=JSON.parse(JSON.stringify(base));
  if(!Array.isArray(doc.Zones))doc.Zones=[];
  working=!!(w&&w.doc&&Object.keys(w.doc).length);
  sel=doc.Zones.length?0:-1;
  img=new Image();img.onload=()=>draw();
  img.src=(typeof MAP_B64!=='undefined'&&MAP_B64)?'data:image/webp;base64,'+MAP_B64:'map.webp';
  render();
  $('#status').textContent='Мод: '+mod+' · зон: '+doc.Zones.length+(working?' · загружена WORKING-правка':' · из базы (нет правок)');
 }catch(e){$('#status').textContent='Ошибка загрузки: '+e.message}}

async function save(){
 const st=$('#status');st.textContent='Сохраняю…';
 try{
  const r=await api('/api/loot/working-save',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({type:'zone',mod:mod,doc:doc})});
  const wn=(r.warnings||[]).join(' · ');
  working=true;
  st.textContent='Сохранено в WORKING: '+r.key+(wn?' · ВНИМАНИЕ: '+wn:' · зон: '+doc.Zones.length)+' · '+new Date().toLocaleTimeString();
  try{localStorage.setItem('loot-work-bump',String(Date.now()))}catch(e){}
  render();
 }catch(e){st.textContent='Ошибка: '+e.message}}

async function reset(){
 if(!working)return;
 if(!confirm('Вернуть зоны мода «'+mod+'» к базе? WORKING-правка будет удалена.'))return;
 try{
  await api('/api/loot/working-reset',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({type:'zone',key:mod})});
  working=false;
  const zn=await api('/api/loot/zones');
  const m=(zn.mods||[]).find(x=>x.mod===mod);
  doc=JSON.parse(JSON.stringify(m&&m.zonesDoc?m.zonesDoc:{Zones:[]}));
  if(!Array.isArray(doc.Zones))doc.Zones=[];
  sel=doc.Zones.length?0:-1;
  $('#status').textContent='Правка сброшена · зон из базы: '+doc.Zones.length;
  try{localStorage.setItem('loot-work-bump',String(Date.now()))}catch(e){}
  render();
 }catch(e){$('#status').textContent='Ошибка: '+e.message}}

function setJson(on){
 jsonMode=on;
 $('#left').classList.toggle('hidden',on);
 $('#right').classList.toggle('hidden',on);
 $('#jsonwrap').classList.toggle('hidden',!on);
 $('#b-json').textContent=on?'КАРТА':'JSON';
 if(on)$('#jsondoc').value=JSON.stringify(doc,null,2);
 else{try{doc=JSON.parse($('#jsondoc').value);
   if(!Array.isArray(doc.Zones))doc.Zones=[]}catch(e){}}
 render()}

cv.addEventListener('wheel',e=>{
 e.preventDefault();
 const r=cv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
 const wx=view.x+mx/zoom,wy=view.y+my/zoom;
 zoom*=e.deltaY<0?1.2:1/1.2;
 zoom=Math.min(Math.max(zoom,fit*0.4),fit*60);
 view.x=wx-mx/zoom;view.y=wy-my/zoom;viewFit();draw()},{passive:false});
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('mousedown',e=>{
 const r=cv.getBoundingClientRect();
 if(e.button===2){pan={x:e.clientX,y:e.clientY};return}
 if(e.button!==0||!$('#draw').checked)return;
 e.preventDefault();
 const ox=e.clientX-r.left,oy=e.clientY-r.top;
 drag={a:{x:ox,y:oy},b:null}});
window.addEventListener('mousemove',e=>{
 if(pan){view.x-=(e.clientX-pan.x)/zoom;view.y-=(e.clientY-pan.y)/zoom;
  pan={x:e.clientX,y:e.clientY};viewFit();draw();return}
 if(!doc)return;
 const r=cv.getBoundingClientRect(),ox=e.clientX-r.left,oy=e.clientY-r.top;
 const inside=ox>=0&&oy>=0&&ox<=cv.width&&oy<=cv.height;
 if(inside){const w0=p2g(view.x+ox/zoom,view.y+oy/zoom);
  $('#hint').textContent='X='+w0.x.toFixed(0)+' Y='+w0.y.toFixed(0)}
 if(drag&&inside){drag.b={x:ox,y:oy};draw()}});
window.addEventListener('mouseup',()=>{
 if(pan){pan=null;return}
 if(!drag)return;
 const d=drag;drag=null;
 const ax=d.a.x/zoom,ay=d.a.y/zoom,bx=d.b?d.b.x/zoom:ax,by=d.b?d.b.y/zoom:ay;
 if(Math.abs(bx-ax)<2&&Math.abs(by-ay)<2){draw();return}
 const g1=p2g(Math.min(ax,bx)+view.x,Math.min(ay,by)+view.y);
 const g2=p2g(Math.max(ax,bx)+view.x,Math.max(ay,by)+view.y);
 doc.Zones.push({TopLeft:zFmt(g1.x,g1.y),BottomRight:zFmt(g2.x,g2.y)});
 sel=doc.Zones.length-1;render()});
window.addEventListener('resize',resize);
if(window.ResizeObserver)new ResizeObserver(()=>resize()).observe($('#cvwrap'));

$('#b-fit').onclick=resetView;
$('#b-add').onclick=()=>{const c=p2g(540,540);
 doc.Zones.push({TopLeft:zFmt(c.x-20000,c.y+20000),BottomRight:zFmt(c.x+20000,c.y-20000)});
 sel=doc.Zones.length-1;render()};
$('#b-json').onclick=()=>setJson(!jsonMode);
$('#b-save').onclick=save;
$('#b-reset').onclick=reset;
$('#b-close').onclick=async()=>{
 try{await api('/api/loot/zone-window-close',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({mod:mod})})}catch(e){}
 try{localStorage.setItem('loot-work-bump',String(Date.now()))}catch(e){}
 window.close()};
load();
resize();
