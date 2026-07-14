/**
 * 街角点歌台 v2 - 独立支付页面逻辑
 */

const API_BASE = window.location.origin + '/api';

// ============================================
// 状态管理
// ============================================

let currentOrderId = null;
let currentOrder = null;

// ============================================
// 工具函数
// ============================================

function showMessage(text, type = 'success') {
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    document.body.appendChild(message);
    
    setTimeout(() => message.classList.add('show'), 10);
    setTimeout(() => {
        message.classList.remove('show');
        setTimeout(() => message.remove(), 300);
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// 从URL获取订单ID
// ============================================

function getOrderIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('orderId');
}

// ============================================
// API 调用
// ============================================

async function fetchOrder(orderId) {
    try {
        const response = await fetch(`${API_BASE}/orders/${orderId}`);
        const result = await response.json();
        
        if (result.success) {
            return result.data;
        } else {
            throw new Error(result.message);
        }
    } catch (e) {
        console.error('获取订单失败:', e);
        throw e;
    }
}

async function confirmPayment() {
    if (!currentOrderId) {
        showMessage('订单不存在', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/orders/${currentOrderId}/pay`, {
            method: 'PUT'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccessState();
        } else {
            showMessage(result.message, 'error');
        }
    } catch (e) {
        console.error('确认支付失败:', e);
        showMessage('网络错误', 'error');
    }
}

// ============================================
// UI 渲染
// ============================================

function showLoadingState() {
    document.getElementById('loading-state').classList.remove('hidden');
    document.getElementById('payment-content').classList.add('hidden');
    document.getElementById('success-state').classList.add('hidden');
}

function showPaymentContent() {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('payment-content').classList.remove('hidden');
    document.getElementById('success-state').classList.add('hidden');
}

function showSuccessState() {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('payment-content').classList.add('hidden');
    document.getElementById('success-state').classList.remove('hidden');
}

function renderOrder(order, paymentQRUrl) {
    currentOrder = order;
    
    // 订单号
    document.getElementById('order-id').textContent = `订单号：#${order.id}`;
    
    // 歌曲列表
    const songsContainer = document.getElementById('order-songs');
    songsContainer.innerHTML = order.songs.map(song => `
        <div class="order-song-item-full">
            <span>《${escapeHtml(song)}》</span>
        </div>
    `).join('');
    
    // 总价
    document.getElementById('total-price').textContent = `¥${order.total_price || order.totalPrice || 0}`;
    
    // 收款码
    const qrContainer = document.getElementById('payment-qr');
    if (paymentQRUrl) {
        qrContainer.innerHTML = `<img src="${paymentQRUrl}" alt="收款码">`;
    }
    
    // 提示文字
    document.getElementById('qr-tip').innerHTML = '<strong>⚠️ 请支付 ¥' + order.total_price || order.totalPrice || 0 + '</strong><br><span style=\"color:#ef4444;font-size:0.95rem\">付款完成后务必点击下方按钮通知歌手，否则歌手无法收到您的点歌！</span>';
}

// ============================================
// 事件绑定
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    currentOrderId = getOrderIdFromUrl();
    
    if (!currentOrderId) {
        showMessage('无效的订单链接', 'error');
        document.getElementById('loading-state').innerHTML = `
            <p style="color: var(--accent-red);">无效的订单链接</p>
            <a href="/" class="back-link">← 返回点歌页面</a>
        `;
        return;
    }
    
    showLoadingState();
    
    try {
        const data = await fetchOrder(currentOrderId);
        renderOrder(data.order, data.paymentQRUrl); hideLoading();
        showPaymentContent();
    } catch (e) {
        showMessage('订单不存在或已过期', 'error');
        document.getElementById('loading-state').innerHTML = `
            <p style="color: var(--accent-red);">订单不存在或已过期</p>
            <a href="/" class="back-link">← 返回点歌页面</a>
        `;
    }
    
    // 确认支付按钮
    document.getElementById('confirm-btn').addEventListener('click', confirmPayment);
});
setTimeout(hideLoading, 5000);
