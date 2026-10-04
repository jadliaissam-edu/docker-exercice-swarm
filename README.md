# Docker Swarm exercise — deploying a full stack

A small application made of **4 services** to practise deploying a stack on a Docker Swarm cluster.

| Service    | Technology                     | Source                    |
|------------|--------------------------------|---------------------------|
| `frontend` | React (Vite), served by nginx  | `app1-postgres/frontend/` |
| `backend`  | Node.js (Express)              | `app1-postgres/backend/`  |
| `db`       | PostgreSQL 16                  | official image `postgres:16-alpine` |
| `redis`    | Redis 7                        | official image `redis:7-alpine`     |

The home page shows a greeting and live indicators (refreshed every 3 s):

- 🟢/🔴 **Backend**: can the browser reach the Node.js API?
- 🟢/🔴 **Database**: can the backend reach PostgreSQL?
- 🟢/🔴 **Redis**: can the backend reach Redis? (also counts visits)
- the **hostname of the backend replica** that answered. Watch it change as Swarm load-balances.

## Architecture

```
 browser ──:8080──▶ frontend (nginx)
                        │  /api/*  proxied to http://backend:3000
                        ▼
                    backend (Node.js)
                        │
                        ├──▶ db     (PostgreSQL)
                        └──▶ redis
```

## Writing the stack file

👉 **[`app1-postgres/README.md`](app1-postgres/README.md)** describes everything the stack file needs:
service names, images, ports, environment variables, networks, volume, secret, Swarm settings,
plus a skeleton to fill in and a troubleshooting table.

---

## 1. Create the swarm

On the first (manager) node:

```bash
docker swarm init                     # add --advertise-addr <IP> if the host has several IPs
docker swarm join-token worker        # prints the command to run on the other nodes
```

Check: `docker node ls`

## 2. Run a registry inside the swarm

Every node must be able to pull the images you build. The simplest way is a registry running as a swarm service:

```bash
docker service create --name registry --publish published=5000,target=5000 registry:2
```

Thanks to the routing mesh, `127.0.0.1:5000` now points to this registry **on every node**
(Docker allows plain HTTP for `127.0.0.1`, so no TLS config is needed).

## 3. Build and push the images

```bash
cd app1-postgres
docker build -t 127.0.0.1:5000/app1-backend:1.0  ./backend
docker build -t 127.0.0.1:5000/app1-frontend:1.0 ./frontend
docker push 127.0.0.1:5000/app1-backend:1.0
docker push 127.0.0.1:5000/app1-frontend:1.0
```

> On Apple Silicon or mixed-architecture clusters, build for the nodes' platform,
> e.g. `docker build --platform linux/amd64 ...`.

## 4. Write the stack file and deploy

Create `app1-postgres/docker-stack.yml` by following [`app1-postgres/README.md`](app1-postgres/README.md).
In short:

1. `frontend` published on port **8080**, with **2 replicas**.
2. `backend` with **3 replicas**, configured through environment variables.
3. `db` (PostgreSQL) storing its data in a **named volume**, with **1 replica** pinned to the manager node.
4. `redis` with **1 replica**.
5. Two overlay networks: `front` (frontend + backend) and `back` (backend + db + redis).
6. The database password is passed as a **Docker secret** to both `db` and `backend`.
7. Rolling updates of `frontend` and `backend` replace **one task at a time**.

Then deploy:

```bash
docker stack deploy -c docker-stack.yml app1
```

Open <http://localhost:8080>, or use the IP of **any** node. All three indicators should be green.

## 5. Useful commands

```bash
docker stack ls
docker stack services app1
docker stack ps app1                       # where is each task running?
docker service logs -f app1_backend
docker service scale app1_backend=5        # refresh the page: more hostnames
docker service update --force app1_backend # rolling restart
docker stack rm app1
```

## 6. Exercise ideas

1. **Break things and watch the indicators**: `docker service scale app1_redis=0`, then back to `1`.
   Same with `app1_db` and `app1_backend`.
2. **Scaling and load balancing**: scale the backend and watch the replica hostname change.
3. **Rolling update**: change the greeting in `frontend/src/App.jsx`, tag the image `1.1`,
   build + push, update the stack and watch `docker service ps app1_frontend`.
4. **Rollback**: `docker service rollback app1_frontend`.
5. **Placement**: drain a node (`docker node update --availability drain <node>`) and watch tasks move.
6. **Secrets**: replace the file-based secret with an external one created by `docker secret create`.
7. **Network isolation**: `docker exec` into a frontend container and try to reach `db`. Why does it fail?

---

## Running locally without Docker (optional)

With Node.js (≥ 20), start PostgreSQL and Redis yourself, then:

```bash
cd app1-postgres/backend  && npm install && npm run dev     # http://localhost:3000/api/status
cd app1-postgres/frontend && npm install && npm run dev     # http://localhost:5173 (proxies /api)
```
