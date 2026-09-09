// v33: complete itinerary display with movement cost and three nearby restaurants.
async function renderIt() {
  const { data, error } = await sb.from('itinerary_items').select('*').eq('trip_id', trip.id).order('day_no').order('sort_order');
  if (error) {
    $('tabbody').innerHTML = `<div class="msg error">${e(error.message)}</div>`;
    return;
  }
  const rows = data || [];
  $('tabbody').innerHTML = '<div id="iform"></div>' + rows.map(item => {
    const restaurants = cleanRestaurants(item.restaurant_suggestions);
    const route = item.item_type === 'flight'
      ? `<div class="route">✈ ${e(item.airline || '')} ${e(item.flight_number || '항공편')} · ${e(item.departure_airport || '-')} → ${e(item.arrival_airport || '-')}</div>`
      : item.travel_duration_min != null
        ? `<div class="route">↳ ${e(item.transport || '이동')} · 약 ${e(item.travel_duration_min)}분 · ${e(item.travel_distance_km)}km · 예상 교통비 ${e(item.travel_cost)} ${e(item.currency || '')}</div>`
        : '';
    const restaurantBlock = restaurants.length ? `<div class="restaurants"><b>주변 맛집 추천 ${restaurants.length}곳</b><ol>${restaurants.map(restaurant => {
      const price = restaurant.estimated_price_per_person != null ? ` · 1인 약 ${e(restaurant.estimated_price_per_person)} ${e(restaurant.currency || item.currency || '')}` : '';
      const travel = restaurant.travel_minutes != null ? ` · ${e(restaurant.travel_mode || '도보')} 약 ${e(restaurant.travel_minutes)}분${restaurant.distance_km != null ? ` (${e(restaurant.distance_km)}km)` : ''}` : '';
      return `<li><b>${e(restaurant.name)}</b>${restaurant.cuisine ? ` · ${e(restaurant.cuisine)}` : ''}${price}${travel}</li>`;
    }).join('')}</ol></div>` : '';
    return `<div class="item"><div class="row"><div><b>Day ${item.day_no} · ${(item.start_time || '').slice(0, 5)} · ${e(item.title)}</b><div class="muted">${e(item.place || '')}</div></div><div class="actions"><button class="small" onclick="memoI('${item.id}')">메모</button><button class="small" onclick="editI('${item.id}')">수정</button><button class="small danger" onclick="delI('${item.id}')">삭제</button></div></div>${route}<div class="chips">${item.estimated_cost != null ? `<span class="chip">예상 이용금액 ${e(item.estimated_cost)} ${e(item.currency || '')}</span>` : ''}${item.meal_type ? `<span class="chip">🍽 ${e(item.meal_type)}</span>` : ''}</div>${item.user_memo ? `<div class="memobox"><b>📝 내 메모</b><div>${e(item.user_memo)}</div></div>` : ''}${restaurantBlock}</div>`;
  }).join('');
  window._i = rows;
}
