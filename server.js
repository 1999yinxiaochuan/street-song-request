/**
 * 街角点歌台 v2 - 后端服务器
 * Node.js + Express + Supabase
 * 支持购物车和支付确认流程
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Supabase 配置
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://romrgjcxfabdexvkobbp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_Gz3OdhTdNi0OZmPknVPAPA_XbGXoZjV';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// 中间件配置
// ============================================

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// 辅助函数
// ============================================

function calculatePrice(config) {
    return config.price_per_song;
}


// ── 配置缓存（避免每次请求都查数据库）──
let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 30000; // 30秒缓存

async function getCachedConfig() {
    const now = Date.now();
    if (configCache && (now - configCacheTime) < CONFIG_CACHE_TTL) {
        return configCache;
    }
    configCache = await getConfig();
    configCacheTime = now;
    return configCache;
}

// 配置更新后清除缓存
function clearConfigCache() {
    configCache = null;
    configCacheTime = 0;
}

function calculateOptimalPrice(songCount, config) {
    if (songCount <= 0) return 0;
    const { price_per_song, bundle_price, bundle_quantity } = config;
    if (!bundle_price || !bundle_quantity) return songCount * price_per_song;
    const bundleCount = Math.floor(songCount / bundle_quantity);
    const remaining = songCount % bundle_quantity;
    const total = (bundleCount * bundle_price) + (remaining * price_per_song);
    const singlePrice = songCount * price_per_song;
    return Math.min(total, singlePrice);
}

// 获取配置
async function getConfig() {
    const { data } = await supabase.from('config').select('*').eq('id', 1).single();
    return data || { price_per_song: 10, bundle_price: 15, bundle_quantity: 2, payment_qr_url: '', singer_name: '街头歌手', announce_text: '欢迎点歌！' };
}

// ============================================
// API 路由 - 歌曲队列
// ============================================

// 歌手直接添加歌曲
app.post('/api/queue', async (req, res) => {
    const { songName, requester, contact } = req.body;
    if (!songName || !songName.trim()) {
        return res.status(400).json({ success: false, message: '歌曲名称不能为空' });
    }
    const config = await getCachedConfig();
    const newSong = {
        id: Date.now(),
        song_name: songName.trim(),
        requester: (requester && requester.trim()) || '歌手添加',
        contact: contact || '',
        timestamp: new Date().toISOString(),
        status: 'pending',
        price: calculatePrice(config)
    };
    const { error } = await supabase.from('songs').insert(newSong);
    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true, data: newSong, message: `《${newSong.song_name}》已加入待演唱队列` });
});

// 获取所有歌曲
app.get('/api/queue', async (req, res) => {
    const { data, error } = await supabase.from('songs').select('*').order('timestamp', { ascending: true });
    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true, data: data || [] });
});

// 获取购物车歌曲
app.get('/api/queue/cart', async (req, res) => {
    const { data, error } = await supabase.from('songs').select('*').eq('status', 'cart').order('timestamp', { ascending: true });
    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true, data: data || [] });
});

// 获取待演唱歌曲
app.get('/api/queue/pending', async (req, res) => {
    const { data, error } = await supabase.from('songs').select('*').eq('status', 'pending').order('timestamp', { ascending: true });
    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true, data: data || [] });
});

// 获取等待支付的歌曲
app.get('/api/queue/waiting', async (req, res) => {
    const { data, error } = await supabase.from('songs').select('*').eq('status', 'waiting_payment').order('timestamp', { ascending: true });
    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true, data: data || [] });
});

// 添加歌曲到购物车
app.post('/api/queue/cart', async (req, res) => {
    const { songName, requester, contact } = req.body;
    if (!songName || !songName.trim()) {
        return res.status(400).json({ success: false, message: '歌曲名称不能为空' });
    }
    const config = await getCachedConfig();
    // 获取当前购物车数量
    const { data: cartSongs } = await supabase.from('songs').select('*').eq('status', 'cart');
    const currentCount = (cartSongs || []).length;
    const newCount = currentCount + 1;
    const optimizedPrice = calculateOptimalPrice(newCount, config);
    const pricePerSong = optimizedPrice / newCount;

    // 更新已有歌曲价格
    for (const song of (cartSongs || [])) {
        await supabase.from('songs').update({ price: pricePerSong }).eq('id', song.id);
    }

    const newSong = {
        id: Date.now(),
        song_name: songName.trim(),
        requester: (requester && requester.trim()) || '匿名音乐爱好者',
        contact: contact || '',
        timestamp: new Date().toISOString(),
        status: 'cart',
        price: pricePerSong
    };
    const { error } = await supabase.from('songs').insert(newSong);
    if (error) return res.status(500).json({ success: false, message: error.message });

    // 返回购物车信息
    const { data: allCart } = await supabase.from('songs').select('*').eq('status', 'cart');
    const totalPrice = calculateOptimalPrice((allCart || []).length, config);
    res.json({
        success: true,
        data: { song: newSong, cartCount: (allCart || []).length, totalPrice, pricePerSong },
        message: `《${newSong.song_name}》已加入已点歌曲`
    });
});

// 从购物车删除
app.delete('/api/queue/cart/:id', async (req, res) => {
    const { id } = req.params;
    const { data: song, error: findErr } = await supabase.from('songs').select('*').eq('id', parseInt(id)).eq('status', 'cart').single();
    if (findErr || !song) {
        return res.status(404).json({ success: false, message: '歌曲不存在或不在已点列表中' });
    }
    await supabase.from('songs').delete().eq('id', parseInt(id));

    // 重新计算价格
    const config = await getCachedConfig();
    const { data: remaining } = await supabase.from('songs').select('*').eq('status', 'cart');
    if (remaining && remaining.length > 0) {
        const newTotal = calculateOptimalPrice(remaining.length, config);
        const newPrice = newTotal / remaining.length;
        for (const s of remaining) {
            await supabase.from('songs').update({ price: newPrice }).eq('id', s.id);
        }
    }

    const { data: allCart } = await supabase.from('songs').select('*').eq('status', 'cart');
    const totalPrice = calculateOptimalPrice((allCart || []).length, config);
    res.json({ success: true, data: { cartCount: (allCart || []).length, totalPrice }, message: `已删除《${song.song_name}》` });
});

// ============================================
// API 路由 - 订单和支付
// ============================================

// 创建订单
app.post('/api/orders/create', async (req, res) => {
    const { contact } = req.body;
    const { data: cartSongs } = await supabase.from('songs').select('*').eq('status', 'cart');
    if (!cartSongs || cartSongs.length === 0) {
        return res.status(400).json({ success: false, message: '购物车为空' });
    }
    const totalPrice = cartSongs.reduce((sum, item) => sum + item.price, 0);
    const config = await getCachedConfig();
    const order = {
        id: Date.now(),
        song_ids: cartSongs.map(item => item.id),
        songs: cartSongs.map(item => item.song_name),
        requester: cartSongs[0].requester,
        contact: contact || cartSongs[0].contact,
        total_price: totalPrice,
        song_count: cartSongs.length,
        status: 'waiting_payment',
        created_at: new Date().toISOString()
    };
    await supabase.from('orders').insert(order);
    // 更新歌曲状态
    for (const song of cartSongs) {
        await supabase.from('songs').update({ status: 'waiting_payment', order_id: order.id }).eq('id', song.id);
    }
    res.json({
        success: true,
        data: { order, paymentQRUrl: config.payment_qr_url, pricePerSong: config.price_per_song, bundlePrice: config.bundle_price, bundleQuantity: config.bundle_quantity },
        message: '订单已创建，请完成支付'
    });
});

// 获取订单详情
app.get('/api/orders/:id', async (req, res) => {
    const { data: order } = await supabase.from('orders').select('*').eq('id', parseInt(req.params.id)).single();
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    const config = await getCachedConfig();
    res.json({ success: true, data: { order, paymentQRUrl: config.payment_qr_url } });
});

// 标记已支付
app.put('/api/orders/:id/pay', async (req, res) => {
    const { data: order } = await supabase.from('orders').select('*').eq('id', parseInt(req.params.id)).single();
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    await supabase.from('orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', parseInt(req.params.id));
    res.json({ success: true, data: { ...order, status: 'paid' }, message: '已标记为待确认收款' });
});

// 歌手确认收款
app.put('/api/orders/:id/confirm', async (req, res) => {
    const { data: order } = await supabase.from('orders').select('*').eq('id', parseInt(req.params.id)).single();
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    await supabase.from('orders').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', parseInt(req.params.id));
    // 更新歌曲状态为待演唱
    for (const songId of (order.song_ids || [])) {
        await supabase.from('songs').update({ status: 'pending', order_id: null }).eq('id', songId);
    }
    res.json({ success: true, data: { ...order, status: 'confirmed' }, message: '收款已确认，歌曲已加入播放队列' });
});

// 获取所有订单
app.get('/api/orders', async (req, res) => {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    res.json({ success: true, data: data || [] });
});

// 获取待确认订单
app.get('/api/orders/pending', async (req, res) => {
    const { data } = await supabase.from('orders').select('*').eq('status', 'paid').order('created_at', { ascending: false });
    res.json({ success: true, data: data || [] });
});


// ── 自动关闭超时订单（60分钟）──
async function closeExpiredOrders() {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await supabase.from('orders')
        .update({ status: 'expired' })
        .eq('status', 'waiting_payment')
        .lt('created_at', cutoff);
}
// 每5分钟检查一次
setInterval(closeExpiredOrders, 5 * 60 * 1000);

// 手动确认订单已支付（歌手端使用）
app.put('/api/orders/:id/confirm-payment', async (req, res) => {
    const { data: order, error } = await supabase.from('orders')
        .update({ status: 'paid' })
        .eq('id', req.params.id)
        .eq('status', 'waiting_payment')
        .select()
        .single();
    if (error || !order) {
        return res.status(400).json({ error: '订单不存在或状态异常' });
    }
    res.json({ success: true, data: order, message: '已确认支付' });
});

// 关闭订单（歌手端使用）
app.put('/api/orders/:id/close', async (req, res) => {
    const { data: order, error } = await supabase.from('orders')
        .update({ status: 'expired' })
        .eq('id', req.params.id)
        .select()
        .single();
    if (error || !order) {
        return res.status(400).json({ error: '订单不存在' });
    }
    res.json({ success: true, data: order, message: '订单已关闭' });
});

// 获取所有订单（包含已过期的）
app.get('/api/orders/all', async (req, res) => {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    res.json({ success: true, data: data || [] });
});

// ============================================
// API 路由 - 歌曲状态更新
// ============================================

app.put('/api/queue/:id', async (req, res) => {
    const { status } = req.body;
    const { data: song } = await supabase.from('songs').select('*').eq('id', parseInt(req.params.id)).single();
    if (!song) return res.status(404).json({ success: false, message: '歌曲不存在' });
    await supabase.from('songs').update({ status }).eq('id', parseInt(req.params.id));
    res.json({ success: true, data: { ...song, status }, message: '状态更新成功' });
});

app.delete('/api/queue/:id', async (req, res) => {
    const { data: song } = await supabase.from('songs').select('*').eq('id', parseInt(req.params.id)).single();
    if (!song) return res.status(404).json({ success: false, message: '歌曲不存在' });
    await supabase.from('songs').delete().eq('id', parseInt(req.params.id));
    res.json({ success: true, data: song, message: `已删除《${song.song_name}》` });
});

app.delete('/api/queue', async (req, res) => {
    await supabase.from('songs').delete().neq('id', 0);
    res.json({ success: true, message: '队列已清空' });
});

// ============================================
// API 路由 - 配置管理
// ============================================

app.get('/api/config', async (req, res) => {
    const config = await getCachedConfig();
    res.json({ success: true, data: {
        pricePerSong: config.price_per_song,
        bundlePrice: config.bundle_price,
        bundleQuantity: config.bundle_quantity,
        paymentQRUrl: config.payment_qr_url,
        singerName: config.singer_name,
        announceText: config.announce_text
    }});
});

app.put('/api/config', async (req, res) => {
    const { pricePerSong, bundlePrice, bundleQuantity, paymentQRUrl, singerName, announceText } = req.body;
    const updates = {};
    if (pricePerSong !== undefined) updates.price_per_song = parseFloat(pricePerSong) || 10;
    if (bundlePrice !== undefined) updates.bundle_price = parseFloat(bundlePrice) || 15;
    if (bundleQuantity !== undefined) updates.bundle_quantity = parseInt(bundleQuantity) || 2;
    if (paymentQRUrl !== undefined) updates.payment_qr_url = paymentQRUrl;
    if (singerName !== undefined) updates.singer_name = singerName;
    if (announceText !== undefined) updates.announce_text = announceText;
    updates.updated_at = new Date().toISOString();
    await supabase.from('config').update(updates).eq('id', 1);
    const config = await getConfig();
    res.json({ success: true, data: {
        pricePerSong: config.price_per_song,
        bundlePrice: config.bundle_price,
        bundleQuantity: config.bundle_quantity,
        paymentQRUrl: config.payment_qr_url,
        singerName: config.singer_name,
        announceText: config.announce_text
    }, message: '配置已更新' });
});

// ============================================
// 页面路由
// ============================================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'audience.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/payment', (req, res) => res.sendFile(path.join(__dirname, 'public', 'payment.html')));

// ============================================
// 启动服务器
// ============================================

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════╗
║        🎵 街角点歌台 v2 服务器已启动 🎵        ║
╠════════════════════════════════════════════════╣
║  观众端: http://localhost:${PORT}               ║
║  管理后台: http://localhost:${PORT}/admin        ║
╚════════════════════════════════════════════════╝
    `);
});
