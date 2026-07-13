const categories = [
  {key:'security', ja:'安心感', zh:'安心感'},
  {key:'communication', ja:'コミュニケーション', zh:'沟通情况'},
  {key:'company', ja:'一緒に過ごす時間', zh:'陪伴质量'},
  {key:'trust', ja:'尊重と信頼', zh:'尊重与信任'},
  {key:'romance', ja:'思いやりとロマン', zh:'浪漫与用心'},
  {key:'overall', ja:'総合評価', zh:'综合评分'}
];
const fields = [
  ['grateful','一番感謝したこと','最感谢对方的事情'],
  ['happy','一番幸せだった瞬間','最幸福的瞬间'],
  ['hurt','悲しかったこと・違和感','难过或不舒服的事情'],
  ['hope','ふたりで変えたいこと','希望一起做出的改变'],
  ['selfChange','自分が改善したいこと','自己愿意改善的事情']
];
const renewLabels = {
  continue:'交際を続けたい / 愿意继续交往',
  improve:'一緒に改善しながら続けたい / 愿意继续，一起改善',
  talk:'まずはきちんと話し合いたい / 希望先认真谈谈',
  end:'契約を更新したくない / 不希望续约'
};
const now = new Date();
const metDate = new Date(2026,5,5);
const datingDate = new Date(2026,6,7);
const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
let currentPerson = localStorage.getItem('contract-person') || 'haku';
let data = JSON.parse(localStorage.getItem('haku-risa-contract') || '{}');
data.months ||= {};
data.months[monthKey] ||= {reviews:{}};
const names = {haku:'はく', risa:'りさ'};
let resultMonthKey = monthKey;
let cloudIdentityLocked = false;
let cloudSubmissionStatus = null;
const LIFF_ID = '2010691057-bPSQMjfx';
let lineProfile = null;

function publishLineState(state){
  window.tsukimusubiLineState=state;
  document.dispatchEvent(new CustomEvent('tsukimusubi:line-ready',{detail:state}));
}

function setLineStatus(text,state){
  const button=document.querySelector('#lineStatus');
  document.querySelector('#lineStatusText').textContent=text;
  button.className=`line-status ${state}`;
}

async function initializeLine(){
  const button=document.querySelector('#lineStatus');
  if(!window.liff){
    setLineStatus('WEB MODE / 网页模式','error');
    button.onclick=()=>showToast('LINE SDKを読み込めませんでした / LINE连接暂时不可用');
    publishLineState({loggedIn:false});
    return;
  }
  try{
    await liff.init({liffId:LIFF_ID});
    if(liff.isLoggedIn()){
      const decodedToken=liff.getDecodedIDToken();
      lineProfile={displayName:decodedToken?.name||'LINE User'};
      setLineStatus(`LINE · ${lineProfile.displayName}`,'connected');
      button.title='LINEに接続済み / 已连接LINE';
      button.onclick=()=>showToast(`LINE 接続済み / 已连接：${lineProfile.displayName}`);
      publishLineState({loggedIn:true,displayName:lineProfile.displayName});
    }else{
      setLineStatus('LINEでログイン / 使用LINE登录','web');
      button.title='LINEログイン / LINE登录';
      button.onclick=()=>liff.login({redirectUri:window.location.href});
      publishLineState({loggedIn:false});
    }
  }catch(error){
    setLineStatus('WEB MODE / 网页模式','error');
    button.title='通常のブラウザモード / 普通网页模式';
    button.onclick=()=>showToast('通常のブラウザで開いています / 当前为普通网页模式');
    publishLineState({loggedIn:false});
  }
}

function save(){localStorage.setItem('haku-risa-contract',JSON.stringify(data));}
function month(){return data.months[monthKey];}
function scoreFor(review,category){return +(review.scores[category.key] ?? review.scores[category.zh] ?? 0);}
function reviewAverage(review){return categories.reduce((sum,category)=>sum+scoreFor(review,category),0)/categories.length;}
function relationshipDays(startDate){const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());return Math.max(0,Math.floor((today-startDate)/86400000)+1);}
function renewText(value){return renewLabels[value] || value;}
function isPositive(value){return ['continue','improve'].includes(value) || String(value).startsWith('愿意继续');}
function showToast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200);}
function showView(id){document.querySelectorAll('.view').forEach(view=>view.classList.remove('active'));document.querySelector(`#${id}View`).classList.add('active');scrollTo({top:0,behavior:'smooth'});if(id==='home')renderHome();if(id==='result')renderResult();}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));

