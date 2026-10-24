/**
 * Системные ключевые слова (E1.3-T6, шаг 6 конвейера): то, что осталось без мерчанта, MCC и категории банка.
 * Шаблон — слова подряд; слово от 4 букв — основа («заправ» → «заправка»), короче — слово целиком («азс»).
 * Порядок важен: первое совпадение выигрывает, поэтому частные правила стоят выше общих.
 */
import { normalizeMerchantText } from "./merchant";

interface KeywordRule {
  direction: "in" | "out";
  code: string;
  patterns: string[];
  /** Слова, при которых правило не срабатывает: «Оплата по QR СБП» — покупка, а не перевод. */
  unless?: string[];
}

const PURCHASE = ["оплат", "покупк", "qr"];

export const KEYWORD_RULES: KeywordRule[] = [
  // поступления
  { direction: "in", code: "inc.salary", patterns: ["зарплат", "заработн плат", "аванс", "salary", "оплат труд", "зп"] },
  { direction: "in", code: "inc.cashback", patterns: ["кэшбэк", "кешбэк", "кэшбек", "кешбек", "cashback", "бонус за покупк", "вознагражден за операц"] },
  { direction: "in", code: "inc.interest", patterns: ["процент на остат", "процент по вклад", "процент по счет", "капитализац", "выплат процент", "начислен процент", "interest"] },
  { direction: "in", code: "inc.pension", patterns: ["пенси"] },
  { direction: "in", code: "inc.stipend", patterns: ["стипенди"] },
  { direction: "in", code: "inc.alimony", patterns: ["алимент"] },
  { direction: "in", code: "inc.benefits", patterns: ["пособи", "единое пособ", "социальн выплат", "фсс"] },
  { direction: "in", code: "inc.refund_tax", patterns: ["налогов вычет", "возврат ндфл", "возврат налог"] },
  { direction: "in", code: "inc.gov", patterns: ["сфр", "соцзащит", "казначейств"] },
  { direction: "in", code: "inc.p2p", patterns: ["перевод", "сбп", "по номер телефон", "card 2 card", "c 2 c", "p 2 p"] },
  // списания: деньги и банк
  { direction: "out", code: "cash", patterns: ["снят наличн", "выдач наличн", "atm", "банкомат", "cash withdrawal"] },
  { direction: "out", code: "finance.fees", patterns: ["комисси", "плат за обслуживан", "обслуживан карт", "обслуживан счет", "смс информ", "sms информ", "плат за смс", "оповещен"] },
  { direction: "out", code: "finance.interest", patterns: ["процент по кредит", "погашен процент", "процент за пользован"] },
  { direction: "out", code: "finance.taxes", patterns: ["налог", "ндфл", "госпошлин", "пошлин", "фнс", "уфк"] },
  { direction: "out", code: "auto.fines", patterns: ["штраф", "гибдд", "цафап"] },
  { direction: "out", code: "finance.insurance_life", patterns: ["страхован жизн"] },
  { direction: "out", code: "auto.insurance", patterns: ["осаго", "каско"] },
  { direction: "out", code: "health.insurance", patterns: ["дмс"] },
  { direction: "out", code: "gifts.charity", patterns: ["благотвор", "пожертвован", "donat", "фонд помощ"] },
  { direction: "out", code: "p2p", patterns: ["перевод", "сбп", "по номер телефон", "card 2 card", "c 2 c", "p 2 p"], unless: PURCHASE },
  // дом и связь
  { direction: "out", code: "home.utilities", patterns: ["жкх", "жку", "коммунал", "электроэнерг", "водоснабжен", "газоснабжен", "отоплен", "капремонт", "капитальн ремонт", "квартплат", "управляющ компан", "тсж", "энергосбыт", "водоканал", "епд"] },
  { direction: "out", code: "home.rent", patterns: ["аренд квартир", "арендн плат", "найм жил", "наем жил"] },
  { direction: "out", code: "telecom.mobile", patterns: ["мобильн связ", "сотов связ", "оплат мобильн", "пополнен телефон"] },
  { direction: "out", code: "telecom.internet", patterns: ["домашн интернет", "интернет", "телевиден", "кабельн тв"] },
  { direction: "out", code: "home.repair", patterns: ["стройматериал", "строительн", "сантехник", "мебел", "ремонт квартир", "обои"] },
  { direction: "out", code: "home.goods", patterns: ["хозтовар", "товар для дом", "посуд", "текстил"] },
  // транспорт и авто
  { direction: "out", code: "auto.fuel", patterns: ["азс", "заправ", "бензин", "дизел", "fuel", "petrol"] },
  { direction: "out", code: "auto.parking", patterns: ["парковк", "паркинг", "parking", "платн дорог", "toll"] },
  { direction: "out", code: "auto.service", patterns: ["автосервис", "шиномонтаж", "автомойк", "автозапчаст", "техосмотр", "car wash"] },
  { direction: "out", code: "transport.taxi", patterns: ["такси", "taxi"] },
  { direction: "out", code: "transport.carsharing", patterns: ["каршеринг", "carsharing", "аренд самокат"] },
  { direction: "out", code: "transport.public", patterns: ["метро", "metro", "автобус", "трамва", "троллейбус", "электричк", "транспортн карт", "проезд"] },
  { direction: "out", code: "travel.transport", patterns: ["авиабилет", "ж д билет", "жд билет", "airlines", "авиакомпан", "поезд"] },
  { direction: "out", code: "travel.hotel", patterns: ["отел", "hotel", "гостиниц", "хостел", "hostel"] },
  { direction: "out", code: "travel.other", patterns: ["турагент", "туроператор", "duty free", "аэропорт", "airport"] },
  // еда
  { direction: "out", code: "eat.delivery", patterns: ["доставк ед", "food delivery"] },
  { direction: "out", code: "food.delivery", patterns: ["доставк продукт"] },
  { direction: "out", code: "food.alcohol", patterns: ["алкогол", "вино", "винн", "пиво", "beer", "wine"] },
  { direction: "out", code: "eat.fastfood", patterns: ["бургер", "burger", "шаурм", "шаверм", "пицц", "pizza", "фастфуд", "fast food", "хот дог", "кебаб", "kebab"] },
  { direction: "out", code: "eat.cafe", patterns: ["кафе", "cafe", "кофе", "coffee", "кофейн", "bar", "бар", "паб", "pub"] },
  { direction: "out", code: "eat.restaurant", patterns: ["ресторан", "restaurant", "траттор", "trattoria", "гриль", "steak"] },
  { direction: "out", code: "food.local", patterns: ["рынок", "пекарн", "булочн", "мясн лавк", "овощ", "фрукт"] },
  { direction: "out", code: "food.groceries", patterns: ["супермаркет", "гипермаркет", "продукт", "grocery", "продмаг"] },
  // здоровье и красота
  { direction: "out", code: "health.pharmacy", patterns: ["аптек", "apteka", "pharm", "фарм"] },
  { direction: "out", code: "health.dental", patterns: ["стоматолог", "dental", "дентал"] },
  { direction: "out", code: "health.medical", patterns: ["клиник", "clinic", "медицин", "медцентр", "больниц", "поликлиник", "анализ", "лаборатор", "врач", "doctor", "оптик", "диагност", "узи", "мрт"] },
  { direction: "out", code: "beauty", patterns: ["салон красот", "парикмах", "барбер", "barber", "маникюр", "nail", "косметик", "cosmetic", "spa", "спа", "массаж"] },
  { direction: "out", code: "sport.fitness", patterns: ["фитнес", "fitness", "бассейн", "тренажер", "спортзал", "gym", "йога", "yoga"] },
  { direction: "out", code: "sport.goods", patterns: ["спорттовар", "спортивн товар"] },
  // покупки
  { direction: "out", code: "clothes", patterns: ["одежд", "обув", "clothes", "shoes", "fashion"] },
  { direction: "out", code: "shopping.electronics", patterns: ["электроник", "бытов техник", "electronics", "цифров техник"] },
  { direction: "out", code: "shopping.marketplace", patterns: ["маркетплейс", "marketplace"] },
  { direction: "out", code: "kids.goods", patterns: ["детск товар", "игрушк", "toys"] },
  { direction: "out", code: "pets", patterns: ["зоомагазин", "зоотовар", "ветеринар", "ветклиник", "корм для"] },
  { direction: "out", code: "gifts.gifts", patterns: ["цветы", "букет", "flower", "подар", "gift", "ювелир", "jewel", "сувенир"] },
  // образование и досуг
  { direction: "out", code: "education.school", patterns: ["детск сад", "детсад", "школ", "гимназ", "лицей"] },
  { direction: "out", code: "education.books", patterns: ["книг", "книжн", "book"] },
  { direction: "out", code: "education.courses", patterns: ["курс", "обучен", "образовательн", "университет", "колледж", "тренинг", "вебинар", "репетитор"] },
  { direction: "out", code: "kids.activities", patterns: ["кружок", "секци"] },
  { direction: "out", code: "subs.video", patterns: ["онлайн кинотеатр"] },
  { direction: "out", code: "leisure.cinema", patterns: ["кино", "cinema", "театр", "theatre", "theater", "концерт", "concert"] },
  { direction: "out", code: "leisure.events", patterns: ["музе", "museum", "выставк", "зоопарк", "аквапарк", "экскурс"] },
  { direction: "out", code: "leisure.hobby", patterns: ["хобби", "hobby"] },
  { direction: "out", code: "leisure", patterns: ["развлечен", "боулинг", "бильярд", "квест", "караоке"] },
  { direction: "out", code: "subs.software", patterns: ["software", "облачн хранилищ", "vpn", "хостинг"] },
  { direction: "out", code: "subs", patterns: ["подписк", "subscription", "premium", "премиум"] },
];

