# LIVE GOODS 代购订单网页

## 目录

- `index.html`：朋友下单页
- `admin.html`：管理后台
- `products.js`：商品数据
- `images/`：商品图片
- `api/orders.js`：Vercel Serverless API
- `supabase-schema.sql`：Supabase 数据库建表 SQL

## 图片上传

把商品图片放到 `images/` 文件夹，文件名建议对应商品 ID：

- `HEART001.jpg`
- `HEART002.jpg`
- ...
- `HEART028.jpg`

如果某个商品没有图片，页面会显示“商品图”占位。

## Vercel 环境变量

需要设置：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_TOKEN`

`ADMIN_TOKEN` 就是你的后台密码。
