# Keel Server Deployment

## Option 1: Fly.io (Recommended)

### Prerequisites
- [Fly CLI](https://fly.io/docs/flyctl/install/) installed
- Fly.io account: `fly auth login`

### Setup

```bash
cd server

# Launch app (first time only)
fly launch --no-deploy

# Create Postgres with pgvector
fly pg create --name keel-db
fly pg attach keel-db

# Create Tigris S3 bucket
fly storage create

# Set secrets
fly secrets set JWT_SECRET=$(openssl rand -base64 32)
fly secrets set CORS_ORIGIN="https://keel-api.fly.dev,capacitor://localhost,http://localhost"

# Deploy
fly deploy
```

### CI/CD
Add `FLY_API_TOKEN` to your GitHub repo secrets. Pushes to `main` that
touch `server/` will auto-deploy via `.github/workflows/deploy.yml`.

```bash
fly tokens create deploy -x 999999h
# → copy token to GitHub Settings > Secrets > FLY_API_TOKEN
```

---

## Option 2: Self-Hosted (Docker Compose)

```bash
cd server

# Configure
cp .env.example .env
# Edit .env — set JWT_SECRET, POSTGRES_PASSWORD, S3 keys, CORS_ORIGIN

# Start all services
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f api
```

The API server auto-migrates the database on startup.

### Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

---

## Mobile App Configuration

When building the Capacitor mobile app, point it at your production server:

```bash
# From repo root
VITE_API_URL=https://keel-api.fly.dev npm run build:mobile
npx cap sync
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `S3_ENDPOINT` | Yes | S3-compatible endpoint URL |
| `S3_ACCESS_KEY` | Yes | S3 access key |
| `S3_SECRET_KEY` | Yes | S3 secret key |
| `S3_BUCKET` | Yes | S3 bucket name |
| `S3_REGION` | No | S3 region (default: us-east-1) |
| `PORT` | No | Server port (default: 3001) |
| `CORS_ORIGIN` | No | Comma-separated allowed origins |
| `LOG_LEVEL` | No | Fastify log level (default: info) |
| `AUTO_MIGRATE` | No | Run migrations on startup (default: true in production) |
