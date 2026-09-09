// v31: transport times are wall-clock values for each local departure/arrival place.
// Never convert them to UTC when enforcing itinerary constraints.
function itineraryMinute(day, time) {
  const dayNo = Number(day);
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})/);
  if (!Number.isInteger(dayNo) || dayNo < 1 || !match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return (dayNo - 1) * 1440 + hour * 60 + minute;
}

function minuteToItinerary(value) {
  const maximum = Math.max(1, Number(trip?.days || 1)) * 1440 - 1;
  const bounded = Math.max(0, Math.min(maximum, Math.round(value)));
  const dayNo = Math.floor(bounded / 1440) + 1;
  const minutes = bounded % 1440;
  return { day_no: dayNo, start_time: String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0') };
}

async function cascadeAfterEdit(oldItem, newItem) {
  if (!oldItem?.id) return 0;
  const oldStart = itineraryMinute(oldItem.day_no, oldItem.start_time);
  const newStart = itineraryMinute(newItem.day_no, newItem.start_time);
  if (oldStart == null || newStart == null) return 0;
  const delta = (newStart + Number(newItem.travel_duration_min || 0)) - (oldStart + Number(oldItem.travel_duration_min || 0));
  if (!delta) return 0;
  const [{ data: items, error: itemError }, { data: transports, error: transportError }] = await Promise.all([
    sb.from('itinerary_items').select('id,day_no,start_time,sort_order,item_type').eq('trip_id', trip.id).order('day_no').order('sort_order'),
    sb.from('trip_transports').select('itinerary_item_id').eq('trip_id', trip.id),
  ]);
  if (itemError) throw itemError;
  if (transportError) throw transportError;
  const fixedIds = new Set((transports || []).map(x => x.itinerary_item_id).filter(Boolean));
  const index = (items || []).findIndex(x => x.id === oldItem.id);
  if (index < 0) return 0;
  let changed = 0;
  for (let i = index + 1; i < items.length; i += 1) {
    const item = items[i];
    if (fixedIds.has(item.id)) break;
    const start = itineraryMinute(item.day_no, item.start_time);
    if (start == null) continue;
    const { error } = await sb.from('itinerary_items').update(minuteToItinerary(start + delta)).eq('id', item.id);
    if (error) throw error;
    changed += 1;
  }
  return changed;
}

async function saveI() {
  try {
    const userInfo = await need();
    if (!$('ititle').value.trim()) throw Error('일정명을 입력하세요');
    if ($('itype').value !== 'flight' && (!$('idur').value || $('icost').value === '')) {
      try { await enrich(true); } catch (error) { console.warn('[tripmate] manual enrichment failed', error); }
    }
    const numberOrNull = id => $(id).value === '' ? null : Number($(id).value);
    let payload = {
      day_no: Number($('iday').value), start_time: $('itime').value || null, item_type: $('itype').value,
      title: $('ititle').value.trim(), place: $('iplace').value.trim() || null,
      transport: $('itrans').value.trim() || null, travel_duration_min: numberOrNull('idur'),
      travel_distance_km: numberOrNull('idist'), travel_cost: numberOrNull('ifare'), estimated_cost: numberOrNull('icost'),
      currency: $('icur').value.trim() || null, meal_type: $('imeal').value || null,
      restaurant_suggestions: window._rests || [], airline: $('iair')?.value || null,
      flight_number: $('ifn')?.value || null, departure_airport: $('ida')?.value || null,
      arrival_airport: $('iaa')?.value || null, departure_terminal: $('idt')?.value || null,
      arrival_terminal: $('iat')?.value || null, seat: $('iseat')?.value || null,
      booking_reference: $('ibref')?.value || null,
      departure_at: $('idat')?.value ? new Date($('idat').value).toISOString() : null,
      arrival_at: $('iaat')?.value ? new Date($('iaat').value).toISOString() : null,
      notes: $('inotes').value.trim() || null,
    };
    const id = $('iid').value;
    if (id) {
      const { data: oldItem, error: readError } = await sb.from('itinerary_items').select('*').eq('id', id).single();
      if (readError) throw readError;
      const { error } = await sb.from('itinerary_items').update(payload).eq('id', id);
      if (error) throw error;
      await cascadeAfterEdit(oldItem, { ...oldItem, ...payload });
    } else {
      const { data: last } = await sb.from('itinerary_items').select('sort_order').eq('trip_id', trip.id).eq('day_no', payload.day_no).order('sort_order', { ascending: false }).limit(1);
      payload = { ...payload, user_id: userInfo.id, trip_id: trip.id, sort_order: (last?.[0]?.sort_order ?? -1) + 1 };
      const { error } = await sb.from('itinerary_items').insert(payload);
      if (error) throw error;
    }
    window._rests = [];
    closeScheduleModal();
    await renderIt();
  } catch (error) {
    M('imsg', error.message, 'error');
  }
}

function transportLocal(item, key) {
  return item[key + '_local'] || toLocalInput(item[key + '_at']) || '';
}

function validateTransportForAi(item) {
  const departure = transportLocal(item, 'departure');
  const arrival = transportLocal(item, 'arrival');
  if (!departure || !arrival) return '출발/도착 현지시각이 비어 있습니다.';
  if (item.mode === 'flight') {
    const start = localMinuteKey(departure);
    const end = localMinuteKey(arrival);
    const duration = start != null && end != null ? end - start : null;
    if (duration != null && (duration > 1440 || duration < -720)) return '항공편 출발/도착 날짜가 비정상적입니다.';
  }
  return '';
}

function anchorFromTransport(item, userInfo) {
  const outbound = item.direction === 'outbound';
  const local = outbound ? transportLocal(item, 'arrival') : transportLocal(item, 'departure');
  const place = outbound ? item.arrival_location : item.departure_location;
  const label = transportLabels[item.mode] || '↔ 이동';
  return {
    user_id: userInfo.id,
    trip_id: trip.id,
    day_no: tday(local),
    start_time: ttime(local),
    title: outbound ? `${place || '도착지'} 도착` : `${place || '출발지'} 출발`,
    place: place || null,
    item_type: item.mode === 'flight' ? 'flight' : 'transport',
    transport: label,
    estimated_cost: item.estimated_cost ?? null,
    currency: item.currency || null,
    notes: [
      `${item.departure_location || '-'} → ${item.arrival_location || '-'}`,
      `출발 ${transportLocal(item, 'departure')}`,
      `도착 ${transportLocal(item, 'arrival')}`,
      item.carrier,
      item.service_number,
      item.notes,
    ].filter(Boolean).join(' · '),
    flight_number: item.mode === 'flight' ? item.service_number : null,
    departure_airport: item.mode === 'flight' ? item.departure_location : null,
    arrival_airport: item.mode === 'flight' ? item.arrival_location : null,
    departure_at: item.mode === 'flight' ? item.departure_at : null,
    arrival_at: item.mode === 'flight' ? item.arrival_at : null,
    airline: item.mode === 'flight' ? item.carrier : null,
    departure_terminal: item.mode === 'flight' ? item.departure_terminal : null,
    arrival_terminal: item.mode === 'flight' ? item.arrival_terminal : null,
    seat: item.mode === 'flight' ? item.seat : null,
    booking_reference: item.mode === 'flight' ? item.booking_reference : null,
    sort_order: outbound ? -10000 : 10000,
  };
}

function isAiTransportDuplicate(item) {
  const text = `${item.title || ''} ${item.place || ''}`.toLowerCase();
  return item.item_type === 'flight' || /공항|airport|항공|비행|입국|출국|수속/.test(text);
}

function validNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function validMovementNumber(value) {
  const number = validNumber(value);
  return number != null && number > 0 ? number : null;
}

function cleanRestaurants(restaurants) {
  if (!Array.isArray(restaurants)) return [];
  return restaurants.filter(x => x && String(x.name || x.restaurant_name || x.title || x.place || '').trim()).map(x => ({
    name: String(x.name || x.restaurant_name || x.title || x.place).trim(),
    cuisine: String(x.cuisine || '').trim() || null,
    estimated_price_per_person: validNumber(x.estimated_price_per_person),
    currency: String(x.currency || '').trim() || null,
    walk_minutes: validNumber(x.walk_minutes),
    travel_mode: String(x.travel_mode || x.transport || '도보').trim(),
    travel_minutes: validNumber(x.travel_minutes) ?? validNumber(x.walk_minutes),
    distance_km: validNumber(x.distance_km),
    selected: x.selected === true,
  })).slice(0, 3);
}

function fallbackRestaurants(item) {
  const key = `${trip.destination || ''} ${item.place || ''} ${item.title || ''}`;
  let names;
  if (/베이징|북경|beijing/i.test(key)) names = ['쓰지민푸 베이징덕', '다둥 카오야', '하이디라오 훠궈'];
  else if (/도쿄|tokyo/i.test(key)) names = ['이치란 라멘', '스시잔마이', '츠루톤탄'];
  else if (/오사카|osaka/i.test(key)) names = ['미즈노 오코노미야키', '쿠시카츠 다루마', '이치란 도톤보리점'];
  else if (/파리|paris/i.test(key)) names = ['Bouillon Chartier', 'Le Relais de l’Entrecôte', 'Café de Flore'];
  else if (/제주|jeju/i.test(key)) names = ['오는정김밥', '자매국수', '우진해장국'];
  else if (/서울|seoul/i.test(key)) names = ['명동교자', '광장시장 먹거리골목', '토속촌 삼계탕'];
  else names = [1, 2, 3].map(n => `${item.place || trip.destination} 인근 현지 맛집 후보 ${n}`);
  return names.map((name, index) => ({
    name,
    cuisine: index === 0 ? '현지 대표 음식' : '현지 음식',
    estimated_price_per_person: null,
    currency: item.currency || null,
    walk_minutes: 5 + index * 5,
    travel_mode: index < 2 ? '도보' : '택시/대중교통',
    travel_minutes: 5 + index * 5,
    distance_km: Number((0.4 + index * 0.5).toFixed(1)),
  }));
}

function shoppingCandidate(item) {
  const text = `${item.item_type || ''} ${item.title || ''}`;
  return /activity|shopping|관광|관람|체험|명소|공원|박물관|궁|성|거리|광장/i.test(text) && !/공항|항공|숙소|호텔|식사|점심|저녁|아침|체크인|체크아웃/i.test(text);
}

function cleanShopping(suggestions) {
  if (!Array.isArray(suggestions)) return [];
  return suggestions.filter(x => x && String(x.name || x.shop_name || x.title || x.place || '').trim()).map(x => ({
    name: String(x.name || x.shop_name || x.title || x.place).trim(),
    category: String(x.category || x.type || '쇼핑').trim(),
    recommended_items: String(x.recommended_items || x.items || x.what_to_buy || '').trim() || null,
    travel_mode: String(x.travel_mode || x.transport || '도보').trim(),
    travel_minutes: validNumber(x.travel_minutes) ?? validNumber(x.walk_minutes),
    distance_km: validNumber(x.distance_km),
    notes: String(x.notes || x.tip || x.reason || '').trim() || null,
    selected: x.selected === true,
  })).slice(0, 3);
}

function fallbackShopping(item) {
  if (!shoppingCandidate(item)) return [];
  const key = `${trip.destination || ''} ${item.place || ''} ${item.title || ''}`;
  let places = [];
  if (/유니버설|universal/i.test(key)) places = [['Universal CityWalk Beijing','테마파크 쇼핑','캐릭터 상품·기념품'],['UNIVERSAL STUDIOS STORE','공식 굿즈','영화·캐릭터 공식 상품'],['POP MART CityWalk 매장','아트토이','한정판 피규어·아트토이']];
  else if (/베이징|북경|beijing/i.test(key)) places = [['왕푸징 보행거리','쇼핑거리','베이징 기념품·백화점 상품'],['첸먼 다스란 거리','전통상점가','차·과자·전통 공예품'],['시단 상업거리','복합 쇼핑','패션·생활용품']];
  else if (/도쿄|tokyo/i.test(key)) places = [['도쿄역 캐릭터 스트리트','캐릭터 상품','한정 굿즈'],['긴자 미츠코시','백화점','화장품·식품·패션'],['도큐 플라자 긴자','복합 쇼핑','패션·잡화']];
  else if (/오사카|osaka/i.test(key)) places = [['신사이바시스지 상점가','쇼핑거리','패션·드럭스토어 상품'],['난바 파크스','복합 쇼핑몰','패션·생활용품'],['도톤보리 돈키호테','종합 할인점','기념품·생활용품']];
  else if (/파리|paris/i.test(key)) places = [['Galeries Lafayette Haussmann','백화점','패션·화장품'],['Le Bon Marché','백화점','디자이너 상품·식품'],['Rue de Rivoli','쇼핑거리','패션·기념품']];
  else if (/제주|jeju/i.test(key)) places = [['제주동문시장','전통시장','감귤 제품·제주 먹거리'],['제주 기념품샵 바이제주','기념품점','제주 디자인 소품'],['칠성로 쇼핑거리','쇼핑거리','패션·생활용품']];
  return places.map((x, index) => ({ name:x[0], category:x[1], recommended_items:x[2], travel_mode:index < 2 ? '도보' : '택시/대중교통', travel_minutes:8 + index * 7, distance_km:Number((0.6 + index * 0.7).toFixed(1)), notes:'영업시간과 재고는 방문 전 확인' }));
}

function needsGeneratedEnrichment(item) {
  const missingMove = item.item_type !== 'flight' && (!item.transport || validNumber(item.travel_duration_min) == null);
  const missingShopping = shoppingCandidate(item) && cleanShopping(item.shopping_suggestions).length < 2;
  return missingMove || cleanRestaurants(item.restaurant_suggestions).length < 3 || missingShopping;
}

async function geocodeForPlan(value) {
  if (!value) return null;
  try {
    if (typeof knownDestinationPoint === 'function') {
      const known = knownDestinationPoint(value);
      if (known) return known;
    }
    const query = [value.place, value.title, trip.destination].filter(Boolean).join(', ');
    const response = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query), { headers: { 'Accept-Language': 'ko' } });
    const data = await response.json();
    return data?.[0] ? [Number(data[0].lat), Number(data[0].lon)] : null;
  } catch (_) { return null; }
}

