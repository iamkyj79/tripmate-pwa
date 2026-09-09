// v32: delete an unwanted trip and all of its owned detail records.
async function loadTrips() {
  const currentUser = await user();
  if (!currentUser) {
    $('tripList').innerHTML = '<div class="panel">로그인하면 여행을 관리할 수 있습니다.</div>';
    return;
  }
  const { data, error } = await sb.from('trips').select('*').order('created_at', { ascending: false });
  if (error) {
    $('tripList').innerHTML = `<div class="msg error">${e(error.message)}</div>`;
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = (data || []).filter(item => {
    if (!item.end_date) return tripScope === 'upcoming';
    const end = new Date(item.end_date + 'T00:00:00');
    return tripScope === 'past' ? end < today : end >= today;
  });
  window._tripRows = rows;
  $('tripList').innerHTML = rows.length ? rows.map(item => `
    <div class="trip" onclick="openTrip('${item.id}')">
      <div class="row" style="align-items:center">
        <div>
          <b>${e(item.title || '제목 없는 여행')}</b>
          <div class="muted">${e(item.destination || '목적지 미정')} · ${item.start_date || '날짜 미정'} ~ ${item.end_date || ''}</div>
        </div>
        <button class="small danger" type="button" aria-label="${e(item.title || '여행')} 삭제" onclick="event.stopPropagation(); deleteTrip('${item.id}')">삭제</button>
      </div>
    </div>`).join('') : `<div class="panel">${tripScope === 'past' ? '지난 여행이 없습니다.' : '예정된 여행이 없습니다.'}</div>`;
  document.querySelectorAll('[data-trip-scope]').forEach(button => {
    button.classList.toggle('on', button.dataset.tripScope === tripScope);
    button.onclick = () => {
      tripScope = button.dataset.tripScope;
      loadTrips();
      $('detail').innerHTML = '';
    };
  });
}

window.deleteTrip = function deleteTrip(id) {
  const title = (window._tripRows || []).find(item => item.id === id)?.title || '제목 없는 여행';
  $('scheduleModal').classList.remove('hidden');
  $('scheduleModalTitle').textContent = '여행 삭제 확인';
  $('scheduleModalBody').innerHTML = `<div class="panel"><h3 style="margin-top:0">“${e(title)}” 여행을 정말 삭제할까요?</h3><div class="msg error">일정, 교통편, 예약, 경비, 준비물과 실제 여행 기록이 모두 삭제되며 복구할 수 없습니다.</div><div class="actions" style="margin-top:18px;justify-content:flex-end"><button class="small" id="tripDeleteCancel" type="button">취소</button><button class="btn" id="tripDeleteConfirm" type="button" style="background:#c62828">삭제하기</button></div><div id="tripDeleteMsg"></div></div>`;
  $('tripDeleteCancel').onclick = closeScheduleModal;
  $('tripDeleteConfirm').onclick = () => performTripDelete(id);
};

async function performTripDelete(id) {
  const button = $('tripDeleteConfirm');
  try {
    button.disabled = true;
    button.textContent = '삭제 중...';
    await need();
    for (const table of ['actual_itinerary_items', 'expenses', 'bookings', 'packing_items', 'trip_transports', 'itinerary_items']) {
      const { error } = await sb.from(table).delete().eq('trip_id', id);
      if (error) throw Error(`${table} 삭제 실패: ${error.message}`);
    }
    const { error } = await sb.from('trips').delete().eq('id', id);
    if (error) throw error;
    if (trip?.id === id) {
      trip = null;
      $('detail').innerHTML = '';
    }
    closeScheduleModal();
    await Promise.all([loadTrips(), home()]);
  } catch (error) {
    M('tripDeleteMsg', '여행을 삭제하지 못했습니다: ' + error.message, 'error');
    if (button) {
      button.disabled = false;
      button.textContent = '삭제하기';
    }
  }
}