const wordMatches = (word: string, token: string) => (word.length >= 4 ? token.startsWith(word) : token === word);

function phraseIn(tokens: string[], phrase: string[]): boolean {
  for (let start = 0; start + phrase.length <= tokens.length; start++) {
    if (phrase.every((word, i) => wordMatches(word, tokens[start + i]))) return true;
  }
  return false;
}

// шаблоны написаны людьми — приводим их к тому же виду, что и текст операции
const compiled = KEYWORD_RULES.map((rule) => ({
  ...rule,
  phrases: rule.patterns.map((pattern) => normalizeMerchantText(pattern).split(" ")),
  unlessPhrases: (rule.unless ?? []).map((pattern) => normalizeMerchantText(pattern).split(" ")),
}));

/** Код категории по ключевым словам в строках операции или null. */
export function keywordCategory(direction: "in" | "out", ...values: Array<string | null | undefined>): string | null {
  const tokens = normalizeMerchantText(values.filter(Boolean).join(" ")).split(" ").filter(Boolean);
  if (!tokens.length) return null;
  for (const rule of compiled) {
    if (rule.direction !== direction) continue;
    if (!rule.phrases.some((phrase) => phraseIn(tokens, phrase))) continue;
    if (rule.unlessPhrases.some((phrase) => phraseIn(tokens, phrase))) continue;
    return rule.code;
  }
  return null;
}
