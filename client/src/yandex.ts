const LEADERBOARD_NAME = "pool_rating";

interface YandexLeaderboardEntry {
  score: number;
  rank: number;
  player?: {
    publicName?: string;
  };
}

interface YandexSdk {
  features?: {
    LoadingAPI?: {
      ready: () => void;
    };
  };
  leaderboards?: {
    setScore: (name: string, score: number, extraData?: string) => Promise<void>;
    getPlayerEntry: (name: string) => Promise<YandexLeaderboardEntry>;
    getEntries: (
      name: string,
      options?: { quantityTop?: number; includeUser?: boolean; quantityAround?: number }
    ) => Promise<{ entries: YandexLeaderboardEntry[] }>;
  };
  isAvailableMethod?: (name: string) => Promise<boolean>;
}

declare global {
  interface Window {
    YaGames?: {
      init: () => Promise<YandexSdk>;
    };
  }
}

let sdkPromise: Promise<YandexSdk | undefined> | undefined;

export interface LeaderboardState {
  available: boolean;
  playerScore?: number;
  playerRank?: number;
  entries: Array<{ name: string; score: number; rank: number }>;
}

export function initYandexSdk(): Promise<YandexSdk | undefined> {
  sdkPromise ??= loadYandexSdk();
  return sdkPromise;
}

export async function notifyYandexReady(): Promise<void> {
  const sdk = await initYandexSdk();
  sdk?.features?.LoadingAPI?.ready();
}

export async function submitRatingScore(score: number): Promise<void> {
  const sdk = await initYandexSdk();
  if (!sdk?.leaderboards?.setScore || !sdk.isAvailableMethod) return;
  const available = await sdk.isAvailableMethod("leaderboards.setScore");
  if (!available) return;
  await sdk.leaderboards.setScore(LEADERBOARD_NAME, Math.max(0, Math.floor(score)));
}

export async function loadLeaderboard(): Promise<LeaderboardState> {
  const sdk = await initYandexSdk();
  if (!sdk?.leaderboards) return { available: false, entries: [] };

  const entries: LeaderboardState["entries"] = [];
  try {
    const top = await sdk.leaderboards.getEntries?.(LEADERBOARD_NAME, { quantityTop: 5, includeUser: true });
    for (const entry of top?.entries ?? []) {
      entries.push({
        name: entry.player?.publicName || "Player",
        score: entry.score,
        rank: entry.rank
      });
    }
  } catch {
    return { available: false, entries: [] };
  }

  try {
    if (!sdk.isAvailableMethod || !(await sdk.isAvailableMethod("leaderboards.getPlayerEntry"))) {
      return { available: true, entries };
    }
    const player = await sdk.leaderboards.getPlayerEntry(LEADERBOARD_NAME);
    return { available: true, playerScore: player.score, playerRank: player.rank, entries };
  } catch {
    return { available: true, entries };
  }
}

async function loadYandexSdk(): Promise<YandexSdk | undefined> {
  if (!isYandexBuild()) return undefined;
  try {
    if (!window.YaGames) await appendSdkScript();
    return await window.YaGames?.init();
  } catch {
    return undefined;
  }
}

function isYandexBuild(): boolean {
  if (typeof window === "undefined") return false;
  return import.meta.env.VITE_YANDEX === "true" || /(^|\.)yandex\./i.test(window.location.hostname);
}

function appendSdkScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/sdk.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Yandex SDK failed to load"));
    document.head.append(script);
  });
}
