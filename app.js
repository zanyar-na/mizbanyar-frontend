// app.js — MizbanYar frontend logic, wired to the real backend API.
//
// API base: change API_BASE if the backend runs on a different host/port.
// All data on dashboard pages is now fetched live from /api/* endpoints
// instead of being hardcoded, with graceful fallback if the backend
// is unreachable (e.g. when this file is opened directly without the
// server running) so the UI never breaks for a demo/preview.

const API_BASE = 'https://mizbanyar-backend-production.up.railway.app/api';

let STATE = {
  workspaceId: null,
  properties: [],
  activePropertyId: null,
  backendOnline: false,
};

// ── NAV ──
function go(v) {
  document.querySelectorAll('.view').forEach(e => e.classList.remove('active'));
  document.getElementById('view-' + v).classList.add('active');
  if (v === 'landing') {
    document.querySelectorAll('.nav-link').forEach((e, i) => {
      if (i === 0) e.classList.add('active'); else e.classList.remove('active');
    });
  }
  if (v === 'dash' && STATE.backendOnline) refreshActiveSection();
}
function goLanding(anchor) {
  go('landing');
  setTimeout(() => {
    const el = document.getElementById(anchor);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}
function dsec(s, btn) {
  document.querySelectorAll('.dash-inner').forEach(e => e.classList.remove('active'));
  document.getElementById('sec-' + s).classList.add('active');
  document.querySelectorAll('.sb-item').forEach(e => e.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadSection(s);
}

// ── HELPERS ──
function toFA(n) { return String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]); }
function fmtToman(n) {
  if (n === null || n === undefined) return '—';
  return toFA(new Intl.NumberFormat('en-US').format(Math.round(n)));
}
function fmtShort(n) {
  if (n >= 1000000) return toFA((n / 1000000).toFixed(1).replace(/\.0$/, '')) + 'M';
  if (n >= 1000) return toFA((n / 1000).toFixed(0)) + 'K';
  return toFA(n);
}
function showToast(msg, isError) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  if (isError) t.style.background = 'var(--red)';
  t.innerHTML = `<i class="ti ti-${isError ? 'alert-circle' : 'check'}" style="font-size:14px"></i>${msg}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let body;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const err = new Error(body?.error || `درخواست ناموفق (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// ── BOOTSTRAP ──
async function bootstrap() {
  try {
    const data = await api('/bootstrap');
    if (!data?.workspace) throw new Error('فضای کاری یافت نشد');
    STATE.workspaceId = data.workspace.id;
    STATE.backendOnline = true;
    const props = await api(`/properties?workspace_id=${STATE.workspaceId}`);
    STATE.properties = props;
    STATE.activePropertyId = props[0]?.id || null;
    populatePropertySelectors();
    return true;
  } catch (err) {
    console.warn('[mizbanyar] backend offline, using static fallback:', err.message);
    STATE.backendOnline = false;
    showToast('اتصال به سرور برقرار نشد — حالت نمایشی فعال است', true);
    return false;
  }
}

function populatePropertySelectors() {
  const selects = document.querySelectorAll('[data-property-select]');
  selects.forEach(sel => {
    sel.innerHTML = STATE.properties.map(p =>
      `<option value="${p.id}">${p.name}</option>`
    ).join('') + '<option value="">همه اقامتگاه‌ها</option>';
  });
}

// ── SECTION LOADERS ──
async function loadSection(s) {
  if (!STATE.backendOnline) return;
  try {
    if (s === 'overview') await loadOverview();
    else if (s === 'recs') await loadRecs();
    else if (s === 'calendar') await loadCalendar('big-cal-root', false);
    else if (s === 'props') await loadProps();
    else if (s === 'revenue') await loadRevenue();
    else if (s === 'price') await loadPriceTable();
    else if (s === 'channels') await loadChannels();
  } catch (err) {
    console.error(`[mizbanyar] failed to load section "${s}":`, err);
    showToast('خطا در بارگذاری اطلاعات', true);
  }
}

function refreshActiveSection() {
  const active = document.querySelector('.dash-inner.active');
  if (active) loadSection(active.id.replace('sec-', ''));
}

// ── OVERVIEW ──
async function loadOverview() {
  const wsId = STATE.workspaceId;
  const [summary, alerts, bookings] = await Promise.all([
    api(`/dashboard/summary?workspace_id=${wsId}`),
    api(`/alerts?workspace_id=${wsId}&status=open`),
    api(`/bookings?workspace_id=${wsId}`),
  ]);

  const kpiRow = document.querySelector('#sec-overview .kpi-row');
  if (kpiRow) {
    kpiRow.innerHTML = `
      <div class="kpi">
        <div class="kpi-label">درآمد این ماه</div>
        <div class="kpi-value">${fmtShort(summary.revenueThisMonth)}</div>
        <div class="kpi-sub">تومان</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">نرخ اشغال (۳۰ روز آینده)</div>
        <div class="kpi-value">${toFA(summary.occupancyRate)}٪</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">رزروهای پیش‌رو</div>
        <div class="kpi-value">${toFA(summary.upcomingBookings)}</div>
        <div class="kpi-sub">۳۰ روز آینده</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">هشدارهای باز</div>
        <div class="kpi-value">${toFA(summary.openAlerts)}</div>
        <div class="kpi-sub">نیاز به بررسی</div>
      </div>
    `;
  }

  // recent bookings list (latest 4 by check-in)
  const recentList = bookings
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 4);

  const bkContainer = document.querySelector('#sec-overview .card-body[style*="padding:0 1.25rem"]');
  if (bkContainer) {
    bkContainer.innerHTML = recentList.map(b => `
      <div class="bk-row">
        <div>
          <div class="bk-name">${escapeHtml(b.guest_name)}</div>
          <div class="bk-meta">${propertyName(b.property_id)} · ${channelLabel(b.channel)}</div>
        </div>
        <div style="text-align:left">
          <div class="bk-price">${fmtShort(b.total_amount)}</div>
          ${statusPill(b.booking_status)}
        </div>
      </div>
    `).join('') || `<div style="padding:1rem;color:var(--ink-3);font-size:13px">رزروی ثبت نشده</div>`;
  }

  await loadCalendar('mini-cal-root', true);
}

// ── RECOMMENDATIONS ──
async function loadRecs() {
  const wsId = STATE.workspaceId;
  const recs = await api(`/pricing-recommendations?workspace_id=${wsId}&status=pending`);
  const container = document.querySelector('#sec-recs .rec-list');
  if (!container) return;

  if (recs.length === 0) {
    container.innerHTML = `<div style="padding:1rem;color:var(--ink-3);font-size:13px">در حال حاضر پیشنهادی موجود نیست</div>`;
    return;
  }

  container.innerHTML = recs.map(r => {
    const isIncrease = r.change_percentage > 0;
    const importance = Math.abs(r.change_percentage) > 30 ? 'hi' : Math.abs(r.change_percentage) > 5 ? 'med' : 'lo';
    return `
      <div class="rec-item ${importance}">
        <div class="rec-icon-box"><i class="ti ti-${isIncrease ? 'trending-up' : 'tag'}"></i></div>
        <div style="flex:1">
          <div class="rec-item-title">${propertyName(r.property_id)} — ${formatJalaliDate(r.target_date)}</div>
          <div class="rec-item-desc">${escapeHtml(r.reason)}</div>
          <div class="rec-item-tags">
            <span class="pill ${importance === 'hi' ? 'pill-green' : importance === 'med' ? 'pill-amber' : 'pill-gray'}">
              ${isIncrease ? '+' : ''}${toFA(r.change_percentage.toFixed(1))}٪
            </span>
            <span class="pill pill-gray">${fmtShort(r.current_price)} ← ${fmtShort(r.recommended_price)}</span>
          </div>
          <div class="rec-item-actions">
            <button class="btn-sm-dark" onclick="applyRecommendation('${r.id}')">اعمال</button>
            <button class="btn-sm-ghost" onclick="rejectRecommendation('${r.id}')">رد کردن</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function applyRecommendation(id) {
  try {
    await api(`/pricing-recommendations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'accepted', applyToProperty: true }),
    });
    showToast('پیشنهاد اعمال شد ✓');
    await loadRecs();
  } catch (err) {
    showToast(err.message, true);
  }
}
async function rejectRecommendation(id) {
  try {
    await api(`/pricing-recommendations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    });
    showToast('پیشنهاد رد شد');
    await loadRecs();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ── CALENDAR ──
async function loadCalendar(containerId, small) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth();
  const monthStr = `${y}-${String(m + 1).padStart(2, '0')}`;
  const propertyId = STATE.activePropertyId;

  let bookings = [];
  try {
    const params = new URLSearchParams({ workspace_id: STATE.workspaceId, month: monthStr });
    if (propertyId) params.set('property_id', propertyId);
    bookings = await api(`/dashboard/calendar?${params}`);
  } catch (err) {
    console.error('[calendar] failed to load:', err);
  }

  renderCalendar(el, today, bookings, small);
}

function renderCalendar(el, baseDate, bookings, small) {
  const y = baseDate.getFullYear(), m = baseDate.getMonth();
  const d0 = baseDate.getDate();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const offset = (first + 1) % 7;
  const wds = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  const bookedDays = new Set();
  bookings.forEach(b => {
    if (!['confirmed', 'completed'].includes(b.booking_status)) return;
    const inD = new Date(b.check_in_date), outD = new Date(b.check_out_date);
    for (let d = new Date(inD); d < outD; d.setDate(d.getDate() + 1)) {
      if (d.getMonth() === m) bookedDays.add(d.getDate());
    }
  });

  let html = '';
  if (!small) {
    const months = ['ژانویه','فوریه','مارس','آوریل','مه','ژوئن','ژوئیه','اوت','سپتامبر','اکتبر','نوامبر','دسامبر'];
    html += `<div class="mini-cal-head"><div class="mini-cal-title">${months[m]} ${y}</div></div>`;
  }
  html += '<div class="cal-grid">';
  wds.forEach(w => { html += `<div class="cal-dh">${w}</div>`; });
  for (let i = 0; i < offset; i++) html += '<div class="cal-d"></div>';
  for (let d = 1; d <= days; d++) {
    let cls = 'cal-d has-day';
    if (d < d0) cls += ' past';
    else if (d === d0) cls += ' active-day';
    else if (bookedDays.has(d)) cls += ' booked';
    html += `<div class="${cls}">${toFA(d)}</div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

// ── PROPERTIES ──
async function loadProps() {
  const wsId = STATE.workspaceId;
  const props = await api(`/properties?workspace_id=${wsId}`);
  STATE.properties = props;

  const grid = document.querySelector('#sec-props .prop-grid');
  if (!grid) return;

  const cards = props.map(p => `
    <div class="prop-card" onclick="showToast('${escapeHtml(p.name)}')">
      <div class="prop-card-name">${escapeHtml(p.name)}</div>
      <div class="prop-card-meta">
        ${escapeHtml(p.city)} · ${toFA(p.base_capacity)} نفر · ${fmtToman(p.base_price)} تومان / شب<br>
        ${typeLabel(p.type)}
      </div>
      <div class="prop-card-footer">
        <span class="pill ${p.status ? 'pill-green' : 'pill-gray'}">${p.status ? 'فعال' : 'غیرفعال'}</span>
        <span style="font-size:12px;color:var(--ink-3)">${(p.amenities || []).slice(0, 2).join('، ')}</span>
      </div>
    </div>
  `).join('');

  grid.innerHTML = cards + `
    <div class="prop-card" style="border-style:dashed;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--ink-3);font-size:13.5px;cursor:pointer;min-height:120px" onclick="showToast('فرم اضافه کردن اقامتگاه جدید')">
      <i class="ti ti-plus" style="font-size:18px"></i> اقامتگاه جدید
    </div>
  `;
}

// ── REVENUE ANALYTICS ──
async function loadRevenue() {
  const wsId = STATE.workspaceId;
  const [byMonth, summary] = await Promise.all([
    api(`/dashboard/revenue-by-month?workspace_id=${wsId}&months=6`),
    api(`/dashboard/summary?workspace_id=${wsId}`),
  ]);

  const kpiRow = document.querySelector('#sec-revenue .kpi-row');
  if (kpiRow) {
    const totalRevenue = byMonth.reduce((s, r) => s + r.revenue, 0);
    kpiRow.innerHTML = `
      <div class="kpi">
        <div class="kpi-label">درآمد ۶ ماه اخیر</div>
        <div class="kpi-value">${fmtShort(totalRevenue)}</div>
        <div class="kpi-sub">تومان</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">درآمد این ماه</div>
        <div class="kpi-value">${fmtShort(summary.revenueThisMonth)}</div>
        <div class="kpi-sub">تومان</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">نرخ اشغال</div>
        <div class="kpi-value">${toFA(summary.occupancyRate)}٪</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">پیشنهادهای در انتظار</div>
        <div class="kpi-value">${toFA(summary.pendingRecommendations)}</div>
      </div>
    `;
  }

  const chartEl = document.getElementById('rev-chart');
  if (chartEl) {
    const max = Math.max(...byMonth.map(r => r.revenue), 1);
    chartEl.innerHTML = byMonth.map((r, i) => {
      const h = Math.round((r.revenue / max) * 100);
      const isCurrent = i === byMonth.length - 1;
      return `
        <div class="rev-bar-col">
          <div class="rev-bar ${isCurrent ? 'current' : ''}" style="height:${h}%"></div>
          <div class="rev-bar-lbl">${r.month}</div>
        </div>
      `;
    }).join('');
  }
}

// ── PRICE TABLE ──
async function loadPriceTable() {
  const wsId = STATE.workspaceId;
  const recs = await api(`/pricing-recommendations?workspace_id=${wsId}`);
  const tbody = document.getElementById('price-tbody');
  if (!tbody) return;

  tbody.innerHTML = recs.map(r => {
    const diff = r.recommended_price - r.current_price;
    const diffStr = diff === 0 ? '—' : (diff > 0
      ? `<span class="up">+${fmtToman(diff)}</span>`
      : `<span class="dn">${fmtToman(diff)}</span>`);
    const statusBadge = r.status === 'accepted'
      ? '<span class="pill pill-green">اعمال شده</span>'
      : r.status === 'rejected'
        ? '<span class="pill pill-gray">رد شده</span>'
        : '<span class="pill pill-amber">در انتظار</span>';
    const action = r.status === 'pending'
      ? `<button class="btn-sm-dark" style="font-size:11px;padding:4px 10px" onclick="applyRecommendation('${r.id}')">اعمال</button>`
      : '—';
    return `<tr>
      <td>${formatJalaliDate(r.target_date)}</td>
      <td>${statusBadge}</td>
      <td>${fmtToman(r.current_price)}</td>
      <td style="font-weight:600">${fmtToman(r.recommended_price)}</td>
      <td>${diffStr}</td>
      <td style="color:var(--ink-3);font-size:12px">${escapeHtml(r.reason)}</td>
      <td>${action}</td>
    </tr>`;
  }).join('');
}

// ── CHANNELS ──
async function loadChannels() {
  const wsId = STATE.workspaceId;
  const byChannel = await api(`/dashboard/revenue-by-channel?workspace_id=${wsId}`);

  const body = document.getElementById('ch-body');
  if (body) {
    body.innerHTML = byChannel.map(c => `
      <div class="ch-row">
        <div class="ch-name">${channelLabel(c.channel)}</div>
        <div class="ch-bar"><div class="ch-fill" style="width:${c.percentage}%"></div></div>
        <div class="ch-pct">${toFA(c.percentage)}٪</div>
        <div style="min-width:52px;text-align:left;font-size:13px;font-weight:600;color:var(--ink)">${fmtShort(c.revenue)}</div>
      </div>
    `).join('') + `
      <div style="padding-top:1rem;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:13.5px">
        <span style="color:var(--ink-2)">جمع کل</span>
        <span style="font-weight:700">${fmtShort(byChannel.reduce((s, c) => s + c.revenue, 0))} تومان</span>
      </div>
    `;
  }

  const perf = document.getElementById('ch-perf');
  if (perf) {
    perf.innerHTML = byChannel.map(c => `
      <div class="ch-row">
        <div style="font-size:13px;font-weight:500;color:var(--ink);min-width:80px">${channelLabel(c.channel)}</div>
        <div style="flex:1;font-size:12px;color:var(--ink-3)">${toFA(c.booking_count)} رزرو</div>
        <div style="font-size:12px;font-weight:600">${fmtShort(c.revenue)}</div>
      </div>
    `).join('');
  }
}

// ── BOOKING FORM SUBMISSION ──
async function submitBookingForm(formEl) {
  if (!STATE.backendOnline) {
    showToast('سرور در دسترس نیست', true);
    return;
  }
  const fd = new FormData(formEl);
  const payload = {
    workspace_id: STATE.workspaceId,
    property_id: fd.get('property_id'),
    guest_name: fd.get('guest_name'),
    check_in_date: fd.get('check_in_date'),
    check_out_date: fd.get('check_out_date'),
    guest_count: Number(fd.get('guest_count') || 1),
    channel: fd.get('channel'),
    total_amount: Number(fd.get('total_amount') || 0),
    booking_status: fd.get('booking_status') || 'pending_payment',
    internal_notes: fd.get('internal_notes') || null,
  };

  try {
    await api('/bookings', { method: 'POST', body: JSON.stringify(payload) });
    showToast('رزرو با موفقیت ثبت شد ✓');
    formEl.reset();
  } catch (err) {
    if (err.status === 409) {
      const ok = confirm('این بازه با رزرو دیگری تداخل دارد. آیا می‌خواهید به‌صورت اجباری ثبت شود؟');
      if (ok) {
        try {
          await api('/bookings', { method: 'POST', body: JSON.stringify({ ...payload, force: true }) });
          showToast('رزرو با وجود تداخل به‌صورت اجباری ثبت شد ⚠');
          formEl.reset();
        } catch (e2) {
          showToast(e2.message, true);
        }
      }
    } else {
      showToast(err.message, true);
    }
  }
}

// ── AI COPILOT (rule-based demo responses using live data) ──
async function getAIResponse(msg) {
  const wsId = STATE.workspaceId;
  if (!STATE.backendOnline) {
    return 'در حال حاضر به سرور متصل نیستم. لطفاً مطمئن شوید بک‌اند روی پورت ۳۰۰۱ در حال اجراست.';
  }
  try {
    if (msg.includes('نوروز') || msg.includes('تعطیلات')) {
      const recs = await api(`/pricing-recommendations?workspace_id=${wsId}&status=pending`);
      const holidayRec = recs.find(r => r.change_percentage > 30) || recs[0];
      if (holidayRec) {
        return `بر اساس داده‌های فعلی، برای ${propertyName(holidayRec.property_id)} در تاریخ ${formatJalaliDate(holidayRec.target_date)} پیشنهاد می‌کنم قیمت را به ${fmtToman(holidayRec.recommended_price)} تومان برسانی (${holidayRec.reason})`;
      }
      return 'در حال حاضر پیشنهاد خاصی برای تعطیلات ثبت نشده — می‌تونی از بخش «پیشنهادها» بررسی کنی.';
    }
    if (msg.includes('خالی') || msg.includes('تخفیف')) {
      const summary = await api(`/dashboard/summary?workspace_id=${wsId}`);
      return `در ۳۰ روز آینده نرخ اشغال ${toFA(summary.occupancyRate)}٪ است. ${summary.pendingRecommendations} پیشنهاد قیمتی در انتظار تایید داری — می‌تونی از بخش «پیشنهادها» اونا رو ببینی و اعمال کنی.`;
    }
    if (msg.includes('درآمد')) {
      const summary = await api(`/dashboard/summary?workspace_id=${wsId}`);
      return `درآمد این ماه ${fmtToman(summary.revenueThisMonth)} تومان بوده، با ${toFA(summary.upcomingBookings)} رزرو تایید شده در ۳۰ روز آینده. نرخ اشغال فعلی ${toFA(summary.occupancyRate)}٪ است.`;
    }
    return 'بر اساس تقویم و داده‌های اقامتگاهت می‌تونم کمکت کنم. می‌تونی دقیق‌تر بپرسی، مثلاً درباره یک تاریخ خاص یا یک اقامتگاه خاص.';
  } catch (err) {
    return 'متاسفانه در دریافت اطلاعات خطایی رخ داد. لطفاً دوباره امتحان کن.';
  }
}

function addMsg(role, text) {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + role;
  const av = document.createElement('div');
  av.className = 'chat-avatar ' + (role === 'ai' ? 'ai' : 'user-av');
  av.textContent = role === 'ai' ? 'AI' : 'ع';
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = text;
  div.appendChild(av);
  div.appendChild(bubble);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}
function showTyping() {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ai';
  div.id = 'typing-indicator';
  div.innerHTML = `<div class="chat-avatar ai">AI</div><div class="chat-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}
async function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  const sug = document.getElementById('chat-suggestions');
  if (sug) sug.style.display = 'none';
  addMsg('user', msg);
  showTyping();
  const reply = await getAIResponse(msg);
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
  addMsg('ai', reply);
}
function sendSug(btn) {
  document.getElementById('chat-input').value = btn.textContent;
  sendChat();
}

// ── LABEL / FORMAT HELPERS ──
function propertyName(id) {
  return STATE.properties.find(p => p.id === id)?.name || 'اقامتگاه نامشخص';
}
function typeLabel(type) {
  const map = { villa: 'ویلا', apartment: 'آپارتمان', suite: 'سوئیت', ecotourism: 'بوم‌گردی', hotel_apartment: 'هتل‌آپارتمان', other: 'سایر' };
  return map[type] || type;
}
function channelLabel(ch) {
  const map = { jabama: 'جاباما', jajiga: 'جاجیگا', otaghak: 'اتاقک', shab: 'شب', whatsapp: 'واتساپ', instagram: 'اینستاگرام', direct_call: 'تماس مستقیم', other: 'سایر' };
  return map[ch] || ch;
}
function statusPill(status) {
  const map = {
    confirmed: '<span class="pill pill-green">تایید</span>',
    pending_payment: '<span class="pill pill-amber">در انتظار</span>',
    cancelled: '<span class="pill pill-red">لغو شده</span>',
    completed: '<span class="pill pill-gray">تکمیل شده</span>',
  };
  return map[status] || '';
}
function formatJalaliDate(isoDate) {
  // lightweight display — shows the ISO date; a full Jalali conversion
  // library can replace this if needed.
  return isoDate;
}
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
  await bootstrap();
  if (STATE.backendOnline) {
    await loadOverview();
  }

  // wire booking form if present
  const bookingForm = document.getElementById('booking-form');
  if (bookingForm) {
    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitBookingForm(bookingForm);
    });
  }
});