function setIdentity(person){
  if(cloudIdentityLocked){
    document.querySelector('#identityModal').classList.remove('open');
    return showToast('クラウドでは役割が固定されています / 云端模式下身份已固定');
  }
  currentPerson=person;
  localStorage.setItem('contract-person',person);
  document.querySelector('#identityModal').classList.remove('open');
  renderHome();
  showToast(`${names[person]} に切り替えました / 已切换为 ${names[person]}`);
}
document.querySelector('#identityButton').addEventListener('click',()=>{
  if(cloudIdentityLocked)return showToast('クラウドでは役割が固定されています / 云端模式下身份已固定');
  document.querySelector('#identityModal').classList.add('open');
});
document.querySelector('.modal-backdrop').addEventListener('click',()=>document.querySelector('#identityModal').classList.remove('open'));
document.querySelectorAll('[data-person]').forEach(button=>button.addEventListener('click',()=>setIdentity(button.dataset.person)));

function setIdentityLabel(){
  document.querySelector('#identityName').textContent=names[currentPerson];
  document.querySelector('#identityDot').textContent=currentPerson==='haku'?'白':'凜';
  document.querySelector('#identityDot').style.background=currentPerson==='haku'?'var(--blue)':'var(--pink)';
}

function renderHome(){
  setIdentityLabel();
  const reviews=month().reviews;
  const hakuSubmitted=cloudSubmissionStatus?cloudSubmissionStatus.haku:Boolean(reviews.haku);
  const risaSubmitted=cloudSubmissionStatus?cloudSubmissionStatus.risa:Boolean(reviews.risa);
  const count=Number(hakuSubmitted)+Number(risaSubmitted);
  const both=hakuSubmitted&&risaSubmitted;
  document.querySelector('#dateLabel').textContent=`今月の契約 / 本月契约 · ${now.getFullYear()}年${now.getMonth()+1}月`;
  document.querySelector('#progressText').textContent=`${count} / 2 提出済み / 已提交`;
  document.querySelector('#statusText').textContent=both?'回答公開済み / 双方已公开':'契約進行中 / 契约进行中';
  document.querySelector('#hakuState').textContent=hakuSubmitted?'封印済み / 已封存 ✓':'記入待ち / 等待填写';
  document.querySelector('#risaState').textContent=risaSubmitted?'封印済み / 已封存 ✓':'記入待ち / 等待填写';
  document.querySelector('#dayNumber').textContent=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  document.querySelector('#monthNumber').textContent=`${now.getMonth()+1}月`;
  const knownDays=relationshipDays(metDate),loveDays=relationshipDays(datingDate);
  document.querySelector('#knownDays').textContent=knownDays;
  document.querySelector('#knownDaysCn').textContent=knownDays;
  document.querySelector('#loveDays').textContent=loveDays;
  document.querySelector('#loveDaysCn').textContent=loveDays;
  const button=document.querySelector('#startReview');
  if(both&&reviews.haku&&reviews.risa){
    button.innerHTML='ふたりの回答を見る / 查看双方回顾 <span>→</span>';
    button.onclick=()=>openResult(monthKey);
  }else if(currentPerson==='haku'?hakuSubmitted:risaSubmitted){
    button.innerHTML='回答は封印済み · 相手を待っています / 已封存 · 等待对方 <span>♡</span>';
    button.onclick=()=>showToast('相手が提出した後、同時に公開されます / 对方提交后同时公开');
  }else{
    button.innerHTML='今月の振り返りを始める / 开始月度回顾 <span>→</span>';
    button.onclick=startReview;
  }
  renderHistory();
  renderScoreDashboard();
}

