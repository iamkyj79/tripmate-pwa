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
