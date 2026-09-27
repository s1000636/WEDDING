import * as core from "./core.js?v=4";
import { DEFAULT_META } from "./seed.js?v=4";

const $ = s=>document.querySelector(s);
const esc = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WD='日一二三四五六';
const VSTAT=['未詢價','詢價中','已報價','已簽約'];
const SIDES=['男方','女方','共同'];
const RSVP=['未回覆','出席','不出席'];
const DIETS=['葷食','素食','蛋奶素','其他'];
const PAYCAT=['場地與餐飲','婚顧','婚攝婚錄','新秘造型','婚紗禮服','佈置花藝','喜帖喜餅','婚戒','其他'];
const PALETTES=[['blue','灰藍香檳','#4F6D8A'],['rose','乾燥玫瑰','#A35D6A'],['sage','鼠尾草綠','#5E7461'],['navy','午夜藍金','#2E3A59'],['red','經典喜紅','#B3242F']];
const LISTS={vendors:'廠商',family:'雙方分工',pitfalls:'踩雷提醒'};
const INTRO={
  vendors:'數字是建議詢價順序，越前面越早滿檔。點狀態可切換。',
  family:'以下是常見分法，可直接修改。',
  pitfalls:'最常見、事後最難補救的三件事。確認過就打勾。',
  seating:'上傳桌次圖，並在下方逐桌記錄。賓客頁指定桌號後，這裡會自動列出。'
};
const PHASES=[
  {n:'決定結婚',d:'兩家取得共識：擇日、預算、禮俗與場地'},
  {n:'籌備',d:'廠商、賓客、桌次，一步步到位'},
  {n:'婚禮當天',d:'流程、聯絡、收禮一手掌握'},
  {n:'婚後收尾',d:'對帳、回禮、交件與各項手續'}
];
const COLL_NAME={items:'待辦',tables:'桌次',charts:'桌次圖',guests:'賓客',payments:'付款',meta:'婚禮資訊'};
const SOON={invite:'喜帖與喜餅',flow:'婚禮流程',docs:'文件',dayof:'婚禮當天',gifts:'禮金與回禮',after:'婚後收尾',ai:'AI 婚禮助理',rsvp:'RSVP 回覆連結'};

// ---------- 狀態 ----------
const ls=core.ls;
let view = ls.get('wp-view3') || 'home';
let hideDone = ls.get('wp-hide')==='1';
let gFilter = '', gQuery = '';
let meta = {...DEFAULT_META};
const data = { items:new Map(), tables:new Map(), charts:new Map(), guests:new Map(), payments:new Map() };
let logs = [], loaded = false, conn = 'connecting';
const flash = new Set();
let editing = null;

// ---------- 小工具 ----------
function parseDate(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return m?new Date(+m[1],+m[2]-1,+m[3]):null}
function today(){const t=new Date();t.setHours(0,0,0,0);return t}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function ym(d){return ymd(d).slice(0,7)}
function md(s){const d=parseDate(s);return d?(d.getMonth()+1)+'/'+d.getDate():''}
function daysLeft(){const d=parseDate(meta.date);return d?Math.round((d-today())/864e5):null}
function rel(t){if(!t)return'';const s=(Date.now()-t)/1000;if(s<60)return'剛剛';if(s<3600)return Math.floor(s/60)+' 分鐘前';if(s<86400)return Math.floor(s/3600)+' 小時前';const d=new Date(t);return (d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
const money=n=>'$'+Math.round(+n||0).toLocaleString('en-US');
const moneyShort=n=>{n=Math.round(+n||0);return n>=10000?(Math.round(n/1000)/10)+' 萬':'$'+n.toLocaleString('en-US')};
let toastT;
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2600)}
core.onError.fn = e=>toast(e&&e.code==='permission-denied'?'沒有權限：請確認 Firestore 規則已更新':'儲存失敗，請檢查網路');

const alive = m=>[...m.values()].filter(x=>!x.deleted);
const list = sec=>alive(data.items).filter(i=>i.section===sec);
const isDone = i=>i.section==='vendors'?i.status==='已簽約':!!i.done;
function groups(sec){
  const m=new Map();
  for(const i of list(sec)){const k=String(i.gk||'0');if(!m.has(k))m.set(k,{gk:k,g:i.g||'',sec,items:[]});m.get(k).items.push(i)}
  const out=[...m.values()].sort((a,b)=>a.gk<b.gk?-1:a.gk>b.gk?1:0);
  out.forEach(g=>g.items.sort((a,b)=>(a.o||0)-(b.o||0)||(a.id<b.id?-1:1)));
  return out;
}
function monthSub(gk){
  const w=parseDate(meta.date), m=/^(\d{4})-(\d{2})$/.exec(gk); if(!w||!m) return '';
  const diff=(w.getFullYear()*12+w.getMonth())-(+m[1]*12+(+m[2]-1));
  return diff>0?'婚前 '+diff+' 個月':diff===0?'婚禮當月':'';
}
const sortedTables=()=>alive(data.tables).sort((a,b)=>(+a.no||0)-(+b.no||0)||(a.id<b.id?-1:1));
const guests=()=>alive(data.guests);
const hc=g=>Math.max(1,+g.headcount||1);
function guestStats(){
  const gs=guests(), s={total:0,yes:0,no:0,wait:0,veg:0,lodge:0,shuttle:0,child:0,m:0,f:0,unseated:0};
  for(const g of gs){const n=hc(g);s.total+=n;if(g.rsvp==='出席')s.yes+=n;else if(g.rsvp==='不出席')s.no+=n;else s.wait+=n;
    if(g.rsvp==='不出席')continue;
    if(g.diet&&g.diet!=='葷食')s.veg+=n;if(g.lodging)s.lodge+=n;if(g.shuttle)s.shuttle+=n;s.child+=+g.child||0;
    if(g.side==='男方')s.m+=n;else if(g.side==='女方')s.f+=n;if(!g.table)s.unseated+=n}
  return s;
}
function seatStats(){const s={total:0,m:0,f:0,j:0};for(const t of alive(data.tables)){const c=tableCount(t);s.total+=c;if(t.side==='男方')s.m+=c;else if(t.side==='女方')s.f+=c;else s.j+=c}return s}
function tableGuests(t){return guests().filter(g=>String(g.table)===String(t.no)&&g.rsvp!=='不出席')}
function tableCount(t){const tg=tableGuests(t);return tg.length?tg.reduce((a,g)=>a+hc(g),0):(+t.count||0)}
function payStats(){
  const ps=alive(data.payments), s={paid:0,unpaid:0,soon:0,soonN:0,late:0};
  const lim=ymd(new Date(Date.now()+30*864e5)), now=ymd(today());
  for(const p of ps){const a=+p.amount||0;if(p.paid)s.paid+=a;else{s.unpaid+=a;if(p.due&&p.due<=lim){s.soon+=a;s.soonN++}if(p.due&&p.due<now)s.late++}}
  return s;
}
function phaseIndex(){
  const d=parseDate(meta.date); if(!d) return 0;
  const n=daysLeft(); if(n<0) return 3; if(n===0) return 2;
  const t=today(), months=(d.getFullYear()*12+d.getMonth())-(t.getFullYear()*12+t.getMonth());
  return months>8?0:1;
}
function trashItems(){
  const out=[];
  for(const [c,m] of Object.entries(data)) for(const x of m.values()) if(x.deleted) out.push({c,x});
  return out.sort((a,b)=>(b.x.deletedAt||0)-(a.x.deletedAt||0));
}
const labelOf=(c,x)=>!x?'':c==='items'?x.text:c==='tables'?'第 '+x.no+' 桌'+(x.area?'（'+x.area+'）':''):c==='charts'?(x.name||'桌次圖'):c==='guests'?x.name:c==='payments'?x.title+' '+money(x.amount):'';

