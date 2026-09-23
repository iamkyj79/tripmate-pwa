// v58 - Request-only AI reference attachments and concise undo label.
(() => {
  const MAX_FILES = 3;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 14 * 1024 * 1024;
  let attachments = [];

  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const bytesOf = value => value.data ? Math.ceil(value.data.length * .75) : new Blob([value.text || '']).size;
  const dataUrl = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error || Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });

  async function compactImage(file) {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .84));
    if (!blob) throw Error('이미지를 변환하지 못했습니다.');
    return { name: file.name, mime_type: 'image/jpeg', data: await dataUrl(blob) };
  }

  async function readAttachment(file) {
    if (file.size > MAX_FILE_BYTES) throw Error(`${file.name}: 파일당 10MB까지 첨부할 수 있습니다.`);
    if (/^image\/(png|jpeg|webp)$/.test(file.type)) return compactImage(file);
    if (file.type === 'application/pdf') return { name: file.name, mime_type: file.type, data: await dataUrl(file) };
    if (['text/plain', 'text/csv', 'application/json'].includes(file.type) || /\.md$/i.test(file.name)) {
      return { name: file.name, mime_type: 'text/plain', text: (await file.text()).slice(0, 200000) };
    }
    throw Error(`${file.name}: 지원하지 않는 파일 형식입니다.`);
  }

  function message(text, error = false) {
    const node = document.getElementById('planAttachmentMsg');
    if (node) node.innerHTML = text ? `<div class="msg ${error ? 'error' : ''}">${escapeHtml(text)}</div>` : '';
  }

  function renderList() {
    const host = document.getElementById('planAttachmentList');
    if (!host) return;
    if (!attachments.length) {
      host.innerHTML = '<span class="muted">선택한 파일이 없습니다.</span>';
      return;
    }
    host.innerHTML = attachments.map((file, index) => `<div class="plan-attachment-item"><span>${file.mime_type.startsWith('image/') ? '🖼️' : file.mime_type === 'application/pdf' ? '📄' : '📝'} <b>${escapeHtml(file.name)}</b></span><button type="button" class="small" data-remove-ai-file="${index}">삭제</button></div>`).join('');
    host.querySelectorAll('[data-remove-ai-file]').forEach(button => {
      button.onclick = () => {
        attachments.splice(Number(button.dataset.removeAiFile), 1);
        renderList();
        message('');
      };
    });
  }

  async function addFiles(files) {
    message('');
    for (const file of files.slice(0, Math.max(0, MAX_FILES - attachments.length))) {
      try {
        const next = await readAttachment(file);
        if ([...attachments, next].reduce((sum, value) => sum + bytesOf(value), 0) > MAX_TOTAL_BYTES) throw Error('첨부파일 전체 용량은 14MB 이하여야 합니다.');
        attachments.push(next);
      } catch (error) {
        message(error.message, true);
        break;
      }
    }
    renderList();
    if (attachments.length) message(`${attachments.length}개 파일을 AI 참고자료로 준비했습니다.`);
  }

  function enhanceModal() {
    const body = document.getElementById('scheduleModalBody');
    if (!body || document.getElementById('planAttachmentBox')) return;
    const firstMessage = body.querySelector('.msg');
    if (!firstMessage) return;
    attachments = [];
    const box = document.createElement('section');
    box.id = 'planAttachmentBox';
    box.className = 'plan-attachment-box';
    box.innerHTML = `<div class="plan-attachment-heading"><div><b>📎 AI 참고자료 첨부</b><small>이미지·PDF·TXT·CSV·JSON·MD / 최대 3개</small></div><label class="small plan-attachment-button">파일 선택<input id="planAttachmentInput" type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv,application/json,.md" hidden></label></div><div id="planAttachmentList" class="plan-attachment-list"><span class="muted">선택한 파일이 없습니다.</span></div><div id="planAttachmentMsg"></div><p class="plan-attachment-notice">첨부자료는 이번 AI 일정 생성 요청에만 사용되며 앱이나 데이터베이스에 저장되지 않습니다.</p>`;
    firstMessage.insertAdjacentElement('beforebegin', box);
    document.getElementById('planAttachmentInput').onchange = event => addFiles([...event.target.files]);
  }

  function shortenUndoLabel() {
    const button = document.getElementById('restoreFullItinerary');
    if (!button) return;
    const current = button.textContent.trim();
    if (current.includes('복구 중') && current !== '복구 중...') button.textContent = '복구 중...';
    else if (current !== '↩️ 돌아가기' && (current.includes('전체 일정') || current.includes('돌아가기'))) button.textContent = '↩️ 돌아가기';
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.includes('/functions/v1/travel-plan') || !init.body || !attachments.length) return nativeFetch(input, init);
    let body;
    try { body = JSON.parse(init.body); } catch (_) { return nativeFetch(input, init); }
    const response = await nativeFetch(input, { ...init, body: JSON.stringify({ ...body, attachments }) });
    if (response.ok) attachments = [];
    return response;
  };

  const observer = new MutationObserver(() => {
    enhanceModal();
    shortenUndoLabel();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  enhanceModal();
  shortenUndoLabel();
})();
