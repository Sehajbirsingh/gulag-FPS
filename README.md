# Gulag Duel

Browser-based 1v1 FPS duel inspired by the Warzone Gulag format.

## Stack

- Three.js/WebGL client
- Express + Socket.IO server
- Server-authoritative room, hit registration, health, ammo, timer, and match state
- Custom lightweight movement/collision for the small arena
- Docker packaging for Azure Container Apps

## Game Rules

- Best of 5 rounds; first player to 3 round wins takes the match.
- Exactly 2 players per room.
- Each round lasts 2 minutes.
- If the timer expires, higher remaining HP wins the round. If HP is tied, sudden death starts and the next successful hit wins.
- Pistol only: 8 rounds per magazine, 420 ms fire cooldown, 1.6 s reload.
- Health resets to 100 HP each round.
- Head hitbox: instant kill.
- Torso hitbox: 50 damage.
- Limb hitboxes: 25 damage.

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in two browser windows. Create a room in one window, join the room code in the other, then set both players ready.

Controls:

- WASD to move
- Mouse to look after clicking into the game
- Left mouse to fire
- R to reload
- Space to jump
- Ctrl or C to crouch

## Docker

```bash
docker build -t gulag-duel .
docker run --rm -p 3000:3000 gulag-duel
```

## Azure Deployment

Recommended testing target: Azure Container Apps. It supports WebSocket traffic over HTTP ingress, runs containers directly, and can scale to zero when idle.

```bash
az login
chmod +x azure/deploy.sh
./azure/deploy.sh
```

The script creates:

- Resource group
- Azure Container Registry Basic
- Azure Container Apps environment
- Public Container App with external ingress on port 3000
- HTTP concurrency autoscale rule, min replicas 0 and max replicas 5
- Sticky sessions so each WebSocket client remains on the same replica

For free-credit testing, prefer one scalable backend handling many rooms instead of one container per match. A per-match container model is expensive and operationally noisy because every duel needs scheduling, routing, cold starts, and cleanup. This app keeps many isolated 2-player rooms inside one Node process and lets Azure add replicas only as total connection/load grows.

The current prototype stores active room state in memory. That is fine for a small test with one or a few replicas, but a production multi-replica version should externalize room ownership/state with Redis, Azure Web PubSub, or a dedicated match coordinator so two players who share a room code are guaranteed to land on the same authoritative room process.
