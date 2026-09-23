// v56 - Mobile-only two-date calendar. Does not save or modify trip data itself.
(() => {
  const mobile = () => matchMedia('(max-width:760px)').matches;
  const pairs = { ns: ['ns', 'ne'], ne: ['ns', 'ne'], es: ['es', 'ee'], ee: ['es', 'ee'] };
  let state = null;
  const pad = n => String(n).padStart(2, '0');
  const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const date = value => value ? new Date(`${value}T00:00:00`) : null;
  const same = (a, b) => a && b && key(a) === key(b);

  function ensureDialog() {
    if (document.getElementById('mobileDateRange')) return;
    const dialog = document.createElement('div');
    dialog.id = 'mobileDateRange';
    dialog.className = 'mobile-date-range hidden';
    dialog.innerHTML = `<div class="mobile-date-sheet" role="dialog" aria-modal="true" aria-labelledby="mobileDateTitle">
      <div class="mobile-date-head"><div><small>여행 기간 선택</small><h2 id="mobileDateTitle">출발일과 귀국일</h2></div><button type="button" class="mobile-date-close" aria-label="닫기">×</button></div>
      <div class="mobile-date-summary"><button type="button" data-date-step="start"><small>출발일</small><b id="mobileStartText">선택</b></button><span>→</span><button type="button" data-date-step="end"><small>귀국일</small><b id="mobileEndText">선택</b></button></div>
      <div id="mobileDateHint" class="mobile-date-hint">출발일을 선택하세요.</div>
      <div class="mobile-month-head"><button type="button" id="mobilePrevMonth" aria-label="이전 달">‹</button><b id="mobileMonthTitle"></b><button type="button" id="mobileNextMonth" aria-label="다음 달">›</button></div>
      <div class="mobile-weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
      <div id="mobileCalendarDays" class="mobile-calendar-days"></div>
      <div class="mobile-date-actions"><button type="button" id="mobileDateCancel" class="small">취소</button><button type="button" id="mobileDateApply" class="btn" disabled>날짜 적용</button></div>
    </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('.mobile-date-close').onclick = close;
    document.getElementById('mobileDateCancel').onclick = close;
    dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
    document.getElementById('mobilePrevMonth').onclick = () => { state.month.setMonth(state.month.getMonth() - 1); render(); };
    document.getElementById('mobileNextMonth').onclick = () => { state.month.setMonth(state.month.getMonth() + 1); render(); };
    dialog.querySelectorAll('[data-date-step]').forEach(b => b.onclick = () => { state.step = b.dataset.dateStep; render(); });
    document.getElementById('mobileDateApply').onclick = apply;
  }

  function open(input) {
    if (!mobile()) return;
    const ids = pairs[input.id];
    if (!ids) return;
    ensureDialog();
    const startInput = document.getElementById(ids[0]);
    const endInput = document.getElementById(ids[1]);
    if (!startInput || !endInput) return;
    const start = date(startInput.value);
    const end = date(endInput.value);
    const focus = input.id === ids[1] && start ? 'end' : 'start';
    const base = focus === 'end' ? (end || start || new Date()) : (start || new Date());
    state = { startInput, endInput, start, end, step: focus, month: new Date(base.getFullYear(), base.getMonth(), 1) };
    document.getElementById('mobileDateRange').classList.remove('hidden');
    document.body.classList.add('mobile-calendar-open');
    render();
  }

  function choose(value) {
    const picked = date(value);
    if (state.step === 'start') {
      state.start = picked;
      if (state.end && state.end < picked) state.end = null;
      state.step = 'end';
    } else if (!state.start || picked < state.start) {
      state.start = picked;
      state.end = null;
      state.step = 'end';
    } else {
      state.end = picked;
    }
    render();
  }

  function render() {
    if (!state) return;
    document.getElementById('mobileStartText').textContent = state.start ? key(state.start) : '선택';
    document.getElementById('mobileEndText').textContent = state.end ? key(state.end) : '선택';
    document.getElementById('mobileDateHint').textContent = state.step === 'start' ? '출발일을 선택하세요.' : state.end ? '날짜를 확인하고 적용하세요.' : '이어서 귀국일을 선택하세요.';
    document.querySelectorAll('[data-date-step]').forEach(b => b.classList.toggle('active', b.dataset.dateStep === state.step));
    document.getElementById('mobileDateApply').disabled = !(state.start && state.end);
    const y = state.month.getFullYear(), m = state.month.getMonth();
    document.getElementById('mobileMonthTitle').textContent = `${y}년 ${m + 1}월`;
    const first = new Date(y, m, 1), gridStart = new Date(y, m, 1 - first.getDay());
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
      const value = key(d), outside = d.getMonth() !== m;
      const inRange = state.start && state.end && d >= state.start && d <= state.end;
      const classes = [outside ? 'outside' : '', inRange ? 'in-range' : '', same(d, state.start) ? 'range-start' : '', same(d, state.end) ? 'range-end' : ''].filter(Boolean).join(' ');
      days.push(`<button type="button" data-day="${value}" class="${classes}" aria-label="${value}">${d.getDate()}</button>`);
    }
    const host = document.getElementById('mobileCalendarDays');
    host.innerHTML = days.join('');
    host.querySelectorAll('[data-day]').forEach(b => b.onclick = () => choose(b.dataset.day));
  }

  function apply() {
    if (!state?.start || !state?.end) return;
    state.startInput.value = key(state.start);
    state.endInput.value = key(state.end);
    for (const input of [state.startInput, state.endInput]) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
  }

  function close() {
    document.getElementById('mobileDateRange')?.classList.add('hidden');
    document.body.classList.remove('mobile-calendar-open');
    state = null;
  }

  document.addEventListener('pointerdown', event => {
    const input = event.target.closest('input[type="date"]');
    if (!mobile() || !input || !pairs[input.id]) return;
    event.preventDefault();
    input.blur();
    open(input);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state) close();
  });
})();