// ---------- 標題列 ----------
function applyPalette(){
  const p=PALETTES.find(p=>p[0]===meta.palette)||PALETTES[0];
  document.documentElement.dataset.palette=p[0];
  document.querySelector('meta[name=theme-color]').content=p[2];
}
function headHome(){
  const d=parseDate(meta.date), n=daysLeft();
  const count=d?(n>0?'還有<b>'+n+'</b>天':n===0?'就是今天':'婚後第 '+(-n)+' 天'):'尚未設定婚期';
  return '<header class="hero"><div class="xi" aria-hidden="true">囍</div><div class="hero-top"><h1>'+esc(meta.title||'我們的婚禮')+'</h1>'+
    '<button type="button" class="pill" data-act="identity">'+esc(core.me()||'選擇身分')+'</button></div>'+
    '<p class="count">'+count+'</p><p class="facts">'+(d?d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日（'+WD[d.getDay()]+'）':'')+
    '<br>'+esc(meta.venue||'')+(meta.guests?'，約 '+meta.guests+' 位賓客':'')+'</p></header>';
}
function headBar(title,{back,pct,label}={}){
  const n=daysLeft();
  return '<header class="bar"><div class="bar-top">'+(back?'<button type="button" class="back" data-go="'+back+'" aria-label="返回">‹</button>':'')+
    '<h1>'+esc(title)+'</h1><span class="days">'+(n>0?'倒數 '+n+' 天':'')+'</span></div>'+
    (label!=null?'<div class="prog-track"><div class="prog-bar" style="width:'+(pct||0)+'%"></div></div><div class="prog-label">'+esc(label)+'</div>':'')+'</header>';
}
function toolbar(withHide){
  const txt=conn==='live'?'即時同步中':conn==='connecting'?'連線中':'離線中，恢復後自動同步';
  return '<div class="toolbar"><div class="sync'+(conn==='live'?' live':'')+'"><span class="dot"></span>'+txt+'</div>'+
    (withHide?'<button type="button" class="toggle" data-act="hide" aria-pressed="'+hideDone+'"><span class="sw"></span>隱藏已完成</button>':'')+'</div>';
}

// ---------- 待辦項目 ----------
function row(i,idx,prefix){
  const d=isDone(i);
  const lead=i.section==='vendors'?'<span class="num">'+idx+'</span>'
    :'<button type="button" class="chk" data-toggle="'+esc(i.id)+'" aria-pressed="'+d+'" aria-label="'+(d?'標為未完成':'標為完成')+'"><svg viewBox="0 0 20 20"><path d="M5 10.5l3.2 3.2L15 7"/></svg></button>';
  let v='';
  if(i.section==='vendors'){
    const s=Math.max(0,VSTAT.indexOf(i.status));
    v='<div class="vmeta"><button type="button" class="chip s'+s+'" data-cycle="'+esc(i.id)+'">'+VSTAT[s]+'</button>'+
      (i.quote?'<span>報價 '+esc(i.quote)+'</span>':'')+(i.contact?'<span>'+esc(i.contact)+'</span>':'')+'</div>';
  }
  return '<li class="item'+(d?' done':'')+(flash.has(i.id)?' flash':'')+'">'+lead+
    '<div><button type="button" class="body" data-edit="'+esc(i.id)+'">'+(prefix||'')+'<span class="t">'+esc(i.text)+(i.owner?'<span class="otag">'+esc(i.owner)+'</span>':'')+'</span>'+
    (i.note?'<span class="n">'+esc(i.note)+'</span>':'')+'</button>'+v+'</div></li>';
}
function groupBlock(g,opts={}){
  const gd=g.items.filter(isDone).length, nowYM=ym(today());
  let h='<section class="grp"><div class="grp-h"><h2>'+esc(g.g)+'</h2>'+(opts.sub?'<span class="sub">'+opts.sub+'</span>':'')+
    (g.gk===nowYM&&g.sec==='timeline'?'<span class="tag">本月</span>':'')+'<span class="right">'+gd+'/'+g.items.length+'</span></div><ul class="items">';
  let shown=0,vi=opts.start||0;
  for(const i of g.items){vi++;if(!(hideDone&&isDone(i))){h+=row(i,vi,opts.prefix&&opts.prefix(i));shown++}}
  if(!shown) h+='<li class="item"><span></span><span class="n">這組都完成了</span></li>';
  h+='</ul>'+(opts.noAdd?'':'<button type="button" class="add" data-add="1" data-sec="'+g.sec+'" data-gk="'+esc(g.gk)+'" data-g="'+esc(g.g)+'">＋ 新增一項</button>')+'</section>';
  return h;
}

// ---------- 總覽 ----------
function viewHome(){
  const pi=phaseIndex();
  let h=toolbar(false);
  h+='<div class="phases">'+PHASES.map((p,i)=>'<div class="ph'+(i<pi?' done':'')+(i===pi?' cur':'')+'"><b>'+(i<pi?'✓':'階段 '+(i+1))+'</b>'+p.n+'</div>').join('')+'</div>'+
    '<p class="phase-desc">目前在<strong>「'+PHASES[pi].n+'」</strong>階段：'+PHASES[pi].d+'。</p>';
  const nowYM=ym(today()), tl=list('timeline');
  const overdue=tl.filter(i=>!i.done&&String(i.gk)<nowYM), thisMonth=tl.filter(i=>!i.done&&String(i.gk)===nowYM);
  let focus=[...overdue,...thisMonth], title='本月重點', tag='';
  if(!focus.length){
    const fut=[...new Set(tl.filter(i=>!i.done&&String(i.gk)>nowYM).map(i=>String(i.gk)))].sort();
    if(fut.length){focus=tl.filter(i=>!i.done&&String(i.gk)===fut[0]);title='接下來要做的事';tag=(focus[0]&&focus[0].g)||''}
  }
  focus.sort((a,b)=>String(a.gk)<String(b.gk)?-1:String(a.gk)>String(b.gk)?1:(a.o||0)-(b.o||0));
  h+='<section class="grp"><div class="grp-h"><h2>'+title+'</h2>'+(tag?'<span class="tag">'+esc(tag)+'</span>':'')+
    (overdue.length?'<span class="tag warn">逾期 '+overdue.length+' 項</span>':'')+'<button type="button" class="link" data-go="todo">全部 ›</button></div>';
  if(focus.length){h+='<ul class="items">'+focus.slice(0,6).map(i=>row(i,0,String(i.gk)<nowYM?'<span class="n warn">'+esc(i.g)+' 未完成</span>':'')).join('')+'</ul>';
    if(focus.length>6) h+='<button type="button" class="add" data-go="todo">還有 '+(focus.length-6)+' 項 ›</button>';}
  else h+='<p class="empty" style="padding:20px">目前沒有待辦，太棒了！</p>';
  h+='</section>';
  const td=tl.filter(i=>i.done).length, vs=list('vendors'), vd=vs.filter(isDone).length, gs=guestStats(), ps=payStats();
  const card=(go,big,small,lbl)=>'<button type="button" class="stat" data-go="'+go+'"><span class="big">'+big+(small?'<small style="font-size:14px;color:var(--muted)">'+small+'</small>':'')+'</span><span class="lbl">'+lbl+'</span></button>';
  h+='<section class="grp"><div class="grp-h"><h2>進度</h2></div><div class="stats4">'+
    card('todo',td,'/'+tl.length,'待辦完成')+card('money',moneyShort(ps.paid),'','預算已付')+
    card('guests',gs.yes,'/'+gs.total,'賓客已回覆出席')+card('vendors',vd,'/'+vs.length,'廠商已簽約')+'</div>';
  if(ps.soonN) h+='<button type="button" class="next" data-go="money"><span>30 天內要付款：</span>'+ps.soonN+' 筆，共 '+money(ps.soon)+(ps.late?'（含 '+ps.late+' 筆逾期）':'')+'</button>';
  const nextV=[...vs].sort((a,b)=>(a.o||0)-(b.o||0)).find(v=>!isDone(v));
  if(nextV) h+='<button type="button" class="next" data-go="vendors"><span>下一家要談的廠商：</span>'+esc(nextV.text)+'（'+esc(nextV.status||'未詢價')+'）</button>';
  h+='</section><section class="grp"><div class="grp-h"><h2>最近動態</h2><button type="button" class="link" data-go="activity">全部 ›</button></div>'+logList(logs.slice(0,5))+'</section>';
  return h;
}
function logList(arr){
  if(!arr.length) return '<p class="empty" style="padding:20px">還沒有任何修改紀錄。</p>';
  return '<ul class="log">'+arr.map(l=>'<li><span class="who">'+esc(l.by)+'</span> <span class="act'+(l.action==='刪除'?' del':'')+'">'+esc(l.action)+'</span> '+
    (l.coll==='meta'?'婚禮資訊':'「'+esc(l.label)+'」')+'<span class="when">'+rel(l.at)+(COLL_NAME[l.coll]&&l.coll!=='meta'?'・'+COLL_NAME[l.coll]:'')+'</span></li>').join('')+'</ul>';
}

// ---------- 待辦 ----------
function viewTodo(){
  const all=[...list('timeline'),...list('packing')], done=all.filter(isDone).length;
  const head=headBar('待辦',{pct:all.length?done/all.length*100:0,label:'已完成 '+done+' / '+all.length});
  let h=toolbar(true);
  groups('timeline').forEach(g=>h+=groupBlock(g,{sub:monthSub(g.gk)}));
  const pk=groups('packing');
  if(pk.length) pk.forEach(g=>h+=groupBlock({...g,g:'物品清單'}));
  else h+=groupBlock({gk:'0',g:'物品清單',sec:'packing',items:[]});
  return [head,h];
}

// ---------- 清單頁（廠商／分工／提醒）----------
function viewList(sec){
  const all=list(sec), done=all.filter(isDone).length;
  const head=headBar(LISTS[sec],{back:'more',pct:all.length?done/all.length*100:0,label:'已完成 '+done+' / '+all.length});
  let h=toolbar(true)+'<p class="intro">'+INTRO[sec]+'</p>', vi=0;
  const gs=groups(sec);
  if(!gs.length) h+='<div class="empty">這裡還沒有項目。<br><button type="button" class="add" style="text-align:center" data-add="1" data-sec="'+sec+'" data-gk="0" data-g="'+esc(LISTS[sec])+'">新增第一項</button></div>';
  for(const g of gs){h+=groupBlock(g,{start:vi});vi+=g.items.length}
  return [head,h];
}

// ---------- 預算與付款 ----------
function viewMoney(){
  const ps=payStats(), budget=+meta.budget||0, pct=budget?Math.min(100,ps.paid/budget*100):0;
  const head=headBar('預算與付款');
  let h=toolbar(false)+'<section class="grp" style="margin-top:14px"><div class="lbl-s">已付款總額</div><div class="money-big">'+money(ps.paid)+'</div>'+
    (budget?'<div class="grp-h" style="margin:0"><span class="lbl-s">總預算 '+money(budget)+'</span><span class="right">已付 '+Math.round(pct)+'%</span></div><div class="track"><i style="width:'+pct+'%"></i></div>'
      :'<button type="button" class="mini" data-act="meta">設定總預算</button>')+
    '<div class="stats4" style="margin-top:12px"><div class="stat"><span class="big">'+money(budget?Math.max(0,budget-ps.paid):ps.unpaid)+'</span><span class="lbl">'+(budget?'預算剩餘':'尚未支付')+'</span></div>'+
    '<div class="stat"><span class="big">'+money(ps.soon)+'</span><span class="lbl">30 天內要付（'+ps.soonN+' 筆）</span></div></div></section>';
  const pays=alive(data.payments), now=ymd(today());
  const unpaid=pays.filter(p=>!p.paid).sort((a,b)=>(a.due||'9999')<(b.due||'9999')?-1:1);
  const paid=pays.filter(p=>p.paid).sort((a,b)=>(b.paidAt||'')<(a.paidAt||'')?-1:1);
  const prow=p=>'<div class="pay-row'+(flash.has(p.id)?' flash':'')+'"><button type="button" class="body" data-pay="'+esc(p.id)+'"><span class="t">'+esc(p.title)+'</span>'+
    '<span class="due'+(!p.paid&&p.due&&p.due<now?' late':'')+'">'+esc(p.category||'')+(p.paid?'・'+(p.paidAt?md(p.paidAt)+' 付清':'已付'):p.due?'・'+md(p.due)+(p.due<now?' 已逾期':' 到期'):'・未排日期')+'</span></button>'+
    '<div style="text-align:right"><div class="amt'+(p.paid?' paid':'')+'">'+money(p.amount)+'</div>'+(p.paid?'':'<button type="button" class="mini" data-markpaid="'+esc(p.id)+'">標為已付</button>')+'</div></div>';
  h+='<section class="grp"><div class="grp-h"><h2>即將付款</h2><span class="right">'+unpaid.length+' 筆</span></div><div class="items">'+
    (unpaid.length?unpaid.map(prow).join(''):'<p class="empty" style="padding:18px">目前沒有待付款項。</p>')+'</div>'+
    '<button type="button" class="add" data-act="addpay">＋ 新增付款</button></section>';
  h+='<section class="grp"><div class="grp-h"><h2>已付款</h2><span class="right">'+paid.length+' 筆</span></div><div class="items">'+
    (paid.length?paid.map(prow).join(''):'<p class="empty" style="padding:18px">付款後按「標為已付」，就會自動加總到上方。</p>')+'</div></section>';
  const cats=new Map();for(const p of pays){const c=p.category||'其他';const o=cats.get(c)||{paid:0,all:0};o.all+=+p.amount||0;if(p.paid)o.paid+=+p.amount||0;cats.set(c,o)}
  if(cats.size){h+='<section class="grp"><div class="grp-h"><h2>各類花費</h2></div><div class="items">'+
    [...cats.entries()].sort((a,b)=>b[1].all-a[1].all).map(([c,o])=>'<div class="pay-row"><span>'+esc(c)+'</span><span class="due">已付 '+money(o.paid)+'／共 '+money(o.all)+'</span></div>').join('')+'</div></section>'}
  return [head,h];
}

// ---------- 賓客 ----------
function guestMatch(g){
  if(gFilter==='男方'||gFilter==='女方'){if(g.side!==gFilter)return false}
  else if(gFilter==='未回覆'){if(g.rsvp&&g.rsvp!=='未回覆')return false}
  else if(gFilter==='素食'){if(!g.diet||g.diet==='葷食'||g.rsvp==='不出席')return false}
  else if(gFilter==='住宿'){if(!g.lodging||g.rsvp==='不出席')return false}
  else if(gFilter==='接駁'){if(!g.shuttle||g.rsvp==='不出席')return false}
  else if(gFilter==='兒童椅'){if(!(+g.child>0)||g.rsvp==='不出席')return false}
  else if(gFilter==='未排桌'){if(g.table||g.rsvp==='不出席')return false}
  if(gQuery){const q=gQuery.toLowerCase();if(!((g.name||'')+(g.relation||'')+(g.note||'')).toLowerCase().includes(q))return false}
  return true;
}
function guestRows(){
  const arr=guests().filter(guestMatch).sort((a,b)=>(a.side||'').localeCompare(b.side||'')||(a.relation||'').localeCompare(b.relation||'')||(a.name||'').localeCompare(b.name||'','zh-Hant'));
  if(!arr.length) return '<p class="empty" style="padding:24px">'+(guests().length?'沒有符合條件的賓客。':'還沒有賓客，按下方新增，也可以一次貼上多位。')+'</p>';
  return arr.slice(0,400).map(g=>{
    const bits=[g.side,g.relation,hc(g)>1?hc(g)+' 人':'',g.diet&&g.diet!=='葷食'?g.diet:'',g.lodging?'住宿':'',g.shuttle?'接駁':'',+g.child?'兒童椅 '+g.child:''].filter(Boolean).join('・');
    const tt=g.rsvp==='不出席'?'<span class="ttag">不出席</span>':g.table?'<span class="ttag set">第 '+esc(g.table)+' 桌</span>':'<span class="ttag">未排桌</span>';
    return '<button type="button" class="g-row'+(flash.has(g.id)?' flash':'')+'" data-guest="'+esc(g.id)+'"><span><span class="g-name">'+esc(g.name)+'</span>'+(g.rsvp==='出席'?' <span class="otag">出席</span>':'')+'<span class="g-sub">'+esc(bits)+'</span></span>'+tt+'</button>';
  }).join('');
}
function viewGuests(){
  const s=guestStats();
  const head=headBar('賓客',{pct:s.total?s.yes/s.total*100:0,label:'已回覆出席 '+s.yes+' / 名單 '+s.total+' 人'});
  const chip=(k,lbl)=>'<button type="button" class="fchip'+(gFilter===k?' on':'')+'" data-gf="'+k+'">'+lbl+'</button>';
  let h=toolbar(false)+'<div class="stats4" style="margin-top:12px"><div class="stat"><span class="big">'+s.total+'</span><span class="lbl">名單人數（男方 '+s.m+'・女方 '+s.f+'）</span></div>'+
    '<div class="stat"><span class="big">'+s.yes+'</span><span class="lbl">已回覆出席（未回覆 '+s.wait+'）</span></div></div>'+
    '<div class="chips">'+chip('','全部')+chip('男方','男方')+chip('女方','女方')+chip('未回覆','未回覆 '+s.wait)+chip('素食','素食 '+s.veg)+chip('住宿','住宿 '+s.lodge)+chip('接駁','接駁 '+s.shuttle)+chip('兒童椅','兒童椅 '+s.child)+chip('未排桌','未排桌 '+s.unseated)+'</div>'+
    '<input class="search" id="gSearch" type="search" placeholder="搜尋姓名或關係" value="'+esc(gQuery)+'">'+
    '<section class="grp" style="margin-top:12px"><div class="items" id="gList">'+guestRows()+'</div>'+
    '<div class="row2" style="margin-top:4px"><button type="button" class="add" data-act="addguest">＋ 新增賓客</button><button type="button" class="add" data-act="bulkguest">＋ 一次貼上多位</button></div></section>'+
    '<section class="grp"><div class="grp-h"><h2>工具</h2></div><ul class="menu">'+
    '<li><button type="button" data-go="seating"><span class="ic">🪑</span><span class="lbl">桌次安排</span><span class="val">'+alive(data.tables).length+' 桌</span><span class="arrow">›</span></button></li>'+
    '<li><button type="button" data-soon="rsvp"><span class="ic">✉️</span><span class="lbl">RSVP 回覆連結</span><span class="val">之後推出</span><span class="arrow">›</span></button></li></ul></section>';
  return [head,h];
}

// ---------- 桌次 ----------
function viewSeating(){
  const st=seatStats(), ts=sortedTables(), cs=alive(data.charts).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  const head=headBar('桌次安排',{back:'guests',pct:meta.guests?Math.min(100,st.total/meta.guests*100):0,label:'已排 '+ts.length+' 桌，共 '+st.total+' 人'+(meta.guests?'／目標 '+meta.guests+' 人':'')});
  let h=toolbar(false)+'<p class="intro">'+INTRO.seating+'</p><section class="grp"><div class="grp-h"><h2>桌次圖</h2><span class="right">'+cs.length+' 張</span></div><div class="charts">';
  cs.forEach(c=>{h+='<figure class="chart'+(flash.has(c.id)?' flash':'')+'"><button type="button" data-view="'+esc(c.id)+'"><img src="'+esc(c.img)+'" alt="'+esc(c.name||'桌次圖')+'" loading="lazy"></button>'+
    '<figcaption><span>'+esc(c.name||'桌次圖')+(c.createdBy?'・'+esc(c.createdBy)+'上傳':'')+'</span><button type="button" data-delchart="'+esc(c.id)+'">刪除</button></figcaption></figure>'});
  h+='<button type="button" class="upload" data-act="upload">'+(cs.length?'＋ 再上傳一張（新版桌次圖）':'＋ 上傳桌次圖')+'</button></div></section>'+
    '<section class="grp"><div class="grp-h"><h2>各桌賓客</h2></div><div class="stats"><span>總人數 <b>'+st.total+'</b></span><span>男方 <b>'+st.m+'</b></span><span>女方 <b>'+st.f+'</b></span><span>共同 <b>'+st.j+'</b></span><span>桌數 <b>'+ts.length+'</b></span></div><ul class="items">';
  if(!ts.length) h+='<li class="item"><span></span><span class="n">還沒有桌次，按下方新增。</span></li>';
  for(const t of ts){
    const sc=t.side==='男方'?'m':t.side==='女方'?'f':'j', tg=tableGuests(t);
    const names=tg.length?tg.map(g=>g.name+(hc(g)>1?'（'+hc(g)+'）':'')).join('、'):t.names;
    h+='<li class="item'+(flash.has(t.id)?' flash':'')+'"><span class="tno">'+esc(t.no)+'</span><div><button type="button" class="body" data-table="'+esc(t.id)+'">'+
      '<span class="t"><span class="side '+sc+'">'+esc(t.side||'共同')+'</span>'+esc(t.area||'第 '+t.no+' 桌')+(t.relation?'｜'+esc(t.relation):'')+'　'+tableCount(t)+' 人</span>'+
      (names?'<span class="n">'+esc(names)+'</span>':'')+(t.note?'<span class="n">備註：'+esc(t.note)+'</span>':'')+'</button></div></li>';
  }
  h+='</ul><button type="button" class="add" data-act="addtable">＋ 新增一桌</button></section>';
  return [head,h];
}

// ---------- 更多 ----------
function viewMore(){
  const tr=trashItems().length, p=PALETTES.find(p=>p[0]===meta.palette)||PALETTES[0], vs=list('vendors');
  const it=(attr,ic,lbl,val)=>'<li><button type="button" '+attr+'><span class="ic">'+ic+'</span><span class="lbl">'+lbl+'</span><span class="val">'+esc(val||'')+'</span><span class="arrow">›</span></button></li>';
  const soon=k=>'data-soon="'+k+'"';
  const h=toolbar(false)+
    '<section class="grp"><div class="grp-h"><h2>籌備</h2></div><ul class="menu">'+
    it('data-go="vendors"','🤵','廠商',vs.filter(isDone).length+'/'+vs.length+' 簽約')+
    it(soon('invite'),'💌','喜帖與喜餅','之後推出')+it(soon('flow'),'📋','婚禮流程','之後推出')+it(soon('docs'),'📁','文件','之後推出')+
    it('data-go="family"','👨‍👩‍👧','雙方分工',list('family').filter(isDone).length+'/'+list('family').length)+
    it('data-go="pitfalls"','⚠️','踩雷提醒',list('pitfalls').filter(isDone).length+'/'+list('pitfalls').length)+
    '</ul></section><section class="grp"><div class="grp-h"><h2>當天與婚後</h2></div><ul class="menu">'+
    it(soon('dayof'),'🚨','婚禮當天','當天自動開啟')+it(soon('gifts'),'🎁','禮金與回禮','之後推出')+it(soon('after'),'🏁','婚後收尾','之後推出')+
    '</ul></section><section class="grp"><div class="grp-h"><h2>工具與設定</h2></div><ul class="menu">'+
    it(soon('ai'),'🤖','AI 婚禮助理','之後推出')+
    it('data-go="activity"','🕘','動態紀錄',logs[0]?rel(logs[0].at):'')+
    it('data-go="trash"','🗑️','垃圾桶',tr?tr+' 項':'空的')+
    it('data-act="identity"','👤','我的身分',core.me()||'未選擇')+
    it('data-act="meta"','💍','婚禮資訊與配色',p[1])+
    it('data-act="share"','🔗','分享連結給家人','')+'</ul></section>';
  return [headBar('更多'),h];
}
function viewActivity(){
  let h=toolbar(false)+'<p class="intro">最近 80 筆修改紀錄，每支手機都看得到。</p>', last='', buf=[];
  if(!logs.length) h+=logList([]);
  const flush=()=>{if(buf.length){h+=logList(buf);buf=[]}};
  for(const l of logs){const d=new Date(l.at), k=(d.getMonth()+1)+'月'+d.getDate()+'日（'+WD[d.getDay()]+'）';if(k!==last){flush();h+='<div class="day-h">'+k+'</div>';last=k}buf.push(l)}
  flush();
  return [headBar('動態紀錄',{back:'more'}),h];
}
function viewTrash(){
  const tr=trashItems(), ic={charts:'🖼',tables:'🪑',guests:'👤',payments:'💰',items:'📝'};
  let h=toolbar(false)+'<p class="intro">刪除的東西會在這裡保留 '+core.TRASH_DAYS+' 天，期間都能還原。</p>';
  if(!tr.length) h+='<p class="empty">垃圾桶是空的。</p>';
  else{
    h+='<ul class="items" style="margin-top:12px">';
    for(const {c,x} of tr){
      const left=Math.max(0,core.TRASH_DAYS-Math.floor((Date.now()-(x.deletedAt||0))/864e5));
      h+='<li class="item"><span class="num" style="font-size:16px">'+(ic[c]||'📝')+'</span><div><span class="t">'+esc(labelOf(c,x))+'</span>'+
        '<span class="n">'+esc(x.deletedBy||'有人')+' 於 '+rel(x.deletedAt)+'刪除・'+left+' 天後永久清除</span>'+
        '<div class="trash-actions"><button type="button" class="restore" data-restore="'+c+'|'+esc(x.id)+'">還原</button><button type="button" class="purge" data-purge="'+c+'|'+esc(x.id)+'">永久刪除</button></div></div></li>';
    }
    h+='</ul>';
  }
  return [headBar('垃圾桶',{back:'more'}),h];
}

// ---------- 畫面 ----------
const NAV={home:'home',todo:'todo',guests:'guests',seating:'guests',money:'money'};
function render(){
  applyPalette();
  const navKey=NAV[view]||'more';
  document.querySelectorAll('#tabs button').forEach(b=>b.dataset.go===navKey?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current'));
  const all=[...list('timeline'),...list('packing')], gs=guestStats(), ps=payStats();
  $('#c-todo').textContent=all.length?all.filter(isDone).length+'/'+all.length:'';
  $('#c-guests').textContent=gs.total?gs.total+' 人':'';
  $('#c-money').textContent=ps.paid?moneyShort(ps.paid):'';
  if(!loaded){$('#head').innerHTML=headHome();$('#main').innerHTML='<p class="empty">正在載入…</p>';return}
  // 賓客頁搜尋中：只更新名單，避免打字時跳掉
  const ae=document.activeElement;
  if(view==='guests'&&ae&&ae.id==='gSearch'&&$('#gList')){$('#gList').innerHTML=guestRows();return}
  let head,body;
  if(view==='home'){head=headHome();body=viewHome()}
  else if(view==='todo') [head,body]=viewTodo();
  else if(LISTS[view]) [head,body]=viewList(view);
  else if(view==='money') [head,body]=viewMoney();
  else if(view==='guests') [head,body]=viewGuests();
  else if(view==='seating') [head,body]=viewSeating();
  else if(view==='activity') [head,body]=viewActivity();
  else if(view==='trash') [head,body]=viewTrash();
  else [head,body]=viewMore();
  $('#head').innerHTML=head; $('#main').innerHTML=body;
}
function go(v){view=v;ls.set('wp-view3',v);render();window.scrollTo(0,0)}

// ---------- 底部面板 ----------
function openSheet(html){$('#sheetPanel').innerHTML=html;$('#sheet').classList.add('open')}
function closeSheet(force){if(!force&&editing&&editing.kind==='identity'&&!core.me())return;$('#sheet').classList.remove('open');editing=null}
const stamp=x=>x&&x.updatedAt?'<p class="stamp">最後修改：'+esc(x.updatedBy||'有人')+'・'+rel(x.updatedAt)+'</p>':'';
function actions(del,saveId){return '<div class="actions">'+(del?'<button type="button" class="btn danger" data-act="del">刪除</button>':'')+'<span class="grow"></span><button type="button" class="btn ghost" data-close>取消</button><button type="button" class="btn primary" data-act="'+saveId+'">儲存</button></div>'}
const opts=(arr,cur)=>arr.map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('');
function maxO(sec,gk){let m=-1;for(const i of list(sec)) if(String(i.gk)===String(gk)&&(i.o||0)>m) m=i.o||0;return m}
const val=id=>($(id)?$(id).value.trim():'');

function openIdentity(){
  editing={kind:'identity'};
  const cur=core.me(), custom=cur&&!core.ROLES.includes(cur)?cur:'';
  openSheet('<h3>你是誰？</h3><p class="sub">選一次就好，這支手機會記住。之後每筆修改都會記錄是誰做的。</p><div class="roles">'+
    core.ROLES.map(r=>'<button type="button" data-role="'+r+'"'+(r===cur?' class="on"':'')+'>'+r+'</button>').join('')+'</div>'+
    '<label class="field"><span>或輸入名字</span><input id="idName" value="'+esc(custom)+'" placeholder="例如：小姑、阿姨、婚顧 Amy"></label>'+
    '<div class="actions"><span class="grow"></span>'+(cur?'<button type="button" class="btn ghost" data-close>取消</button>':'')+'<button type="button" class="btn primary" data-act="saveName">確定</button></div>');
}
function openItem(id,preset){
  const it=id?data.items.get(id):Object.assign({text:'',note:'',status:'未詢價',quote:'',contact:'',owner:''},preset);
  if(!it) return;
  editing={kind:'item',id,section:it.section,gk:String(it.gk),g:it.g};
  const gs=groups(it.section); if(!gs.some(g=>g.gk===String(it.gk))) gs.push({gk:String(it.gk),g:it.g});
  let h='<h3>'+(id?'編輯項目':'新增項目')+'</h3>'+stamp(id&&it)+
    '<label class="field"><span>內容</span><textarea id="fText" rows="2">'+esc(it.text)+'</textarea></label>';
  if(it.section==='timeline'||it.section==='packing'||it.section==='family') h+='<label class="field"><span>負責人</span><select id="fOwner"><option value="">未指派</option>'+opts(core.OWNERS,it.owner)+'</select></label>';
  h+='<label class="field"><span>備註</span><textarea id="fNote" rows="2" placeholder="例如：已約 11/9 看場地">'+esc(it.note)+'</textarea></label>';
  if(gs.length>1) h+='<label class="field"><span>分組</span><select id="fGroup">'+gs.map(g=>'<option value="'+esc(g.gk)+'" data-g="'+esc(g.g)+'"'+(g.gk===String(it.gk)?' selected':'')+'>'+esc(g.g)+'</option>').join('')+'</select></label>';
  if(it.section==='vendors') h+='<label class="field"><span>狀態</span><select id="fStatus">'+opts(VSTAT,it.status||'未詢價')+'</select></label>'+
    '<div class="row2"><label class="field"><span>報價</span><input id="fQuote" value="'+esc(it.quote)+'" placeholder="每桌 $22,000"></label><label class="field"><span>聯絡人</span><input id="fContact" value="'+esc(it.contact)+'" placeholder="姓名或電話"></label></div>';
  openSheet(h+actions(!!id,'saveItem'));
  if(!id) setTimeout(()=>$('#fText')&&$('#fText').focus(),50);
}
function saveItem(){
  const text=val('#fText'); if(!text){toast('請先填寫內容');return}
  const sel=$('#fGroup'), gk=sel?sel.value:editing.gk, g=sel?sel.selectedOptions[0].dataset.g:editing.g;
  const body={text,note:val('#fNote'),gk,g};
  if($('#fOwner')) body.owner=$('#fOwner').value;
  if(editing.section==='vendors'){body.status=$('#fStatus').value;body.quote=val('#fQuote');body.contact=val('#fContact')}
  const ed=editing;
  if(ed.id){const cur=data.items.get(ed.id);if(cur&&String(cur.gk)!==gk)body.o=maxO(ed.section,gk)+1;core.update('items',ed.id,body,text)}
  else core.create('items',{...body,section:ed.section,done:false,o:maxO(ed.section,gk)+1},text);
  closeSheet(true);toast('已儲存');
}
function openPay(id){
  const p=id?data.payments.get(id):{title:'',category:'場地與餐飲',amount:'',due:'',paid:false,paidAt:'',note:''};
  if(!p) return;
  editing={kind:'pay',id};
  const vendors=list('vendors').sort((a,b)=>(a.o||0)-(b.o||0)).map(v=>v.text.split('：')[0]);
  openSheet('<h3>'+(id?'編輯付款':'新增付款')+'</h3>'+stamp(id&&p)+
    '<label class="field"><span>項目</span><input id="pTitle" list="vlist" value="'+esc(p.title)+'" placeholder="例如：艾麗酒店 訂金"><datalist id="vlist">'+vendors.map(v=>'<option value="'+esc(v)+'">').join('')+'</datalist></label>'+
    '<div class="row2"><label class="field"><span>金額</span><input id="pAmt" type="number" inputmode="numeric" value="'+esc(p.amount)+'" placeholder="100000"></label>'+
    '<label class="field"><span>類別</span><select id="pCat">'+opts(PAYCAT,p.category)+'</select></label></div>'+
    '<div class="row2"><label class="field"><span>付款期限</span><input id="pDue" type="date" value="'+esc(p.due)+'"></label>'+
    '<label class="field"><span>付清日期</span><input id="pPaidAt" type="date" value="'+esc(p.paidAt)+'"></label></div>'+
    '<div class="checks"><label><input type="checkbox" id="pPaid"'+(p.paid?' checked':'')+'>已付款</label></div>'+
    '<label class="field"><span>備註</span><input id="pNote" value="'+esc(p.note)+'" placeholder="例如：匯款後附收據照片"></label>'+actions(!!id,'savePay'));
  $('#pPaid').addEventListener('change',e=>{if(e.target.checked&&!$('#pPaidAt').value)$('#pPaidAt').value=ymd(today())});
}
function savePay(){
  const title=val('#pTitle'), amount=parseInt($('#pAmt').value,10)||0;
  if(!title){toast('請填寫項目');return} if(!amount){toast('請填寫金額');return}
  const paid=$('#pPaid').checked;
  const body={title,amount,category:$('#pCat').value,due:$('#pDue').value,paid,paidAt:paid?($('#pPaidAt').value||ymd(today())):'',note:val('#pNote')};
  const label=title+' '+money(amount);
  editing.id?core.update('payments',editing.id,body,label):core.create('payments',body,label);
  closeSheet(true);toast('已儲存');
}
function openGuest(id){
  const g=id?data.guests.get(id):{name:'',side:'男方',relation:'',headcount:1,rsvp:'未回覆',diet:'葷食',lodging:false,shuttle:false,child:0,table:'',phone:'',note:''};
  if(!g) return;
  editing={kind:'guest',id};
  const rels=[...new Set(guests().map(x=>x.relation).filter(Boolean))];
  openSheet('<h3>'+(id?'編輯賓客':'新增賓客')+'</h3>'+stamp(id&&g)+
    '<div class="row2"><label class="field"><span>姓名</span><input id="gName" value="'+esc(g.name)+'" placeholder="王大明"></label>'+
    '<label class="field"><span>哪一方</span><select id="gSide">'+opts(['男方','女方'],g.side)+'</select></label></div>'+
    '<div class="row2"><label class="field"><span>關係</span><input id="gRel" list="rlist" value="'+esc(g.relation)+'" placeholder="大學同學"><datalist id="rlist">'+rels.map(r=>'<option value="'+esc(r)+'">').join('')+'</datalist></label>'+
    '<label class="field"><span>人數（含攜伴）</span><input id="gHc" type="number" inputmode="numeric" min="1" value="'+esc(hc(g))+'"></label></div>'+
    '<div class="row2"><label class="field"><span>出席回覆</span><select id="gRsvp">'+opts(RSVP,g.rsvp||'未回覆')+'</select></label>'+
    '<label class="field"><span>桌號</span><input id="gTable" type="number" inputmode="numeric" value="'+esc(g.table)+'" placeholder="未排"></label></div>'+
    '<div class="row2"><label class="field"><span>飲食</span><select id="gDiet">'+opts(DIETS,g.diet||'葷食')+'</select></label>'+
    '<label class="field"><span>兒童椅</span><input id="gChild" type="number" inputmode="numeric" min="0" value="'+esc(+g.child||0)+'"></label></div>'+
    '<div class="checks"><label><input type="checkbox" id="gLodge"'+(g.lodging?' checked':'')+'>需要住宿</label><label><input type="checkbox" id="gShuttle"'+(g.shuttle?' checked':'')+'>搭接駁車</label></div>'+
    '<label class="field"><span>電話</span><input id="gPhone" type="tel" value="'+esc(g.phone)+'"></label>'+
    '<label class="field"><span>備註</span><input id="gNote" value="'+esc(g.note)+'" placeholder="例如：對海鮮過敏"></label>'+actions(!!id,'saveGuest'));
  if(!id) setTimeout(()=>$('#gName')&&$('#gName').focus(),50);
}
function saveGuest(){
  const name=val('#gName'); if(!name){toast('請填寫姓名');return}
  const body={name,side:$('#gSide').value,relation:val('#gRel'),headcount:Math.max(1,parseInt($('#gHc').value,10)||1),rsvp:$('#gRsvp').value,
    table:$('#gTable').value?parseInt($('#gTable').value,10):'',diet:$('#gDiet').value,child:Math.max(0,parseInt($('#gChild').value,10)||0),
    lodging:$('#gLodge').checked,shuttle:$('#gShuttle').checked,phone:val('#gPhone'),note:val('#gNote')};
  editing.id?core.update('guests',editing.id,body,name):core.create('guests',body,name);
  closeSheet(true);toast('已儲存');
}
function openBulk(){
  editing={kind:'bulk'};
  openSheet('<h3>一次新增多位賓客</h3><p class="sub">一行一位。可以直接從 LINE 記事本或 Excel 複製貼上。</p>'+
    '<div class="row2"><label class="field"><span>哪一方</span><select id="bSide">'+opts(['男方','女方'],'男方')+'</select></label>'+
    '<label class="field"><span>關係</span><input id="bRel" placeholder="例如：男方同事"></label></div>'+
    '<label class="field"><span>姓名</span><textarea id="bNames" rows="8" placeholder="王大明&#10;林小華&#10;陳志明"></textarea></label>'+actions(false,'saveBulk'));
}
function saveBulk(){
  const names=$('#bNames').value.split(/[\n,，、]/).map(s=>s.trim()).filter(Boolean);
  if(!names.length){toast('請貼上至少一位');return}
  if(names.length>200){toast('一次最多 200 位');return}
  const side=$('#bSide').value, rel=val('#bRel');
  names.forEach(n=>core.create('guests',{name:n,side,relation:rel,headcount:1,rsvp:'未回覆',diet:'葷食',lodging:false,shuttle:false,child:0,table:'',phone:'',note:''},n));
  closeSheet(true);toast('已新增 '+names.length+' 位');
}
function openTable(id){
  const ts=sortedTables();
  const t=id?data.tables.get(id):{no:(ts.length?Math.max(...ts.map(x=>+x.no||0)):0)+1,area:'',side:'男方',relation:'',names:'',count:10,note:''};
  if(!t) return;
  editing={kind:'table',id};
  const tg=id?tableGuests(t):[];
  openSheet('<h3>'+(id?'編輯第 '+esc(t.no)+' 桌':'新增一桌')+'</h3>'+stamp(id&&t)+
    '<div class="row2"><label class="field"><span>桌號</span><input id="tNo" type="number" inputmode="numeric" value="'+esc(t.no)+'"></label><label class="field"><span>人數'+(tg.length?'（依賓客自動計算）':'')+'</span><input id="tCount" type="number" inputmode="numeric" value="'+esc(tg.length?tableCount(t):t.count)+'"'+(tg.length?' disabled':'')+'></label></div>'+
    '<div class="row2"><label class="field"><span>哪一方</span><select id="tSide">'+opts(SIDES,t.side)+'</select></label><label class="field"><span>區域</span><input id="tArea" value="'+esc(t.area)+'" placeholder="主桌、舞台左"></label></div>'+
    '<label class="field"><span>關係</span><input id="tRel" value="'+esc(t.relation)+'" placeholder="例如：男方大學同學"></label>'+
    (tg.length?'<p class="stamp">這桌的賓客：'+esc(tg.map(g=>g.name).join('、'))+'（到賓客頁修改桌號）</p>':'<label class="field"><span>賓客名單</span><textarea id="tNames" rows="3" placeholder="用頓號或換行分隔">'+esc(t.names)+'</textarea></label>')+
    '<label class="field"><span>備註</span><input id="tNote" value="'+esc(t.note)+'" placeholder="例如：2 位素食、1 張兒童椅"></label>'+actions(!!id,'saveTable'));
}
function saveTable(){
  const body={no:parseInt($('#tNo').value,10)||0,side:$('#tSide').value,area:val('#tArea'),relation:val('#tRel'),note:val('#tNote')};
  if(!$('#tCount').disabled) body.count=parseInt($('#tCount').value,10)||0;
  if($('#tNames')) body.names=val('#tNames');
  const label='第 '+body.no+' 桌';
  editing.id?core.update('tables',editing.id,body,label):core.create('tables',body,label);
  closeSheet(true);toast('已儲存');
}
function openMeta(){
  editing={kind:'meta'};
  openSheet('<h3>婚禮資訊與配色</h3>'+stamp(meta)+
    '<label class="field"><span>名稱</span><input id="mTitle" value="'+esc(meta.title)+'"></label>'+
    '<label class="field"><span>婚期</span><input id="mDate" type="date" value="'+esc(meta.date)+'"></label>'+
    '<div class="row2"><label class="field"><span>地點</span><input id="mVenue" value="'+esc(meta.venue)+'"></label><label class="field"><span>預計賓客人數</span><input id="mGuests" type="number" inputmode="numeric" value="'+esc(meta.guests)+'"></label></div>'+
    '<label class="field"><span>總預算</span><input id="mBudget" type="number" inputmode="numeric" value="'+esc(meta.budget||'')+'" placeholder="1200000"></label>'+
    '<label class="field"><span>配色（所有人一起套用）</span><select id="mPal">'+PALETTES.map(([k,n])=>'<option value="'+k+'"'+((meta.palette||'blue')===k?' selected':'')+'>'+n+'</option>').join('')+'</select></label>'+actions(false,'saveMeta'));
}
function saveMeta(){
  const body={title:val('#mTitle')||'我們的婚禮',date:$('#mDate').value,venue:val('#mVenue'),guests:parseInt($('#mGuests').value,10)||0,budget:parseInt($('#mBudget').value,10)||0,palette:$('#mPal').value};
  core.updateMeta(body);meta={...meta,...body};closeSheet(true);render();toast('已儲存');
}

// ---------- 圖片 ----------
function loadImg(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file),im=new Image();im.onload=()=>{URL.revokeObjectURL(u);res(im)};im.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('無法讀取圖片'))};im.src=u})}
async function compress(file){
  const im=await loadImg(file);let max=2200;
  for(let r=0;r<6;r++){
    const s=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement('canvas');
    c.width=Math.round(im.naturalWidth*s);c.height=Math.round(im.naturalHeight*s);
    const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);
    for(const q of [0.85,0.75,0.65,0.55]){const d=c.toDataURL('image/jpeg',q);if(d.length<900000)return d}
    max=Math.round(max*0.8);
  }
  throw new Error('圖片太大');
}
$('#fileIn').addEventListener('change',async e=>{
  const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
  toast('圖片處理中…');
  try{const img=await compress(f),d=new Date(),name='桌次圖 '+(d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    core.create('charts',{img,name},name);toast('已上傳，大家都看得到了')}
  catch(err){toast('上傳失敗：'+(err.message||'請換一張圖試試'))}
});

// ---------- 事件 ----------
document.addEventListener('input',e=>{if(e.target.id==='gSearch'){gQuery=e.target.value.trim();$('#gList').innerHTML=guestRows()}});
document.addEventListener('click',async e=>{
  if(e.target.closest('[data-close]')){closeSheet();return}
  if(e.target.closest('[data-closeviewer]')){$('#viewer').classList.remove('open');return}
  if(e.target.id==='vImg'){$('#viewer').classList.toggle('zoom');return}
  const t=e.target.closest('button');if(!t)return;
  const d=t.dataset;
  if(d.go){go(d.go);return}
  if(d.soon){toast('「'+SOON[d.soon]+'」會在之後的版本加入');return}
  if(d.toggle){const i=data.items.get(d.toggle);if(i)core.update('items',i.id,{done:!i.done},i.text,i.done?'取消完成':'完成');return}
  if(d.cycle){const i=data.items.get(d.cycle);if(!i)return;const s=VSTAT[(Math.max(0,VSTAT.indexOf(i.status))+1)%VSTAT.length];core.update('items',i.id,{status:s},i.text+' → '+s,'更新狀態');return}
  if(d.edit){openItem(d.edit);return}
  if(d.add){openItem(null,{section:d.sec,gk:d.gk,g:d.g});return}
  if(d.table){openTable(d.table);return}
  if(d.guest){openGuest(d.guest);return}
  if(d.gf!=null){gFilter=gFilter===d.gf?'':d.gf;render();return}
  if(d.pay){openPay(d.pay);return}
  if(d.markpaid){const p=data.payments.get(d.markpaid);if(p){core.update('payments',p.id,{paid:true,paidAt:ymd(today())},p.title+' '+money(p.amount),'付款');toast('已付 '+money(p.amount))}return}
  if(d.view){const c=data.charts.get(d.view);if(c){$('#vImg').src=c.img;$('#viewer').classList.remove('zoom');$('#viewer').classList.add('open')}return}
  if(d.delchart){const c=data.charts.get(d.delchart);if(c&&confirm('把這張桌次圖移到垃圾桶？30 天內可還原。')){core.remove('charts',c.id,c.name||'桌次圖');toast('已移到垃圾桶')}return}
  if(d.restore){const [c,id]=d.restore.split('|'),x=data[c]&&data[c].get(id);if(x){core.restore(c,id,labelOf(c,x));toast('已還原')}return}
  if(d.purge){const [c,id]=d.purge.split('|');if(confirm('永久刪除後就救不回來了，確定嗎？')){core.purge(c,id);toast('已永久刪除')}return}
  if(d.role){document.querySelectorAll('[data-role]').forEach(b=>b.classList.toggle('on',b===t));$('#idName').value='';return}
  switch(d.act){
    case 'identity': openIdentity(); break;
    case 'meta': openMeta(); break;
    case 'hide': hideDone=!hideDone;ls.set('wp-hide',hideDone?'1':'0');render(); break;
    case 'upload': $('#fileIn').click(); break;
    case 'addtable': openTable(null); break;
    case 'addguest': openGuest(null); break;
    case 'bulkguest': openBulk(); break;
    case 'addpay': openPay(null); break;
    case 'saveItem': saveItem(); break;
    case 'saveTable': saveTable(); break;
    case 'saveGuest': saveGuest(); break;
    case 'saveBulk': saveBulk(); break;
    case 'savePay': savePay(); break;
    case 'saveMeta': saveMeta(); break;
    case 'saveName': {
      const typed=$('#idName').value.trim(), on=document.querySelector('[data-role].on');
      const name=typed||(on&&on.dataset.role);
      if(!name){toast('請選一個身分或輸入名字');return}
      core.setMe(name);closeSheet(true);render();toast('你好，'+name);break;
    }
    case 'del': {
      if(!editing||!editing.id)return;
      const c={table:'tables',guest:'guests',pay:'payments'}[editing.kind]||'items', x=data[c].get(editing.id);
      core.remove(c,editing.id,labelOf(c,x));closeSheet(true);toast('已移到垃圾桶，30 天內可還原');break;
    }
    case 'share': {
      const url=location.href;
      if(navigator.share){try{await navigator.share({title:meta.title||'婚禮管家',text:'我們的婚禮管家，點開就能一起編輯',url});return}catch(err){if(err.name==='AbortError')return}}
      try{await navigator.clipboard.writeText(url);toast('連結已複製，貼到 LINE 給家人就好')}catch(err){prompt('複製這個連結：',url)}
      break;
    }
  }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSheet();$('#viewer').classList.remove('open')}});