function directDistanceKm(a, b) {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

async function mapMovement(previous, current) {
  const from = await geocodeForPlan(previous);
  const to = await geocodeForPlan(current);
  if (!from || !to) return null;
  const straight = directDistanceKm(from, to);
  const walking = straight <= 1.2;
  try {
    const route = await routeGeometry([from, to], walking ? 'walking' : 'driving');
    const distance = Number(route.distance || 0) / 1000;
    const minutes = Math.max(1, Math.round(Number(route.duration || 0) / 60));
    return { position: to, transport: walking ? '도보' : '택시', travel_duration_min: minutes, travel_distance_km: Number(distance.toFixed(1)), travel_cost: walking ? 0 : Math.ceil((13 + Math.max(0, distance - 3) * 2.3) / 5) * 5 };
  } catch (_) {
    const distance = Number((straight * 1.25).toFixed(1));
    return { position: to, transport: walking ? '도보' : '택시', travel_duration_min: Math.max(1, Math.round(distance / (walking ? 4.5 : 22) * 60)), travel_distance_km: distance, travel_cost: walking ? 0 : Math.ceil((13 + Math.max(0, distance - 3) * 2.3) / 5) * 5 };
  }
}

async function mapRestaurants(item, knownPosition) {
  const position = knownPosition || await geocodeForPlan(item);
  if (!position) return [];
  try {
    const query = `[out:json][timeout:20];(node["amenity"="restaurant"]["name"](around:1800,${position[0]},${position[1]});way["amenity"="restaurant"]["name"](around:1800,${position[0]},${position[1]}););out center 12;`;
    const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.elements || []).map(value => {
      const lat = Number(value.lat ?? value.center?.lat);
      const lon = Number(value.lon ?? value.center?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !value.tags?.name) return null;
      const distance = directDistanceKm(position, [lat, lon]) * 1.2;
      const walking = distance <= 1.2;
      return { name: value.tags['name:ko'] || value.tags.name, cuisine: value.tags.cuisine || '현지 음식', estimated_price_per_person: null, currency: null, walk_minutes: walking ? Math.max(1, Math.round(distance / 4.5 * 60)) : null, travel_mode: walking ? '도보' : '택시', travel_minutes: Math.max(1, Math.round(distance / (walking ? 4.5 : 20) * 60)), distance_km: Number(distance.toFixed(1)) };
    }).filter(Boolean).sort((a, b) => a.distance_km - b.distance_km).slice(0, 3);
  } catch (_) { return []; }
}

