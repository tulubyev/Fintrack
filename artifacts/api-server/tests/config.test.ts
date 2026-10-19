/**
 * Публичная конфигурация фронтенда: ответ из кэша должен совпадать с первым, а не быть JSON-строкой (#60).
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./helpers";

describe("GET /api/config/public", () => {
  it("отдаёт объект и при промахе, и при попадании в кэш", async () => {
    const first = await request(app).get("/api/config/public");
    const second = await request(app).get("/api/config/public");

    for (const res of [first, second]) {
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      const body = JSON.parse(res.text);
      expect(typeof body).toBe("object");
      expect(body).toHaveProperty("ui");
      expect(body).toHaveProperty("api");
      expect(body).toHaveProperty("business");
    }
    expect(second.headers["x-cache"]).toBe("HIT");
    expect(second.body).toEqual(first.body);
  });
});
