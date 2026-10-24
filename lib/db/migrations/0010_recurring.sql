CREATE TABLE "recurring_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_key" varchar(160) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"direction" varchar(3) NOT NULL,
	"kind" varchar(12) NOT NULL,
	"service_id" uuid,
	"account_id" uuid,
	"category_id" uuid,
	"currency" varchar(3) DEFAULT 'RUB' NOT NULL,
	"periodicity" varchar(10) NOT NULL,
	"interval_days" integer NOT NULL,
	"amount_last" numeric(15, 2) NOT NULL,
	"amount_median" numeric(15, 2) NOT NULL,
	"amount_min" numeric(15, 2) NOT NULL,
	"amount_max" numeric(15, 2) NOT NULL,
	"amount_previous" numeric(15, 2),
	"price_changed_at" date,
	"occurrences" integer NOT NULL,
	"first_date" date NOT NULL,
	"last_date" date NOT NULL,
	"next_expected_date" date,
	"expected_amount" numeric(15, 2),
	"confidence" real NOT NULL,
	"source" varchar(8) DEFAULT 'detector' NOT NULL,
	"status" varchar(10) DEFAULT 'detected' NOT NULL,
	"remind_days_before" integer DEFAULT 2 NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "recurring_series_direction_check" CHECK ("recurring_series"."direction" in ('out', 'in')),
	CONSTRAINT "recurring_series_kind_check" CHECK ("recurring_series"."kind" in ('subscription', 'utility', 'loan', 'rent', 'salary', 'pension', 'trial', 'other')),
	CONSTRAINT "recurring_series_periodicity_check" CHECK ("recurring_series"."periodicity" in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
	CONSTRAINT "recurring_series_status_check" CHECK ("recurring_series"."status" in ('detected', 'confirmed', 'ignored', 'cancelled', 'ended')),
	CONSTRAINT "recurring_series_remind_check" CHECK ("recurring_series"."remind_days_before" between 0 and 7)
);
--> statement-breakpoint
CREATE TABLE "subscription_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"service_group" varchar(30) NOT NULL,
	"patterns" text[] NOT NULL,
	"typical_period" varchar(10),
	"trial_days" integer,
	"cancel_url" varchar(300),
	"cancel_steps" text,
	"verified_at" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_services_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_service_id_subscription_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."subscription_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_series_user_key_uq" ON "recurring_series" USING btree ("user_id","direction","group_key","currency");--> statement-breakpoint
