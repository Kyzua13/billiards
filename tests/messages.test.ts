import { describe, expect, it } from "vitest";
import type { ClientMessage, ServerMessage } from "../shared/src/index.ts";

describe("message contract", () => {
  it("covers create, join, seat, name, shoot, and state messages", () => {
    const outgoing: ClientMessage[] = [
      { type: "create_room", name: "Ada", gameMode: "1v1" },
      { type: "join_room", roomCode: "ABCDE", name: "Grace" },
      { type: "choose_seat", roomCode: "ABCDE", seat: "A1" },
      { type: "set_name", roomCode: "ABCDE", name: "Linus" },
      { type: "shoot", roomCode: "ABCDE", shot: { angle: 0, power: 0.5 } },
      { type: "request_state", roomCode: "ABCDE" }
    ];
    const incoming: ServerMessage = { type: "shot_frame", roomCode: "ABCDE", frame: { balls: [], events: [] } };

    expect(outgoing.map((message) => message.type)).toEqual([
      "create_room",
      "join_room",
      "choose_seat",
      "set_name",
      "shoot",
      "request_state"
    ]);
    expect(incoming.type).toBe("shot_frame");
  });
});
