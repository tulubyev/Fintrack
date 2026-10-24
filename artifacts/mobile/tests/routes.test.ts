import { readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Пути экранов повторяют сайт (lib/links.ts): ссылка fin-wall.ru/app/<путь> и deepLink уведомлений должны открыть
 * нужный экран. Маршруты разбирает сам expo-router (его внутренние getRoutes/getLinkingConfig) по файлам src/app —
 * при обновлении SDK тест может потребовать правки вызова, но не самих ожиданий.
 */
const require = createRequire(import.meta.url);
const appDir = join(dirname(fileURLToPath(import.meta.url)), "../src/app");
const routerDir = dirname(require.resolve("expo-router/package.json"));

function linking() {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(`./${relative(appDir, full)}`);
    }
  })(appDir);
  const context = Object.assign(
    (key: string) => (key.includes("+native-intent") ? { redirectSystemPath: () => "/" } : { default: () => null }),
    { keys: () => files, resolve: (key: string) => key, id: "app" },
  );
  const { getRoutes } = require(join(routerDir, "build/getRoutes.js"));
  const { getLinkingConfig } = require(join(routerDir, "build/getLinkingConfig.js"));
  const config = getLinkingConfig(getRoutes(context, { platform: "android", importMode: "sync" }), context, { metaOnly: true });
  return (path: string): string => {
    let state = config.getStateFromPath(path, config.config);
    const names: string[] = [];
    while (state?.routes) {
      const route = state.routes[state.index ?? state.routes.length - 1];
      names.push(route.name);
      state = route.state;
    }
    return names.slice(1).join(" > "); // без __root
  };
}

describe("маршруты приложения", () => {
  const resolve = linking();

  it("пути сайта открывают те же экраны", () => {
    expect(resolve("/")).toBe("(tabs) > index");
    expect(resolve("/transactions")).toBe("(tabs) > transactions");
    expect(resolve("/budgets")).toBe("(tabs) > budgets");
    expect(resolve("/accounts")).toBe("accounts/index");
    expect(resolve("/accounts/42")).toBe("accounts/[id]");
    expect(resolve("/budgets/7")).toBe("budgets/[id]");
    expect(resolve("/goals")).toBe("goals/index");
    expect(resolve("/subscriptions")).toBe("subscriptions/index");
    expect(resolve("/categories")).toBe("categories/index");
    expect(resolve("/categories/rules")).toBe("categories/rules");
    expect(resolve("/import")).toBe("import");
    expect(resolve("/settings")).toBe("settings");
  });

  it("экраны только приложения и неизвестный путь", () => {
    expect(resolve("/transactions/abc")).toBe("transactions/[id]/index");
    expect(resolve("/transactions/abc/edit")).toBe("transactions/[id]/edit");
    expect(resolve("/transactions?uncategorized=1")).toBe("(tabs) > transactions");
    expect(resolve("/quick-add")).toBe("quick-add");
    // «new» — отдельный экран, а не id
    expect(resolve("/budgets/new")).toBe("budgets/new");
    expect(resolve("/accounts/new")).toBe("accounts/new");
    expect(resolve("/goals/new")).toBe("goals/new");
    expect(resolve("/goals/g1")).toBe("goals/[id]");
    expect(resolve("/categories/new")).toBe("categories/new");
    expect(resolve("/more")).toBe("(tabs) > more");
    expect(resolve("/nope/zzz")).toBe("+not-found");
  });
});