CREATE INDEX "recurring_series_user_next_idx" ON "recurring_series" USING btree ("user_id","status","next_expected_date");--> statement-breakpoint
CREATE INDEX "recurring_series_user_updated_idx" ON "recurring_series" USING btree ("user_id","updated_at");--> statement-breakpoint
-- Колонка была без FK и нигде не заполнялась: случайные значения сломали бы ограничение
UPDATE "transactions" SET "recurring_series_id" = NULL WHERE "recurring_series_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_series_id_recurring_series_id_fk" FOREIGN KEY ("recurring_series_id") REFERENCES "public"."recurring_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tx_recurring_series_idx" ON "transactions" USING btree ("recurring_series_id") WHERE "transactions"."recurring_series_id" is not null;
--> statement-breakpoint
-- Справочник сервисов подписок: паттерны — в нормализованном виде (normalizeText в services/recurring).
-- Ссылки и шаги отмены не сверены (verified_at = null): сверка вручную перед показом пользователям.
INSERT INTO subscription_services (code, name, service_group, patterns, typical_period, trial_days, cancel_url, cancel_steps) VALUES
  ('kinopoisk', 'Кинопоиск', 'video', ARRAY['kinopoisk', 'кинопоиск']::text[], 'monthly', 30, 'https://hd.kinopoisk.ru', '1. Откройте Кинопоиск и войдите в аккаунт Яндекса.
2. Профиль → «Подписки» или страница управления Плюсом.
3. Отключите автопродление.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('okko', 'Okko', 'video', ARRAY['okko', 'окко']::text[], 'monthly', 14, 'https://okko.tv', '1. Откройте okko.tv и войдите в аккаунт.
2. Профиль → «Подписки».
3. Отключите автопродление нужной подписки.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('ivi', 'Иви', 'video', ARRAY['ivi', 'иви']::text[], 'monthly', 14, 'https://www.ivi.ru', '1. Откройте ivi.ru и войдите в аккаунт.
2. Профиль → «Подписки».
3. Отключите автопродление.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('wink', 'Wink', 'video', ARRAY['wink', 'винк']::text[], 'monthly', 14, 'https://wink.ru', '1. Откройте wink.ru и войдите (часто по номеру или договору Ростелекома).
2. Профиль → «Подписки».
3. Отключите автопродление нужной подписки.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('start', 'START', 'video', ARRAY['start ru', 'start online', 'старт онлайн']::text[], 'monthly', 7, 'https://start.ru', '1. Откройте start.ru и войдите в аккаунт.
2. Профиль → «Подписка».
3. Отмените подписку.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('premier', 'PREMIER', 'video', ARRAY['premier one', 'premier', 'премьер']::text[], 'monthly', 7, 'https://premier.one', '1. Откройте premier.one и войдите в аккаунт.
2. Профиль → «Подписки».
3. Отключите автопродление.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('kion', 'KION', 'video', ARRAY['kion', 'кион']::text[], 'monthly', 14, 'https://kion.ru', '1. Откройте kion.ru или приложение «Мой МТС».
2. Найдите раздел с подписками («Мой МТС» → «Услуги» → «Подписки»).
3. Отключите KION.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('more_tv', 'more.tv', 'video', ARRAY['more tv', 'moretv']::text[], 'monthly', 7, 'https://more.tv', '1. Откройте more.tv и войдите в аккаунт.
2. Профиль → «Подписка».
3. Отключите автопродление.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('amediateka', 'Амедиатека', 'video', ARRAY['amediateka', 'амедиатека']::text[], 'monthly', 7, 'https://www.amediateka.ru', '1. Откройте amediateka.ru и войдите в аккаунт.
2. Профиль → «Подписки».
3. Отключите автопродление.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('youtube_premium', 'YouTube Premium', 'video', ARRAY['youtube', 'google youtube']::text[], 'monthly', NULL, 'https://www.youtube.com/paid_memberships', '1. Откройте YouTube → аватар → «Платные подписки».
2. Выберите Premium и отмените подписку.
3. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('yandex_music', 'Яндекс Музыка', 'music', ARRAY['yandex music', 'яндекс музыка']::text[], 'monthly', 30, 'https://plus.yandex.ru', '1. Музыка входит в Яндекс Плюс — подписка управляется там.
2. Откройте plus.yandex.ru и войдите в аккаунт.
3. Отключите автопродление.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('vk_music', 'VK Музыка', 'music', ARRAY['vk music', 'vk muzyka', 'vk combo', 'boom', 'вк музыка']::text[], 'monthly', 30, 'https://vk.com', '1. Откройте VK → «Настройки» → «Платежи и подписки».
2. Выберите VK Музыку (или VK Combo).
3. Отмените подписку.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('zvuk', 'Звук', 'music', ARRAY['zvuk', 'sber zvuk', 'звук']::text[], 'monthly', 30, 'https://zvuk.com', '1. Откройте zvuk.com или приложение (вход часто через Сбер ID).
2. Профиль → «Подписка».
3. Отключите автопродление; если Звук входит в СберПрайм — отключайте СберПрайм.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('yandex_plus', 'Яндекс Плюс', 'bundle', ARRAY['yandex plus', 'plus yandex', 'яндекс плюс', 'yandex plyus']::text[], 'monthly', 30, 'https://plus.yandex.ru', '1. Откройте plus.yandex.ru и войдите в аккаунт Яндекса.
2. Перейдите в управление подпиской.
3. Отключите автопродление — доступ сохранится до конца оплаченного периода.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('sber_prime', 'СберПрайм', 'bundle', ARRAY['sberprime', 'sber prime', 'сберпрайм']::text[], 'monthly', 30, 'https://www.sberbank.ru', '1. Откройте приложение СберБанк Онлайн.
2. Найдите СберПрайм через поиск или в разделе подписок.
3. Отключите автопродление.'),
  ('mts_premium', 'МТС Premium', 'bundle', ARRAY['mts premium', 'мтс премиум']::text[], 'monthly', 30, 'https://mts.ru', '1. Откройте приложение «Мой МТС».
2. «Услуги» → «Подписки».
3. Отключите МТС Premium.'),
  ('x5_paket', 'Пакет X5', 'bundle', ARRAY['paket x5', 'пакет x5', 'пакет х5']::text[], 'monthly', NULL, NULL, '1. Откройте приложение «Пятёрочка» или «Перекрёсток».
2. Профиль → «Пакет».
3. Отключите автопродление.'),
  ('ozon_premium', 'Ozon Premium', 'marketplace', ARRAY['ozon premium', 'озон премиум']::text[], 'monthly', 30, 'https://www.ozon.ru', '1. Откройте приложение Ozon.
2. Профиль → Ozon Premium → управление подпиской.
3. Отключите автопродление.'),
  ('wb_club', 'WB Клуб', 'marketplace', ARRAY['wb club', 'вб клуб', 'wildberries club']::text[], 'monthly', NULL, 'https://www.wildberries.ru', '1. Откройте приложение Wildberries.
2. Профиль → «WB Клуб».
3. Отключите автопродление.'),
  ('tbank_pro', 'Т-Банк Pro', 'bank', ARRAY['tinkoff pro', 'tbank pro', 'т банк про', 'тинькофф про']::text[], 'monthly', 30, 'https://www.tbank.ru', '1. Откройте приложение Т-Банка.
2. Профиль → подписки → Pro.
3. Отключите подписку.'),
  ('alfa_smart', 'Альфа Смарт', 'bank', ARRAY['alfa smart', 'альфа смарт']::text[], 'monthly', NULL, 'https://alfabank.ru', '1. Откройте приложение Альфа-Банка.
2. Профиль → подписки → «Альфа Смарт».
3. Отключите подписку.'),
  ('litres', 'Литрес', 'books', ARRAY['litres', 'литрес']::text[], 'monthly', 14, 'https://www.litres.ru', '1. Откройте litres.ru и войдите в аккаунт.
2. Профиль → «Подписка».
3. Отключите автопродление.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('mybook', 'MyBook', 'books', ARRAY['mybook', 'май бук']::text[], 'monthly', 14, 'https://mybook.ru', '1. Откройте mybook.ru и войдите в аккаунт.
2. Профиль → «Подписка».
3. Отключите автопродление.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('mts_stroki', 'МТС Строки', 'books', ARRAY['mts stroki', 'stroki', 'строки']::text[], 'monthly', 14, 'https://mts.ru', '1. Откройте приложение «Мой МТС».
2. «Услуги» → «Подписки».
3. Отключите «Строки».
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('yandex_books', 'Яндекс Книги', 'books', ARRAY['bookmate', 'yandex books', 'яндекс книги']::text[], 'monthly', NULL, 'https://plus.yandex.ru', '1. Книги входят в Яндекс Плюс — подписка управляется там.
2. Откройте plus.yandex.ru → управление подпиской.
3. Отключите автопродление.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('yandex_360', 'Яндекс 360', 'cloud', ARRAY['yandex 360', 'яндекс 360']::text[], 'monthly', NULL, 'https://360.yandex.ru', '1. Откройте 360.yandex.ru и войдите в аккаунт.
2. Перейдите в управление тарифом.
3. Отключите автопродление.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('mail_cloud', 'Облако Mail', 'cloud', ARRAY['cloud mail', 'mail ru cloud', 'облако mail']::text[], 'monthly', NULL, 'https://cloud.mail.ru', '1. Откройте cloud.mail.ru и войдите в аккаунт.
2. «Тарифы» → текущий тариф.
3. Отключите автопродление.
4. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('google_one', 'Google One', 'cloud', ARRAY['google one', 'google storage']::text[], 'monthly', NULL, 'https://one.google.com', '1. Откройте one.google.com → «Настройки».
2. Отмените подписку.
3. Если подписка оформлена через App Store или Google Play — отменяйте её в настройках подписок телефона.'),
  ('kaspersky', 'Kaspersky', 'software', ARRAY['kaspersky', 'касперский']::text[], 'yearly', 30, 'https://my.kaspersky.com', '1. Откройте my.kaspersky.com и войдите в аккаунт.
2. Раздел подписок.
3. Отключите автопродление.'),
  ('drweb', 'Dr.Web', 'software', ARRAY['drweb', 'dr web', 'доктор веб']::text[], 'yearly', NULL, 'https://www.drweb.ru', '1. Найдите письмо о покупке или войдите в личный кабинет Dr.Web.
2. Раздел автопродления.
3. Отключите автопродление.'),
  ('telegram_premium', 'Telegram Premium', 'software', ARRAY['telegram', 'телеграм']::text[], 'monthly', NULL, 'https://telegram.org', '1. Если оплачивали в приложении на телефоне — отменяйте в App Store или Google Play.
2. Если через бота @PremiumBot — откройте бота и отмените подписку.'),
  ('chatgpt', 'ChatGPT Plus', 'ai', ARRAY['openai', 'chatgpt']::text[], 'monthly', NULL, 'https://chatgpt.com', '1. Откройте chatgpt.com → настройки аккаунта.
2. Раздел подписки → «Управлять».
3. Отмените план.'),
  ('mts', 'МТС', 'telecom', ARRAY['mts', 'мтс']::text[], 'monthly', NULL, 'https://mts.ru', '1. Связь — обязательный платёж: обычно не отменяют, а меняют тариф.
2. Проверьте платные подписки на номере: «Мой МТС» → «Услуги» → «Подписки».'),
  ('megafon', 'МегаФон', 'telecom', ARRAY['megafon', 'мегафон']::text[], 'monthly', NULL, 'https://megafon.ru', '1. Связь — обязательный платёж: обычно не отменяют, а меняют тариф.
2. Проверьте платные подписки на номере в приложении МегаФона.'),
  ('beeline', 'Билайн', 'telecom', ARRAY['beeline', 'билайн']::text[], 'monthly', NULL, 'https://beeline.ru', '1. Связь — обязательный платёж: обычно не отменяют, а меняют тариф.
2. Проверьте платные подписки на номере в приложении «Мой Билайн».'),
  ('t2', 'T2 (Tele2)', 'telecom', ARRAY['tele2', 't2', 'теле2']::text[], 'monthly', NULL, 'https://t2.ru', '1. Связь — обязательный платёж: обычно не отменяют, а меняют тариф.
2. Проверьте платные подписки на номере в приложении T2.'),
  ('rostelecom', 'Ростелеком', 'telecom', ARRAY['rostelecom', 'ростелеком']::text[], 'monthly', NULL, 'https://lk.rt.ru', '1. Интернет и ТВ — обязательный платёж; отключение — через личный кабинет или офис.
2. Платные дополнения (например, Wink) отключаются в личном кабинете.'),
  ('yota', 'Yota', 'telecom', ARRAY['yota', 'йота']::text[], 'monthly', NULL, 'https://www.yota.ru', '1. Связь — обязательный платёж: меняйте тариф в приложении Yota.'),
  ('dom_ru', 'Дом.ру', 'telecom', ARRAY['dom ru', 'дом ру']::text[], 'monthly', NULL, 'https://dom.ru', '1. Интернет и ТВ — обязательный платёж; управление — в личном кабинете Дом.ру.'),
  ('apple', 'Подписки App Store', 'store', ARRAY['apple com bill', 'apple com', 'itunes']::text[], 'monthly', NULL, 'https://apps.apple.com/account/subscriptions', '1. На iPhone: «Настройки» → ваше имя → «Подписки».
2. Выберите подписку и отмените её.
3. В выписке все подписки App Store выглядят одинаково — список конкретных сервисов есть только там.'),
  ('google_play', 'Подписки Google Play', 'store', ARRAY['google play', 'google']::text[], 'monthly', NULL, 'https://play.google.com/store/account/subscriptions', '1. Откройте Google Play → аватар → «Платежи и подписки» → «Подписки».
2. Выберите подписку и отмените её.'),
  ('boosty', 'Boosty', 'software', ARRAY['boosty', 'бусти']::text[], 'monthly', NULL, 'https://boosty.to', '1. Откройте boosty.to → «Подписки».
2. Выберите автора и отключите автопродление.')
ON CONFLICT (code) DO NOTHING;
