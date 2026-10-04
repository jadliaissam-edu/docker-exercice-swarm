# app1-postgres: writing the stack file

This folder holds everything needed to run the application. Your job is to write
**`docker-stack.yml`** (in this folder) to deploy it on Docker Swarm.
The same file can also be used with `docker compose` for local testing.

```
app1-postgres/
├── backend/                 Node.js API          → image 127.0.0.1:5000/app1-backend:1.0
├── frontend/                React app + nginx    → image 127.0.0.1:5000/app1-frontend:1.0
├── secrets/
│   └── db_password.txt      database password (to be used as a Docker secret)
└── docker-stack.yml         ← YOU write this file
```

## The 4 services at a glance

| Service name | Image                               | Container port | Published port | Replicas | Networks        | Needs                                |
|--------------|-------------------------------------|----------------|----------------|----------|-----------------|--------------------------------------|
| `frontend`   | `127.0.0.1:5000/app1-frontend:1.0`  | 80             | **8080**       | 2        | `front`         | `backend`                            |
| `backend`    | `127.0.0.1:5000/app1-backend:1.0`   | 3000           | none           | 3        | `front`, `back` | `db`, `redis`, secret `db_password`  |
| `db`         | `postgres:16-alpine`                | 5432           | none           | 1        | `back`          | volume `db-data`, secret `db_password` |
| `redis`      | `redis:7-alpine`                    | 6379           | none           | 1        | `back`          |                                      |

```
                 :8080
 browser ──────────────▶ frontend ──(/api/* → http://backend:3000)──▶ backend ──┬──▶ db:5432
                         └──────── network: front ─────────────────────┘        └──▶ redis:6379
                                                                       └── network: back ──┘
```

> ⚠️ **Service names matter.** Services find each other by name through Docker's DNS.
> nginx (in the frontend image) forwards to `http://backend:3000`, so the backend service
> **must** be called `backend`. The backend reaches the DB and Redis using the names you
> give in its environment variables (`db` and `redis` below).

---

## Service details

### `frontend`
- Built from `./frontend` (multi-stage: Vite build, then nginx).
- Listens on port **80** inside the container. Publish it as **8080**.
- Has no environment variables.

### `backend`
- Built from `./backend`.
- Listens on port **3000**. **Do not publish it**: only the frontend talks to it.
- Has a built-in `HEALTHCHECK` (`GET /api/health`), so `docker ps` shows `healthy`/`unhealthy`.
- Configured with these environment variables:

| Variable           | Value to use in the stack       | Notes                                                  |
|--------------------|---------------------------------|--------------------------------------------------------|
| `DB_HOST`          | `db`                            | name of the PostgreSQL service                         |
| `DB_PORT`          | *(default `5432`)*              | optional                                               |
| `DB_USER`          | `app`                           | must match `POSTGRES_USER` of `db`                     |
| `DB_NAME`          | `app`                           | must match `POSTGRES_DB` of `db`                       |
| `DB_PASSWORD_FILE` | `/run/secrets/db_password`      | file where Swarm mounts the secret (or use `DB_PASSWORD` with a plain value) |
| `REDIS_URL`        | `redis://redis:6379`            | `redis` = name of the Redis service                    |
| `PORT`             | *(default `3000`)*              | optional                                               |

### `db` (official `postgres` image)

| Variable                 | Value                       |
|--------------------------|-----------------------------|
| `POSTGRES_USER`          | `app`                       |
| `POSTGRES_DB`            | `app`                       |
| `POSTGRES_PASSWORD_FILE` | `/run/secrets/db_password`  |

- Data directory: `/var/lib/postgresql/data`. Mount the named volume `db-data` there.
- A Swarm volume is **local to the node** where it is created. Pin the DB to one node
  (e.g. the manager), or it may restart on another node with an empty volume.

### `redis` (official `redis` image)
- No configuration needed.

---

## Top-level sections you will need

| Section    | Entry         | Purpose                                                        |
|------------|---------------|----------------------------------------------------------------|
| `networks` | `front`       | frontend ↔ backend                                             |
| `networks` | `back`        | backend ↔ db / redis (the frontend must not be on it)          |
| `volumes`  | `db-data`     | persistent PostgreSQL data                                     |
| `secrets`  | `db_password` | created from the file `./secrets/db_password.txt`              |

`docker stack deploy` creates networks as **overlay** networks by default, so you don't need to
set a driver. If you do write `driver: overlay`, the file will no longer work with plain
`docker compose` on a machine that isn't in a swarm.

## Swarm-only settings (`deploy:` key)

These are read by `docker stack deploy`. `docker compose` ignores most of them.

| Setting                                        | Where                  | Value                       |
|------------------------------------------------|------------------------|-----------------------------|
| `deploy.replicas`                              | all services           | see table at the top        |
| `deploy.update_config.parallelism` / `delay`   | `frontend`, `backend`  | `1` / `5s` (one task at a time) |
| `deploy.restart_policy.condition`              | `frontend`, `backend`  | `on-failure`                |
| `deploy.placement.constraints`                 | `db`                   | `node.role == manager`      |

---

## Skeleton to start from

Copy this into `docker-stack.yml` and replace every `TODO`.

```yaml
services:
  frontend:
    image: 127.0.0.1:5000/app1-frontend:1.0
    build: ./frontend          # used by `docker compose build`, ignored by `docker stack deploy`
    ports:
      - TODO                   # host 8080 → container 80
    networks:
      - TODO
    deploy:
      replicas: TODO
      # TODO: update_config, restart_policy

  backend:
    image: TODO
    build: TODO
    environment:
      DB_HOST: TODO
      DB_USER: TODO
      DB_NAME: TODO
      DB_PASSWORD_FILE: TODO
      REDIS_URL: TODO
    secrets:
      - TODO
    networks:
      - TODO
      - TODO
    deploy:
      replicas: TODO

  db:
    image: TODO
    environment:
      POSTGRES_USER: TODO
      POSTGRES_DB: TODO
      POSTGRES_PASSWORD_FILE: TODO
    secrets:
      - TODO
    volumes:
      - TODO                   # named volume → PostgreSQL data directory
    networks:
      - TODO
    deploy:
      replicas: 1
      placement:
        constraints:
          - TODO

  redis:
    image: TODO
    networks:
      - TODO

networks:
  front:
  back:

volumes:
  db-data:

secrets:
  db_password:
    file: TODO
```

---

## Using the file

**On the swarm** (see the root README for setting up the swarm and the registry):

```bash
docker compose -f docker-stack.yml build    # or: docker build -t <image> ./backend ...
docker compose -f docker-stack.yml push
docker stack deploy -c docker-stack.yml app1
```

**Locally with Docker Compose** (no swarm needed):

```bash
docker compose -f docker-stack.yml up --build --scale frontend=1
```

`--scale frontend=1` is needed because two frontend replicas cannot share host port 8080
outside of Swarm (in Swarm, the routing mesh handles it).

## Checking your work

Open <http://localhost:8080>:

- ✅ **Backend**, **Database** and **Redis** are all green.
- ✅ The *served by backend replica* hostname changes between refreshes (several backend replicas).
- ✅ `docker stack ps app1` shows the `db` task running on the manager.

If an indicator is red:

| Red indicator | Likely cause                                                                         |
|---------------|--------------------------------------------------------------------------------------|
| Backend       | backend service not named `backend`, not on the `front` network, or not running      |
| Database      | wrong `DB_HOST`/user/db name, secret not attached to both services, backend not on `back` |
| Redis         | wrong `REDIS_URL`, or Redis not on the `back` network                               |

The page shows the exact error message under a red indicator. `docker service logs app1_backend` helps too.
