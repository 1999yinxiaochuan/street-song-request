/**
 * 街角点歌台 v2 - 管理后台逻辑
 */
const API_BASE = window.location.origin + '/api';

function hideLoading() { var el = document.getElementById("loading-overlay"); if (el) el.classList.add("hidden"); }
function showMessage(text, type) {
    type = type || 'success';
    var existing = document.querySelector('.message');
    if (existing) existing.remove();
    var m = document.createElement('div');
    m.className = 'message ' + type;
    m.textContent = text;
    document.body.appendChild(m);
    setTimeout(function() { m.classList.add('show'); }, 10);
    setTimeout(function() { m.classList.remove('show'); setTimeout(function() { m.remove(); }, 300); }, 3000);
}
function formatTime(timestamp) {
    var d = new Date(timestamp), now = new Date(), diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function escapeHtml(t) {
    var div = document.createElement('div');
    div.textContent = t;
    return div.innerHTML;
}

// ── Tabs + SubTabs ──
function initTabs() {
    var btns = document.querySelectorAll('.tab-btn');
    var contents = document.querySelectorAll('.tab-content');
    btns.forEach(function(b) {
        b.addEventListener('click', function() {
            btns.forEach(function(x) { x.classList.remove('active'); });
            contents.forEach(function(x) { x.classList.remove('active'); });
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
async function fetchAllSongs() {
    try {
        var r = await fetch(API_BASE + '/queue');
        var d = await r.json();
        if (d.success) renderAdminQueue(d.data);
    } catch (e) { console.error(e); }
}
async function fetchAllOrders() {
    try {
        var r = await fetch(API_BASE + '/orders');
        var d = await r.json();
        if (d.success) {
            var po = d.data.filter(function(o) { return o.status === 'waiting_payment' || o.status === 'paid'; });
            renderPendingOrders(po);
            document.getElementById('orders-badge').textContent = po.length;
        }
    } catch (e) { console.error(e); }
}
async function fetchConfig() {
    try {
        var r = await fetch(API_BASE + '/config');
        var d = await r.json();
        if (d.success) loadConfigToForm(d.data);
    } catch (e) { console.error(e); }
}
async function addSong(name) {
    try {
        var r = await fetch(API_BASE + '/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ songName: name, requester: '歌手添加' }) });
        var d = await r.json();
        if (d.success) { showMessage(d.message); fetchAllSongs(); return true; }
        else { showMessage(d.message, 'error'); return false; }
    } catch (e) { showMessage('网络错误', 'error'); return false; }
}
async function updateSongStatus(id, status) {
    try {
        await fetch(API_BASE + '/queue/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status }) });
        fetchAllSongs();
    } catch (e) { showMessage('网络错误', 'error'); }
}
async function deleteSong(id) {
    try { await fetch(API_BASE + '/queue/' + id, { method: 'DELETE' }); fetchAllSongs(); } catch (e) {}
}
async function clearQueue() {
    if (!confirm('确定要清空整个队列吗？')) return;
    try { await fetch(API_BASE + '/queue', { method: 'DELETE' }); fetchAllSongs(); } catch (e) {}
}
async function shuffleQueue() {
    try { await fetch(API_BASE + '/queue/shuffle', { method: 'POST' }); fetchAllSongs(); } catch (e) {}
}
async function confirmOrder(oid) {
    if (!confirm('确认已收到该订单的付款？')) return;
    try { await fetch(API_BASE + '/orders/' + oid + '/confirm', { method: 'PUT' }); fetchAllOrders(); fetchAllSongs(); } catch (e) {}
}
async function saveConfig(cfg) {
    try { await fetch(API_BASE + '/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }); showMessage('配置已保存'); } catch (e) {}
}

// ── Render ──
function updateQueueBadge(n) { document.getElementById('queue-badge').textContent = n; }

function loadConfigToForm(c) {
    document.getElementById('price-per-song').value = c.pricePerSong || 10;
    document.getElementById('bundle-quantity').value = c.bundleQuantity || 2;
    document.getElementById('bundle-price').value = c.bundlePrice || 15;
    document.getElementById('singer-name').value = c.singerName || '';
    document.getElementById('announce-text').value = c.announceText || '';
    if (c.paymentQRUrl) {
        document.getElementById('qr-preview').innerHTML = '<img src="' + c.paymentQRUrl + '" alt="收款码预览">';
    }
}

function renderPendingOrders(orders) {
    var c = document.getElementById('pending-orders');
    if (!orders.length) { c.innerHTML = '<p class="empty-queue">没有待处理的订单</p>'; return; }
    c.innerHTML = orders.map(function(o) {
        var sc = o.status === 'waiting_payment' ? 'waiting' : (o.status === 'paid' ? 'paid' : 'confirmed');
        var st = o.status === 'waiting_payment' ? '等待支付' : (o.status === 'paid' ? '已支付，待确认' : '已确认');
        var act = o.status === 'paid'
            ? '<button class="btn btn-success" onclick="confirmOrder(' + o.id + ')">确认收款</button>'
            : '<span class="waiting-hint">等待用户支付确认</span>';
        return '<div class="order-card ' + sc + '"><div class="order-header"><span class="order-id">订单 #' + o.id + '</span><span class="order-time">' + formatTime(o.created_at || o.createdAt || '') + '</span></div><div class="order-body"><div class="order-songs">' + o.songs.map(function(s) { return '<span class="order-song-tag">《' + escapeHtml(s) + '》</span>'; }).join('') + '</div><div class="order-info"><span class="order-requester">点歌人：' + escapeHtml(o.requester) + '</span>' + (o.contact ? '<span class="order-contact">联系方式：' + escapeHtml(o.contact) + '</span>' : '') + '</div><div class="order-total"><span>总计：</span><span class="total-price">¥' + o.total_price || o.totalPrice || 0 + '</span></div></div><div class="order-actions"><span class="order-status ' + sc + '">' + st + '</span>' + act + '</div></div>';
    }).join('');
}

function renderAdminQueue(songs) {
    var pending = songs.filter(function(s) { return s.status === 'pending' || s.status === 'playing'; });
    var played = songs.filter(function(s) { return s.status === 'completed' || s.status === 'skipped'; });
    updateQueueBadge(pending.length);
    document.getElementById('pending-badge').textContent = pending.length;
    document.getElementById('played-badge').textContent = played.length;

    var pc = document.getElementById('admin-queue-pending');
    if (!pending.length) {
        pc.innerHTML = '<p class="empty-queue">没有待演唱的歌曲</p>';
    } else {
        pc.innerHTML = pending.map(function(item, idx) {
            var isP = item.status === 'playing';
            var acts = isP
                ? '<button class="action-btn-small complete" onclick="completeSong(' + item.id + ')" title="演唱完成">✓</button><button class="action-btn-small skip" onclick="skipSong(' + item.id + ')" title="跳过">⏭</button>'
                : '<button class="action-btn-small play" onclick="playSong(' + item.id + ')" title="开始演唱">▶</button><button class="action-btn-small skip" onclick="skipSong(' + item.id + ')" title="跳过">⏭</button><button class="action-btn-small remove" onclick="removeSong(' + item.id + ')" title="删除">✕</button>';
            return '<div class="queue-item ' + item.status + '"><span class="queue-number">' + (idx + 1) + '</span><div class="song-info"><div class="song-name">《' + escapeHtml(item.song_name || item.songName || '') + '》</div><div class="requester">点歌人：' + escapeHtml(item.requester) + '</div><div class="queue-time">' + formatTime(item.timestamp) + '</div><span class="status-label ' + (isP ? 'playing' : 'pending') + '">' + (isP ? '演唱中' : '待演唱') + '</span></div><div class="queue-item-actions">' + acts + '</div></div>';
        }).join('');
    }

    var plc = document.getElementById('admin-queue-played');
    if (!played.length) {
        plc.innerHTML = '<p class="empty-queue">还没有已演唱的歌曲</p>';
    } else {
        plc.innerHTML = played.map(function(item, idx) {
            var st = item.status === 'completed' ? '已完成' : '已跳过';
            var sc = item.status === 'completed' ? 'completed' : 'skipped';
            return '<div class="queue-item ' + item.status + '"><span class="queue-number">' + (idx + 1) + '</span><div class="song-info"><div class="song-name">《' + escapeHtml(item.song_name || item.songName || '') + '》</div><div class="requester">点歌人：' + escapeHtml(item.requester) + '</div><div class="queue-time">' + formatTime(item.timestamp) + '</div><span class="status-label ' + sc + '">' + st + '</span></div><div class="queue-item-actions"><button class="action-btn-small remove" onclick="removeSong(' + item.id + ')" title="删除">✕</button></div></div>';
        }).join('');
    }
}

// ── Actions ──
function playSong(id) { updateSongStatus(id, 'playing'); }
function completeSong(id) { updateSongStatus(id, 'completed'); }
function skipSong(id) { updateSongStatus(id, 'skipped'); }
function removeSong(id) { if (confirm('确定要删除这首歌吗？')) deleteSong(id); }

// ── Init ──
document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    fetchAllSongs(); fetchAllOrders(); fetchConfig();
    setInterval(fetchAllSongs, 5000);
    setInterval(fetchAllOrders, 5000);

    document.getElementById('add-song-btn-inline').addEventListener('click', function() {
        var el = document.getElementById('add-song-inline');
        el.classList.toggle('hidden');
        document.getElementById('add-song-input-inline').focus();
    });
    document.getElementById('add-song-confirm-btn').addEventListener('click', async function() {
        var inp = document.getElementById('add-song-input-inline');
        var name = inp.value.trim();
        if (!name) { showMessage('请输入歌曲名称', 'error'); return; }
        var ok = await addSong(name);
        if (ok) { inp.value = ''; document.getElementById('add-song-inline').classList.add('hidden'); }
    });
    document.getElementById('add-song-cancel-btn').addEventListener('click', function() {
        document.getElementById('add-song-inline').classList.add('hidden');
        document.getElementById('add-song-input-inline').value = '';
    });
    document.getElementById('add-song-input-inline').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('add-song-confirm-btn').click();
    });
    document.getElementById('shuffle-btn-inline').addEventListener('click', shuffleQueue);
    document.getElementById('clear-btn-inline').addEventListener('click', clearQueue);
    document.getElementById('save-pricing-btn').addEventListener('click', function() {
        saveConfig({ pricePerSong: parseFloat(document.getElementById('price-per-song').value) || 10, bundleQuantity: parseInt(document.getElementById('bundle-quantity').value) || 2, bundlePrice: parseFloat(document.getElementById('bundle-price').value) || 15 });
    });
    document.getElementById('save-basic-btn').addEventListener('click', function() {
        saveConfig({ singerName: document.getElementById('singer-name').value.trim(), announceText: document.getElementById('announce-text').value.trim() });
    });
    document.getElementById('save-qr-btn').addEventListener('click', function() { showMessage('请先上传收款码图片', 'error'); });
    document.getElementById('qr-upload').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { showMessage('请上传图片文件', 'error'); return; }
        var reader = new FileReader();
        reader.onload = function(ev) {
            var dataUrl = ev.target.result;
            document.getElementById('qr-preview').innerHTML = '<img src="' + dataUrl + '" alt="收款码预览">';
            saveConfig({ paymentQRUrl: dataUrl });
            showMessage('收款码已保存');
        };
        reader.readAsDataURL(file);
    });
});
setTimeout(hideLoading, 5000);
