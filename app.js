(() => {
  'use strict';

  const backend = window.TsukiBackend;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const e = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const t = (ja, zh) => state.lang === 'zh' ? zh : ja;
  const pad = number => String(number).padStart(2, '0');
  const today = new Date();
  const monthKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
  const categories = [
    { key: 'communication', ja: '会話と傾聴', zh: '沟通与倾听' },
    { key: 'trust', ja: '信頼と安心', zh: '信任与安心' },
    { key: 'care', ja: '思いやり', zh: '体贴与关心' },
    { key: 'time', ja: '一緒の時間', zh: '相处的时间' },
    { key: 'support', ja: '支え合い', zh: '互相支持' },
    { key: 'affection', ja: '愛情表現', zh: '爱意表达' }
  ];
  const textFields = [
    { key: 'grateful', ja: '今月、感謝したこと', zh: '这个月最感谢对方的事' },
    { key: 'happy', ja: '一番うれしかった瞬間', zh: '最开心的瞬间' },
    { key: 'difficult', ja: '少し寂しかった・難しかったこと', zh: '有点难过或辛苦的事' },
    { key: 'hope', ja: '来月、一緒にしたいこと', zh: '下个月想一起做的事' },
    { key: 'selfChange', ja: '自分が少し変えたいこと', zh: '自己想稍微改变的地方' }
  ];
  const questionPacks = {
    standard: { ja: '基本の振り返り', zh: '基础回顾', questions: [] },
    future: {
      ja: 'これからのふたり', zh: '两个人的未来', questions: [
        { key: 'next_season', ja: '次の季節までに、ふたりでしたいこと', zh: '下个季节到来前想一起做的事' },
        { key: 'future_security', ja: 'これからについて、安心したいこと', zh: '关于未来，希望获得安心的事' },
        { key: 'small_promise', ja: '来月から始める、小さな約束', zh: '下个月开始的小约定' }
      ]
    },
    closeness: {
      ja: 'もっと近くなる', zh: '让彼此更亲近', questions: [
        { key: 'loved_moment', ja: '愛されていると感じた瞬間', zh: '感受到被爱的一刻' },
        { key: 'want_more', ja: 'もう少し増やしたいふたりの時間', zh: '希望再增加一点的相处时间' },
        { key: 'say_now', ja: '今だから伝えたいこと', zh: '现在最想告诉对方的话' }
      ]
    },
    repair: {
      ja: 'すれ違いをほどく', zh: '化解分歧', questions: [
        { key: 'misunderstood', ja: 'うまく伝わらなかった気持ち', zh: '没能好好传达的心情' },
        { key: 'need_support', ja: '相手に手伝ってほしいこと', zh: '希望对方给予帮助的事' },
        { key: 'repair_step', ja: 'ふたりで試したい、ひとつの改善', zh: '两个人想一起尝试的一项改善' }
      ]
    }
  };
  const renewLabels = {
    yes: { ja: 'このまま続けたい', zh: '想继续交往' },
    continue: { ja: 'このまま続けたい', zh: '想继续保持现在这样' },
    improve: { ja: '少し変えて続けたい', zh: '希望改善后继续' },
    talk: { ja: '話してから決めたい', zh: '想谈谈再决定' },
    end: { ja: '今回は更新しない', zh: '这次不续约' }
  };
  const state = {
    lang: localStorage.getItem('tsuki-language') || (navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'ja'),
    context: null,
    reviews: [],
    status: { a: false, b: false },
    photos: [],
    memories: { anniversaries: [], dateRecords: [], dateWishes: [] },
    selectedMonth: monthKey,
    editingMonth: null,
    lineProfile: null
  };

  const isPlus = () => true;
  const limitFor = key => Number(state.context?.limits?.[key] || ({ photos: 500, anniversaries: 500, date_records: 1000, date_wishes: 1000 }[key]));
  const isPositiveRenew = value => ['yes', 'continue', 'improve'].includes(value);
  const renewText = value => {
    const label = renewLabels[value] || renewLabels.talk;
    return t(label.ja, label.zh);
  };

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function errorText(error) {
    const message = String(error?.message || error || 'Unknown error');
    if (/Invalid invitation code|Invalid pairing code/i.test(message)) return t('招待コードが正しくありません。', '邀请码不正确。');
    if (/Both reviews are already submitted/i.test(message)) return t('相手が提出したため、回答はもう修正できません。', '对方已经提交，回答已锁定，无法再修改。');
    if (/Already submitted/i.test(message)) return t('今月の回答は提出済みです。', '本月回答已经提交。');
    if (/No submitted review/i.test(message)) return t('修正する回答が見つかりません。', '找不到需要修改的回答。');
    if (/Album quota/i.test(message)) return t('アルバムの保存上限に達しました。', '已达到相册保存上限。');
    if (/Anniversary quota|Date record quota|Date wish quota|Memory quota/i.test(message)) return t('保存上限に達しました。', '已达到保存上限。');
    if (/Free feature migration required/i.test(message)) return t('最新版のデータ更新が必要です。', '需要先完成最新版数据库更新。');
    if (/already has a demo pair/i.test(message)) return t('この端末にはすでにデモ空間があります。設定から削除できます。', '此设备已经有演示空间，可在设置中删除。');
    return message;
  }

  function applyLanguage() {
    document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'ja';
    $$('[data-ja][data-zh]').forEach(element => {
      element.textContent = element.dataset[state.lang];
    });
    localStorage.setItem('tsuki-language', state.lang);
    if (state.context) renderAll();
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(modal) {
    const target = typeof modal === 'string' ? document.getElementById(modal) : modal.closest('.modal');
    target?.classList.remove('open');
    target?.setAttribute('aria-hidden', 'true');
  }

  function showView(name) {
    $$('.view').forEach(view => view.classList.remove('active'));
    document.getElementById(`${name}View`)?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function randomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map(byte => alphabet[byte % alphabet.length]).join('').match(/.{1,4}/g).join('-');
  }

  function roleData(role) {
    const pair = state.context.pair;
    return role === 'a'
      ? { name: pair.name_a, initial: pair.initial_a }
      : { name: pair.name_b, initial: pair.initial_b };
  }

  function displayDate(value) {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
  }

  function daysSince(value) {
    if (!value) return '—';
    const start = new Date(`${value}T00:00:00`);
    return Math.max(0, Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - start) / 86400000) + 1);
  }

  function monthLabel(value, long = false) {
    const [year, month] = value.split('-');
    return state.lang === 'zh' ? `${year}年${Number(month)}月${long ? '契约' : ''}` : `${year}年${Number(month)}月${long ? 'の契約' : ''}`;
  }

  function nextMonth() {
    const date = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return date;
  }

  function reviewAverage(review) {
    return categories.reduce((sum, category) => sum + Number(review?.scores?.[category.key] || 0), 0) / categories.length;
  }

  function currentReview(role) {
    return state.reviews.find(row => row.month === activeMonthKey() && row.author_role === role);
  }

  function reviewsForMonth(month) {
    const rows = state.reviews.filter(row => row.month === month);
    return { a: rows.find(row => row.author_role === 'a'), b: rows.find(row => row.author_role === 'b') };
  }

  function activeMonthKey() {
    return state.selectedMonth || monthKey;
  }

  function previousMonthKey(value = monthKey) {
    const [year, month] = value.split('-').map(Number);
    const date = new Date(year, month - 2, 1);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`;
  }

  function completedMonths() {
    const months = [...new Set(state.reviews.map(row => row.month))].sort();
    return months.map(month => ({ month, ...reviewsForMonth(month) })).filter(item => item.a && item.b);
  }

  function renderPair() {
    const pair = state.context.pair;
    const a = roleData('a');
    const b = roleData('b');
    $('#sealNameA').textContent = a.name;
    $('#sealNameB').textContent = b.name;
    $('#heroMonth').textContent = monthLabel(activeMonthKey(), true);
    [['#avatarA', a.initial], ['#scoreAvatarA', a.initial], ['#avatarB', b.initial], ['#scoreAvatarB', b.initial]].forEach(([selector, value]) => $(selector).textContent = value);
    [['#nameA', a.name], ['#scoreNameA', a.name], ['#legendA', a.name], ['#nameB', b.name], ['#scoreNameB', b.name], ['#legendB', b.name]].forEach(([selector, value]) => $(selector).textContent = value);
    $('#metDate').textContent = displayDate(pair.met_date);
    $('#datingDate').textContent = displayDate(pair.dating_date);
    $('#metDays').textContent = daysSince(pair.met_date);
    $('#datingDays').textContent = daysSince(pair.dating_date);
    const next = nextMonth();
    const remaining = Math.max(0, Math.ceil((next - today) / 86400000));
    $('#nextDays').textContent = remaining;
    $('#nextDate').textContent = `${next.getFullYear()}.${pad(next.getMonth() + 1)}.01`;
  }

  function renderPlan() {
    const chip = $('#planChip');
    chip.textContent = 'ALL FREE';
    chip.classList.add('plus');
    $('#plusBannerTitle').textContent = t('最新版の全機能を無料で利用中', '最新版全部功能免费使用中');
    $('#plusBannerState').textContent = t('はく × りさ 専用', 'はく × りさ 专属');
    $('#plusBanner').classList.add('active');
  }

  function renderStatus() {
    const activeMonth = activeMonthKey();
    const carryover = activeMonth < monthKey;
    const count = Number(state.status.a) + Number(state.status.b);
    $('#monthProgressCount').textContent = `${count} / 2`;
    $('#monthProgressText').textContent = carryover
      ? t(`${Number(activeMonth.slice(5, 7))}月の契約はまだ完了していません`, `${Number(activeMonth.slice(5, 7))}月契约尚未完成`)
      : count === 2 ? t('今月の契約が完成しました', '本月契约已经完成') : count === 1 ? t('ひとりの手紙を預かっています', '已收到一人的来信') : t('今月の契約は進行中', '本月契约进行中');
    $('#stateA').textContent = state.status.a ? t('封印済み ✓', '已封存 ✓') : t('記入待ち', '等待填写');
    $('#stateB').textContent = state.status.b ? t('封印済み ✓', '已封存 ✓') : t('記入待ち', '等待填写');
    const carryoverBanner = $('#carryoverBanner');
    carryoverBanner.classList.toggle('hidden', !carryover);
    if (carryover) {
      $('#carryoverTitle').textContent = t(`${Number(activeMonth.slice(5, 7))}月の契約を先に完成させましょう`, `请先完成${Number(activeMonth.slice(5, 7))}月契约`);
      $('#carryoverText').textContent = t('提出済みの回答は安全に保存されています。もうひとりが提出すると、ふたりの契約が完成します。', '已提交的回答仍安全保存在云端；另一人补交后，两个人的契约即可完成。');
    }
    const mine = state.context.role;
    const submitted = state.status[mine];
    const button = $('#startReview');
    button.querySelector('span').textContent = count === 2
      ? t(`${Number(activeMonth.slice(5, 7))}月の契約を読む`, `查看${Number(activeMonth.slice(5, 7))}月契约`)
      : submitted
        ? t('提出済みの回答を確認する', '查看已提交的回答')
        : carryover
          ? t(`${Number(activeMonth.slice(5, 7))}月の振り返りを続ける`, `继续填写${Number(activeMonth.slice(5, 7))}月回顾`)
          : t('今月の振り返りを始める', '开始本月回顾');
    button.disabled = false;
  }

  function renderScores() {
    const completed = completedMonths();
    const latest = completed.at(-1);
    $('#totalA').textContent = latest ? reviewAverage(latest.b).toFixed(1) : '—';
    $('#totalB').textContent = latest ? reviewAverage(latest.a).toFixed(1) : '—';
    const chart = $('#trendChart');
    if (!completed.length) {
      chart.innerHTML = `<p>${t('最初の共同契約が完成すると表示されます。', '完成第一份共同契约后将显示趋势。')}</p>`;
      return;
    }
    const width = 720, height = 210, left = 34, right = 18, top = 15, bottom = 35;
    const x = index => completed.length === 1 ? width / 2 : left + index * ((width - left - right) / (completed.length - 1));
    const y = value => top + (10 - value) / 9 * (height - top - bottom);
    const pointsA = completed.map((item, index) => [x(index), y(reviewAverage(item.b))]);
    const pointsB = completed.map((item, index) => [x(index), y(reviewAverage(item.a))]);
    const path = points => points.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ');
    const grid = [1, 4, 7, 10].map(value => `<line x1="${left}" x2="${width-right}" y1="${y(value)}" y2="${y(value)}" stroke="#eadfd8" stroke-width="1"/><text x="5" y="${y(value)+3}" fill="#9a8e89" font-size="9">${value}</text>`).join('');
    const dots = (points, color) => points.map(point => `<circle cx="${point[0]}" cy="${point[1]}" r="4" fill="${color}"/>`).join('');
    const labels = completed.map((item, index) => `<text x="${x(index)}" y="${height-8}" text-anchor="middle" fill="#9a8e89" font-size="9">${Number(item.month.slice(5,7))}月</text>`).join('');
    chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly score chart">${grid}<path d="${path(pointsA)}" fill="none" stroke="#759da1" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="${path(pointsB)}" fill="none" stroke="#c8797b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots(pointsA, '#759da1')}${dots(pointsB, '#c8797b')}${labels}</svg>`;
  }

  function renderHistory() {
    const list = $('#historyList');
    const completed = completedMonths().reverse();
    if (!completed.length) {
      list.innerHTML = `<div class="empty">${t('最初の契約は、ふたりの提出後にここへ保存されます。毎月の契約はすべて新しい記録として残ります。', '双方完成第一份契约后会保存在这里。以后每个月的契约都会成为一条新记录。')}</div>`;
      return;
    }
    list.innerHTML = completed.map(item => {
      const continued = isPositiveRenew(item.a.renew) && isPositiveRenew(item.b.renew);
      const average = ((reviewAverage(item.a) + reviewAverage(item.b)) / 2).toFixed(1);
      const ended = item.a.renew === 'end' || item.b.renew === 'end';
      return `<button class="history-item" data-month="${item.month}"><div><b>${monthLabel(item.month, true)}</b><small>${t('ふたりの平均', '两人平均')} ${average} / 10</small></div><span>${continued ? t('契約継続', '继续交往') : ended ? t('更新なし', '未续约') : t('対話を選択', '选择沟通')}</span></button>`;
    }).join('');
  }

  function renderAlbum() {
    const limit = limitFor('photos');
    $('#albumUsage').textContent = `${state.photos.length} / ${limit}`;
    $('#albumUsage').nextElementSibling.textContent = t('専用版・無料', '专属版・免费');
    const grid = $('#albumGrid');
    if (!state.photos.length) {
      grid.innerHTML = `<div class="empty">${t('まだ写真はありません。ふたりの最初の一枚を追加してみよう。', '还没有照片，添加属于两个人的第一张回忆吧。')}</div>`;
      return;
    }
    grid.innerHTML = state.photos.map(photo => `<article class="photo-card"><img src="${e(photo.url)}" alt="${e(photo.name || '')}" loading="lazy"><footer><span>${e((photo.created_at || '').slice(0,10))}</span><button data-delete-photo="${photo.id}" aria-label="Delete">×</button></footer></article>`).join('');
  }

  function nextOccurrence(value) {
    if (!value) return null;
    const source = new Date(`${value}T00:00:00`);
    let result = new Date(today.getFullYear(), source.getMonth(), source.getDate());
    if (result < new Date(today.getFullYear(), today.getMonth(), today.getDate())) result = new Date(today.getFullYear() + 1, source.getMonth(), source.getDate());
    return Math.ceil((result - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  }

  function memoryEmpty(messageJa, messageZh) {
    return `<div class="memory-empty">${t(messageJa, messageZh)}</div>`;
  }

  function renderMemories() {
    const { anniversaries, dateRecords, dateWishes } = state.memories;
    $('#anniversaryList').innerHTML = anniversaries.length ? anniversaries.map(item => `<article class="memory-item"><div><b>${e(item.title)}</b><small>${displayDate(item.event_date)} · ${t('あと', '还有')} ${nextOccurrence(item.event_date)} ${t('日', '天')}</small>${item.note ? `<p>${e(item.note)}</p>` : ''}</div><button data-delete-memory="anniversary" data-id="${item.id}">×</button></article>`).join('') : memoryEmpty('まだ記念日はありません。', '还没有纪念日。');
    $('#dateRecordList').innerHTML = dateRecords.length ? dateRecords.map(item => `<article class="memory-item"><div><b>${e(item.title)}</b><small>${displayDate(item.date_on)}${item.place ? ` · ${e(item.place)}` : ''}</small>${item.memory ? `<p>${e(item.memory)}</p>` : ''}</div><button data-delete-memory="date" data-id="${item.id}">×</button></article>`).join('') : memoryEmpty('最初のデートを残してみよう。', '记录第一次约会吧。');
    $('#dateWishList').innerHTML = dateWishes.length ? dateWishes.map(item => `<article class="memory-item ${item.status === 'done' ? 'done' : ''}"><button class="wish-check" data-wish-status="${item.status === 'done' ? 'planned' : 'done'}" data-id="${item.id}">${item.status === 'done' ? '✓' : '○'}</button><div><b>${e(item.title)}</b>${item.place ? `<small>${e(item.place)}</small>` : ''}${item.note ? `<p>${e(item.note)}</p>` : ''}</div><button data-delete-memory="wish" data-id="${item.id}">×</button></article>`).join('') : memoryEmpty('ふたりで行きたい場所を追加しよう。', '添加两个人想去的地方吧。');
  }

  function renderInsights() {
    const content = $('#insightsContent');
    if (!isPlus()) {
      content.innerHTML = `<div class="insights-lock"><span>＋</span><div><b>${t('毎月の変化を深く読む', '深入了解每月变化')}</b><p>${t('得点差・前月比・会話のヒントを、ふたりだけのレポートにまとめます。', '将评分差、环比变化与沟通提示整理成两个人的专属报告。')}</p></div></div>`;
      bindPricingButtons();
      return;
    }
    const completed = completedMonths();
    if (!completed.length) {
      content.innerHTML = `<div class="empty">${t('最初の共同契約が完成すると、関係レポートが表示されます。', '完成第一份共同契约后将显示关系报告。')}</div>`;
      return;
    }
    const latest = completed.at(-1);
    const previous = completed.at(-2);
    const pairAverage = item => (reviewAverage(item.a) + reviewAverage(item.b)) / 2;
    const change = previous ? pairAverage(latest) - pairAverage(previous) : null;
    const categoryRows = categories.map(category => ({ ...category, value: (Number(latest.a.scores[category.key]) + Number(latest.b.scores[category.key])) / 2 }));
    const strongest = [...categoryRows].sort((a,b) => b.value-a.value)[0];
    const focus = [...categoryRows].sort((a,b) => a.value-b.value)[0];
    const gap = Math.abs(reviewAverage(latest.a) - reviewAverage(latest.b));
    content.innerHTML = `<div class="insight-grid"><article><span>${t('今月のふたり平均', '本月两人平均')}</span><strong>${pairAverage(latest).toFixed(1)}</strong><small>/10</small></article><article><span>${t('前月から', '较上月')}</span><strong>${change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}`}</strong></article><article><span>${t('得点の感じ方の差', '评分感受差')}</span><strong>${gap.toFixed(1)}</strong></article></div><div class="insight-notes"><p><b>${t('今月の強み', '本月优势')}：</b>${t(strongest.ja,strongest.zh)} (${strongest.value.toFixed(1)})</p><p><b>${t('話してみたいテーマ', '建议沟通主题')}：</b>${t(focus.ja,focus.zh)} (${focus.value.toFixed(1)})</p><p>${t('数値は関係の良し悪しを決めるものではなく、会話を始めるための目印です。', '分数不是判断关系好坏的标准，而是开启沟通的提示。')}</p></div>`;
  }

  function renderAll() {
    if (!state.context) return;
    renderPair();
    renderPlan();
    renderStatus();
    renderScores();
    renderHistory();
    renderAlbum();
    renderMemories();
    renderInsights();
    $('#demoWarning').classList.toggle('hidden', backend.mode !== 'demo');
  }

  async function refreshData() {
    state.context = backend.context;
    if (!state.context) return;
    const previousMonth = previousMonthKey();
    const [reviews, currentStatus, previousStatus, photos, memories] = await Promise.all([
      backend.loadReviews(), backend.monthStatus(monthKey), backend.monthStatus(previousMonth), backend.getPhotos(), backend.loadMemories()
    ]);
    const visiblePrevious = reviews.filter(row => row.month === previousMonth);
    const resolvedPreviousStatus = {
      a: previousStatus.a || visiblePrevious.some(row => row.author_role === 'a'),
      b: previousStatus.b || visiblePrevious.some(row => row.author_role === 'b')
    };
    const previousCount = Number(resolvedPreviousStatus.a) + Number(resolvedPreviousStatus.b);
    state.reviews = reviews;
    state.selectedMonth = previousCount === 1 ? previousMonth : monthKey;
    state.status = previousCount === 1 ? resolvedPreviousStatus : currentStatus;
    state.photos = photos;
    state.memories = memories;
    renderAll();
  }

  function renderReviewForm(review = null) {
    const mine = roleData(state.context.role);
    const activeMonth = activeMonthKey();
    $('#reviewMonthLabel').textContent = `${monthLabel(activeMonth, true)} · SEALED LETTER`;
    $('#reviewerName').textContent = mine.name;
    $('#reviewForm').reset();
    $('#scoreFields').innerHTML = categories.map(category => `<div class="score-row"><label><b>${t(category.ja, category.zh)}</b><small>${t('パートナーへの評価', '给对象的评价')}</small></label><input type="range" name="${category.key}" min="1" max="10" value="7"><output class="score-value">7</output></div>`).join('');
    $('#textFields').innerHTML = textFields.map(field => `<div class="field"><label>${t(field.ja, field.zh)}<small>${t('短くても、正直な言葉で大丈夫です。', '写得简短也没关系，真诚就好。')}</small></label><textarea required maxlength="500" name="${field.key}"></textarea></div>`).join('');
    $('#questionPack').innerHTML = Object.entries(questionPacks).map(([key, pack]) => `<option value="${key}">${t(pack.ja,pack.zh)}</option>`).join('');
    const packKey = review?.question_pack || 'standard';
    $('#questionPack').value = packKey;
    renderExtraFields(packKey);
    $('#questionPack').onchange = event => renderExtraFields(event.target.value);
    $$('#scoreFields input').forEach(input => input.addEventListener('input', () => input.nextElementSibling.textContent = input.value));
    const submitText = $('#reviewForm .submit-zone .primary-button span');
    submitText.textContent = review ? t('修正内容を保存', '保存修改内容') : t('回答を封印して提出', '密封并提交回答');
    if (!review) return;
    categories.forEach(category => {
      const input = $('#reviewForm').elements[category.key];
      input.value = Number(review.scores?.[category.key] || 7);
      input.nextElementSibling.textContent = input.value;
    });
    textFields.forEach(field => {
      const key = field.key === 'selfChange' ? 'self_change' : field.key;
      $('#reviewForm').elements[field.key].value = review[key] || '';
    });
    (questionPacks[packKey]?.questions || []).forEach(question => {
      $('#reviewForm').elements[`extra_${question.key}`].value = review.extra_answers?.[question.key] || '';
    });
    const renew = $('#reviewForm').querySelector(`[name="renew"][value="${review.renew}"]`);
    if (renew) renew.checked = true;
  }

  function renderLateView() {
    const activeMonth = activeMonthKey();
    const monthNumber = Number(activeMonth.slice(5, 7));
    $('#lateMonthText').textContent = t(
      `${monthNumber}月の手紙が、あなたの回答を待っています。`,
      `${monthNumber}月的来信正在等待你的回答。`
    );
    $('#lateContinueText').textContent = t(
      `${monthNumber}月を振り返る`,
      `回顾${monthNumber}月`
    );
    showView('late');
  }

  function renderExtraFields(packKey) {
    const pack = questionPacks[packKey] || questionPacks.standard;
    $('#extraFields').innerHTML = pack.questions.length
      ? `<div class="extra-question-list">${pack.questions.map(question => `<div class="field"><label>${t(question.ja,question.zh)}<small>${t('ふたりだけの回答として保存されます。', '将作为两个人的专属回答保存。')}</small></label><textarea required maxlength="500" name="extra_${question.key}"></textarea></div>`).join('')}</div>`
      : `<p class="pack-note">${t('いつもの5つの質問で振り返ります。', '使用常规的5个问题进行回顾。')}</p>`;
  }

  function renderResult(month) {
    const { a, b } = reviewsForMonth(month);
    if (!a || !b) return;
    const personA = roleData('a'), personB = roleData('b');
    const continued = isPositiveRenew(a.renew) && isPositiveRenew(b.renew);
    const ended = a.renew === 'end' || b.renew === 'end';
    const headline = continued ? t('来月も、よろしくね ♡', '下个月，也请继续相爱 ♡') : ended ? t('ふたりの答えを、丁寧に受け止めよう', '认真面对两个人的答案') : t('まずは、ゆっくり話そう', '先停下来，好好聊聊');
    $('#resultHero').innerHTML = `<span class="section-kicker">${e(monthLabel(month, true))}</span><h1>${headline}</h1><p>${e(personA.name)}：${renewText(a.renew)}<br>${e(personB.name)}：${renewText(b.renew)}</p>`;
    $('#scoreCompare').innerHTML = categories.map(category => `<article class="score-box"><span>${t(category.ja, category.zh)}</span><strong>${((Number(a.scores[category.key]) + Number(b.scores[category.key])) / 2).toFixed(1)}</strong><small>${e(personA.name)} ${a.scores[category.key]} · ${e(personB.name)} ${b.scores[category.key]}</small></article>`).join('');
    $('#wordsCompare').innerHTML = [['a', a, personA], ['b', b, personB]].map(([, review, person]) => {
      const pack = questionPacks[review.question_pack] || questionPacks.standard;
      const extras = pack.questions.map(question => `<div class="quote-block plus-quote"><span>${t(question.ja,question.zh)}</span><p>${e(review.extra_answers?.[question.key] || '—')}</p></div>`).join('');
      return `<article class="words-person"><h2>${e(person.name)} ${t('から、ふたりへ', '写给我们')}</h2>${textFields.map(field => `<div class="quote-block"><span>${t(field.ja, field.zh)}</span><p>${e(review[field.key === 'selfChange' ? 'self_change' : field.key])}</p></div>`).join('')}${extras}</article>`;
    }).join('');
    showView('result');
  }

  function renderOwnReview(month) {
    const review = state.reviews.find(row => row.month === month && row.author_role === state.context.role);
    if (!review) return;
    const person = roleData(state.context.role);
    const pack = questionPacks[review.question_pack] || questionPacks.standard;
    const extras = pack.questions.map(question => `<div class="quote-block plus-quote"><span>${t(question.ja,question.zh)}</span><p>${e(review.extra_answers?.[question.key] || '—')}</p></div>`).join('');
    $('#resultHero').innerHTML = `<span class="section-kicker">${e(monthLabel(month, true))}</span><h1>${t('回答は安全に保存されています', '回答已安全保存')}</h1><p>${t('相手が提出するまで、ここでは自分の回答だけ確認できます。', '对方提交前，这里只会显示你自己的回答。')}</p>`;
    $('#scoreCompare').innerHTML = categories.map(category => `<article class="score-box"><span>${t(category.ja, category.zh)}</span><strong>${Number(review.scores?.[category.key] || 0)}</strong><small>/ 10</small></article>`).join('');
    $('#wordsCompare').innerHTML = `<article class="words-person own-review"><h2>${e(person.name)} ${t('の提出済み回答', '已提交的回答')}</h2>${textFields.map(field => `<div class="quote-block"><span>${t(field.ja, field.zh)}</span><p>${e(review[field.key === 'selfChange' ? 'self_change' : field.key])}</p></div>`).join('')}${extras}<div class="quote-block"><span>${t('来月も一緒にいたい？', '下个月还想继续在一起吗？')}</span><p>${e(renewText(review.renew))}</p></div></article>`;
    $('#wordsCompare').insertAdjacentHTML('beforeend', `<div class="own-review-actions"><button id="editOwnReview" class="ghost-button" type="button">${t('提出内容を修正する', '修改已提交内容')}</button><p>${t('相手が提出するまで修正できます。', '对方提交前可以修改。')}</p></div>`);
    $('#editOwnReview').onclick = () => {
      state.editingMonth = month;
      renderReviewForm(review);
      showView('review');
    };
    showView('result');
  }

  async function initLine() {
    const config = window.TSUKIMUSUBI_CONFIG || {};
    if (!config.liffId || !window.liff) return;
    try {
      await liff.init({ liffId: config.liffId });
      if (!liff.isLoggedIn()) {
        $('#lineState span').textContent = 'LINE';
        return;
      }
      state.lineProfile = await liff.getProfile();
      $('#lineState').classList.add('connected');
      $('#lineState span').textContent = state.lineProfile.displayName || 'LINE';
    } catch (error) {
      console.warn('LINE initialization failed', error);
    }
  }

  function codesMarkup(codeA, codeB) {
    return `<div class="code-card"><span>${t('あなたの復元コード', '你的恢复码')}</span><strong>${e(codeA)}</strong><button data-copy="${e(codeA)}">${t('コピー', '复制')}</button></div><div class="code-card partner"><span>${t('パートナーへの招待コード', '给对象的邀请码')}</span><strong>${e(codeB)}</strong><button data-copy="${e(codeB)}">${t('コピー', '复制')}</button></div><p class="tiny">${t('この2つを知っている人は対応する役割で参加できます。公開しないでください。', '知道代码的人可以用对应身份加入，请勿公开。')}</p>`;
  }

  async function handleCreate(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    const form = new FormData(event.currentTarget);
    const codeA = randomCode(), codeB = randomCode();
    try {
      await backend.createPair({
        nameA: form.get('nameA').trim(), initialA: form.get('initialA').trim(),
        nameB: form.get('nameB').trim(), initialB: form.get('initialB').trim(),
        metDate: form.get('metDate'), datingDate: form.get('datingDate'), codeA, codeB
      });
      state.context = backend.context;
      closeModal('createModal');
      $('#createdCodes').innerHTML = codesMarkup(codeA, codeB);
      bindCopyButtons();
      $('#codesSaved').checked = false;
      $('#finishCodes').disabled = true;
      openModal('codesModal');
      await refreshData();
    } catch (error) { showToast(errorText(error)); }
    finally { button.disabled = false; }
  }

  async function handleJoin(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      await backend.joinPair(new FormData(event.currentTarget).get('code'));
      state.context = backend.context;
      closeModal('joinModal');
      await refreshData();
      showView('home');
    } catch (error) { showToast(errorText(error)); }
    finally { button.disabled = false; }
  }

  async function handleReview(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    const form = new FormData(event.currentTarget);
    const scores = Object.fromEntries(categories.map(category => [category.key, Number(form.get(category.key))]));
    const questionPack = form.get('questionPack') || 'standard';
    const extraAnswers = Object.fromEntries((questionPacks[questionPack]?.questions || []).map(question => [question.key, form.get(`extra_${question.key}`)?.trim() || '']));
    const review = { scores, renew: form.get('renew'), questionPack, extraAnswers };
    textFields.forEach(field => review[field.key] = form.get(field.key).trim());
    const submittedMonth = activeMonthKey();
    const wasEditing = state.editingMonth === submittedMonth;
    try {
      if (wasEditing) await backend.updateReview(submittedMonth, review);
      else await backend.submitReview(submittedMonth, review);
      state.editingMonth = null;
      await refreshData();
      showView('home');
      showToast(wasEditing
        ? t('修正内容を保存しました。', '修改内容已保存。')
        : t('回答を安全に封印しました。', '回答已安全封存。'));
      const submittedPair = reviewsForMonth(submittedMonth);
      if (submittedPair.a && submittedPair.b) renderResult(submittedMonth);
    } catch (error) { showToast(errorText(error)); }
    finally { button.disabled = false; }
  }

  async function compressPhoto(file) {
    if (!file.type.startsWith('image/')) throw new Error(t('画像ファイルを選んでください。', '请选择图片文件。'));
    const bitmap = window.createImageBitmap ? await createImageBitmap(file) : await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = URL.createObjectURL(file);
    });
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let quality = .84;
    let blob;
    do {
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      quality -= .1;
    } while (blob.size > 900000 && quality >= .44);
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  }

  async function handlePhotos(files) {
    const limit = limitFor('photos');
    if (state.photos.length >= limit) return showToast(t('アルバムの保存上限に達しました。', '已达到相册保存上限。'));
    const available = limit - state.photos.length;
    for (const file of [...files].slice(0, available)) {
      try { await backend.addPhoto(await compressPhoto(file)); }
      catch (error) { showToast(errorText(error)); break; }
    }
    state.photos = await backend.getPhotos();
    renderAlbum();
  }

  function bindPricingButtons() {
    $$('.open-pricing').forEach(button => button.onclick = () => openModal('pricingModal'));
  }

  function openMemoryForm(type) {
    const form = $('#memoryForm');
    form.reset();
    form.elements.type.value = type;
    const definitions = {
      anniversary: { ja: '記念日を追加', zh: '添加纪念日', date: true, place: false },
      date: { ja: 'デート記録を追加', zh: '添加约会记录', date: true, place: true },
      wish: { ja: '一緒にしたいことを追加', zh: '添加想一起做的事', date: false, place: true }
    };
    const definition = definitions[type];
    if (!definition) return;
    $('#memoryModalTitle').textContent = t(definition.ja,definition.zh);
    form.elements.date.required = definition.date;
    form.elements.date.closest('label').classList.toggle('hidden',!definition.date);
    $('#memoryPlaceField').classList.toggle('hidden',!definition.place);
    openModal('memoryModal');
  }

  async function handleMemory(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    const form = new FormData(event.currentTarget);
    try {
      await backend.createMemory(form.get('type'), {
        date: form.get('date') || null,
        title: form.get('title').trim(),
        place: form.get('place')?.trim() || '',
        note: form.get('note')?.trim() || ''
      });
      state.memories = await backend.loadMemories();
      renderMemories();
      closeModal('memoryModal');
      showToast(t('ふたりの思い出に追加しました。', '已添加到两个人的回忆。'));
    } catch (error) { showToast(errorText(error)); }
    finally { button.disabled = false; }
  }

  function renderSettings() {
    const content = $('#settingsContent');
    if (!state.context) {
      content.innerHTML = `<section class="settings-section"><h3>${t('表示言語', '显示语言')}</h3>${languageButtons()}</section><section class="settings-section"><p class="tiny">${t('空間を作成または参加すると、プロフィールとデータ管理が表示されます。', '创建或加入空间后，将显示个人资料与数据管理。')}</p></section>`;
      bindSettings();
      return;
    }
    const me = roleData(state.context.role);
    content.innerHTML = `<section class="settings-section plan-settings"><h3>TSUKIMUSUBI · ALL FREE</h3><p>${t('はく × りさ専用版では、最新版の全機能を無料で利用できます。', 'はく × りさ专属版可以免费使用最新版全部功能。')}</p></section><section class="settings-section"><h3>${t('あなたのプロフィール', '你的个人资料')}</h3><p>${e(me.initial)} · ${e(me.name)}</p><p class="tiny">${t('専用版のプロフィールは固定されています。', '专属版的个人资料已固定。')}</p></section><section class="settings-section"><h3>${t('表示言語', '显示语言')}</h3>${languageButtons()}</section>${state.context.role === 'a' ? `<section class="settings-section"><h3>${t('新しい招待コード', '新的邀请码')}</h3><p class="tiny">${t('以前のパートナー用コードを無効にし、新しいコードを一度だけ表示します。', '旧的对象邀请码将失效，新代码只显示一次。')}</p><button id="rotateInvite" class="settings-button">${t('招待コードを再発行', '重新生成邀请码')}</button><div id="rotatedCode"></div></section>` : ''}${backend.mode === 'demo' ? `<section class="settings-section"><h3>${t('デモ用の役割切替', '演示身份切换')}</h3><div class="language-buttons"><button data-role="a">${e(roleData('a').name)}</button><button data-role="b">${e(roleData('b').name)}</button></div></section>` : ''}<section class="settings-section"><h3>${t('データ管理', '数据管理')}</h3><div class="language-buttons"><button id="exportData">${t('データを書き出す', '导出数据')}</button></div><p class="tiny">${t('既存の契約・写真・思い出は、そのまま専用クラウドに保存されます。', '已有契约、照片和回忆会继续保存在专属云端。')}</p></section>`;
    content.insertAdjacentHTML('beforeend', `<section class="settings-section"><h3>${t('自分の復元コード', '自己的恢复码')}</h3><p class="tiny">${t('機種変更用の新しいコードを一度だけ表示します。以前の自分用コードは無効になります。', '将显示一次用于换手机的新代码，旧的个人恢复码会失效。')}</p><button id="rotateRecovery" class="settings-button">${t('復元コードを再発行', '重新生成恢复码')}</button><div id="rotatedRecovery"></div></section>`);
    bindSettings();
  }

  function languageButtons() {
    return `<div class="language-buttons"><button data-lang="ja" class="${state.lang === 'ja' ? 'active' : ''}">日本語</button><button data-lang="zh" class="${state.lang === 'zh' ? 'active' : ''}">中文</button></div>`;
  }

  function downloadJson(data, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.click();
    URL.revokeObjectURL(url);
  }

  function bindSettings() {
    bindPricingButtons();
    $$('[data-lang]').forEach(button => button.onclick = () => { state.lang = button.dataset.lang; applyLanguage(); renderSettings(); });
    $('#profileForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try { await backend.updateProfile(form.get('name').trim(), form.get('initial').trim()); state.context = backend.context; renderAll(); renderSettings(); showToast(t('保存しました。', '已保存。')); }
      catch (error) { showToast(errorText(error)); }
    });
    $('#rotateInvite')?.addEventListener('click', async () => {
      const code = randomCode();
      try { await backend.rotateInvite(code); $('#rotatedCode').innerHTML = `<div class="code-card partner"><span>${t('新しいパートナー招待コード', '新的对象邀请码')}</span><strong>${code}</strong><button data-copy="${code}">${t('コピー', '复制')}</button></div>`; bindCopyButtons(); }
      catch (error) { showToast(errorText(error)); }
    });
    $('#rotateRecovery')?.addEventListener('click', async () => {
      const code = randomCode();
      try { await backend.rotateRecovery(code); $('#rotatedRecovery').innerHTML = `<div class="code-card"><span>${t('新しい自分の復元コード', '新的个人恢复码')}</span><strong>${code}</strong><button data-copy="${code}">${t('コピー', '复制')}</button></div>`; bindCopyButtons(); }
      catch (error) { showToast(errorText(error)); }
    });
    $$('[data-role]').forEach(button => button.onclick = async () => { await backend.switchDemoRole(button.dataset.role); state.context = backend.context; await refreshData(); closeModal('settingsModal'); showToast(t('デモの役割を切り替えました。', '已切换演示身份。')); });
    $('#exportData')?.addEventListener('click', async () => downloadJson(await backend.exportData(), `tsukimusubi-${new Date().toISOString().slice(0,10)}.json`));
    $('#deleteAccount')?.addEventListener('click', async () => {
      const confirmed = confirm(t('この端末の会員情報を削除します。最後のメンバーの場合、ふたりのデータも削除されます。続けますか？', '将删除此设备的会员信息。如果这是最后一名成员，两人的数据也会删除。继续吗？'));
      if (!confirmed) return;
      try { await backend.deleteAccount(); state.context = null; state.reviews = []; state.photos = []; state.memories = { anniversaries: [], dateRecords: [], dateWishes: [] }; closeModal('settingsModal'); showView('welcome'); showToast(t('削除しました。', '已删除。')); }
      catch (error) { showToast(errorText(error)); }
    });
  }

  function renderLegal(type) {
    const privacy = state.lang === 'zh'
      ? `<span class="section-kicker">PRIVACY</span><h2>隐私政策</h2><p>月结会处理提供契约、历史、纪念日、约会记录、愿望与共享相册所需的信息。回答在双方提交前不会向对象公开。</p><h3>数据用途</h3><ul><li>提供、维护与保护服务</li><li>排查故障及防止滥用</li><li>根据用户请求导出或删除数据</li></ul><h3>保存与删除</h3><p>照片存放在私有存储空间。用户可在设置中删除账户，最后一名成员删除后，配对数据将一并删除。</p><p><a href="privacy.html" target="_blank" rel="noopener">查看完整隐私政策</a></p>`
      : `<span class="section-kicker">PRIVACY</span><h2>プライバシーポリシー</h2><p>月結びは、契約、履歴、記念日、デート記録、行きたい場所、共有アルバムの提供に必要な情報を取り扱います。回答は双方が提出するまで相手に公開されません。</p><h3>利用目的</h3><ul><li>サービスの提供・保守・安全確保</li><li>不具合調査および不正利用の防止</li><li>利用者の求めに応じたデータの出力・削除</li></ul><h3>保存と削除</h3><p>写真は非公開ストレージに保存します。設定からアカウントを削除でき、最後のメンバーが削除した場合はペアデータも削除します。</p><p><a href="privacy.html" target="_blank" rel="noopener">完全版のプライバシーポリシーを確認</a></p>`;
    const terms = state.lang === 'zh'
      ? `<span class="section-kicker">TERMS</span><h2>使用条款</h2><p>本专属版本供はく与りさ在双方自愿同意的前提下记录关系回顾。不得擅自上传第三人的照片或个人信息，也不得公开邀请码。</p><h3>费用</h3><p>这个两人专属版本的全部功能免费，不设应用内购买。</p><h3>服务性质</h3><p>功能可能变更或暂停，重要内容请自行导出备份。本服务不能代替紧急援助或专业咨询。</p><p><a href="terms.html" target="_blank" rel="noopener">查看完整使用条款</a></p>`
      : `<span class="section-kicker">TERMS</span><h2>利用規約</h2><p>本専用版は、はくとりさが双方の自由な同意のもとで関係を振り返るために利用できます。第三者の写真・個人情報を無断で投稿したり、招待コードを公開したりしないでください。</p><h3>料金</h3><p>このふたり専用版は、最新版のすべての機能を無料で利用でき、アプリ内課金はありません。</p><h3>サービスの性質</h3><p>機能の変更・停止があります。大切な内容は書き出し機能で保管してください。本サービスは緊急支援や専門家への相談を代替しません。</p><p><a href="terms.html" target="_blank" rel="noopener">完全版の利用規約を確認</a></p>`;
    $('#legalContent').innerHTML = type === 'privacy' ? privacy : terms;
    openModal('legalModal');
  }

  function bindCopyButtons() {
    $$('[data-copy]').forEach(button => button.onclick = async () => {
      try { await navigator.clipboard.writeText(button.dataset.copy); showToast(t('コピーしました。', '已复制。')); }
      catch { showToast(t('長押ししてコピーしてください。', '请长按复制。')); }
    });
  }

  function bindEvents() {
    $('#openCreate').onclick = () => openModal('createModal');
    $('#openJoin').onclick = () => openModal('joinModal');
    $('#createForm').addEventListener('submit', handleCreate);
    $('#joinForm').addEventListener('submit', handleJoin);
    $('#reviewForm').addEventListener('submit', handleReview);
    $('#memoryForm').addEventListener('submit', handleMemory);
    $('#settingsButton').onclick = () => { renderSettings(); openModal('settingsModal'); };
    $('#homeButton').onclick = () => showView(state.context ? 'home' : 'welcome');
    $$('[data-close]').forEach(button => button.onclick = () => closeModal(button));
    $$('.back-button').forEach(button => button.onclick = () => showView(button.dataset.target));
    $('#codesSaved').onchange = event => $('#finishCodes').disabled = !event.target.checked;
    $('#finishCodes').onclick = () => { closeModal('codesModal'); showView('home'); };
    $('#startReview').onclick = () => {
      const activeMonth = activeMonthKey();
      if (state.status.a && state.status.b) return renderResult(activeMonth);
      if (state.status[state.context.role]) return renderOwnReview(activeMonth);
      if (activeMonth < monthKey) return renderLateView();
      state.editingMonth = null;
      renderReviewForm(); showView('review');
    };
    $('#lateContinue').onclick = () => { state.editingMonth = null; renderReviewForm(); showView('review'); };
    $('#historyList').onclick = event => { const item = event.target.closest('[data-month]'); if (item) renderResult(item.dataset.month); };
    $$('[data-add-memory]').forEach(button => button.onclick = () => openMemoryForm(button.dataset.addMemory));
    $('.memory-section').onclick = async event => {
      const remove = event.target.closest('[data-delete-memory]');
      if (remove) {
        if (!confirm(t('この記録を削除しますか？', '要删除这条记录吗？'))) return;
        try { await backend.deleteMemory(remove.dataset.deleteMemory,remove.dataset.id); state.memories = await backend.loadMemories(); renderMemories(); }
        catch (error) { showToast(errorText(error)); }
        return;
      }
      const status = event.target.closest('[data-wish-status]');
      if (status) {
        try { await backend.setWishStatus(status.dataset.id,status.dataset.wishStatus); state.memories = await backend.loadMemories(); renderMemories(); }
        catch (error) { showToast(errorText(error)); }
      }
    };
    $('#photoInput').onchange = event => { handlePhotos(event.target.files); event.target.value = ''; };
    $('#albumGrid').onclick = async event => {
      const button = event.target.closest('[data-delete-photo]');
      if (!button) return;
      const photo = state.photos.find(item => item.id === button.dataset.deletePhoto);
      if (!photo || !confirm(t('この写真を削除しますか？', '要删除这张照片吗？'))) return;
      try { await backend.deletePhoto(photo); state.photos = await backend.getPhotos(); renderAlbum(); }
      catch (error) { showToast(errorText(error)); }
    };
    $$('[data-legal]').forEach(button => button.onclick = () => renderLegal(button.dataset.legal));
    bindPricingButtons();
    document.addEventListener('keydown', event => { if (event.key === 'Escape') $$('.modal.open').forEach(closeModal); });
  }

  async function init() {
    applyLanguage();
    bindEvents();
    await initLine();
    try {
      const result = await backend.init();
      state.context = result.context;
      if (state.context) { await refreshData(); showView('home'); }
      else showView('welcome');
    } catch (error) {
      console.error(error);
      showToast(t('クラウドへの接続に失敗しました。設定を確認してください。', '云端连接失败，请检查配置。'));
      showView('welcome');
    }
  }

  init();
})();
