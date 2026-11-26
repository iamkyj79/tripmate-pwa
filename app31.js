// v60 - Password recovery flow for the hosted TRIP:MATE app.
(() => {
  const RECOVERY_URL = location.origin + '/';

  function ensureResetModal() {
    let modal = document.getElementById('passwordResetModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'passwordResetModal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modalbox">
        <div class="row">
          <h2>새 비밀번호 설정</h2>
          <button class="small" id="passwordResetClose" type="button">×</button>
        </div>
        <div class="field"><label>새 비밀번호</label><input id="passwordResetValue" type="password" autocomplete="new-password" minlength="8" placeholder="8자 이상 입력"></div>
        <div class="field"><label>새 비밀번호 확인</label><input id="passwordResetConfirm" type="password" autocomplete="new-password" minlength="8"></div>
        <button class="btn" id="passwordResetSave" type="button" style="width:100%">비밀번호 변경</button>
        <div id="passwordResetMsg"></div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('passwordResetClose').onclick = () => modal.classList.add('hidden');
    document.getElementById('passwordResetSave').onclick = updatePassword;
    return modal;
  }

  function showMessage(id, text, isError = false) {
    const node = document.getElementById(id);
    if (node) node.innerHTML = text ? `<div class="msg ${isError ? 'error' : ''}">${e(text)}</div>` : '';
  }

  function showResetModal() {
    ensureResetModal().classList.remove('hidden');
    setTimeout(() => document.getElementById('passwordResetValue')?.focus(), 0);
  }

  async function updatePassword() {
    const password = document.getElementById('passwordResetValue').value;
    const confirmation = document.getElementById('passwordResetConfirm').value;
    const button = document.getElementById('passwordResetSave');
    try {
      if (password.length < 8) throw Error('새 비밀번호는 8자 이상 입력해 주세요.');
      if (password !== confirmation) throw Error('새 비밀번호가 서로 일치하지 않습니다.');
      button.disabled = true;
      showMessage('passwordResetMsg', '비밀번호를 변경하고 있습니다.');
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      showMessage('passwordResetMsg', '비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.');
      await sb.auth.signOut();
      setTimeout(() => {
        document.getElementById('passwordResetModal')?.classList.add('hidden');
        document.getElementById('auth')?.classList.remove('hidden');
      }, 900);
    } catch (error) {
      showMessage('passwordResetMsg', error.message || '비밀번호를 변경하지 못했습니다.', true);
    } finally {
      button.disabled = false;
    }
  }

  async function consumeRecoveryHash() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (params.get('type') !== 'recovery') return false;
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    try {
      if (accessToken && refreshToken) {
        const { error } = await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) throw error;
      }
      history.replaceState(null, '', location.pathname + location.search);
      showResetModal();
      return true;
    } catch (error) {
      history.replaceState(null, '', location.pathname + location.search);
      ensureResetModal().classList.remove('hidden');
      showMessage('passwordResetMsg', '재설정 링크가 만료됐습니다. 로그인 창에서 새 메일을 받아 주세요.', true);
      return false;
    }
  }

  function addRecoveryRequestButton() {
    const loginButton = document.getElementById('alog');
    if (!loginButton || document.getElementById('passwordRecoveryRequest')) return;
    const button = document.createElement('button');
    button.id = 'passwordRecoveryRequest';
    button.type = 'button';
    button.className = 'small';
    button.style.cssText = 'width:100%;margin-top:10px';
    button.textContent = '비밀번호 재설정 메일 받기';
    loginButton.insertAdjacentElement('afterend', button);
    button.onclick = async () => {
      const email = document.getElementById('email')?.value.trim();
      try {
        if (!email) throw Error('먼저 이메일을 입력해 주세요.');
        button.disabled = true;
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: RECOVERY_URL });
        if (error) throw error;
        M('alogmsg', '비밀번호 재설정 메일을 보냈습니다. 새로 도착한 메일을 확인해 주세요.');
      } catch (error) {
        M('alogmsg', error.message || '재설정 메일을 보내지 못했습니다.', 'error');
      } finally {
        button.disabled = false;
      }
    };
  }

  ensureResetModal();
  addRecoveryRequestButton();
  sb.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') setTimeout(showResetModal, 0);
  });
  consumeRecoveryHash();
})();
