# LAN 8-Ball Pool

A browser-based 2D American 8-ball game. It can run locally, through Radmin VPN, or as a public Render-hosted game with WebSocket multiplayer.

## Run

```bash
npm install
npm run dev
```

Open the client URL printed by Vite. Other players on the same LAN can open `http://HOST_LAN_IP:5173` and join with the room code.

## Production locally

```bash
npm run build
npm start
```

Open:

```text
http://localhost:8787
```

In production mode the Node server serves the built Vite client and WebSocket traffic from the same origin.

## Deploy to Render

1. Push this repository to GitHub.
2. In Render, create a new Blueprint or Web Service from the repo.
3. If creating manually, use:
   - Build command: `npm install --include=dev && npm run build`
   - Start command: `npm start`
   - Plan: Free
4. After deploy, give players the public URL:

```text
https://your-service-name.onrender.com
```

Render Free web services can sleep after about 15 minutes without traffic. The first player after a sleep may wait around a minute while the service wakes up. Rooms are kept in memory, so active rooms disappear if Render restarts or redeploys the service.

## Yandex Games deploy

The Yandex Games build is a static HTML5 client. Online play still connects to the public Render WebSocket backend.

1. In Yandex Games Console, create a leaderboard with technical name:

```text
pool_rating
```

2. Build the static client:

```bash
npm run build:yandex
```

3. Zip the contents of `dist` so that `index.html` is at the root of the archive.
4. Upload the archive in Yandex Games Console.
5. In the game settings, prefer landscape orientation and test mobile controls in the console preview.

The Yandex build initializes the SDK, calls `LoadingAPI.ready()` after the UI is ready, and submits online 1v1 wins to the `pool_rating` leaderboard. Local 1v1 games do not affect rating.

If your Render service URL is different, build with a custom WebSocket URL:

```bash
set VITE_WS_URL=wss://your-service.onrender.com
npm run build:yandex
```

## Radmin VPN

If players connect through Radmin VPN, use the host address printed for the `Radmin VPN` adapter, usually a `26.x.x.x` address:

```bash
npm run dev:radmin
```

```text
http://26.x.x.x:5173
```

On this machine the Radmin address is currently:

```text
http://26.33.51.218:5173
```

The game needs inbound TCP access to:

- `5173` for the browser client
- `8787` for the WebSocket game server

If another player cannot open the page through Radmin, allow these two ports in Windows Defender Firewall for Private networks.

## Controls

- Enter a name; it is saved in `localStorage`.
- Create or join a room.
- Use **Random 1v1** to find an online opponent automatically.
- Use **Local 1v1** to play pass-and-play on one device.
- Pick one of four seats. Turns rotate A1, B1, A2, B2.
- Active player aims by pointing from the cue ball, adjusts the power slider, and clicks **Shoot**.

The server is authoritative for shots and rules. The client trajectory preview is advisory.