function renderHistory(){
  const list=document.querySelector('#historyList');
  const completed=Object.entries(data.months)
    .filter(([,value])=>value.reviews?.haku&&value.reviews?.risa)
    .sort(([a],[b])=>b.localeCompare(a));
  if(!completed.length){list.innerHTML='<div class="empty-history">ふたりで完成した毎月の契約が、時系列でここに保存されます。<br>双方完成的每月契约都会按时间保存在这里。</div>';return;}
  list.innerHTML=completed.map(([key,value])=>{
    const [year,monthNumber]=key.split('-');
    const average=(categories.reduce((sum,category)=>sum+scoreFor(value.reviews.haku,category)+scoreFor(value.reviews.risa,category),0)/12).toFixed(1);
    const renewed=[value.reviews.haku.renew,value.reviews.risa.renew].every(isPositive);
    const status=renewed?'更新完了 / 续约完成 ♡':'話し合い / 需要沟通';
    return `<button type="button" class="history-item history-button" data-history-month="${key}"><div><b>${year}年${+monthNumber}月 · ふたりの契約 / 双人契约</b><p>ふたりの平均 / 共同平均 ${average} 点 · タップして詳しく見る / 点击查看完整记录</p></div><span class="badge">${status}<i>→</i></span></button>`;
  }).join('');
  list.querySelectorAll('[data-history-month]').forEach(button=>button.addEventListener('click',()=>openResult(button.dataset.historyMonth)));
}

function openResult(key=monthKey){
  const reviews=data.months[key]?.reviews;
  if(!reviews?.haku||!reviews?.risa)return showToast('まだふたりの提出が揃っていません / 双方尚未全部提交');
  resultMonthKey=key;
  showView('result');
}

function renderScoreDashboard(){
  const reviews=month().reviews;
  const both=reviews.haku&&reviews.risa;
  document.querySelector('#hakuTotal').textContent=both?reviewAverage(reviews.risa).toFixed(1):'—';
  document.querySelector('#risaTotal').textContent=both?reviewAverage(reviews.haku).toFixed(1):'—';
  const completed=Object.entries(data.months)
    .filter(([,value])=>value.reviews?.haku&&value.reviews?.risa)
    .sort(([a],[b])=>a.localeCompare(b));
  const chart=document.querySelector('#trendChart');
  if(!completed.length){chart.innerHTML='<div class="trend-empty">ふたりが提出した最初の月から、グラフが始まります。<br>双方完成第一个月的提交后，走势图会从这里开始。</div>';return;}
  const width=600,height=220,left=45,right=560,top=20,bottom=175;
  const xAt=index=>completed.length===1?(left+right)/2:left+index*((right-left)/(completed.length-1));
  const yAt=value=>bottom-((value-1)/9)*(bottom-top);
  const hakuPoints=completed.map(([,value],index)=>[xAt(index),yAt(reviewAverage(value.reviews.risa)),reviewAverage(value.reviews.risa)]);
  const risaPoints=completed.map(([,value],index)=>[xAt(index),yAt(reviewAverage(value.reviews.haku)),reviewAverage(value.reviews.haku)]);
  const pathFor=points=>points.map(([x,y],index)=>`${index?'L':'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const grid=[2,4,6,8,10].map(value=>`<line x1="${left}" y1="${yAt(value)}" x2="${right}" y2="${yAt(value)}" stroke="#eee5df" stroke-width="1"/><text x="${left-13}" y="${yAt(value)+4}" text-anchor="middle" fill="#a69a96" font-size="9">${value}</text>`).join('');
  const monthLabels=completed.map(([key],index)=>`<text x="${xAt(index)}" y="204" text-anchor="middle" fill="#817775" font-size="9">${+key.split('-')[1]}月</text>`).join('');
  const dots=(points,color)=>points.map(([x,y,value])=>`<circle cx="${x}" cy="${y}" r="4.5" fill="${color}"/><text x="${x}" y="${y-9}" text-anchor="middle" fill="${color}" font-size="9" font-weight="700">${value.toFixed(1)}</text>`).join('');
  chart.innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="はくとりさの月間スコア推移 / 两人的月度得分走势">${grid}<path d="${pathFor(hakuPoints)}" fill="none" stroke="#789fa5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="${pathFor(risaPoints)}" fill="none" stroke="#c8797b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots(hakuPoints,'#789fa5')}${dots(risaPoints,'#c8797b')}${monthLabels}</svg>`;
}

function startReview(){
  if(window.TsukimusubiCloud&&!window.TsukimusubiCloud.isPaired()){
    window.TsukimusubiCloud.openSetup();
    return;
  }
  document.querySelector('#reviewerName').textContent=names[currentPerson];
  document.querySelector('#reviewForm').reset();
  document.querySelector('#scores').innerHTML=categories.map((category,index)=>`<div class="score-row"><label>${category.ja}<small class="translation">${category.zh}</small></label><input type="range" name="score${index}" min="1" max="10" value="8"><output class="score-value">8</output></div>`).join('');
  document.querySelectorAll('.score-row input').forEach(input=>input.addEventListener('input',()=>input.nextElementSibling.textContent=input.value));
  showView('review');
}

document.querySelector('#reviewForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(month().reviews[currentPerson])return showToast('この回答は封印済みです / 这份回顾已经封存');
  const formData=new FormData(event.target);
  const scores={};
  categories.forEach((category,index)=>scores[category.key]=+formData.get(`score${index}`));
  const review={scores,renew:formData.get('renew'),submittedAt:new Date().toISOString()};
  fields.forEach(([key])=>review[key]=formData.get(key).trim());
  const submitButton=event.target.querySelector('[type="submit"]');
  submitButton.disabled=true;
  try{
    if(window.TsukimusubiCloud?.isPaired()){
      await window.TsukimusubiCloud.submitReview(review);
    }else{
      month().reviews[currentPerson]=review;
      save();
    }
    showView('home');
    showToast('回答を安全に封印しました / 回顾已安全封存 ♡');
  }catch(error){
    showToast(`保存できませんでした / 保存失败：${error.message||error}`);
  }finally{submitButton.disabled=false;}
});

