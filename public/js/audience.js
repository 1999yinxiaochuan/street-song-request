/**
 * 街角点歌台 v2 - 观众端逻辑
 */
const API_BASE = window.location.origin + '/api';
let cartSongs = [];
let pendingSongs = [];
let waitingSongs = [];
let playedSongs = [];
let currentOrder = null;
let appConfig = {};
let userNickname = localStorage.getItem('userNickname') || '';

function hideLoading() { var el = document.getElementById("loading-overlay"); if (el) el.classList.add("hidden"); }
function showMessage(text, type) {
    type = type || 'success';
    var m = document.querySelector('.message');
    if (m) m.remove();
    var d = document.createElement('div');
    d.className = 'message ' + type;
    d.textContent = text;
    document.body.appendChild(d);
    setTimeout(function() { d.classList.add('show'); }, 10);
    setTimeout(function() { d.classList.remove('show'); setTimeout(function() { d.remove(); }, 300); }, 3000);
}
function formatTime(t) {
    var d = new Date(t), n = new Date(), diff = n - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function escapeHtml(t) {
    var d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}
function saveUserNickname(n) { userNickname = n; localStorage.setItem('userNickname', n); }

// ── 主Tab + 子Tab ──
function initAudienceTabs() {
    var mainBtns = document.querySelectorAll('.audience-tabs .tab-btn');
    var mainContents = document.querySelectorAll('#tab-request, #tab-live');
    mainBtns.forEach(function(b) {
        b.addEventListener('click', function() {
            mainBtns.forEach(function(x) { x.classList.remove('active'); });
            mainContents.forEach(function(x) { x.classList.remove('active'); });
            b.classList.add('active');
            document.getElementById('tab-' + b.dataset.tab).classList.add('active');
        });
    });
    var sbtns = document.querySelectorAll('.subtab-btn');
    var scontents = document.querySelectorAll('.subtab-content');
    sbtns.forEach(function(b) {
        b.addEventListener('click', function() {
            sbtns.forEach(function(x) { x.classList.remove('active'); });
            scontents.forEach(function(x) { x.classList.remove('active'); });
            b.classList.add('active');
            document.getElementById('subtab-' + b.dataset.subtab).classList.add('active');
        });
    });
}

// ── API ──
async function fetchConfig() {
    try { var r = await fetch(API_BASE + '/config'); var d = await r.json(); if (d.success) { appConfig = d.data; updateConfigDisplay(d.data); } } catch (e) {}
}
async function fetchCart() {
    try { var r = await fetch(API_BASE + '/queue/cart'); var d = await r.json(); if (d.success) { cartSongs = d.data; renderCart(); updateCartSummary(); } } catch (e) {}
}
async function fetchPending() {
    try { var r = await fetch(API_BASE + '/queue/pending'); var d = await r.json(); if (d.success) { pendingSongs = d.data; renderPending(); } } catch (e) {}
}
async function fetchWaiting() {
    try { var r = await fetch(API_BASE + '/queue/waiting'); var d = await r.json(); if (d.success) { waitingSongs = d.data; renderWaiting(); } } catch (e) {}
}
async function fetchPlayed() {
    try { var r = await fetch(API_BASE + '/queue'); var d = await r.json(); if (d.success) { playedSongs = d.data.filter(function(s) { return s.status === 'completed' || s.status === 'skipped'; }); renderPlayed(); } } catch (e) {}
}
async function addToCart(sn, rq, ct) {
    try { var r = await fetch(API_BASE + '/queue/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ songName: sn, requester: rq, contact: ct }) }); var d = await r.json(); if (d.success) { showMessage(d.message); cartSongs.push(d.data.song); renderCart(); updateCartSummary(d.data); return true; } else { showMessage(d.message, 'error'); return false; } } catch (e) { showMessage('网络错误', 'error'); return false; }
}
async function removeFromCart(id) {
    try { var r = await fetch(API_BASE + '/queue/cart/' + id, { method: 'DELETE' }); var d = await r.json(); if (d.success) { showMessage(d.message); cartSongs = cartSongs.filter(function(i) { return i.id !== id; }); renderCart(); updateCartSummary(d.data); } } catch (e) {}
}
async function createOrder() {
    if (!cartSongs.length) { showMessage('已点歌曲列表为空', 'error'); return; }
    try { var ct = document.getElementById('contact').value.trim(); var r = await fetch(API_BASE + '/orders/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact: ct }) }); var d = await r.json(); if (d.success) { window.location.href = '/payment?orderId=' + d.data.order.id; } else { showMessage(d.message, 'error'); } } catch (e) { showMessage('网络错误', 'error'); }
}
function hidePaymentModal() { document.getElementById('payment-modal').classList.add('hidden'); }

// ── 更新 live-badge ──
function updateLiveBadge() {
    document.getElementById('live-badge').textContent = waitingSongs.length + pendingSongs.length;
}

// ── Render ──
function updateConfigDisplay(c) {
    document.getElementById('singer-name').textContent = c.singerName || '欢迎点歌';
    document.getElementById('price-main').textContent = '¥' + c.pricePerSong + ' / 首';
    document.getElementById('price-bundle').textContent = '套餐：¥' + c.bundlePrice + ' / ' + c.bundleQuantity + '首（自动优惠）';
    if (c.announceText && c.announceText.trim()) {
        document.getElementById('announcement-section').classList.remove('hidden');
        document.getElementById('announcement-content').textContent = c.announceText;
    }
}
function calcTotal() {
    var n = cartSongs.length;
    if (!n) return 0;
    var p = appConfig.pricePerSong, bp = appConfig.bundlePrice, bq = appConfig.bundleQuantity;
    if (!bp || !bq) return n * p;
    var bc = Math.floor(n / bq), rs = n % bq;
    return bc * bp + rs * p;
}
function updateCartSummary(data) {
    var n = data ? data.cartCount : cartSongs.length;
    var t = data ? data.totalPrice : calcTotal();
    document.getElementById('cart-count').textContent = n;
    document.getElementById('cart-song-count').textContent = n + ' 首歌曲';
    document.getElementById('cart-total').textContent = '¥' + t;
    var ph = document.getElementById('price-hint');
    if (n >= appConfig.bundleQuantity) { ph.textContent = '已享受套餐优惠，节省 ¥' + (n * appConfig.pricePerSong - t); ph.style.color = 'var(--success)'; }
    else if (n > 0 && n < appConfig.bundleQuantity) { ph.textContent = '再点 ' + (appConfig.bundleQuantity - n) + ' 首即可享受套餐优惠'; ph.style.color = 'var(--text-muted)'; }
    else { ph.textContent = ''; }
    document.getElementById('checkout-btn').disabled = n === 0;
    var ov = document.getElementById('cart-overview-section'), ls = document.getElementById('cart-list-section');
    if (n > 0) { ov.classList.remove('hidden'); ls.classList.remove('hidden'); } else { ov.classList.add('hidden'); ls.classList.add('hidden'); }
}
function renderCart() {
    var c = document.getElementById('cart-list');
    if (!cartSongs.length) { c.innerHTML = '<p class="empty-queue">还没有点歌，去点一首吧！</p>'; return; }
    c.innerHTML = cartSongs.map(function(s, i) { return '<div class="queue-item cart-item' + (s.requester === userNickname ? ' my-song' : '') + '"><span class="queue-number">' + (i + 1) + '</span><div class="song-info"><div class="song-name">《' + escapeHtml(s.song_name) + '》</div><div class="requester">点歌人：' + escapeHtml(s.requester) + (s.requester === userNickname ? '<span class="my-tag">我的点歌</span>' : '') + '</div><div class="song-price">¥' + s.price.toFixed(2) + '</div></div><button class="btn-remove" onclick="removeFromCart(' + s.id + ')" title="删除">✕</button></div>'; }).join('');
}
function renderPending() {
    var c = document.getElementById('pending-queue');
    document.getElementById('pending-badge').textContent = pendingSongs.length;
    if (!pendingSongs.length) { c.innerHTML = '<p class="empty-queue">还没有已确认的歌曲</p>'; return; }
    c.innerHTML = pendingSongs.map(function(s, i) { return '<div class="queue-item' + (s.requester === userNickname ? ' my-song' : '') + '"><span class="queue-number">' + (i + 1) + '</span><div class="song-info"><div class="song-name">《' + escapeHtml(s.song_name) + '》</div><div class="requester">点歌人：' + escapeHtml(s.requester) + (s.requester === userNickname ? '<span class="my-tag">我的点歌</span>' : '') + '</div><div class="queue-time">' + formatTime(s.timestamp) + '</div><span class="status-label pending">待演唱</span></div></div>'; }).join('');
    updateLiveBadge();
}
function renderWaiting() {
    var c = document.getElementById('waiting-queue'), b = document.getElementById('waiting-count');
    if (b) b.textContent = waitingSongs.length;
    if (!waitingSongs.length) { c.innerHTML = '<p class="empty-queue">没有待确认的歌曲</p>'; return; }
    c.innerHTML = waitingSongs.map(function(s, i) { return '<div class="queue-item waiting-item' + (s.requester === userNickname ? ' my-song' : '') + '"><span class="queue-number">' + (i + 1) + '</span><div class="song-info"><div class="song-name">《' + escapeHtml(s.song_name) + '》</div><div class="requester">点歌人：' + escapeHtml(s.requester) + (s.requester === userNickname ? '<span class="my-tag">我的点歌</span>' : '') + '</div><div class="queue-time">' + formatTime(s.timestamp) + '</div><span class="waiting-status">⏳ 等待歌手确认</span></div></div>'; }).join('');
    updateLiveBadge();
}
function renderPlayed() {
    var c = document.getElementById('played-queue');
    document.getElementById('played-badge').textContent = playedSongs.length;
    if (!playedSongs.length) { c.innerHTML = '<p class="empty-queue">还没有已演唱的歌曲</p>'; return; }
    c.innerHTML = playedSongs.map(function(s, i) {
        var st = s.status === 'completed' ? '已完成' : '已跳过';
        var sc = s.status === 'completed' ? 'completed' : 'skipped';
        return '<div class="queue-item ' + s.status + (s.requester === userNickname ? ' my-song' : '') + '"><span class="queue-number">' + (i + 1) + '</span><div class="song-info"><div class="song-name">《' + escapeHtml(s.song_name) + '》</div><div class="requester">点歌人：' + escapeHtml(s.requester) + (s.requester === userNickname ? '<span class="my-tag">我的点歌</span>' : '') + '</div><div class="queue-time">' + formatTime(s.timestamp) + '</div><span class="status-label ' + sc + '">' + st + '</span></div></div>';
    }).join('');
}

// ── Init ──
document.addEventListener('DOMContentLoaded', function() {
    initAudienceTabs();
    if (userNickname) document.getElementById('requester-name').value = userNickname;
    fetchConfig(); fetchCart(); fetchPending(); fetchWaiting(); fetchPlayed();
    setInterval(fetchCart, 8000);
    setInterval(fetchPending, 8000);
    setInterval(fetchWaiting, 8000);
    setInterval(fetchPlayed, 8000);
    document.getElementById('song-request-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        var sn = document.getElementById('song-name').value.trim();
        var rq = document.getElementById('requester-name').value.trim();
        var ct = document.getElementById('contact').value.trim();
        if (!sn) { showMessage('请输入歌曲名称', 'error'); return; }
        if (!rq) { showMessage('请输入你的昵称', 'error'); return; }
        saveUserNickname(rq);
        var ok = await addToCart(sn, rq, ct);
        if (ok) document.getElementById('song-name').value = '';
    });
    document.getElementById('checkout-btn').addEventListener('click', createOrder);
    document.getElementById('close-modal-btn').addEventListener('click', hidePaymentModal);
});

// ── 确认支付 ──
async function confirmPayment() {
    var waiting = waitingSongs;
    if (!waiting.length) { showMessage('没有待确认的订单', 'error'); return; }
    var orderId = waiting[waiting.length - 1].orderId;
    try {
        var r = await fetch(API_BASE + '/orders/' + orderId + '/pay', { method: 'PUT' });
        var d = await r.json();
        if (d.success) { showMessage('支付确认成功'); fetchWaiting(); fetchPending(); }
        else { showMessage(d.message, 'error'); }
    } catch (e) { showMessage('网络错误', 'error'); }
}