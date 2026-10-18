/**
 * Банки для выбора при создании счёта; код хранится в accounts.institution_code.
 * Форматы выписок предварительные: уточняются по образцам при разборе импорта (E1.2).
 */
export const INSTITUTIONS = [
  { code: "sber", name: "Сбербанк", importFormats: ["pdf"] },
  { code: "tbank", name: "Т-Банк", importFormats: ["csv", "xlsx"] },
  { code: "alfa", name: "Альфа-Банк", importFormats: ["csv", "xlsx", "pdf"] },
  { code: "vtb", name: "ВТБ", importFormats: ["pdf", "xlsx"] },
  { code: "ozon", name: "Озон Банк", importFormats: ["pdf"] },
  { code: "yandex", name: "Яндекс Банк", importFormats: ["pdf"] },
  { code: "gazprom", name: "Газпромбанк", importFormats: ["pdf"] },
  { code: "raif", name: "Райффайзенбанк", importFormats: ["pdf"] },
  { code: "other", name: "Другой банк", importFormats: [] as string[] },
] as const;

export const INSTITUTION_CODES = INSTITUTIONS.map((institution) => institution.code) as [string, ...string[]];
