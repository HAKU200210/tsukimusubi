(() => {
  'use strict';

  const DEMO_KEY = 'tsukimusubi-haku-risa-free-v2';
  const PHOTO_DB = 'tsukimusubi-haku-risa-free-photos';
  const config = window.TSUKIMUSUBI_CONFIG || {};
  const LIMITS = { photos: 500, anniversaries: 500, date_records: 1000, date_wishes: 1000 };
  let mode = 'demo';
  let client = null;
  let context = null;
  let user = null;

  const normalizeCode = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const oldRole = role => role === 'a' ? 'haku' : 'risa';
  const newRole = role => role === 'haku' ? 'a' : role === 'risa' ? 'b' : role;
  const memberFor = role => ({
    role,
    display_name: role === 'a' ? 'はく' : 'りさ',
    avatar_initial: role === 'a' ? '白' : '凜'
  });
  const pairFrom = row => ({
    id: row.id,
    name_a: 'はく',
    initial_a: '白',
    name_b: 'りさ',
    initial_b: '凜',
    met_date: row.met_date || row.met_on || '2026-06-05',
    dating_date: row.dating_date || row.dating_on || '2026-07-07',
    created_at: row.created_at
  });
  const withFreeAccess = value => value ? {
    ...value,
    entitlement: { tier: 'pair_free', is_plus: true, expires_at: null },
    limits: { ...LIMITS }
  } : null;

  const readDemo = () => {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '{}'); }
    catch { return {}; }
  };
  const writeDemo = data => localStorage.setItem(DEMO_KEY, JSON.stringify(data));

  function demoContext() {
    const db = readDemo();
    if (!db.pair || !db.role) return null;
    return withFreeAccess({
      pair: db.pair,
      membership: memberFor(db.role),
      members: [memberFor('a'), memberFor('b')],
      role: db.role
    });
  }

  function photoDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(PHOTO_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function photoStore(modeName, work) {
    const db = await photoDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', modeName);
      const request = work(tx.objectStore('photos'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function ensureSession() {
    let { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    if (!session) {
      const signed = await client.auth.signInAnonymously();
      if (signed.error) throw signed.error;
      session = signed.data.session;
    }
    if (!session?.user) throw new Error('Unable to start a secure session');
    user = session.user;
  }

  async function fallbackContext() {
    const membership = await client.from('couple_members')
      .select('couple_id,role,joined_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data) return null;
    const pair = await client.from('couples').select('*').eq('id', membership.data.couple_id).single();
    if (pair.error) throw pair.error;
    const role = newRole(membership.data.role);
    return withFreeAccess({
      pair: pairFrom(pair.data),
      membership: memberFor(role),
      members: [memberFor('a'), memberFor('b')],
      role
    });
  }

  async function refreshContext() {
    const result = await client.rpc('pair_free_get_context');
    if (!result.error) {
      context = withFreeAccess(result.data);
      return context;
    }
    if (!/Could not find the function|schema cache/i.test(String(result.error.message || ''))) throw result.error;
    context = await fallbackContext();
    return context;
  }

  async function initCloud() {
    if (!config.supabaseUrl || !config.supabaseKey || !window.supabase?.createClient) return false;
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    await ensureSession();
    await refreshContext();
    mode = 'cloud';
    return true;
  }

  async function init() {
    if (await initCloud()) return { mode, context };
    mode = 'demo';
    context = demoContext();
    return { mode, context };
  }

  async function createPair(input) {
    if (mode === 'cloud') {
      const result = await client.rpc('create_couple', {
        p_haku_code: input.codeA,
        p_risa_code: input.codeB
      });
      if (result.error) throw result.error;
      await refreshContext();
      return context;
    }
    const db = readDemo();
    if (db.pair) throw new Error('This browser already has a demo pair');
    db.pair = {
      id: crypto.randomUUID(),
      name_a: 'はく',
      initial_a: '白',
      name_b: 'りさ',
      initial_b: '凜',
      met_date: input.metDate || '2026-06-05',
      dating_date: input.datingDate || '2026-07-07',
      created_at: new Date().toISOString()
    };
    db.codes = { a: normalizeCode(input.codeA), b: normalizeCode(input.codeB) };
    db.role = 'a';
    db.reviews = [];
    db.anniversaries = [];
    db.dateRecords = [];
    db.dateWishes = [];
    writeDemo(db);
    context = demoContext();
    return context;
  }

  async function joinPair(code) {
    if (mode === 'cloud') {
      const result = await client.rpc('join_couple', { p_code: code });
      if (result.error) throw result.error;
      await refreshContext();
      return context;
    }
    const db = readDemo();
    if (!db.pair) throw new Error('Demo pair not found on this browser');
    const normalized = normalizeCode(code);
    const role = normalized === db.codes?.a ? 'a' : normalized === db.codes?.b ? 'b' : null;
    if (!role) throw new Error('Invalid invitation code');
    db.role = role;
    writeDemo(db);
    context = demoContext();
    return context;
  }

  async function switchDemoRole(role) {
    if (mode !== 'demo') return;
    const db = readDemo();
    if (!db.pair || !['a', 'b'].includes(role)) return;
    db.role = role;
    writeDemo(db);
    context = demoContext();
  }

  function normalizeScores(scores = {}) {
    if ('care' in scores || 'time' in scores || 'support' in scores || 'affection' in scores) return scores;
    return {
      communication: Number(scores.communication || 0),
      trust: Number(scores.trust || 0),
      care: Number(scores.security || 0),
      time: Number(scores.company || 0),
      support: Number(scores.overall || 0),
      affection: Number(scores.romance || 0)
    };
  }

  function reviewFromRow(row) {
    return {
      ...row,
      month: String(row.month || '').slice(0, 10),
      pair_id: row.pair_id || row.couple_id,
      author_role: newRole(row.author_role),
      scores: normalizeScores(row.scores),
      difficult: row.difficult ?? row.hurt ?? '',
      question_pack: row.question_pack || 'standard',
      extra_answers: row.extra_answers || {}
    };
  }

  async function loadReviews() {
    if (!context) return [];
    if (mode === 'cloud') {
      const result = await client.from('monthly_reviews').select('*').order('month', { ascending: true });
      if (result.error) throw result.error;
      return (result.data || []).map(reviewFromRow);
    }
    return (readDemo().reviews || []).map(reviewFromRow);
  }

  async function monthStatus(month) {
    if (!context) return { a: false, b: false };
    if (mode === 'cloud') {
      const result = await client.rpc('get_month_status', { p_month: month });
      if (result.error) throw result.error;
      const row = Array.isArray(result.data) ? (result.data[0] || {}) : (result.data || {});
      return { a: Boolean(row.haku_submitted), b: Boolean(row.risa_submitted) };
    }
    const rows = (readDemo().reviews || []).filter(row => row.month === month);
    return {
      a: rows.some(row => newRole(row.author_role) === 'a'),
      b: rows.some(row => newRole(row.author_role) === 'b')
    };
  }

  function oldScores(scores) {
    return {
      security: Number(scores.care),
      communication: Number(scores.communication),
      company: Number(scores.time),
      trust: Number(scores.trust),
      romance: Number(scores.affection),
      overall: Number(scores.support)
    };
  }

  async function submitReview(month, review) {
    if (!context) throw new Error('Pairing required');
    if (mode === 'cloud') {
      let result = await client.rpc('pair_free_submit_monthly_review', {
        p_month: month,
        p_scores: review.scores,
        p_grateful: review.grateful,
        p_happy: review.happy,
        p_difficult: review.difficult,
        p_hope: review.hope,
        p_self_change: review.selfChange,
        p_renew: review.renew,
        p_question_pack: review.questionPack || 'standard',
        p_extra_answers: review.extraAnswers || {}
      });
      if (result.error && /Could not find the function|schema cache/i.test(String(result.error.message || ''))) {
        if ((review.questionPack || 'standard') !== 'standard') throw new Error('Free feature migration required');
        result = await client.rpc('submit_monthly_review', {
          p_month: month,
          p_scores: oldScores(review.scores),
          p_grateful: review.grateful,
          p_happy: review.happy,
          p_hurt: review.difficult,
          p_hope: review.hope,
          p_self_change: review.selfChange,
          p_renew: review.renew
        });
      }
      if (result.error) throw result.error;
      return;
    }
    const db = readDemo();
    if ((db.reviews || []).some(row => row.month === month && newRole(row.author_role) === db.role)) throw new Error('Already submitted');
    db.reviews ||= [];
    db.reviews.push({
      id: crypto.randomUUID(),
      couple_id: db.pair.id,
      month,
      author_role: db.role,
      scores: review.scores,
      grateful: review.grateful,
      happy: review.happy,
      difficult: review.difficult,
      hope: review.hope,
      self_change: review.selfChange,
      renew: review.renew,
      question_pack: review.questionPack || 'standard',
      extra_answers: review.extraAnswers || {},
      submitted_at: new Date().toISOString()
    });
    writeDemo(db);
  }

  async function getPhotos() {
    if (!context) return [];
    if (mode === 'cloud') {
      const rows = await client.from('album_photos').select('*').order('created_at', { ascending: false });
      if (rows.error) throw rows.error;
      return Promise.all((rows.data || []).map(async row => {
        const path = row.path || row.storage_path;
        const signed = await client.storage.from('couple-album').createSignedUrl(path, 3600);
        return {
          ...row,
          pair_id: row.pair_id || row.couple_id,
          uploader_role: newRole(row.uploader_role),
          path,
          name: row.name || row.display_name || 'photo.jpg',
          url: signed.data?.signedUrl || ''
        };
      }));
    }
    const rows = await photoStore('readonly', store => store.getAll());
    return (rows || [])
      .filter(row => row.pair_id === context.pair.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(row => ({ ...row, url: URL.createObjectURL(row.blob) }));
  }

  async function addPhoto(file) {
    if (!context) throw new Error('Pairing required');
    if (mode === 'cloud') {
      const id = crypto.randomUUID();
      const path = `${context.pair.id}/${id}.jpg`;
      const upload = await client.storage.from('couple-album').upload(path, file, { contentType: 'image/jpeg', upsert: false });
      if (upload.error) throw upload.error;
      const metadata = await client.from('album_photos').insert({
        id,
        couple_id: context.pair.id,
        uploader_id: user.id,
        uploader_role: oldRole(context.role),
        storage_path: path,
        display_name: String(file.name || 'photo.jpg').slice(0, 120)
      });
      if (metadata.error) {
        await client.storage.from('couple-album').remove([path]);
        throw metadata.error;
      }
      return;
    }
    await photoStore('readwrite', store => store.put({
      id: crypto.randomUUID(),
      pair_id: context.pair.id,
      uploader_role: context.role,
      name: file.name,
      blob: file,
      created_at: new Date().toISOString()
    }));
  }

  const memoryTables = {
    anniversary: 'pair_free_anniversaries',
    date: 'pair_free_date_records',
    wish: 'pair_free_date_wishes'
  };

  async function loadMemories() {
    if (!context) return { anniversaries: [], dateRecords: [], dateWishes: [] };
    if (mode === 'cloud') {
      const [anniversaries, dateRecords, dateWishes] = await Promise.all([
        client.from(memoryTables.anniversary).select('*').order('event_date', { ascending: true }),
        client.from(memoryTables.date).select('*').order('date_on', { ascending: false }),
        client.from(memoryTables.wish).select('*').order('created_at', { ascending: false })
      ]);
      const failure = [anniversaries, dateRecords, dateWishes].find(result => result.error);
      if (failure) {
        if (/does not exist|schema cache/i.test(String(failure.error?.message || ''))) {
          return { anniversaries: [], dateRecords: [], dateWishes: [] };
        }
        throw failure.error;
      }
      return {
        anniversaries: anniversaries.data || [],
        dateRecords: dateRecords.data || [],
        dateWishes: dateWishes.data || []
      };
    }
    const db = readDemo();
    return {
      anniversaries: db.anniversaries || [],
      dateRecords: db.dateRecords || [],
      dateWishes: db.dateWishes || []
    };
  }

  async function createMemory(type, input) {
    if (!context) throw new Error('Pairing required');
    const definitions = {
      anniversary: {
        table: memoryTables.anniversary,
        key: 'anniversaries',
        row: { event_date: input.date, title: input.title, note: input.note || '' }
      },
      date: {
        table: memoryTables.date,
        key: 'dateRecords',
        row: { date_on: input.date, title: input.title, place: input.place || '', memory: input.note || '' }
      },
      wish: {
        table: memoryTables.wish,
        key: 'dateWishes',
        row: { title: input.title, place: input.place || '', note: input.note || '', status: 'planned' }
      }
    };
    const definition = definitions[type];
    if (!definition) throw new Error('Unknown memory type');
    if (mode === 'cloud') {
      const result = await client.from(definition.table).insert({
        id: crypto.randomUUID(),
        couple_id: context.pair.id,
        created_by: user.id,
        ...definition.row
      });
      if (result.error) {
        if (/does not exist|schema cache/i.test(String(result.error.message || ''))) throw new Error('Free feature migration required');
        throw result.error;
      }
      return;
    }
    const db = readDemo();
    db[definition.key] ||= [];
    db[definition.key].unshift({
      id: crypto.randomUUID(),
      couple_id: context.pair.id,
      ...definition.row,
      created_at: new Date().toISOString()
    });
    writeDemo(db);
  }

  async function deleteMemory(type, id) {
    const keys = { anniversary: 'anniversaries', date: 'dateRecords', wish: 'dateWishes' };
    if (!memoryTables[type]) throw new Error('Unknown memory type');
    if (mode === 'cloud') {
      const result = await client.from(memoryTables[type]).delete().eq('id', id);
      if (result.error) throw result.error;
      return;
    }
    const db = readDemo();
    db[keys[type]] = (db[keys[type]] || []).filter(row => row.id !== id);
    writeDemo(db);
  }

  async function setWishStatus(id, status) {
    if (mode === 'cloud') {
      const result = await client.from(memoryTables.wish).update({
        status,
        completed_at: status === 'done' ? new Date().toISOString() : null
      }).eq('id', id);
      if (result.error) throw result.error;
      return;
    }
    const db = readDemo();
    const row = (db.dateWishes || []).find(item => item.id === id);
    if (!row) return;
    row.status = status;
    row.completed_at = status === 'done' ? new Date().toISOString() : null;
    writeDemo(db);
  }

  async function deletePhoto(photo) {
    if (mode === 'cloud') {
      const metadata = await client.from('album_photos').delete().eq('id', photo.id);
      if (metadata.error) throw metadata.error;
      const object = await client.storage.from('couple-album').remove([photo.path]);
      if (object.error) throw object.error;
      return;
    }
    await photoStore('readwrite', store => store.delete(photo.id));
  }

  async function updateProfile() {
    return context;
  }

  async function rotateInvite(code) {
    if (context?.role !== 'a') throw new Error('Only the creator can renew the invitation code');
    if (mode === 'cloud') {
      const result = await client.rpc('pair_free_rotate_partner_code', { p_code: code });
      if (result.error) throw result.error;
      return code;
    }
    const db = readDemo();
    db.codes.b = normalizeCode(code);
    writeDemo(db);
    return code;
  }

  async function rotateRecovery(code) {
    if (!context) throw new Error('Pairing required');
    if (mode === 'cloud') {
      const result = await client.rpc('pair_free_rotate_my_code', { p_code: code });
      if (result.error) throw result.error;
      return code;
    }
    const db = readDemo();
    db.codes[db.role] = normalizeCode(code);
    writeDemo(db);
    return code;
  }

  async function exportData() {
    if (!context) return {};
    const [reviews, photos, memories] = await Promise.all([loadReviews(), getPhotos(), loadMemories()]);
    return {
      exportedAt: new Date().toISOString(),
      pair: context.pair,
      membership: context.membership,
      edition: 'haku-risa-all-free',
      visibleReviews: reviews,
      memories,
      albumMetadata: photos.map(({ url, blob, ...row }) => row)
    };
  }

  async function deleteAccount() {
    throw new Error('This dedicated edition keeps account deletion disabled for data safety');
  }

  window.TsukiBackend = {
    init, createPair, joinPair, switchDemoRole, loadReviews, monthStatus, submitReview,
    getPhotos, addPhoto, deletePhoto, loadMemories, createMemory, deleteMemory, setWishStatus,
    updateProfile, rotateInvite, rotateRecovery, exportData, deleteAccount,
    get mode() { return mode; },
    get context() { return context; }
  };
})();
