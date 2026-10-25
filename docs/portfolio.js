// Resolve optional video support beside this script, including GitHub project subpaths.
const portfolioBaseUrl=new URL('.',document.currentScript.src);

const year=document.getElementById('year');if(year)year.textContent=new Date().getFullYear();
const ua=navigator.userAgent;const device=/Android/i.test(ua)?'google':(/iPad|iPhone|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))?'apple':null;
document.querySelectorAll('.download-link[data-store]').forEach(a=>{if(device&&a.dataset.store===device){a.classList.add('recommended');a.setAttribute('aria-label',a.textContent+'，適合目前裝置')}});
document.querySelectorAll('.device-note').forEach(p=>{const section=p.closest('section')||document;const matching=section.querySelector('[data-store="'+device+'"]');p.textContent=device?(matching?'已突出顯示適合你裝置的商店入口。':'此作品暫未列出適合目前裝置的平台；請查看商店支援資訊。'):'使用電腦？可掃描下方 QR Code，在手機開啟對應商店。'});
let platform='all',category='all',visibleLimit=12;const search=document.getElementById('app-search');
function update(){if(!search)return;const q=search.value.trim().toLocaleLowerCase();const matches=[];document.querySelectorAll('.real-card').forEach(c=>{const match=(platform==='all'||c.dataset.platform.split(' ').includes(platform))&&(category==='all'||c.dataset.category===category)&&(c.dataset.name+' '+c.dataset.category).toLocaleLowerCase().includes(q);c.hidden=true;if(match)matches.push(c)});matches.slice(0,visibleLimit).forEach(c=>c.hidden=false);document.getElementById('app-count').textContent=matches.length+' 個作品';document.getElementById('empty-apps').hidden=matches.length!==0;const more=document.getElementById('load-more');if(more){more.hidden=matches.length<=visibleLimit;more.textContent='顯示更多 App（還有 '+Math.max(0,matches.length-visibleLimit)+' 個）↓'}}
function bindFilters(attribute,set){const bs=document.querySelectorAll('['+attribute+']');bs.forEach(b=>b.addEventListener('click',()=>{visibleLimit=12;set(b.getAttribute(attribute));bs.forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});update()}))}
bindFilters('data-platform-filter',v=>platform=v);bindFilters('data-category-filter',v=>category=v);if(search)search.addEventListener('input',()=>{visibleLimit=12;update()});const more=document.getElementById('load-more');if(more)more.addEventListener('click',()=>{visibleLimit+=12;update()});update();
const share=document.getElementById('share-app');if(share)share.addEventListener('click',async()=>{const status=document.getElementById('share-status');try{await navigator.clipboard.writeText(location.href);status.textContent='已複製作品連結。'}catch{status.textContent='可複製瀏覽器網址列分享此作品。'}});
// No analytics requests are made without a configured service and visitor consent.
const id=window.PORTFOLIO_ANALYTICS?.measurementId;if(/^G-[A-Z0-9]+$/.test(id||'')){const box=document.createElement('div');box.style.cssText='position:fixed;bottom:15px;left:15px;right:15px;background:#163e32;color:white;padding:18px;border-radius:16px;z-index:20';box.textContent='允許匿名瀏覽與下載點擊統計，協助改善網站？ ';const yes=document.createElement('button'),no=document.createElement('button');yes.textContent='允許';no.textContent='暫不';box.append(yes,no);document.body.append(box);no.onclick=()=>box.remove();yes.onclick=()=>{window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config',id,{send_page_view:true});const tag=document.createElement('script');tag.src='https://www.googletagmanager.com/gtag/js?id='+id;tag.async=true;document.head.append(tag);box.remove();document.querySelectorAll('.download-link[data-store]').forEach(a=>a.addEventListener('click',()=>gtag('event','store_click',{app_name:a.dataset.app,store:a.dataset.store,transport_type:'beacon'})))}}



let hlsLoader;
function loadHls(){if(window.Hls)return Promise.resolve();return hlsLoader||(hlsLoader=new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=new URL('assets/hls.min.js',portfolioBaseUrl).href;tag.onload=resolve;tag.onerror=reject;document.head.append(tag)}))}
document.querySelectorAll('.load-video').forEach(b=>b.addEventListener('click',async()=>{const host=b.closest('[data-video],[data-preview]');if(!host)return;
if(host.dataset.preview){const player=document.createElement('video');player.controls=true;player.playsInline=true;player.preload='none';player.setAttribute('aria-label',host.dataset.title||'App 預覽影片');host.replaceChildren(player);let failed=false;function fail(){if(failed)return;failed=true;const note=document.createElement('p');note.style.cssText='color:white;position:absolute;inset:20px;background:#163e32;padding:20px;border-radius:12px;height:fit-content';note.setAttribute('role','status');note.textContent='暫時無法播放，請使用下方的影片、YouTube 或 App Store 連結。';host.append(note)}
player.addEventListener('error',fail);const src=host.dataset.preview;
if(!src.includes('.m3u8')||player.canPlayType('application/vnd.apple.mpegurl')){player.src=src;player.play().catch(()=>{});}else{try{await loadHls();if(!window.Hls.isSupported()){fail();return}const hls=new window.Hls();hls.loadSource(src);hls.attachMedia(player);hls.on(window.Hls.Events.MANIFEST_PARSED,()=>player.play().catch(()=>{}));hls.on(window.Hls.Events.ERROR,(_,data)=>{if(data.fatal){hls.destroy();fail()}})}catch{fail()}}}
else{const frame=document.createElement('iframe');frame.src='https://www.youtube-nocookie.com/embed/'+host.dataset.video+'?autoplay=1&rel=0';frame.title=host.dataset.title||'App 作品介紹影片';frame.style.cssText='width:100%;height:100%;border:0';frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;host.replaceChildren(frame)}}));

