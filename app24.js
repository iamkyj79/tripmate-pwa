// v45: dynamically resolve each itinerary attraction to its own Wikipedia article and representative image.
const PLACE_LOOKUPS={
  '천안문 광장':{ko:'천안문 광장',en:'Tiananmen Square',zh:'天安门广场'},
  '자금성(고궁박물원)':{ko:'자금성',en:'Forbidden City',zh:'故宫'},
  '경산공원(징산공원)':{ko:'징산 공원',en:'Jingshan Park',zh:'景山公园'},
  '자금성 전경 감상':{ko:'자금성',en:'Forbidden City',zh:'故宫'},
  '이화원':{ko:'이화원',en:'Summer Palace',zh:'颐和园'},
  '유니버설 베이징 리조트':{ko:'유니버설 스튜디오 베이징',en:'Universal Studios Beijing',zh:'北京环球度假区'},
  '전문대가리·다스란':{ko:'전문대가',en:'Qianmen',zh:'前门大街'},
  '왕푸징 거리':{ko:'왕푸징',en:'Wangfujing',zh:'王府井'},
  '천단공원':{ko:'천단',en:'Temple of Heaven',zh:'天坛'},
};
const VERIFIED_PLACE_IMAGES={
  '이화원':'https://upload.wikimedia.org/wikipedia/commons/d/db/Longevity_Hill_of_the_Summer_Palace.jpg',
  '유니버설 베이징 리조트':'https://upload.wikimedia.org/wikipedia/commons/c/c6/Beijing_universal_entrance.jpg',
};