function renderResult(){
  const selectedMonth=data.months[resultMonthKey];
  const {haku,risa}=selectedMonth?.reviews||{};
  if(!haku||!risa){showView('home');return;}
  const [resultYear,resultMonthNumber]=resultMonthKey.split('-');
  const positive=[haku.renew,risa.renew].every(isPositive);
  document.querySelector('#resultHero').innerHTML=`<span class="eyebrow">${resultYear}年${+resultMonthNumber}月 · ${positive?'AGREEMENT RENEWED':'A CONVERSATION FIRST'}</span><h1>${positive?'来月も、よろしくね ♡<small class="translation">下个月，也请继续相爱</small>':'まずは、ゆっくり話そう<small class="translation">先停下来，好好听彼此说话</small>'}</h1><p>はく：${escapeHtml(renewText(haku.renew))}<br>りさ：${escapeHtml(renewText(risa.renew))}</p>`;
  document.querySelector('#scoreCompare').innerHTML=categories.map(category=>`<div class="score-box"><span>${category.ja}<small class="translation">${category.zh}</small></span><strong>${((scoreFor(haku,category)+scoreFor(risa,category))/2).toFixed(1)}</strong><small>はく ${scoreFor(haku,category)} · りさ ${scoreFor(risa,category)}</small></div>`).join('');
  document.querySelector('#wordsCompare').innerHTML=['haku','risa'].map(person=>`<article class="words-person"><h2>${names[person]} から、ふたりへ<small class="translation">${names[person]} 写给我们的</small></h2>${fields.map(([key,ja,zh])=>`<div class="quote-block"><span>${ja} / ${zh}</span><p>${escapeHtml(selectedMonth.reviews[person][key])}</p></div>`).join('')}</article>`).join('');
}

function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
document.querySelector('#resetData').addEventListener('click',async()=>{
  if(confirm('月間レビューをリセットしますか？写真は残ります。\n确定重置月度回顾吗？照片会保留。')){
    try{
      if(window.TsukimusubiCloud?.isPaired()){
        await window.TsukimusubiCloud.resetMonth();
      }else{
        data.months[monthKey]={reviews:{}};
        save();
        renderHome();
      }
      showToast('レビューをリセットしました / 月度回顾已重置');
    }catch(error){showToast(`リセットできません / 重置失败：${error.message||error}`);}
  }
});

const albumDbPromise=new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(new Error('IndexedDB unavailable'));return;}
  const request=indexedDB.open('tsukimusubi-album',1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('photos'))request.result.createObjectStore('photos',{keyPath:'id'});};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});

