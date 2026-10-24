/**
 * Настройки приложения (D20): вход по биометрии в приложении выключен по умолчанию, включается переменной
 * MOBILE_BIOMETRICS_ENABLED или супер-администратором в кабинете; приложение читает /api/v1/app-config.
 */
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, auth, makeAdmin, registerUser } from "./helpers";

const appConfig = async () => (await request(app).get("/api/v1/app-config")).body.mobileBiometricsEnabled;

afterEach(async () => {
  delete process.env.MOBILE_BIOMETRICS_ENABLED;
  const admin = await registerUser();
  await makeAdmin(admin, "super_admin");
  await request(app).put("/api/admin/settings").set(auth(admin.token)).send({ mobileBiometrics: null });
});

describe("биометрия в приложении", () => {
  it("по умолчанию выключена; .env включает; ответ без кеша и без входа", async () => {
    const res = await request(app).get("/api/v1/app-config");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mobileBiometricsEnabled: false });
    expect(res.headers["cache-control"]).toBe("no-store");

    process.env.MOBILE_BIOMETRICS_ENABLED = "true";
    expect(await appConfig()).toBe(true);
  });

  it("супер-администратор перекрывает .env и возвращает к нему; действие в журнале", async () => {
    const admin = await registerUser();
    await makeAdmin(admin, "super_admin");

    const on = await request(app).put("/api/admin/settings").set(auth(admin.token)).send({ mobileBiometrics: true });
    expect(on.status).toBe(200);
    expect(on.body.mobileBiometrics).toEqual({ enabled: true, source: "admin", envDefault: false });
    expect(await appConfig()).toBe(true);

    process.env.MOBILE_BIOMETRICS_ENABLED = "true";
    await request(app).put("/api/admin/settings").set(auth(admin.token)).send({ mobileBiometrics: false });
    expect(await appConfig()).toBe(false);

    const reset = await request(app).put("/api/admin/settings").set(auth(admin.token)).send({ mobileBiometrics: null });
    expect(reset.body.mobileBiometrics).toEqual({ enabled: true, source: "env", envDefault: true });

    const logs = await request(app).get("/api/admin/system/logs").set(auth(admin.token));
    expect(JSON.stringify(logs.body)).toContain("settings_updated");
  });

  it("менять может только супер-администратор; обычный пользователь не видит; без входа — 401", async () => {
    const devops = await registerUser();
    await makeAdmin(devops, "devops_admin");
    expect((await request(app).get("/api/admin/settings").set(auth(devops.token))).status).toBe(200);
    const denied = await request(app).put("/api/admin/settings").set(auth(devops.token)).send({ mobileBiometrics: true });
    expect(denied.status).toBe(403);
    expect(await appConfig()).toBe(false);

    const user = await registerUser();
    expect((await request(app).get("/api/admin/settings").set(auth(user.token))).status).toBe(403);
    expect((await request(app).put("/api/admin/settings").send({ mobileBiometrics: true })).status).toBe(401);
  });

  it("неверное значение — 400", async () => {
    const admin = await registerUser();
    await makeAdmin(admin, "super_admin");
    const res = await request(app).put("/api/admin/settings").set(auth(admin.token)).send({ mobileBiometrics: "yes" });
    expect(res.status).toBe(400);
  });
});

describe("статус системы для мониторинга", () => {
  it("база проверена запросом, память и uptime числами", async () => {
    const admin = await registerUser();
    await makeAdmin(admin, "devops_admin");
    const res = await request(app).get("/api/admin/system/status").set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.health).toMatchObject({ database: "healthy", api: "healthy" });
    expect(typeof res.body.health.dbLatencyMs).toBe("number");
    expect(res.body.metrics.memory.used).toBeGreaterThan(0);
    expect(res.body.metrics.uptime).toBeGreaterThanOrEqual(0);
    expect(typeof res.body.metrics.load).toBe("number");
  });
});