function cleanGuidePlaceName(value){
  return String(value||'').replace(/\([^)]*(?:관람|감상|여행|일정)[^)]*\)/g,' ').replace(/(?:관람|탐방|방문|감상|산책|투어|체험|이동|일몰|야경|휴식)/gi,' ').replace(/\s+/g,' ').trim();
}
function automaticGuidesForItem(item){
  const known=guidesForItem(item);
  const isGeneric=known.length===1&&!ATTRACTION_GUIDES.some(value=>value.title===known[0].title);
  if(!isGeneric)return known.map(guide=>({...guide,searchName:PLACE_LOOKUPS[guide.title]?.ko||guide.title}));
  const safePlace=cleanGuidePlaceName(item.place||'').slice(0,80);
  if(!safePlace)return [{...known[0],searchDisabled:true,image:null,summary:'장소 정보가 없어 외부 검색을 실행하지 않았습니다. 일정 수정에서 관광지 장소명을 입력해 주세요.'}];
  const names=[...new Set(safePlace.split(/\s+(?:및|그리고|와|과)\s+|[&/+·]/).map(cleanGuidePlaceName).filter(value=>value.length>1))];
  return names.map(name=>({...known[0],title:name,searchName:name,summary:`${name}에 대한 여행 안내자료를 불러오고 있습니다.`}));
}
function wikiSentences(text){
  return String(text||'').replace(/\s+/g,' ').trim().match(/[^.!?。！？]+[.!?。！？]?/g)||[];
}
function normalizedGuideTerm(value){
  return String(value||'').toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'');
}
function validWikiPage(page){return page&&!page.missing&&String(page.extract||'').length>80}
async function wikiExact(language,title){
  const params=new URLSearchParams({action:'query',format:'json',origin:'*',titles:title,prop:'extracts|pageimages|info',exintro:'1',explaintext:'1',piprop:'thumbnail',pithumbsize:'1400',inprop:'url',redirects:'1'});
  const response=await fetch(`https://${language}.wikipedia.org/w/api.php?${params}`);
  if(!response.ok)throw Error('Wikipedia lookup failed');
  const data=await response.json();
  return Object.values(data?.query?.pages||{}).find(validWikiPage)||null;
}
async function wikiSearch(language,term,expectedTitle,city){
  const params=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',gsrsearch:term,gsrlimit:'5',prop:'extracts|pageimages|info',exintro:'1',explaintext:'1',piprop:'thumbnail',pithumbsize:'1400',inprop:'url',redirects:'1'});
  const response=await fetch(`https://${language}.wikipedia.org/w/api.php?${params}`);
  if(!response.ok)throw Error('Wikipedia search failed');
  const data=await response.json();
  const expected=normalizedGuideTerm(expectedTitle),cityKey=normalizedGuideTerm(city);
  const ranked=Object.values(data?.query?.pages||{}).filter(validWikiPage).map(page=>{
    const title=normalizedGuideTerm(page.title);
    let score=title===expected?100:title.includes(expected)?75:expected.includes(title)&&title.length>=3?55:0;
    if(cityKey&&title===cityKey&&title!==expected)score=-100;
    return {page,score};
  }).sort((a,b)=>b.score-a.score||(a.page.index||99)-(b.page.index||99));
  return ranked[0]?.score>=55?ranked[0].page:null;
}
function usablePageImage(page){
  const source=page?.thumbnail?.source||'';
  if(!source)return null;
  let decoded=source;try{decoded=decodeURIComponent(source)}catch(_){}
  return /(?:map|locator|location_map|administrative|flag|seal|logo|emblem|diagram)/i.test(decoded)?null:source;
}
async function commonsImage(term){
  try{
    const params=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',gsrsearch:`${term} ${trip.destination||''}`,gsrnamespace:'6',gsrlimit:'8',prop:'imageinfo',iiprop:'url',iiurlwidth:'1400'});
    const response=await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);if(!response.ok)return null;
    const data=await response.json();
    const blocked=/map|logo|icon|diagram|flag|seal|poster/i;
    const page=Object.values(data?.query?.pages||{}).sort((a,b)=>(a.index||99)-(b.index||99)).find(value=>!blocked.test(value.title||'')&&value.imageinfo?.[0]?.thumburl);
    return page?.imageinfo?.[0]?.thumburl||null;
  }catch(_){return null}
}
async function resolveAccurateGuide(guide){
  if(guide.searchDisabled)return {...guide,loadFailed:true};
  const city=String(trip.destination||'').slice(0,80);
  const place=String(guide.searchName||guide.title||'').slice(0,80);
  const lookup=PLACE_LOOKUPS[guide.title]||{ko:place,en:place,zh:place};
  let page=null,language='ko';
  for(const lang of ['ko','en','zh']){
    const exactTitle=lookup[lang]||lookup.ko;
    try{
      page=await wikiExact(lang,exactTitle);
      if(!page)page=await wikiSearch(lang,`${exactTitle} ${city}`.trim(),exactTitle,city);
      if(page){language=lang;break}
    }catch(_){}
  }
  if(!page)return {...guide,image:VERIFIED_PLACE_IMAGES[guide.title]||null,loadFailed:true};
  const sentences=wikiSentences(page.extract),summary=sentences.slice(0,2).join(' ').slice(0,430);
  const facts=sentences.slice(2,5).map(value=>value.trim()).filter(value=>value.length>20);
  let image=VERIFIED_PLACE_IMAGES[guide.title]||usablePageImage(page);
  if(!image)image=await commonsImage(lookup.en||lookup.ko);
  return {...guide,title:guide.title,summary:summary||guide.summary,points:facts.length?facts:guide.points,image,sourceUrl:page.fullurl||`https://${language}.wikipedia.org/?curid=${page.pageid}`,sourceLabel:`Wikipedia · ${page.title}`,loadFailed:false};
}
function accurateGuideCard(guide,index,total){
  const image=guide.image?`<img src="${e(guide.image)}" alt="${e(guide.title)} 실제 관광지 사진" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('guide-image-error');this.remove()">`:`<div class="guide-image-placeholder">사진 자료를 정확히 확인하지 못했습니다.</div>`;
  return `<section class="place-guide-card">${total>1?`<div class="guide-sequence"><span>${index+1}</span><b>${e(guide.title)}</b></div>`:''}<div class="place-guide-hero">${image}<div class="place-guide-overlay"><span>${e(guide.eyebrow||'PLACE GUIDE')}</span><h2>${e(guide.title)}</h2></div></div><div class="place-guide-feed"><section class="guide-lead"><span class="guide-badge">${guide.loadFailed?'확인 필요':'장소 확인 완료'}</span><h3>${e(guide.summary)}</h3>${guide.sourceUrl?`<a class="guide-source" href="${e(guide.sourceUrl)}" target="_blank" rel="noopener">자료 출처 확인 ↗</a>`:''}</section><section class="guide-story"><div class="guide-story-index">01</div><div><b>주요 안내</b><ul>${guide.points.map(point=>`<li>${e(point)}</li>`).join('')}</ul></div></section><section class="guide-story"><div class="guide-story-index">02</div><div><b>일정에 적용할 팁</b><p>${e(guide.tip)}</p></div></section></div></section>`;
}
window.openAttractionGuide=async function(id){
  const item=(window._i||[]).find(value=>value.id===id);if(!item)return;
  const candidates=automaticGuidesForItem(item);
  $('scheduleModalTitle').textContent='관광지 안내';
  $('scheduleModalBody').innerHTML=`<div class="guide-loading"><span></span><b>${e(candidates.map(x=>x.title).join(' · '))}</b><p>관광지 설명과 실제 사진을 확인하고 있습니다.</p></div>`;
  $('scheduleModal').classList.remove('hidden');
  const guides=await Promise.all(candidates.map(resolveAccurateGuide));
  if($('scheduleModal').classList.contains('hidden'))return;
  $('scheduleModalBody').innerHTML=`<article class="place-guide">${guides.length>1?`<div class="combined-guide-heading"><span>복합 일정 안내</span><b>${guides.length}개 장소를 각각 확인했습니다.</b></div>`:''}${guides.map((guide,index)=>accurateGuideCard(guide,index,guides.length)).join('')}<section class="guide-story guide-live guide-final-check"><div class="guide-story-index">✓</div><div><b>방문 전 최종 확인</b><p>운영시간, 휴관일, 예약 및 입장 조건은 방문 직전에 공식 홈페이지에서 확인해 주세요.</p></div></section></article>`;
};
