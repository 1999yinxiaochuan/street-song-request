/**
 * 街角点歌台 v2 - 后端服务器
 * Node.js + Express
 * 支持购物车和支付确认流程
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// 中间件配置
// ============================================

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// 数据存储（使用JSON文件模拟数据库）
// ============================================

const DATA_DIR = path.join(__dirname, 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 读取队列数据
function loadQueue() {
    try {
        if (fs.existsSync(QUEUE_FILE)) {
            const data = fs.readFileSync(QUEUE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('读取队列数据失败:', e);
    }
    return [];
}

// 保存队列数据
function saveQueue(queue) {
    try {
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
    } catch (e) {
        console.error('保存队列数据失败:', e);
    }
}

// 读取订单数据
function loadOrders() {
    try {
        if (fs.existsSync(ORDERS_FILE)) {
            const data = fs.readFileSync(ORDERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('读取订单数据失败:', e);
    }
    return [];
}

// 保存订单数据
function saveOrders(orders) {
    try {
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
    } catch (e) {
        console.error('保存订单数据失败:', e);
    }
}

// 读取配置数据
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('读取配置数据失败:', e);
    }
    // 默认配置
    return {
        pricePerSong: 10,
        bundlePrice: 15,
        bundleQuantity: 2,
        paymentQRUrl: '',
        singerName: '街头歌手',
        announceText: '欢迎点歌！'
    };
}

// 保存配置数据
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) {
        console.error('保存配置数据失败:', e);
    }
}

// 初始化数据
let songQueue = loadQueue();
let appConfig = loadConfig();
let orders = loadOrders();

// ============================================
// API 路由 - 歌曲队列
// ============================================

// 添加歌曲到待演唱队列（歌手用）
app.post('/api/queue', (req, res) => {
    const { songName, requester, contact } = req.body;
    
    if (!songName || !songName.trim()) {
        return res.status(400).json({
            success: false,
            message: '歌曲名称不能为空'
        });
    }
    
    const newSong = {
        id: Date.now(),
        songName: songName.trim(),
        requester: (requester && requester.trim()) || '歌手添加',
        contact: contact || '',
        timestamp: new Date().toISOString(),
        status: 'pending', // 直接进入待演唱
        price: calculatePrice()
    };
    
    songQueue.push(newSong);
    saveQueue(songQueue);
    
    res.json({
        success: true,
        data: newSong,
        message: `《${newSong.songName}》已加入待演唱队列`
    });
});

// 获取所有歌曲队列
app.get('/api/queue', (req, res) => {
    res.json({
        success: true,
        data: songQueue
    });
});

// 获取等待支付的歌曲（购物车）
app.get('/api/queue/cart', (req, res) => {
    const cartSongs = songQueue.filter(item => item.status === 'cart');
    res.json({
        success: true,
        data: cartSongs
    });
});

// 获取已支付等待播放的歌曲
app.get('/api/queue/pending', (req, res) => {
    const pendingSongs = songQueue.filter(item => item.status === 'pending');
    res.json({
        success: true,
        data: pendingSongs
    });
});

// 获取等待确认的歌曲（已支付，等待歌手确认）
app.get('/api/queue/waiting', (req, res) => {
    const waitingSongs = songQueue.filter(item => item.status === 'waiting_payment');
    res.json({
        success: true,
        data: waitingSongs
    });
});

// 添加歌曲到已点列表
app.post('/api/queue/cart', (req, res) => {
    const { songName, requester, contact } = req.body;
    
    if (!songName || !songName.trim()) {
        return res.status(400).json({
            success: false,
            message: '歌曲名称不能为空'
        });
    }
    
    // 获取当前已点歌曲数量，计算新歌曲加入后的价格
    const currentCartSongs = songQueue.filter(item => item.status === 'cart');
    const newSongCount = currentCartSongs.length + 1;
    const optimizedPrice = calculateOptimalPrice(newSongCount);
    
    // 重新计算所有已点歌曲的单价（基于最优价格）
    const pricePerSong = optimizedPrice / newSongCount;
    
    // 更新已有歌曲的价格
    currentCartSongs.forEach(song => {
        song.price = pricePerSong;
    });
    
    const newSong = {
        id: Date.now(),
        songName: songName.trim(),
        requester: (requester && requester.trim()) || '匿名音乐爱好者',
        contact: contact || '',
        timestamp: new Date().toISOString(),
        status: 'cart', // cart -> waiting_payment -> pending -> playing -> completed
        price: pricePerSong
    };
    
    songQueue.push(newSong);
    saveQueue(songQueue);
    
    // 返回已点列表信息
    const allCartSongs = songQueue.filter(item => item.status === 'cart');
    const totalPrice = calculateOptimalPrice(allCartSongs.length);
    
    res.json({
        success: true,
        data: {
            song: newSong,
            cartCount: allCartSongs.length,
            totalPrice: totalPrice,
            pricePerSong: pricePerSong
        },
        message: `《${newSong.songName}》已加入已点歌曲`
    });
});

// 从已点列表删除歌曲
app.delete('/api/queue/cart/:id', (req, res) => {
    const { id } = req.params;
    
    const songIndex = songQueue.findIndex(item => item.id === parseInt(id) && item.status === 'cart');
    
    if (songIndex === -1) {
        return res.status(404).json({
            success: false,
            message: '歌曲不存在或不在已点列表中'
        });
    }
    
    const deletedSong = songQueue.splice(songIndex, 1)[0];
    
    // 重新计算剩余歌曲的价格
    const remainingCartSongs = songQueue.filter(item => item.status === 'cart');
    if (remainingCartSongs.length > 0) {
        const newTotalPrice = calculateOptimalPrice(remainingCartSongs.length);
        const newPricePerSong = newTotalPrice / remainingCartSongs.length;
        remainingCartSongs.forEach(song => {
            song.price = newPricePerSong;
        });
    }
    
    saveQueue(songQueue);
    
    // 返回已点列表信息
    const allCartSongs = songQueue.filter(item => item.status === 'cart');
    const totalPrice = calculateOptimalPrice(allCartSongs.length);
    
    res.json({
        success: true,
        data: {
            cartCount: allCartSongs.length,
            totalPrice: totalPrice
        },
        message: `已删除《${deletedSong.songName}》`
    });
});

// ============================================
// API 路由 - 订单和支付
// ============================================

// 创建支付订单（从购物车生成）
app.post('/api/orders/create', (req, res) => {
    const { contact } = req.body;
    
    // 获取购物车中的歌曲
    const cartSongs = songQueue.filter(item => item.status === 'cart');
    
    if (cartSongs.length === 0) {
        return res.status(400).json({
            success: false,
            message: '购物车为空'
        });
    }
    
    // 计算总价
    const totalPrice = cartSongs.reduce((sum, item) => sum + item.price, 0);
    
    // 创建订单
    const order = {
        id: Date.now(),
        songIds: cartSongs.map(item => item.id),
        songs: cartSongs.map(item => item.songName),
        requester: cartSongs[0].requester,
        contact: contact || cartSongs[0].contact,
        totalPrice: totalPrice,
        songCount: cartSongs.length,
        status: 'waiting_payment', // waiting_payment -> paid -> confirmed
        createdAt: new Date().toISOString(),
        paidAt: null,
        confirmedAt: null
    };
    
    orders.push(order);
    saveOrders(orders);
    
    // 更新歌曲状态为等待支付
    cartSongs.forEach(song => {
        song.status = 'waiting_payment';
        song.orderId = order.id;
    });
    saveQueue(songQueue);
    
    res.json({
        success: true,
        data: {
            order: order,
            paymentQRUrl: appConfig.paymentQRUrl,
            pricePerSong: appConfig.pricePerSong,
            bundlePrice: appConfig.bundlePrice,
            bundleQuantity: appConfig.bundleQuantity
        },
        message: '订单已创建，请完成支付'
    });
});

// 获取订单详情
app.get('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    
    const order = orders.find(item => item.id === parseInt(id));
    
    if (!order) {
        return res.status(404).json({
            success: false,
            message: '订单不存在'
        });
    }
    
    res.json({
        success: true,
        data: {
            order: order,
            paymentQRUrl: appConfig.paymentQRUrl
        }
    });
});

// 获取用户的所有订单
app.get('/api/orders/user/:requester', (req, res) => {
    const { requester } = req.params;
    
    const userOrders = orders.filter(item => item.requester === requester);
    
    res.json({
        success: true,
        data: userOrders
    });
});

// 标记订单已支付（用户确认）
app.put('/api/orders/:id/pay', (req, res) => {
    const { id } = req.params;
    
    const orderIndex = orders.findIndex(item => item.id === parseInt(id));
    
    if (orderIndex === -1) {
        return res.status(404).json({
            success: false,
            message: '订单不存在'
        });
    }
    
    orders[orderIndex].status = 'paid';
    orders[orderIndex].paidAt = new Date().toISOString();
    saveOrders(orders);
    
    res.json({
        success: true,
        data: orders[orderIndex],
        message: '已标记为待确认收款'
    });
});

// 歌手确认收款
app.put('/api/orders/:id/confirm', (req, res) => {
    const { id } = req.params;
    
    const orderIndex = orders.findIndex(item => item.id === parseInt(id));
    
    if (orderIndex === -1) {
        return res.status(404).json({
            success: false,
            message: '订单不存在'
        });
    }
    
    orders[orderIndex].status = 'confirmed';
    orders[orderIndex].confirmedAt = new Date().toISOString();
    saveOrders(orders);
    
    // 更新订单中的歌曲状态为待播放
    const order = orders[orderIndex];
    order.songIds.forEach(songId => {
        const songIndex = songQueue.findIndex(item => item.id === songId);
        if (songIndex !== -1) {
            songQueue[songIndex].status = 'pending';
            songQueue[songIndex].orderId = null;
        }
    });
    saveQueue(songQueue);
    
    res.json({
        success: true,
        data: orders[orderIndex],
        message: '收款已确认，歌曲已加入播放队列'
    });
});

// 获取所有订单（歌手用）
app.get('/api/orders', (req, res) => {
    res.json({
        success: true,
        data: orders
    });
});

// 获取待确认的订单
app.get('/api/orders/pending', (req, res) => {
    const pendingOrders = orders.filter(item => item.status === 'paid');
    res.json({
        success: true,
        data: pendingOrders
    });
});

// ============================================
// API 路由 - 歌曲状态更新（歌手用）
// ============================================

// 更新歌曲状态
app.put('/api/queue/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    const songIndex = songQueue.findIndex(item => item.id === parseInt(id));
    
    if (songIndex === -1) {
        return res.status(404).json({
            success: false,
            message: '歌曲不存在'
        });
    }
    
    songQueue[songIndex].status = status;
    saveQueue(songQueue);
    
    res.json({
        success: true,
        data: songQueue[songIndex],
        message: '状态更新成功'
    });
});

// 删除歌曲
app.delete('/api/queue/:id', (req, res) => {
    const { id } = req.params;
    
    const songIndex = songQueue.findIndex(item => item.id === parseInt(id));
    
    if (songIndex === -1) {
        return res.status(404).json({
            success: false,
            message: '歌曲不存在'
        });
    }
    
    const deletedSong = songQueue.splice(songIndex, 1)[0];
    saveQueue(songQueue);
    
    res.json({
        success: true,
        data: deletedSong,
        message: `已删除《${deletedSong.songName}》`
    });
});

// 清空队列
app.delete('/api/queue', (req, res) => {
    songQueue = [];
    saveQueue(songQueue);
    
    res.json({
        success: true,
        message: '队列已清空'
    });
});

// 随机打乱队列
app.post('/api/queue/shuffle', (req, res) => {
    // Fisher-Yates shuffle
    for (let i = songQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [songQueue[i], songQueue[j]] = [songQueue[j], songQueue[i]];
    }
    
    saveQueue(songQueue);
    
    res.json({
        success: true,
        message: '队列已随机打乱'
    });
});

// ============================================
// API 路由 - 配置管理
// ============================================

// 获取配置
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        data: appConfig
    });
});

// 更新配置
app.put('/api/config', (req, res) => {
    const {
        pricePerSong,
        bundlePrice,
        bundleQuantity,
        paymentQRUrl,
        singerName,
        announceText
    } = req.body;
    
    // 更新配置（只更新提供的字段）
    if (pricePerSong !== undefined) appConfig.pricePerSong = parseFloat(pricePerSong) || 10;
    if (bundlePrice !== undefined) appConfig.bundlePrice = parseFloat(bundlePrice) || 15;
    if (bundleQuantity !== undefined) appConfig.bundleQuantity = parseInt(bundleQuantity) || 2;
    if (paymentQRUrl !== undefined) appConfig.paymentQRUrl = paymentQRUrl;
    if (singerName !== undefined) appConfig.singerName = singerName;
    if (announceText !== undefined) appConfig.announceText = announceText;
    
    saveConfig(appConfig);
    
    res.json({
        success: true,
        data: appConfig,
        message: '配置已更新'
    });
});

// ============================================
// 辅助函数
// ============================================

// 计算价格（根据配置）
function calculatePrice() {
    return appConfig.pricePerSong;
}

// 计算最优价格（考虑套餐）
function calculateOptimalPrice(songCount) {
    if (songCount <= 0) return 0;
    
    const { pricePerSong, bundlePrice, bundleQuantity } = appConfig;
    
    // 如果没有设置套餐，直接按单曲价格
    if (!bundlePrice || !bundleQuantity) {
        return songCount * pricePerSong;
    }
    
    // 计算套餐数量和单曲数量
    const bundleCount = Math.floor(songCount / bundleQuantity);
    const remainingSongs = songCount % bundleQuantity;
    
    // 套餐价格 + 单曲价格
    const total = (bundleCount * bundlePrice) + (remainingSongs * pricePerSong);
    
    // 如果单曲购买更便宜，用单曲价格
    const singlePrice = songCount * pricePerSong;
    
    return Math.min(total, singlePrice);
}

// ============================================
// 页面路由
// ============================================

// 观众端页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'audience.html'));
});

// 管理后台页面
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 支付页面
app.get('/payment', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'payment.html'));
});

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
