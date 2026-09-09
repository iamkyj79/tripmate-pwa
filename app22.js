// v41: repair zero-valued route legs and show attraction guides in a visual news-feed modal.
const ATTRACTION_GUIDES = [
  {match:/천안문|톈안먼|tiananmen/i,eyebrow:'BEIJING · HISTORIC LANDMARK',title:'천안문 광장',image:'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=1400&q=85',summary:'베이징 중심축의 출발점이자 중국 현대사를 상징하는 대규모 광장입니다.',points:['광장 북쪽의 천안문 성루와 남쪽의 정양문을 함께 보면 베이징 옛 도성의 축을 이해하기 좋습니다.','자금성과 이어서 관람하면 이동 동선이 자연스럽습니다.','신분증 확인과 보안 검색에 시간이 걸릴 수 있어 여유 있게 이동하세요.'],tip:'넓은 야외 공간이므로 편한 신발과 계절에 맞는 햇빛·방한 대비가 필요합니다.'},
  {match:/자금성|고궁|forbidden city|palace museum/i,exclude:/전경|파노라마|panorama|overlook/i,eyebrow:'BEIJING · WORLD HERITAGE',title:'자금성(고궁박물원)',image:'https://images.unsplash.com/photo-1584646098378-0874589d76b1?auto=format&fit=crop&w=1400&q=85',summary:'명·청 왕조의 황궁으로, 거대한 궁궐 축과 전각을 따라 중국 황실 건축과 생활 문화를 살펴볼 수 있습니다.',points:['오문에서 신무문 방향으로 이동하는 일방향 관람 동선을 기준으로 계획하면 편합니다.','태화전·중화전·보화전은 중심축의 핵심 전각입니다.','전각뿐 아니라 동서쪽 궁원과 보물관까지 보려면 충분한 관람 시간을 확보하세요.'],tip:'입장 정책과 운영시간은 변동될 수 있으므로 방문 전 공식 안내와 예약 상태를 확인하세요.'},
  {match:/경산공원|징산공원|jingshan/i,eyebrow:'BEIJING · CITY VIEW',title:'경산공원(징산공원)',image:'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=1400&q=85',summary:'자금성 북쪽의 경산을 중심으로 조성된 공원으로, 베이징 중심축과 옛 도성의 구조를 내려다보기 좋은 장소입니다.',points:['공원 정상의 만춘정은 자금성 전경을 바라보는 대표 전망 지점입니다.','자금성 신무문에서 이어 방문하면 이동 동선이 짧고 자연스럽습니다.','정상까지 계단과 경사가 있으므로 편한 신발을 준비하세요.'],tip:'일몰 전 미리 올라가 자리를 잡고, 하산 시간과 다음 일정까지의 이동시간도 함께 고려하세요.'},
  {match:/자금성 전경|자금성.*조망|forbidden city panorama|forbidden city overlook/i,eyebrow:'BEIJING · PANORAMA',title:'자금성 전경 감상',image:'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=1400&q=85',summary:'경산공원 정상에서 자금성의 지붕과 베이징 중심축을 한눈에 조망하는 경관 감상 일정입니다.',points:['남쪽을 바라보면 신무문에서 오문 방향으로 이어지는 자금성의 중심축이 펼쳐집니다.','해 질 무렵에는 황금빛 지붕과 도심의 색 변화가 잘 드러납니다.','광각과 망원 화각을 함께 준비하면 전체 축과 전각 세부 모습을 모두 담기 좋습니다.'],tip:'역광과 혼잡을 고려해 일몰 30~60분 전에 전망 지점에 도착하는 편이 좋습니다.'},
  {match:/첸먼|전문|qianmen|다스란/i,eyebrow:'BEIJING · OLD CITY WALK',title:'전문대가리·다스란',image:'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?auto=format&fit=crop&w=1400&q=85',summary:'정양문 남쪽으로 이어지는 베이징의 대표적인 역사 상업거리로 전통 상점과 현대적인 매장이 공존합니다.',points:['전문대가리의 보행 구간과 다스란 골목을 함께 걸으면 옛 상업지구의 분위기를 느끼기 좋습니다.','식사·간식·기념품 쇼핑을 한 동선에서 해결하기 편리합니다.','골목 안쪽은 보행자가 많아 약속 장소를 미리 정해두는 것이 좋습니다.'],tip:'추천 맛집과 쇼핑 장소를 체크하면 일별 지도 경유지에도 함께 반영됩니다.'},
  {match:/왕푸징|wangfujing/i,eyebrow:'BEIJING · CITY & SHOPPING',title:'왕푸징 거리',image:'https://images.unsplash.com/photo-1517309230475-6736d926b979?auto=format&fit=crop&w=1400&q=85',summary:'대형 백화점과 브랜드 매장, 먹거리 공간이 모인 베이징 중심부의 대표 쇼핑 거리입니다.',points:['보행자 중심 구간이라 주변 관광 일정과 묶어 이동하기 편합니다.','대형 상업시설과 전통 상점의 분위기를 비교해볼 수 있습니다.','저녁에는 조명과 유동 인구가 많아 낮과 다른 도심 분위기를 느낄 수 있습니다.'],tip:'구매 전 가격·환불 조건·결제수단을 확인하세요.'},
  {match:/천단|temple of heaven/i,eyebrow:'BEIJING · IMPERIAL ARCHITECTURE',title:'천단공원',image:'https://images.unsplash.com/photo-1599571234909-29ed5d1321d6?auto=format&fit=crop&w=1400&q=85',summary:'명·청 황제가 하늘에 제사를 올리던 제례 공간으로, 원형의 기년전과 넓은 공원 경관이 인상적입니다.',points:['기년전·황궁우·원구단을 남북축으로 이어 보면 공간 구성을 이해하기 쉽습니다.','건축의 색채와 원형·사각형 배치에는 전통적 우주관이 반영되어 있습니다.','공원 규모가 커서 입구와 출구를 이동 방향에 맞춰 정하는 것이 좋습니다.'],tip:'주요 건축물 관람권과 공원 입장권의 범위를 현장에서 다시 확인하세요.'},
  {match:/유니버설|universal/i,eyebrow:'BEIJING · THEME PARK',title:'유니버설 베이징 리조트',image:'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=85',summary:'영화와 캐릭터 세계관을 바탕으로 어트랙션·공연·테마 공간을 즐기는 대형 리조트입니다.',points:['인기 어트랙션은 오전에 우선 배치하면 대기시간 관리에 유리합니다.','공연 시간과 이동 거리를 고려해 구역별로 묶어 관람하세요.','시티워크의 식사와 쇼핑 시간을 별도로 확보하면 일정이 여유롭습니다.'],tip:'운영시간·휴장 시설·입장 조건은 방문일 공식 앱 또는 홈페이지에서 확인하세요.'},
  {match:/이화원|summer palace/i,eyebrow:'BEIJING · GARDEN & LAKE',title:'이화원',image:'https://images.unsplash.com/photo-1537531383496-f4749b8032cf?auto=format&fit=crop&w=1400&q=85',summary:'쿤밍호와 만수산을 중심으로 조성된 황실 정원으로 자연 경관과 누각·회랑이 조화를 이룹니다.',points:['장랑과 불향각, 쿤밍호를 연결해 보면 대표 경관을 효율적으로 볼 수 있습니다.','호수 주변 이동 거리가 길어 핵심 관람 지점을 먼저 정하는 편이 좋습니다.','날씨가 좋은 날에는 호수와 산의 원경을 함께 담기 좋습니다.'],tip:'전체 관람에는 시간이 많이 필요하므로 다음 일정과 이동시간을 넉넉히 잡으세요.'},
];

