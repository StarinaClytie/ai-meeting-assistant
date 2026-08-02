# 生产部署

目标环境：Ubuntu 22.04/24.04、Node.js 20+、Nginx。

## 目录

应用部署到 `/opt/meeting-assistant`，运行用户为 `meeting-assistant`。

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin meeting-assistant
sudo mkdir -p /opt/meeting-assistant
sudo chown -R meeting-assistant:meeting-assistant /opt/meeting-assistant
```

将代码克隆到该目录，安装生产依赖：

```bash
cd /opt/meeting-assistant
npm ci --omit=dev
cp .env.example .env
chmod 600 .env
```

只在服务器上填写 `.env`。不要将 `.env` 提交到 GitHub。

## systemd

```bash
sudo cp deploy/meeting-assistant.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now meeting-assistant
sudo systemctl status meeting-assistant
```

健康检查：

```bash
curl http://127.0.0.1:5173/api/health
```

## OSS 浏览器直传 CORS

在 OSS Bucket 的“数据安全 / 跨域设置（CORS）”新增规则：

- 来源：`https://groupmeeting.xyz`
- 允许 Methods：`PUT`、`GET`、`HEAD`
- 允许 Headers：`*`
- 暴露 Headers：`ETag`
- 缓存时间：`600`

本机需要测试直传时，可再单独增加来源 `http://localhost:5173` 或实际使用的
本机端口。不要使用 `*` 作为正式网站的来源。

## Nginx

将 `deploy/nginx.conf` 中的 `YOUR_DOMAIN` 替换为正式域名：

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/meeting-assistant
sudo ln -s /etc/nginx/sites-available/meeting-assistant /etc/nginx/sites-enabled/meeting-assistant
sudo nginx -t
sudo systemctl reload nginx
```

## HTTPS

域名解析生效后安装 Certbot：

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

Certbot 会修改 Nginx 配置并自动配置证书续期。
