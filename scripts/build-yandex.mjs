import { build } from "vite";

process.env.VITE_YANDEX = "true";

await build();