function attractionGuideCandidate(item) {
  const text = `${item.item_type || ''} ${item.title || ''} ${item.place || ''}`;
  return /activity|attraction|관광|관람|탐방|공원|박물관|궁|성|거리|광장|리조트/i.test(text) && !/공항|항공|숙소|호텔|식사|점심|저녁|아침|체크인|체크아웃/i.test(text);
}

const GUIDE_IMAGE_OVERRIDES = {
  '천안문 광장':'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Front_view_of_Tiananmen_gate_from_north_end_of_Tiananmen_Square.jpg/1280px-Front_view_of_Tiananmen_gate_from_north_end_of_Tiananmen_Square.jpg',
  '자금성(고궁박물원)':'https://commons.wikimedia.org/wiki/Special:FilePath/China%20(Beijing%2C%20Forbidden%20City)%20Outer%20court%20and%20the%20Hall%20of%20Supreme%20Harmony1%20(38940482985).jpg?width=1400',
  '경산공원(징산공원)':'https://chinatripedia.com/wp-content/uploads/2023/03/wanchun-pavilion-in-jingshan-park-jpg.webp',
  '자금성 전경 감상':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/2017-05-07_The_Forbidden_City.jpg/1280px-2017-05-07_The_Forbidden_City.jpg',
};

function guidesForItem(item) {
  const text = `${item.title || ''} ${item.place || ''}`;
  const found = ATTRACTION_GUIDES.filter(guide => guide.match.test(text) && !(guide.exclude && guide.exclude.test(text)));
  if (found.length) return found.map(guide => ({...guide,image:GUIDE_IMAGE_OVERRIDES[guide.title] || guide.image}));
  return [{eyebrow:`${trip.destination || 'TRAVEL'} · PLACE GUIDE`,title:item.place || item.title,image:typeof homeTripImage === 'function' ? homeTripImage(trip) : 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=85',summary:`${item.place || item.title}에서 여행지의 분위기와 문화를 경험할 수 있는 일정입니다.`,points:['주요 관람 지점과 이동 방향을 먼저 확인하면 시간을 효율적으로 사용할 수 있습니다.','현장 운영시간과 입장·예약 조건은 방문 전에 다시 확인하세요.','추천 맛집과 쇼핑 장소를 선택하면 일별 지도에 경유지로 함께 표시됩니다.'],tip:item.notes || '혼잡 시간과 다음 일정까지의 이동시간을 고려해 여유 있게 관람하세요.'}];
}

function guideCard(guide, index, total) {
  return `<section class="place-guide-card">${total > 1 ? `<div class="guide-sequence"><span>${index + 1}</span><b>${e(guide.title)}</b></div>` : ''}<div class="place-guide-hero"><img src="${e(guide.image)}" alt="${e(guide.title)} 여행 이미지"><div class="place-guide-overlay"><span>${e(guide.eyebrow)}</span><h2>${e(guide.title)}</h2></div></div><div class="place-guide-feed"><section class="guide-lead"><span class="guide-badge">여행 안내</span><h3>${e(guide.summary)}</h3></section><section class="guide-story"><div class="guide-story-index">01</div><div><b>놓치지 말아야 할 포인트</b><ul>${guide.points.map(point => `<li>${e(point)}</li>`).join('')}</ul></div></section><section class="guide-story"><div class="guide-story-index">02</div><div><b>일정에 적용할 팁</b><p>${e(guide.tip)}</p></div></section></div></section>`;
}

window.openAttractionGuide = function(id) {
  const item = (window._i || []).find(value => value.id === id);
  if (!item) return;
  const guides = guidesForItem(item);
  $('scheduleModalTitle').textContent = '관광지 안내';
  $('scheduleModalBody').innerHTML = `<article class="place-guide">${guides.length > 1 ? `<div class="combined-guide-heading"><span>복합 일정 안내</span><b>${guides.length}개 장소를 일정 순서대로 확인하세요.</b></div>` : ''}${guides.map((guide,index) => guideCard(guide,index,guides.length)).join('')}<section class="guide-story guide-live guide-final-check"><div class="guide-story-index">✓</div><div><b>방문 전 최종 확인</b><p>운영시간, 휴관일, 예약 및 입장 조건은 변동될 수 있습니다. 방문 직전에 공식 채널에서 확인해 주세요.</p></div></section></article>`;
  $('scheduleModal').classList.remove('hidden');
};

let movementRepairRunning = false;
window.repairZeroMovementRows = async function(rows) {
  if (movementRepairRunning || !Array.isArray(rows) || rows.length < 2) return;
  movementRepairRunning=true;
  const ordered = [...rows].sort((a,b) => a.day_no-b.day_no || a.sort_order-b.sort_order);
  const repairs = [];
  for (let index=1; index<ordered.length; index+=1) {
    const current=ordered[index], previous=ordered[index-1];
    if (current.day_no!==previous.day_no || current.item_type==='flight') continue;
    const taxi=/택시|taxi|car|차량/i.test(current.transport || '');
    const invalid=Number(current.travel_duration_min)<=0 || Number(current.travel_distance_km)<=0 || (taxi && Number(current.travel_cost)<=0);
    if (!invalid) continue;
    const mapped=await mapMovement(previous,current);
    if (mapped) repairs.push({id:current.id,payload:{transport:current.transport||mapped.transport,travel_duration_min:mapped.travel_duration_min,travel_distance_km:mapped.travel_distance_km,travel_cost:taxi?mapped.travel_cost:(current.travel_cost??mapped.travel_cost),currency:current.currency||'CNY'}});
  }
  if (!repairs.length) { movementRepairRunning=false; return; }
  try {
    for (const repair of repairs) {
      const {error}=await sb.from('itinerary_items').update(repair.payload).eq('id',repair.id);
      if (error) throw error;
    }
    await renderIt();
  } catch(error) { console.warn('[tripmate] zero movement repair failed',error); }
  finally { movementRepairRunning=false; }
};
