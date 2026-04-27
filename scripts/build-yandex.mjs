import { build } from "vite";

process.env.VITE_YANDEX = "true";
process.env.VITE_WS_URL ||= "wss://lan-8-ball-pool.onrender.com";

await build();