// ---------- 啟動 ----------
function landing(){
  $('#head').innerHTML='<header class="hero"><div class="xi" aria-hidden="true">囍</div><div class="hero-top"><h1>婚禮管家</h1></div><p class="count">從決定結婚<br>到婚後收尾</p></header>';
  $('#main').innerHTML='<div class="landing"><h2>建立你們的婚禮管家</h2><p>建立後，網址最後會多一串專屬代碼。把整個網址傳給家人，他們打開就能直接編輯，不用登入。</p>'+
    '<button type="button" class="btn primary" id="create">建立</button><p style="font-size:13px;margin-top:24px">已經建立過？請直接打開當初分享的完整網址。</p></div>';
  $('#create').addEventListener('click',()=>{location.hash='w='+core.newWeddingId();location.reload()});
}
async function start(){
  const id=core.weddingIdFromUrl();
  if(!id){landing();return}
  core.initDb(id);
  $('#tabs').hidden=false;
  const known=['home','todo','guests','money','more','seating','vendors','family','pitfalls','activity','trash'];
  if(!known.includes(view)) view='home';
  render();
  if(!core.me()) openIdentity();
  core.watchMeta(m=>{meta={...meta,...m};render()});
  try{await core.ensureSeed();await core.upgrade()}catch(e){console.error(e)}
  for(const c of Object.keys(data)){
    core.watch(c,({changes,first,fromCache,pending})=>{
      const fresh=[];
      for(const ch of changes){
        if(ch.type==='removed'){data[c].delete(ch.id);continue}
        data[c].set(ch.id,{id:ch.id,...ch.data});
        if(!first&&!pending&&!core.isMine(ch.id)) fresh.push(ch.id);
      }
      conn=fromCache?'offline':'live';loaded=true;
      fresh.forEach(id=>flash.add(id));
      render();
      if(fresh.length){toast('有人剛更新了 '+fresh.length+' 項');setTimeout(()=>fresh.forEach(id=>flash.delete(id)),1900)}
    });
  }
  core.watchLog(l=>{logs=l;if(loaded)render()});
  setInterval(()=>{if(view==='home'||view==='activity')render()},60000);
}
start();
