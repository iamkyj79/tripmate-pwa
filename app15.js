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

function cleanRestaurants(restaurants) {
  if (!Array.isArray(restaurants)) return [];
  return restaurants.filter(x => x && String(x.name || '').trim()).map(x => ({
    name: String(x.name).trim(),
    cuisine: String(x.cuisine || '').trim() || null,
    estimated_price_per_person: validNumber(x.estimated_price_per_person),
    currency: String(x.currency || '').trim() || null,
    walk_minutes: validNumber(x.walk_minutes),
  })).slice(0, 3);
}

function needsGeneratedEnrichment(item) {
  const missingMove = item.item_type !== 'flight' && (!item.transport || validNumber(item.travel_duration_min) == null);
  const isMeal = item.item_type === 'meal' || Boolean(item.meal_type) || /식사|점심|저녁|아침|맛집|restaurant/i.test(`${item.title || ''} ${item.notes || ''}`);
  return missingMove || (isMeal && cleanRestaurants(item.restaurant_suggestions).length === 0);
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
    if (needsGeneratedEnrichment(item)) {
      try {
        const response = await fetch(ENR, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: K, Authorization: 'Bearer ' + session.access_token },
          body: JSON.stringify({ destination: trip.destination, start_date: trip.start_date, end_date: trip.end_date, previous, current: { title: item.title, place: item.place, item_type: item.item_type, transport: item.transport, notes: item.notes } }),
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
        if (value.notes_append) item.notes = [item.notes, value.notes_append].filter(Boolean).join(' · ');
        completed += 1;
      } catch (error) {
        console.warn('[tripmate] itinerary enrichment failed', { title: item.title, error: String(error) });
      }
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
