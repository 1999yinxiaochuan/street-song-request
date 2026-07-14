-- ============================================
-- 街角点歌台 v2 - Supabase 数据库建表
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 歌曲队列表
CREATE TABLE IF NOT EXISTS songs (
    id BIGINT PRIMARY KEY,
    song_name TEXT NOT NULL,
    requester TEXT DEFAULT '匿名音乐爱好者',
    contact TEXT DEFAULT '',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'cart',
    price NUMERIC(10,2) DEFAULT 10,
    order_id BIGINT
);

-- 2. 订单表
CREATE TABLE IF NOT EXISTS orders (
    id BIGINT PRIMARY KEY,
    song_ids BIGINT[] DEFAULT '{}',
    songs TEXT[] DEFAULT '{}',
    requester TEXT DEFAULT '',
    contact TEXT DEFAULT '',
    total_price NUMERIC(10,2) DEFAULT 0,
    song_count INT DEFAULT 0,
    status TEXT DEFAULT 'waiting_payment',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ
);

-- 3. 配置表（只保留一行）
CREATE TABLE IF NOT EXISTS config (
    id INT PRIMARY KEY DEFAULT 1,
    price_per_song NUMERIC(10,2) DEFAULT 10,
    bundle_price NUMERIC(10,2) DEFAULT 15,
    bundle_quantity INT DEFAULT 2,
    payment_qr_url TEXT DEFAULT '',
    singer_name TEXT DEFAULT '街头歌手',
    announce_text TEXT DEFAULT '欢迎点歌！',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入默认配置
INSERT INTO config (id, price_per_song, bundle_price, bundle_quantity, singer_name, announce_text)
VALUES (1, 10, 15, 2, '街头歌手', '欢迎点歌！')
ON CONFLICT (id) DO NOTHING;

-- 允许匿名访问（通过 API Key 认证）
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on songs" ON songs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on config" ON config FOR ALL USING (true) WITH CHECK (true);