async function albumTransaction(mode,action){
  const database=await albumDbPromise;
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction('photos',mode);
    const store=transaction.objectStore('photos');
    const request=action(store);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function renderAlbum(){
  const grid=document.querySelector('#albumGrid');
  try{
    const cloudActive=Boolean(window.TsukimusubiCloud?.isPaired());
    const photos=cloudActive
      ? await window.TsukimusubiCloud.listPhotos()
      : await albumTransaction('readonly',store=>store.getAll());
    photos.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    if(!photos.length){grid.innerHTML='<div class="album-empty">まだ写真はありません。ふたりの最初の一枚を追加してみよう。<br>还没有照片，添加属于你们的第一张回忆吧。</div>';return;}
    grid.innerHTML=photos.map(photo=>`<article class="photo-card"><img src="${escapeHtml(photo.data)}" alt="${escapeHtml(photo.name)}"><div class="photo-meta"><span>${escapeHtml(photo.name)} · ${new Date(photo.createdAt).toLocaleDateString('ja-JP')}</span><button class="photo-delete" data-photo-id="${photo.id}" data-photo-path="${escapeHtml(photo.path||'')}" aria-label="写真を削除 / 删除照片">×</button></div></article>`).join('');
    document.querySelectorAll('.photo-delete').forEach(button=>button.addEventListener('click',()=>deletePhoto(button.dataset.photoId,button.dataset.photoPath)));
  }catch(error){grid.innerHTML='<div class="album-error">このブラウザではアルバムを保存できません。 / 当前浏览器无法保存相册。</div>';}
}

function compressPhoto(file){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    const objectUrl=URL.createObjectURL(file);
    image.onload=()=>{
      const maxSize=1400,scale=Math.min(1,maxSize/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
      const context=canvas.getContext('2d');
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      URL.revokeObjectURL(objectUrl);resolve(canvas.toDataURL('image/jpeg',.82));
    };
    image.onerror=()=>{URL.revokeObjectURL(objectUrl);reject(new Error('Image load failed'));};
    image.src=objectUrl;
  });
}

async function addPhotos(files){
  if(window.TsukimusubiCloud&&!window.TsukimusubiCloud.isPaired()){
    window.TsukimusubiCloud.openSetup();
    return;
  }
  const selected=[...files].slice(0,6);
  if(!selected.length)return;
  showToast('写真を保存しています / 正在保存照片…');
  try{
    for(const file of selected){
      if(!file.type.startsWith('image/'))continue;
      const dataUrl=await compressPhoto(file);
      const photoName=file.name.replace(/\.[^.]+$/,'');
      if(window.TsukimusubiCloud?.isPaired()){
        await window.TsukimusubiCloud.uploadPhoto({name:photoName,dataUrl});
      }else{
        await albumTransaction('readwrite',store=>store.put({id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,name:photoName,data:dataUrl,createdAt:new Date().toISOString(),addedBy:currentPerson}));
      }
    }
    await renderAlbum();showToast('アルバムに追加しました / 已添加到相册 ♡');
  }catch(error){showToast('保存できませんでした / 照片保存失败');}
}

async function deletePhoto(id,path=''){
  if(!confirm('この写真を削除しますか？\n确定删除这张照片吗？'))return;
  try{
    if(window.TsukimusubiCloud?.isPaired())await window.TsukimusubiCloud.deletePhoto({id,path});
    else await albumTransaction('readwrite',store=>store.delete(id));
    await renderAlbum();showToast('写真を削除しました / 已删除照片');
  }catch(error){showToast('削除できませんでした / 删除失败');}
}

document.querySelector('#addPhotos').addEventListener('click',()=>{
  if(window.TsukimusubiCloud&&!window.TsukimusubiCloud.isPaired())return window.TsukimusubiCloud.openSetup();
  document.querySelector('#photoInput').click();
});
document.querySelector('#photoInput').addEventListener('change',event=>{addPhotos(event.target.files);event.target.value='';});

function applyCloudState({role,months,submissionStatus}){
  cloudIdentityLocked=true;
  cloudSubmissionStatus=submissionStatus;
  currentPerson=role;
  localStorage.setItem('contract-person',role);
  data={months};
  data.months[monthKey]||={reviews:{}};
  const notice=document.querySelector('#albumNotice');
  notice.classList.add('cloud-active');
  notice.innerHTML='写真は暗号化通信でプライベートクラウドに保存され、ふたりの端末で同期されます。<br><span>照片通过加密连接保存在私密云端，并在两个人的设备间同步。</span>';
  renderHome();
}

function setCloudUnpaired(){
  cloudIdentityLocked=true;
  cloudSubmissionStatus=null;
  currentPerson='haku';
  setIdentityLabel();
}

window.TsukimusubiApp={
  monthKey,
  showToast,
  renderAlbum,
  applyCloudState,
  setCloudUnpaired,
  escapeHtml
};
renderHome();
renderAlbum();
initializeLine();