// Prioritize the most recently updated apps; retain search, category filters and pagination.
(async function sortByUpdatedAppDate(){const grid=document.querySelector('.catalog-grid');if(!grid)return;try{const response=await fetch(new URL('apps.json',portfolioBaseUrl));if(!response.ok)return;const apps=await response.json();const dates=new Map(apps.map(a=>[a.id,a.updated||'']));const cards=[...grid.querySelectorAll('.real-card')];for(const c of cards){const match=c.querySelector('a[href*="apps/app-"]')?.getAttribute('href')?.match(/app-\d+/);c.dataset.updated=match?dates.get(match[0])||'':'';}cards.sort((a,b)=>b.dataset.updated.localeCompare(a.dataset.updated));cards.forEach((c,i)=>{grid.append(c);if(i<3&&c.dataset.updated){const badge=document.createElement('span');badge.className='recent-label';badge.textContent='最近更新';c.append(badge)}});update();}catch(e){console.warn('Catalog fallback ordering',e)}})();

// Prefer official Apple App Store icons for works with an Apple listing.
// Query Apple's public iTunes Lookup API at run-time; retain local image as offline fallback.
(async function hydrateOfficialAppleIcons(){
  const isDetail=/\/apps\/app-\d+\.html$/i.test(location.pathname);
  const indexUrl=new URL('apps.json',portfolioBaseUrl);
  let catalog;
  try{
    const response=await fetch(indexUrl);
    if(!response.ok)return;
    catalog=await response.json();
  }catch{return}
  const entries=catalog.map(a=>{
    const match=(a.links?.apple||'').match(/\/id(\d+)/);
    return match?{app:a,storeId:match[1]}:null;
  }).filter(Boolean);
  if(!entries.length)return;
  const ids=[...new Set(entries.map(e=>e.storeId))];
  function applyArtwork(results){
    const artwork=new Map(results.filter(x=>x.trackId&&x.artworkUrl512).map(x=>[String(x.trackId),x.artworkUrl512]));
    for(const {app,storeId} of entries){
      const url=artwork.get(storeId);
      if(!url || !url.startsWith('https://'))continue;
      // App Store assets are only assigned after official lookup returns the matching track ID.
      const targets=[];
      document.querySelectorAll('article.real-card').forEach(card=>{
        const link=card.querySelector('a[href*="apps/app-"]');
        if(link?.getAttribute('href')?.includes(app.id+'.html'))targets.push(...card.querySelectorAll('.compact-top img,.new-app-icon'));
      });
      if(isDetail && location.pathname.endsWith('/'+app.id+'.html')){
        targets.push(...document.querySelectorAll('.detail-hero img'));
        targets.push(...document.querySelectorAll('.detail-emblem'));
      }
      for(const element of targets){
        const img=element.tagName==='IMG'?element:document.createElement('img');
        if(img!==element){img.width=58;img.height=58;img.alt=app.name+' Apple App Store 圖示';element.replaceWith(img)}
        const fallback=img.getAttribute('src');
        img.onerror=()=>{img.onerror=null;if(fallback)img.src=fallback;else img.style.visibility='hidden'};
        img.src=url;
        img.alt=app.name+' — Apple App Store 官方圖示';
        img.loading='lazy';
      }
    }
  }
  async function fetchBatch(batch){
    const api='https://itunes.apple.com/lookup?country=hk&id='+batch.join(',');
    try{
      const r=await fetch(api);
      if(!r.ok)throw Error('Apple lookup unavailable');
      return (await r.json()).results||[];
    }catch{
      // Apple's lookup service also supports JSONP for restrictive browser CORS environments.
      return await new Promise(resolve=>{
        const callback='lamlamAppleIcons'+Math.random().toString(36).slice(2);
        const script=document.createElement('script');
        let resolved=false;
        function finish(rows){if(resolved)return;resolved=true;delete window[callback];script.remove();resolve(rows||[])}
        window[callback]=data=>finish(data?.results);
        script.onerror=()=>finish([]);
        script.src=api+'&callback='+callback;
        document.head.append(script);
        setTimeout(()=>finish([]),7500);
      });
    }
  }
  const results=[];
  for(let n=0;n<ids.length;n+=25)results.push(...await fetchBatch(ids.slice(n,n+25)));
  applyArtwork(results);
  syncAppleStoreCategories(results);
})();


