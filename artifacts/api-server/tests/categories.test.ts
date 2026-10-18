/**
 * Справочник категорий (E1.3-T1): системное дерево из миграции, свои категории и настройки видны только владельцу.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { db, categories, userCategoryPrefs } from "@workspace/db";
import { app, auth, registerUser, type TestUser } from "./helpers";

interface Node { id: string; code: string | null; name: string; kind: string; taxDeduction: string | null; isSystem: boolean; hidden: boolean; children: Node[] }

const flatten = (nodes: Node[]): Node[] => nodes.flatMap((node) => [node, ...flatten(node.children)]);
const tree = async (user: TestUser, query = "") => {
  const res = await request(app).get(`/api/v1/categories${query}`).set(auth(user.token));
  expect(res.status).toBe(200);
  return res.body.items as Node[];
};

let a: TestUser;
let b: TestUser;
beforeAll(async () => {
  [a, b] = [await registerUser(), await registerUser()];
});

describe("GET /api/v1/categories", () => {
  it("отдаёт системное дерево из миграции", async () => {
    const items = await tree(a);
    const all = flatten(items);
    expect(items.filter((node) => node.kind === "expense")).toHaveLength(22);
    expect(items.map((node) => node.code)).toEqual(expect.arrayContaining(["food", "eat", "p2p", "other", "inc", "xfer"]));
    expect(all.filter((node) => node.isSystem)).toHaveLength(24 + 64);

    const food = items.find((node) => node.code === "food")!;
    expect(food.children.map((child) => child.code)).toEqual(["food.groceries", "food.local", "food.delivery", "food.alcohol"]);
    expect(all.find((node) => node.code === "health.medical")).toMatchObject({ name: "Медуслуги", taxDeduction: "medical", kind: "expense" });
    expect(all.filter((node) => node.taxDeduction).map((node) => node.code).sort())
      .toEqual(["education.courses", "education.school", "finance.insurance_life", "health.dental", "health.insurance", "health.medical", "sport.fitness"]);
  });

  it("фильтрует по виду", async () => {
    const income = await tree(a, "?kind=income");
    expect(income.map((node) => node.code)).toEqual(["inc"]);
    expect(income[0].children).toHaveLength(8);
    expect(flatten(income).every((node) => node.kind === "income")).toBe(true);
  });

  it("своя категория видна только владельцу", async () => {
    const [food] = await db.select().from(categories).where(eq(categories.code, "food"));
    const [own] = await db.insert(categories).values({ userId: a.id, parentId: food.id, name: "Корм для собаки", kind: "expense" }).returning();

    const mine = flatten(await tree(a)).find((node) => node.id === own.id);
    expect(mine).toMatchObject({ isSystem: false, code: null });
    expect((await tree(a)).find((node) => node.code === "food")!.children.map((child) => child.id)).toContain(own.id);
    expect(flatten(await tree(b)).map((node) => node.id)).not.toContain(own.id);
  });

  it("скрытие и переименование системной категории действуют только для этого пользователя", async () => {
    const [beauty] = await db.select().from(categories).where(eq(categories.code, "beauty"));
    const [eat] = await db.select().from(categories).where(eq(categories.code, "eat"));
    await db.insert(userCategoryPrefs).values([
      { userId: a.id, categoryId: beauty.id, hidden: true },
      { userId: a.id, categoryId: eat.id, customName: "Еда вне дома" },
    ]);

    const aTree = await tree(a);
    expect(aTree.map((node) => node.code)).not.toContain("beauty");
    expect(aTree.find((node) => node.code === "eat")!.name).toBe("Еда вне дома");
    expect((await tree(a, "?includeHidden=true")).find((node) => node.code === "beauty")).toMatchObject({ hidden: true });

    const bTree = await tree(b);
    expect(bTree.find((node) => node.code === "beauty")).toMatchObject({ hidden: false });
    expect(bTree.find((node) => node.code === "eat")!.name).toBe("Кафе и рестораны");

    await db.delete(userCategoryPrefs).where(and(eq(userCategoryPrefs.userId, a.id)));
  });

  it("скрытый родитель скрывает и свои подкатегории", async () => {
    const [travel] = await db.select().from(categories).where(eq(categories.code, "travel"));
    await db.insert(userCategoryPrefs).values({ userId: a.id, categoryId: travel.id, hidden: true });
    const codes = flatten(await tree(a)).map((node) => node.code);
    expect(codes).not.toContain("travel");
    expect(codes).not.toContain("travel.hotel");
    await db.delete(userCategoryPrefs).where(eq(userCategoryPrefs.userId, a.id));
  });

  it("неизвестный вид — 400", async () => {
    const res = await request(app).get("/api/v1/categories?kind=gifts").set(auth(a.token));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