async function enrichGeneratedRows(rows, transports, session) {
  const ordered = [...rows].sort((a, b) => a.day_no - b.day_no || a.sort_order - b.sort_order);
  const firstAnchor = transports.find(x => x.direction === 'outbound');
  let previousDay = null;
  let previous = firstAnchor ? anchorFromTransport(firstAnchor, { id: ordered[0]?.user_id || '' }) : null;
  let completed = 0;
  for (const item of ordered) {
    if (previousDay !== item.day_no) {
      previousDay = item.day_no;
      if (item.day_no !== 1) {
        previous = trip.lodging_name || trip.lodging_address ? { title: trip.lodging_name || '숙소', place: trip.lodging_address || trip.lodging_name, item_type: 'lodging' } : null;
      }
    }
    item.restaurant_suggestions = cleanRestaurants(item.restaurant_suggestions);
    item.shopping_suggestions = cleanShopping(item.shopping_suggestions);
    if (needsGeneratedEnrichment(item)) {
      try {
        const response = await fetch(ENR, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: K, Authorization: 'Bearer ' + session.access_token },
          body: JSON.stringify({ destination: trip.destination, start_date: trip.start_date, end_date: trip.end_date, previous, current: { title: item.title, place: item.place, item_type: item.item_type, transport: item.transport, notes: [item.notes, '이전 장소부터 이동수단·거리·소요시간·교통비를 채우고, 현재 장소 주변의 실명 맛집을 최소 3곳 추천하되 각 맛집까지 이동수단·거리·소요시간을 포함할 것', shoppingCandidate(item) ? '주요 관광지 주변에 적절한 쇼핑 장소가 있으면 2~3곳과 추천 품목·이동수단·소요시간·거리를 포함할 것' : '쇼핑 추천이 적절하지 않으면 빈 배열로 둘 것'].filter(Boolean).join(' · ') } }),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || result.detail || '자동 보강 실패');
        const value = result.enrichment || {};
        item.item_type = value.item_type || item.item_type;
        item.transport = value.transport || item.transport || null;
        item.travel_duration_min = validNumber(value.travel_duration_min) ?? validNumber(item.travel_duration_min);
        item.travel_distance_km = validNumber(value.travel_distance_km) ?? validNumber(item.travel_distance_km);
        item.travel_cost = validNumber(value.travel_cost) ?? validNumber(item.travel_cost);
        item.estimated_cost = validNumber(value.estimated_cost) ?? validNumber(item.estimated_cost);
        item.currency = value.currency || item.currency || null;
        item.meal_type = value.meal_type || item.meal_type || null;
        const restaurants = cleanRestaurants(value.restaurant_suggestions);
        if (restaurants.length) item.restaurant_suggestions = restaurants;
        const shopping = cleanShopping(value.shopping_suggestions);
        if (shopping.length) item.shopping_suggestions = shopping;
        if (value.notes_append) item.notes = [item.notes, value.notes_append].filter(Boolean).join(' · ');
        completed += 1;
      } catch (error) {
        console.warn('[tripmate] itinerary enrichment failed', { title: item.title, error: String(error) });
      }
    }
    const mapped = previous ? await mapMovement(previous, item) : null;
    if (mapped) {
      item.transport = item.transport || mapped.transport;
      item.travel_duration_min = validMovementNumber(item.travel_duration_min) ?? mapped.travel_duration_min;
      item.travel_distance_km = validMovementNumber(item.travel_distance_km) ?? mapped.travel_distance_km;
      item.travel_cost = /도보|walk/i.test(item.transport || mapped.transport) ? (validNumber(item.travel_cost) ?? 0) : (validMovementNumber(item.travel_cost) ?? mapped.travel_cost);
      item.currency = item.currency || 'CNY';
    }
    if (item.item_type !== 'flight') {
      item.transport = item.transport || (previous ? '택시/대중교통' : '이동 없음');
      item.travel_duration_min = previous ? (validMovementNumber(item.travel_duration_min) ?? 30) : (validNumber(item.travel_duration_min) ?? 0);
      item.travel_distance_km = previous ? (validMovementNumber(item.travel_distance_km) ?? 5) : (validNumber(item.travel_distance_km) ?? 0);
      item.travel_cost = /도보|walk/i.test(item.transport || '') ? (validNumber(item.travel_cost) ?? 0) : (previous ? (validMovementNumber(item.travel_cost) ?? 30) : (validNumber(item.travel_cost) ?? 0));
    }
    if (item.restaurant_suggestions.length < 3) {
      const mappedRestaurants = await mapRestaurants(item, mapped?.position);
      const names = new Set(item.restaurant_suggestions.map(x => x.name));
      for (const restaurant of mappedRestaurants) if (!names.has(restaurant.name)) { item.restaurant_suggestions.push(restaurant); names.add(restaurant.name); }
      item.restaurant_suggestions = item.restaurant_suggestions.slice(0, 3);
    }
    if (shoppingCandidate(item) && item.shopping_suggestions.length < 2) {
      const names = new Set(item.shopping_suggestions.map(x => x.name));
      for (const place of fallbackShopping(item)) if (!names.has(place.name)) { item.shopping_suggestions.push(place); names.add(place.name); }
      item.shopping_suggestions = item.shopping_suggestions.slice(0, 3);
    }
    if (item.restaurant_suggestions.length < 3) {
      const names = new Set(item.restaurant_suggestions.map(x => x.name));
      for (const restaurant of fallbackRestaurants(item)) if (!names.has(restaurant.name)) { item.restaurant_suggestions.push(restaurant); names.add(restaurant.name); }
      item.restaurant_suggestions = item.restaurant_suggestions.slice(0, 3);
      item.notes = [item.notes, '이동시간·비용 및 일부 맛집 정보는 자동 예상값이며 방문 전 현지 확인이 필요합니다.'].filter(Boolean).join(' · ');
    }
    previous = item;
  }
  return { rows: ordered, completed };
}

