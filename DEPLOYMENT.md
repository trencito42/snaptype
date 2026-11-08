# SnapType — Production Deployment Guide

**Blipmade / Wings hosting:** see [`docs/deployment/BLIPMADE.md`](docs/deployment/BLIPMADE.md) (three instances + Git Deploy). That is the production path for `snaptype.org`.

This guide covers deploying the SnapType platform to a standard Linux VPS (Ubuntu 22.04 / 24.04 LTS), or spinning it up instantly via Docker Compose (local verification and self-hosting).

---

## 0. Quick Start: Turnkey Docker Compose

The fastest way to run SnapType self-hosted with MySQL 8.4, the API server, and the Web Dashboard:

```bash
# 1. Clone repository
git clone https://github.com/trencito42/snaptype.git
cd snaptype

# 2. Start all services (MySQL 8.4, Fastify API, Nginx Web Dashboard)
docker compose up -d --build

# 3. Access Web Dashboard
# Open http://localhost:8080 in your browser
```

---

## 1. System Requirements

- **OS**: Ubuntu 22.04 LTS or 24.04 LTS
- **Node.js**: v22+ (or v24 LTS)
- **Database**: MySQL 8.0+ or MariaDB 10.6+
- **Reverse Proxy**: Nginx with SSL (Let's Encrypt / Certbot)
- **Process Manager**: PM2 or systemd

---

## 2. Server Prerequisites

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 22 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git

# Verify versions
node -v   # v22.x.x
npm -v    # v10+

# Install PM2 globally for zero-downtime process management
sudo npm install -g pm2
```

---

## 3. MySQL Database Setup

1. Log in to MySQL root console:
   ```bash
   sudo mysql -u root
   ```

2. Create database and dedicated user:
   ```sql
   CREATE DATABASE snaptype_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'snaptype_user'@'localhost' IDENTIFIED BY 'SECURE_STRONG_PASSWORD_HERE';
   GRANT ALL PRIVILEGES ON snaptype_db.* TO 'snaptype_user'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```

---

## 4. Application Setup & Build

1. Clone repository to deployment folder (e.g. `/var/www/snaptype`):
   ```bash
   git clone https://github.com/your-org/snaptype.git /var/www/snaptype
   cd /var/www/snaptype
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Set:
   ```env
   NODE_ENV=production
   PORT=3000
   HOST=127.0.0.1
   APP_ORIGIN=https://app.snaptype.com
   API_ORIGIN=https://api.snaptype.com
   JWT_SECRET=generate-a-strong-random-secret-at-least-64-characters
   OTP_HMAC_SECRET=generate-a-strong-random-hmac-secret-at-least-64-characters
   DATABASE_URL=mysql://snaptype_user:SECURE_STRONG_PASSWORD_HERE@127.0.0.1:3306/snaptype_db
   DB_DRIVER=mysql
   SMTP_HOST=smtp.mailgun.org
   SMTP_PORT=587
   SMTP_USER=postmaster@yourdomain.com
   SMTP_PASS=your-smtp-password
   SMTP_FROM="SnapType <noreply@yourdomain.com>"
   SMTP_SECURE=false
   ```

4. Run Database Migrations:
   ```bash
   npm run migrate -w apps/api
   ```
   Or execute directly:
   ```bash
   mysql -u snaptype_user -p snaptype_db < infrastructure/migrations/0001_initial_schema.sql
   ```

5. Build all packages, Web dashboard, and Extensions:
   ```bash
   npm run build
   npm run package:extensions
   ```

---

## 5. Process Management (PM2)

Create `ecosystem.config.cjs`:
```javascript
module.exports = {
  apps: [
    {
      name: 'snaptype-api',
      cwd: './apps/api',
      script: './dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env_file: '../../.env',
      max_memory_restart: '500M'
    }
  ]
};
```

Start the service and enable startup boot persistence:
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

## 6. Nginx & Reverse Proxy Configuration

### Web Dashboard & API Proxy (`/etc/nginx/sites-available/snaptype.conf`)

```nginx
server {
    listen 80;
    server_name app.snaptype.com;

    root /var/www/snaptype/apps/web/dist;
    index index.html;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # Frontend Single Page App Routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable proxy caching for sensitive sync data
        proxy_no_cache 1;
        proxy_cache_bypass 1;
    }

    # Health Check
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
    }
}
```

Enable site and acquire SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/snaptype.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d app.snaptype.com
```

---

## 7. CloudPanel Hosting Integration

For servers running CloudPanel:
1. Create a **Node.js Site** for the backend API (Port 3000).
2. Create a **Static Site** for the Web Dashboard pointing to `/var/www/snaptype/apps/web/dist`.
3. In the Static Site's Vhost container settings, add a reverse proxy directive forwarding `/api/` to `http://127.0.0.1:3000`.

---

## 8. Backup & Maintenance

Database nightly backup cron:
```bash
0 2 * * * mysqldump -u snaptype_user -p'SECURE_PASSWORD' snaptype_db | gzip > /backups/snaptype_$(date +\%F).sql.gz
```

