// v57 - Full itinerary regeneration backup/restore and generated-plan coverage checks.
(() => {
  const MAX_BACKUPS = 5;
  const baseRegenerate = window.regenerateTripAi;
  const baseRenderDetail = window.renderDetail;
  const baseShowTripAiRequest = window.showTripAiRequest;
  const backupKey = () => `tripmate:full-itinerary-backups:${trip?.id || ''}`;
  const getBackups = () => { try { return JSON.parse(localStorage.getItem(backupKey()) || '[]'); } catch (_) { return []; } };
  const setBackups = values => localStorage.setItem(backupKey(), JSON.stringify(values.slice(-MAX_BACKUPS)));
  const signature = rows => JSON.stringify((rows || []).map(x => [x.id, x.day_no, x.start_time, x.title, x.place, x.sort_order]));
  const minute = value => { const m = String(value || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const isMeal = item => item.meal_type || /아침|조식|점심|중식|저녁|석식|식사|breakfast|lunch|dinner/i.test(`${item.title || ''} ${item.item_type || ''}`);

  async function captureSnapshot() {
    const [items, transports, bookings, expenses, actual] = await Promise.all([
      sb.from('itinerary_items').select('*').eq('trip_id', trip.id).order('day_no').order('sort_order'),
      sb.from('trip_transports').select('id,itinerary_item_id').eq('trip_id', trip.id),
      sb.from('bookings').select('id,itinerary_item_id').eq('trip_id', trip.id),
      sb.from('expenses').select('id,itinerary_item_id').eq('trip_id', trip.id),
      sb.from('actual_itinerary_items').select('id,planned_item_id').eq('trip_id', trip.id),
    ]);
    for (const result of [items, transports, bookings, expenses, actual]) if (result.error) throw result.error;
    return {
      saved_at: new Date().toISOString(),
      items: items.data || [],
      links: { transports: transports.data || [], bookings: bookings.data || [], expenses: expenses.data || [], actual: actual.data || [] },
      trip_fields: { extra_request: trip.extra_request ?? null, ai_plan: trip.ai_plan ?? null, ai_grounding: trip.ai_grounding ?? null },
    };
  }

  function pushSnapshot(snapshot) {
    const values = getBackups();
    values.push(snapshot);
    setBackups(values);
  }

  function discardLatestSnapshot() {
    const values = getBackups();
    values.pop();
    setBackups(values);
  }

  async function restoreLinks(links) {
    const groups = [
      ['trip_transports', 'itinerary_item_id', links.transports || []],
      ['bookings', 'itinerary_item_id', links.bookings || []],
      ['expenses', 'itinerary_item_id', links.expenses || []],
      ['actual_itinerary_items', 'planned_item_id', links.actual || []],
    ];
    for (const [table, column, rows] of groups) {
      for (const row of rows) {
        const { error } = await sb.from(table).update({ [column]: row[column] || null }).eq('id', row.id);
        if (error) throw error;
      }
    }
  }

  async function replaceSchedule(snapshot) {
    const { error: deleteError } = await sb.from('itinerary_items').delete().eq('trip_id', trip.id);
    if (deleteError) throw deleteError;
    if (snapshot.items.length) {
      const { error: insertError } = await sb.from('itinerary_items').insert(snapshot.items);
      if (insertError) throw insertError;
    }
    await restoreLinks(snapshot.links);
    const { data: updated, error: tripError } = await sb.from('trips').update(snapshot.trip_fields).eq('id', trip.id).select().single();
    if (tripError) throw tripError;
    trip = updated;
  }

  async function ensureGeneratedCoverage(userInfo) {
    const { data, error } = await sb.from('itinerary_items').select('*').eq('trip_id', trip.id).order('day_no').order('sort_order');
    if (error) throw error;
    const rows = data || [];
    const byDay = new Map();
    rows.forEach(x => { if (x.item_type !== 'flight') { const values = byDay.get(Number(x.day_no)) || []; values.push(x); byDay.set(Number(x.day_no), values); } });

    for (const item of rows.filter(x => x.item_type !== 'flight')) {
      const patch = {};
      const restaurants = typeof cleanRestaurants === 'function' ? cleanRestaurants(item.restaurant_suggestions) : (item.restaurant_suggestions || []);
      if (restaurants.length < 3 && typeof fallbackRestaurants === 'function') {
        const names = new Set(restaurants.map(x => x.name));
        for (const value of fallbackRestaurants(item)) if (!names.has(value.name)) { restaurants.push(value); names.add(value.name); }
        patch.restaurant_suggestions = restaurants.slice(0, 3);
      }
      if (typeof shoppingCandidate === 'function' && shoppingCandidate(item)) {
        const shopping = typeof cleanShopping === 'function' ? cleanShopping(item.shopping_suggestions) : (item.shopping_suggestions || []);
        if (shopping.length < 2 && typeof fallbackShopping === 'function') {
          const names = new Set(shopping.map(x => x.name));
          for (const value of fallbackShopping(item)) if (!names.has(value.name)) { shopping.push(value); names.add(value.name); }
          patch.shopping_suggestions = shopping.slice(0, 3);
        }
      }
      if (Object.keys(patch).length) {
        const { error: updateError } = await sb.from('itinerary_items').update(patch).eq('id', item.id);
        if (updateError) throw updateError;
      }
    }

    const totalDays = Math.max(1, Number(trip.days || 1));
    for (let day = 1; day <= totalDays; day++) {
      const dayRows = byDay.get(day) || [];
      if (dayRows.some(isMeal)) continue;
      const times = dayRows.map(x => minute(x.start_time)).filter(Number.isFinite);
      const earliest = times.length ? Math.min(...times) : 9 * 60;
      const latest = times.length ? Math.max(...times) : 18 * 60;
      let mealType = 'lunch', startTime = '12:30', title = `${trip.destination} 현지 맛집 점심`;
      if (earliest >= 15 * 60) { mealType = 'dinner'; startTime = '18:30'; title = `${trip.destination} 현지 맛집 저녁`; }
      else if (latest <= 11 * 60) { mealType = 'breakfast'; startTime = '08:30'; title = `${trip.destination} 현지식 아침`; }
      const meal = { user_id: userInfo.id, trip_id: trip.id, day_no: day, start_time: startTime, title, place: trip.destination, item_type: 'meal', meal_type: mealType, transport: '도보/택시', travel_duration_min: 15, travel_distance_km: 1.5, travel_cost: 15, estimated_cost: null, currency: rows.find(x => x.currency)?.currency || null, shopping_suggestions: [], notes: 'AI 일정의 식사 누락을 방지하기 위해 추가된 현지 식사 일정입니다.', sort_order: 999 };
      meal.restaurant_suggestions = typeof fallbackRestaurants === 'function' ? fallbackRestaurants(meal).slice(0, 3) : [];
      const { error: mealError } = await sb.from('itinerary_items').insert(meal);
      if (mealError) throw mealError;
    }

    for (let day = 1; day <= totalDays; day++) {
      const { data: ordered, error: orderError } = await sb.from('itinerary_items').select('id').eq('trip_id', trip.id).eq('day_no', day).order('start_time').order('sort_order');
      if (orderError) throw orderError;
      for (let index = 0; index < (ordered || []).length; index++) {
        const { error: sortError } = await sb.from('itinerary_items').update({ sort_order: index }).eq('id', ordered[index].id);
        if (sortError) throw sortError;
      }
    }
  }

  window.regenerateTripAi = async function () {
    let before;
    try {
      before = await captureSnapshot();
      pushSnapshot(before);
    } catch (error) {
      M('regenMsg', `이전 일정 백업에 실패하여 새 일정을 만들지 않았습니다: ${error.message}`, 'error');
      return;
    }
    await baseRegenerate();
    const { data: after, error } = await sb.from('itinerary_items').select('id,day_no,start_time,title,place,sort_order').eq('trip_id', trip.id).order('day_no').order('sort_order');
    if (error || signature(before.items) === signature(after || [])) {
      discardLatestSnapshot();
      return;
    }
    try {
      const userInfo = await need();
      await ensureGeneratedCoverage(userInfo);
    } catch (coverageError) {
      console.warn('[tripmate] generated schedule coverage check failed', coverageError);
    }
    tab = 'itinerary';
    renderDetail();
  };

  window.restorePreviousFullItinerary = async function () {
    const values = getBackups();
    if (!values.length) return;
    const previous = values[values.length - 1];
    const when = new Date(previous.saved_at).toLocaleString('ko-KR');
    if (!confirm(`${when} AI 재생성 이전의 전체 일정으로 돌아갈까요?\n현재 일정은 교체되며, 예약·경비·준비물은 유지됩니다.`)) return;
    const button = document.getElementById('restoreFullItinerary');
    if (button) { button.disabled = true; button.textContent = '전체 일정 복구 중...'; }
    let current;
    try {
      current = await captureSnapshot();
      await replaceSchedule(previous);
      values.pop();
      setBackups(values);
      tab = 'itinerary';
      renderDetail();
      alert('AI 재생성 이전의 전체 일정을 복구했습니다.');
    } catch (error) {
      if (current) {
        try { await replaceSchedule(current); } catch (rollbackError) { console.error('[tripmate] restore rollback failed', rollbackError); }
      }
      alert(`전체 일정을 복구하지 못했습니다. 현재 일정은 유지했습니다: ${error.message}`);
      if (button) { button.disabled = false; button.textContent = '전체 일정 이전으로 돌아가기'; }
    }
  };

  window.renderDetail = function () {
    baseRenderDetail();
    if (!trip || !getBackups().length) return;
    const regen = document.getElementById('regenTrip');
    if (!regen || document.getElementById('restoreFullItinerary')) return;
    const button = document.createElement('button');
    button.id = 'restoreFullItinerary';
    button.className = 'small full-itinerary-undo';
    button.textContent = '전체 일정 이전으로 돌아가기';
    button.onclick = restorePreviousFullItinerary;
    regen.insertAdjacentElement('afterend', button);
  };

  window.showTripAiRequest = function () {
    baseShowTripAiRequest();
    const warning = document.querySelector('#scheduleModalBody .msg[style*="fff8e8"]');
    if (warning) warning.innerHTML = '새로 생성하면 기존 일정은 새 AI 일정으로 교체됩니다. <b>현재 전체 일정은 자동 백업</b>되어 생성 후 이전 일정으로 돌아갈 수 있습니다. 예약·경비·준비물 데이터는 유지됩니다.';
  };
})();