// Apple App Store is the classification authority for every iOS app where official metadata is available.
function syncAppleStoreCategories(results){
 const genres={6000:'商業',6001:'天氣',6002:'工具程式',6003:'旅遊',6004:'運動',6005:'社交網絡',6006:'參考',6007:'生產力工具',6008:'相片與影片',6009:'新聞',6010:'導航',6011:'音樂',6012:'生活風格',6013:'健康與健身',6014:'遊戲',6015:'財經',6016:'娛樂',6017:'教育',6018:'書籍',6020:'醫療',6021:'雜誌與報紙',6023:'美食佳飲',6024:'購物',6026:'開發者工具',6027:'圖像與設計'};
 const categories=new Map(results.filter(r=>r.trackId&&r.primaryGenreId).map(r=>[String(r.trackId),genres[Number(r.primaryGenreId)]||r.primaryGenreName]));
 const appleApps=new Map();
 document.querySelectorAll('.real-card').forEach(card=>{
   const href=card.querySelector('a[href*="apps/app-"]')?.getAttribute('href')||'';
   const appId=href.match(/app-\\d+/)?.[0];if(appId)appleApps.set(appId,card);
 });
 // Do not guess classifications for an unavailable App Store listing.
 fetch(new URL('apps.json',portfolioBaseUrl)).then(r=>r.ok?r.json():[]).then(apps=>{
   let official=0;
   for(const app of apps){const id=(app.links?.apple||'').match(/\\/id(\\d+)/)?.[1];if(!id)continue;
     const genre=categories.get(id),card=appleApps.get(app.id);if(!genre||!card)continue;
     card.dataset.category=genre;card.dataset.categorySource='apple';official++;
   }
   if(!official)return;
   const bar=document.querySelector('.category-bar');
   if(bar){
     const values=[...new Set([...document.querySelectorAll('.real-card')].map(c=>c.dataset.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
     // Existing filter listeners are attached to old buttons; provide equivalent listeners on replacements.
     bar.replaceChildren();
     for(const name of ['all',...values]){const b=document.createElement('button');b.type='button';b.dataset.categoryFilter=name;b.textContent=name==='all'?'所有分類':name;b.className=name==='all'?'active':'';b.setAttribute('aria-pressed',String(name==='all'));b.addEventListener('click',()=>{category=name;visibleLimit=12;bar.querySelectorAll('button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});update()});bar.append(b)}
   }
   category='all';visibleLimit=12;update();
   const note=document.querySelector('.catalog-note .note');if(note)note.append(' 分類以 Apple App Store 官方資料為優先；Apple 分類不可取得或只有 Android 版本時保留原有分類。');
 }).catch(()=>{});
}