async function regenerateTripAi() {
  const button = $('regenStart');
  try {
    const userInfo = await need();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw Error('로그인이 필요합니다.');
    if (!trip.destination || !trip.days) throw Error('여행지와 여행기간을 먼저 저장해 주세요.');
    const extra = $('regenNone').checked ? '' : $('regenReq').value.trim();
    button.disabled = true;
    button.textContent = 'AI 일정 생성 중...';
    M('regenMsg', '등록된 현지 도착·출발시각을 고정한 뒤 일정을 만들고 있습니다...');

    let [{ data: transports, error: transportError }, { data: bookings, error: bookingError }] = await Promise.all([
      sb.from('trip_transports').select('*').eq('trip_id', trip.id).order('sort_order'),
      sb.from('bookings').select('category,title,provider,start_at,end_at,location,status').eq('trip_id', trip.id),
    ]);
    if (transportError) throw transportError;
    if (bookingError) throw bookingError;
    transports = transports || [];
    for (const item of transports) {
      const problem = validateTransportForAi(item);
      if (problem) throw Error(`${item.carrier || ''} ${item.service_number || ''} 교통편: ${problem}`);
    }

    const outbound = transports.find(x => x.direction === 'outbound');
    const returning = [...transports].reverse().find(x => x.direction === 'return');
    const transportContext = transports.map(x => ({
      id: x.id,
      mode: x.mode,
      direction: x.direction,
      carrier: x.carrier,
      service_number: x.service_number,
      departure_location: x.departure_location,
      arrival_location: x.arrival_location,
      departure_local: transportLocal(x, 'departure'),
      arrival_local: transportLocal(x, 'arrival'),
      departure_terminal: x.departure_terminal,
      arrival_terminal: x.arrival_terminal,
      notes: x.notes,
    }));
    const contextNote = [
      extra,
      '[고정 제약 - 아래 현지시각은 절대 변경하거나 UTC로 변환하지 말 것]',
      ...transportContext.map(x => `${x.direction}/${x.mode} ${x.carrier || ''} ${x.service_number || ''}: ${x.departure_location} ${x.departure_local} 출발 → ${x.arrival_location} ${x.arrival_local} 도착`),
      `숙소 ${trip.lodging_name || '미입력'} / ${trip.lodging_address || '미입력'} / 체크인 ${trip.checkin_at || '미입력'} / 체크아웃 ${trip.checkout_at || '미입력'}`,
      '항공편·공항 도착·입출국 수속 항목은 생성하지 말 것. 앱이 등록 교통편을 고정 일정으로 별도 삽입한다.',
      '첫 관광 일정은 도착 현지시각에서 최소 60분 이후에 배치한다. 마지막 일정은 국제선 출발 현지시각 최소 3시간 전에 끝낸다.',
    ].filter(Boolean).join('\n');

    const response = await fetch(PLAN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: K, Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({
        destination: trip.destination,
        days: trip.days,
        nights: trip.nights ?? Math.max(0, trip.days - 1),
        extraRequest: contextNote,
        start_date: trip.start_date,
        end_date: trip.end_date,
        travelers_count: trip.travelers_count,
        lodging: { name: trip.lodging_name, address: trip.lodging_address, checkin_at: trip.checkin_at, checkout_at: trip.checkout_at, notes: trip.lodging_notes },
        transports: transportContext,
        bookings: (bookings || []).filter(x => ['flight', 'transport', 'lodging'].includes(x.category)),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw Error([result.error, result.detail].filter(Boolean).join(' - ') || 'AI 일정 생성 실패');

    const plan = result.plan || { days: [] };
    let rows = [];
    for (const day of plan.days || []) {
      for (const [index, item] of (day.items || []).entries()) {
        if (isAiTransportDuplicate(item)) continue;
        const dayNo = Number(day.day);
        if (itineraryMinute(dayNo, item.time) == null) continue;
        const move = item.from_previous || {};
        rows.push({
          user_id: userInfo.id,
          trip_id: trip.id,
          day_no: dayNo,
          start_time: String(item.time).slice(0, 5),
          title: item.title || item.place || '일정',
          place: item.place || null,
          item_type: item.item_type || 'activity',
          transport: move.mode || item.transport || null,
          travel_duration_min: move.duration_min ?? null,
          travel_distance_km: move.distance_km ?? null,
          travel_cost: move.estimated_fare ?? null,
          estimated_cost: item.estimated_cost ?? null,
          currency: item.currency || move.currency || plan.currency || null,
          meal_type: item.meal_type || null,
          restaurant_suggestions: item.restaurant_suggestions || [],
          shopping_suggestions: item.shopping_suggestions || [],
          notes: item.notes || null,
          sort_order: index,
        });
      }
    }
    if (outbound) {
      const minimum = itineraryMinute(tday(transportLocal(outbound, 'arrival')), ttime(transportLocal(outbound, 'arrival'))) + 60;
      rows = rows.filter(x => itineraryMinute(x.day_no, x.start_time) >= minimum);
    }
    if (returning) {
      const maximum = itineraryMinute(tday(transportLocal(returning, 'departure')), ttime(transportLocal(returning, 'departure'))) - 180;
      rows = rows.filter(x => itineraryMinute(x.day_no, x.start_time) <= maximum);
    }
    if (!rows.length && !transports.length) throw Error('AI가 생성한 유효한 일정이 없습니다. 다시 시도해 주세요.');

    if (rows.length) {
      M('regenMsg', `일정 ${rows.length}개의 이동시간·예상비용·주변 맛집을 자동 보강하고 있습니다...`);
      const enriched = await enrichGeneratedRows(rows, transports, session);
      rows = enriched.rows;
      console.info('[tripmate] generated itinerary enrichment complete', { requested: rows.length, completed: enriched.completed });
      const incomplete = rows.filter(item => item.item_type !== 'flight' && (!item.transport || validNumber(item.travel_duration_min) == null || validNumber(item.travel_distance_km) == null || validNumber(item.travel_cost) == null || cleanRestaurants(item.restaurant_suggestions).length < 3));
      if (incomplete.length) console.warn('[tripmate] saved with estimated enrichment fallback', { titles: incomplete.map(item => item.title) });
    }

    const { error: deleteError } = await sb.from('itinerary_items').delete().eq('trip_id', trip.id);
    if (deleteError) throw deleteError;
    for (const transport of transports) {
      const { data: inserted, error } = await sb.from('itinerary_items').insert(anchorFromTransport(transport, userInfo)).select().single();
      if (error) throw error;
      const { error: linkError } = await sb.from('trip_transports').update({ itinerary_item_id: inserted.id }).eq('id', transport.id);
      if (linkError) throw linkError;
    }
    if (rows.length) {
      const { error } = await sb.from('itinerary_items').insert(rows.map((x, index) => ({ ...x, sort_order: index })));
      if (error) throw error;
    }
    const { data: updated, error: updateError } = await sb.from('trips').update({
      extra_request: extra || null,
      ai_plan: result.text || JSON.stringify(plan),
      ai_grounding: result.grounding || null,
    }).eq('id', trip.id).select().single();
    if (updateError) throw updateError;
    trip = updated;
    closeScheduleModal();
    tab = 'itinerary';
    renderDetail();
  } catch (error) {
    M('regenMsg', error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'AI 일정 생성';
    }
  }
}
