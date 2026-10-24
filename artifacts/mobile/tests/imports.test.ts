import { describe, expect, it } from "vitest";
import { describeMapping, plural, sharedStatement, toImportCount, type ImportRow } from "../src/lib/imports";

const row = (status: ImportRow["status"], decision: ImportRow["decision"]): ImportRow =>
  ({ id: status + decision, rowIndex: 0, status, decision, errorMessage: null, date: "2026-10-01", amount: "-1.00", currency: "RUB", description: "x" });

describe("импорт выписки", () => {
  it("к импорту — только импортируемые строки с решением «импорт»", () => {
    expect(toImportCount([row("new", "import"), row("new", "skip"), row("duplicate", "import"), row("skipped", "import"), row("error", "import")])).toBe(2);
  });

  it("подсказка сопоставления одной строкой", () => {
    expect(describeMapping({ date: "Дата", description: "Описание", income: "Приход", expense: "Расход", signConvention: "split", currency: "Валюта" }))
      .toBe("дата — «Дата», описание — «Описание», приход — «Приход», расход — «Расход», валюта — «Валюта»");
    expect(describeMapping({ date: "Date", description: "Text", amount: "Sum", signConvention: "expense_positive" }))
      .toBe("дата — «Date», описание — «Text», сумма — «Sum» (расходы без минуса)");
  });

  it("«Поделиться»: выписка по типу или расширению, путь без схемы получает file://", () => {
    expect(sharedStatement([{ path: "/data/cache/x.csv", fileName: "Выписка.csv", mimeType: "text/comma-separated-values" }]))
      .toEqual({ uri: "file:///data/cache/x.csv", name: "Выписка.csv", mimeType: "text/comma-separated-values" });
    expect(sharedStatement([{ path: "file:///c/a.bin", fileName: "statement.xlsx", mimeType: "application/octet-stream" }])?.name).toBe("statement.xlsx");
    expect(sharedStatement([{ path: "file:///c/photo.jpg", fileName: "photo.jpg", mimeType: "image/jpeg" }])).toBeNull();
    expect(sharedStatement(null)).toBeNull();
  });

  it("склонение", () => {
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => plural(n, "операция", "операции", "операций"))).toEqual(
      ["операция", "операции", "операций", "операций", "операция", "операции", "операций"],
    );
  });
});
