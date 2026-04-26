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
- Pick one of four seats. Turns rotate A1, B1, A2, B2.
- Active player aims by pointing from the cue ball, adjusts the power slider, and clicks **Shoot**.

The server is authoritative for shots and rules. The client trajectory preview is advisory.
