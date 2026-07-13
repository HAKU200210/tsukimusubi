(() => {
  const config = window.TSUKIMUSUBI_CLOUD_CONFIG;
  const app = () => window.TsukimusubiApp;
  let client = null;
  let user = null;
  let membership = null;
  let initializePromise = null;
  let lastRefreshAt = 0;

  function setStatus(text, state = 'waiting') {
    const bar = document.querySelector('#cloudSyncBar');
    const label = document.querySelector('#cloudSyncStatus');
    if (!bar || !label) return;
    label.textContent = text;
    bar.className = `cloud-sync-bar ${state}`;
  }

  function errorMessage(error) {
    const message = String(error?.message || error || 'Unknown cloud error');
    if (message.includes('Invalid pairing code')) return '配对码无效 / ペアコードが正しくありません';
    if (message.includes('already paired')) return '这个设备已经完成配对 / この端末はペア設定済みです';
    if (message.includes('Anonymous sign-ins are disabled')) return '请先在 Supabase 开启匿名登录 / Supabaseで匿名ログインを有効にしてください';
    if (message.includes('Could not find the function') || message.includes('schema cache')) return '请先执行数据库初始化脚本 / 先にデータベース初期化SQLを実行してください';
    return `云端连接失败 / クラウド接続失敗：${message}`;
  }

  function safe(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
  }

  function randomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const raw = Array.from(bytes, value => alphabet[value % alphabet.length]).join('');
    return raw.match(/.{1,4}/g).join('-');
  }

  function isPaired() { return Boolean(membership); }

  async function ensureSession() {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session?.user) {
      user = sessionData.session.user;
      return;
    }
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    user = data.user;
  }

  async function fetchMembership() {
    const { data, error } = await client
      .from('couple_members')
      .select('couple_id, role, joined_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    membership = data || null;
    return membership;
  }

  function reviewFromRow(row) {
    return {
      scores: row.scores,
      grateful: row.grateful,
      happy: row.happy,
      hurt: row.hurt,
      hope: row.hope,
      selfChange: row.self_change,
      renew: row.renew,
      submittedAt: row.submitted_at
    };
  }

  async function refresh(force = false) {
    if (!membership) return;
    if (!force && Date.now() - lastRefreshAt < 1500) return;
    setStatus('同期中… / 正在同步…', 'syncing');
    const monthDate = `${app().monthKey}-01`;
    const [reviewsResult, statusResult] = await Promise.all([
      client.from('monthly_reviews')
        .select('month, author_role, scores, grateful, happy, hurt, hope, self_change, renew, submitted_at')
        .order('month', { ascending: true }),
      client.rpc('get_month_status', { p_month: monthDate })
    ]);
    if (reviewsResult.error) throw reviewsResult.error;
    if (statusResult.error) throw statusResult.error;

    const months = {};
    for (const row of reviewsResult.data || []) {
      const key = row.month.slice(0, 7);
      months[key] ||= { reviews: {} };
      months[key].reviews[row.author_role] = reviewFromRow(row);
    }
    months[app().monthKey] ||= { reviews: {} };
    const statusRow = statusResult.data?.[0] || { haku_submitted: false, risa_submitted: false };
    app().applyCloudState({
      role: membership.role,
      months,
      submissionStatus: { haku: statusRow.haku_submitted, risa: statusRow.risa_submitted }
    });
    lastRefreshAt = Date.now();
    setStatus('クラウド同期済み / 云端已同步', 'connected');
  }

  async function initialize() {
    if (initializePromise) return initializePromise;
    initializePromise = (async () => {
      if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) {
        throw new Error('Supabase configuration is missing');
      }
      setStatus('クラウドに接続中 / 正在连接云端', 'syncing');
      client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      await ensureSession();
      await fetchMembership();
      if (membership) {
        await refresh(true);
        await app().renderAlbum();
      } else {
        setStatus('ペア設定が必要 / 需要完成配对', 'waiting');
        app().setCloudUnpaired();
        openSetup();
      }
    })().catch(error => {
      initializePromise = null;
      setStatus('クラウド設定待ち / 等待云端设置', 'error');
      app().showToast(errorMessage(error));
      renderError(error);
      throw error;
    });
    return initializePromise;
  }

  function openModal() {
    document.querySelector('#cloudModal').classList.add('open');
    document.querySelector('#cloudModal').setAttribute('aria-hidden', 'false');
  }

  function closeModal(force = false) {
    if (!membership && !force) return;
    document.querySelector('#cloudModal').classList.remove('open');
    document.querySelector('#cloudModal').setAttribute('aria-hidden', 'true');
  }

  function setupMarkup() {
    return `<span class="eyebrow">PRIVATE CLOUD</span>
      <h2>ふたりのクラウドをつなぐ<small class="translation">连接两个人的云端空间</small></h2>
      <p>初めて作るのは、はくだけです。りさは後で招待コードから参加できます。<br>只需要はく创建一次；りさ之后使用邀请码加入。</p>
      <button id="createCloudSpace" class="cloud-primary"><span class="avatar haku">は</span><span><b>はくとして新しい空間を作る</b><small>由はく创建新的共享空间</small></span></button>
      <div class="cloud-divider"><span>または / 或者</span></div>
      <label class="cloud-code-field">ペアコード / 配对码<input id="joinCloudCode" autocomplete="off" maxlength="32" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"></label>
      <button id="joinCloudSpace" class="cloud-secondary">コードで参加 / 使用配对码加入</button>`;
  }

  function renderSetup() {
    const body = document.querySelector('#cloudModalBody');
    body.innerHTML = setupMarkup();
    openModal();
    document.querySelector('#createCloudSpace').addEventListener('click', createSpace);
    document.querySelector('#joinCloudSpace').addEventListener('click', joinSpace);
  }

  function codesMarkup(codes) {
    return `<span class="eyebrow">CODES CREATED</span>
      <h2>大切に保存してください<small class="translation">请妥善保存配对码</small></h2>
      <p>コードそのものはデータベースに保存されません。機種変更時の復元にも使います。<br>数据库只保存加密摘要；更换手机时也需要恢复码。</p>
      <div class="cloud-code-card haku-code"><span>はく · 復元コード / 恢复码</span><strong>${codes.haku}</strong><button data-copy-code="${codes.haku}">コピー / 复制</button></div>
      <div class="cloud-code-card risa-code"><span>りさ · 招待コード / 邀请码</span><strong>${codes.risa}</strong><button data-copy-code="${codes.risa}">コピー / 复制</button></div>
      <p class="cloud-warning">この2つのコードを知っている人は、対応する役割で参加できます。公開しないでください。<br>知道配对码的人可以加入，请勿公开。</p>
      <button id="finishCloudSetup" class="cloud-primary simple">保存完了 ✓ / 已妥善保存</button>`;
  }

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      app().showToast('コピーしました / 已复制');
    } catch {
      app().showToast(`コード / 配对码：${code}`);
    }
  }

  async function createSpace() {
    const button = document.querySelector('#createCloudSpace');
    button.disabled = true;
    button.classList.add('busy');
    const codes = { haku: randomCode(), risa: randomCode() };
    try {
      const { error } = await client.rpc('create_couple', {
        p_haku_code: codes.haku,
        p_risa_code: codes.risa
      });
      if (error) throw error;
      localStorage.setItem('tsukimusubi-recovery-codes', JSON.stringify(codes));
      await fetchMembership();
      await refresh(true);
      await app().renderAlbum();
      document.querySelector('#cloudModalBody').innerHTML = codesMarkup(codes);
      document.querySelectorAll('[data-copy-code]').forEach(copyButton => {
        copyButton.addEventListener('click', () => copyCode(copyButton.dataset.copyCode));
      });
      document.querySelector('#finishCloudSetup').addEventListener('click', closeModal);
      app().showToast('ふたりのクラウドを作りました / 云端空间创建成功 ♡');
    } catch (error) {
      button.disabled = false;
      button.classList.remove('busy');
      app().showToast(errorMessage(error));
    }
  }

  async function joinSpace() {
    const input = document.querySelector('#joinCloudCode');
    const button = document.querySelector('#joinCloudSpace');
    const code = input.value.trim();
    if (!code) return app().showToast('ペアコードを入力してください / 请输入配对码');
    button.disabled = true;
    try {
      const { error } = await client.rpc('join_couple', { p_code: code });
      if (error) throw error;
      localStorage.setItem('tsukimusubi-own-recovery-code', code);
      await fetchMembership();
      await refresh(true);
      closeModal();
      await app().renderAlbum();
      app().showToast('ふたりのクラウドにつながりました / 已连接共享空间 ♡');
    } catch (error) {
      button.disabled = false;
      app().showToast(errorMessage(error));
    }
  }

  function renderManage() {
    if (!membership) return renderSetup();
    const stored = JSON.parse(localStorage.getItem('tsukimusubi-recovery-codes') || 'null');
    const ownCode = stored?.[membership.role] || localStorage.getItem('tsukimusubi-own-recovery-code');
    const invite = membership.role === 'haku' ? stored?.risa : null;
    const body = document.querySelector('#cloudModalBody');
    body.innerHTML = `<span class="eyebrow">CLOUD CONNECTED</span>
      <h2>${membership.role === 'haku' ? 'はく' : 'りさ'}として接続済み<small class="translation">已作为 ${membership.role === 'haku' ? 'はく' : 'りさ'} 连接</small></h2>
      <p>契約記録と写真はクラウドに保存され、この端末以外からも同期できます。<br>评分、记录与照片已保存在云端。</p>
      ${ownCode ? `<div class="cloud-code-card"><span>自分の復元コード / 我的恢复码</span><strong>${ownCode}</strong><button data-copy-code="${ownCode}">コピー / 复制</button></div>` : '<p class="cloud-warning">この端末には復元コードが保存されていません。 / 此设备没有保存恢复码。</p>'}
      ${invite ? `<div class="cloud-code-card risa-code"><span>りさへの招待コード / 给りさ的邀请码</span><strong>${invite}</strong><button data-copy-code="${invite}">コピー / 复制</button></div>` : ''}
      <button id="closeCloudManage" class="cloud-primary simple">閉じる / 关闭</button>`;
    body.querySelectorAll('[data-copy-code]').forEach(copyButton => copyButton.addEventListener('click', () => copyCode(copyButton.dataset.copyCode)));
    document.querySelector('#closeCloudManage').addEventListener('click', closeModal);
    openModal();
  }

  function renderError(error) {
    const body = document.querySelector('#cloudModalBody');
    body.innerHTML = `<span class="eyebrow">CLOUD SETUP</span><h2>もう少し設定が必要です<small class="translation">还需要完成一项设置</small></h2><p>${safe(errorMessage(error))}</p><button id="retryCloud" class="cloud-primary simple">再試行 / 重试</button>`;
    document.querySelector('#retryCloud').addEventListener('click', () => { initializePromise = null; initialize(); });
    openModal();
  }

  function openSetup() {
    if (!client) {
      const body = document.querySelector('#cloudModalBody');
      body.innerHTML = `<span class="eyebrow">LINE LOGIN REQUIRED</span><h2>LINEから開いてください<small class="translation">请先通过 LINE 打开</small></h2><p>クラウドはLINEログイン後に有効になります。MINI AppのURLから開いてください。<br>云端同步会在 LINE 登录后启用，请通过 MINI App 地址打开。</p><button id="closeCloudInfo" class="cloud-primary simple">閉じる / 关闭</button>`;
      document.querySelector('#closeCloudInfo').addEventListener('click', () => closeModal(true));
      openModal();
      return;
    }
    membership ? renderManage() : renderSetup();
  }

  async function submitReview(review) {
    if (!membership) throw new Error('Device is not paired');
    const { error } = await client.rpc('submit_monthly_review', {
      p_month: `${app().monthKey}-01`,
      p_scores: review.scores,
      p_grateful: review.grateful,
      p_happy: review.happy,
      p_hurt: review.hurt,
      p_hope: review.hope,
      p_self_change: review.selfChange,
      p_renew: review.renew
    });
    if (error) throw error;
    await refresh(true);
  }

  async function resetMonth() {
    if (!membership) throw new Error('Device is not paired');
    const { error } = await client.rpc('reset_month_for_testing', { p_month: `${app().monthKey}-01` });
    if (error) throw error;
    await refresh(true);
  }

  async function listPhotos() {
    if (!membership) return [];
    const { data: rows, error } = await client.from('album_photos')
      .select('id, storage_path, display_name, uploader_role, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!rows?.length) return [];
    const { data: signed, error: signedError } = await client.storage.from('couple-album')
      .createSignedUrls(rows.map(row => row.storage_path), 3600);
    if (signedError) throw signedError;
    return rows.map((row, index) => ({
      id: row.id,
      path: row.storage_path,
      name: row.display_name,
      addedBy: row.uploader_role,
      createdAt: row.created_at,
      data: signed[index]?.signedUrl
    }));
  }

  async function uploadPhoto({ name, dataUrl }) {
    if (!membership) throw new Error('Device is not paired');
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${membership.couple_id}/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await client.storage.from('couple-album').upload(path, blob, {
      contentType: 'image/jpeg', cacheControl: '3600', upsert: false
    });
    if (uploadError) throw uploadError;
    const { error: metadataError } = await client.from('album_photos').insert({
      couple_id: membership.couple_id,
      uploader_id: user.id,
      uploader_role: membership.role,
      storage_path: path,
      display_name: name
    });
    if (metadataError) {
      await client.storage.from('couple-album').remove([path]);
      throw metadataError;
    }
  }

  async function deletePhoto(photo) {
    if (!membership) throw new Error('Device is not paired');
    const { error: metadataError } = await client.from('album_photos').delete().eq('id', photo.id);
    if (metadataError) throw metadataError;
    const { error: storageError } = await client.storage.from('couple-album').remove([photo.path]);
    if (storageError) throw storageError;
  }

  window.TsukimusubiCloud = {
    isPaired,
    initialize,
    openSetup,
    refresh: () => refresh(true),
    submitReview,
    resetMonth,
    listPhotos,
    uploadPhoto,
    deletePhoto
  };

  document.querySelector('#cloudManage').addEventListener('click', openSetup);
  document.querySelector('.cloud-modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('tsukimusubi:line-ready', event => {
    if (event.detail?.loggedIn) initialize().catch(() => {});
    else setStatus('LINEログイン後に同期 / 登录LINE后启用云端', 'waiting');
  });
  window.addEventListener('focus', () => { if (membership) refresh().catch(() => {}); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && membership) refresh().catch(() => {});
  });
  if (window.tsukimusubiLineState?.loggedIn) initialize().catch(() => {});
})();
