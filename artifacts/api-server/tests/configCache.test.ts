/**
 * Кэш /api/config/public: повторный ответ из кэша — тот же объект, а не JSON-строка внутри JSON,
 * и с заголовком X-Cache: HIT.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./helpers";

describe("GET /api/config/public из кэша", () => {
  it("второй ответ совпадает с первым и помечен HIT", async () => {
    const first = await request(app).get("/api/config/public");
    const second = await request(app).get("/api/config/public");
    expect(first.status).toBe(200);
    expect(typeof first.body).toBe("object");
    expect(second.body).toEqual(first.body);
    expect(second.body.ui).toBeTruthy();
    expect(second.headers["x-cache"]).toBe("HIT");
  });
});
