/**
 * RuStore Push (E2.2-T3) — нативные настройки для модуля modules/fintrack-push:
 * - репозиторий RuStore с SDK в корневом android/build.gradle (SDK нет в Maven Central);
 * - ID проекта из RuStore Консоли в манифесте: по нему SDK инициализируется сам при запуске.
 *   Без ID (сборка play, локальная сборка без переменной) SDK не запускается и RuStore Push недоступен;
 * - значок и цвет уведомлений — те же, что создаёт плагин expo-notifications (он стоит в списке плагинов раньше).
 */
const { AndroidConfig, withAndroidManifest, withProjectBuildGradle } = require("expo/config-plugins");

// с 01.10.2026 SDK раздаётся только отсюда: прежний artifactory-external.vkpartner.ru отвечает 404
const REPOSITORY = "https://nexus-external.rustore.ru/repository/maven-rustore-exposed";
const PROJECT_ID_KEY = "ru.rustore.sdk.pushclient.project_id";
const ICON_KEY = "ru.rustore.sdk.pushclient.default_notification_icon";
const COLOR_KEY = "ru.rustore.sdk.pushclient.default_notification_color";

/** Репозиторий RuStore — после Google и Maven Central: остальные зависимости ищутся сначала там. */
function addRepository(buildGradle) {
  if (buildGradle.includes(REPOSITORY)) return buildGradle;
  const repositories = /(allprojects\s*\{\s*repositories\s*\{[^}]*?mavenCentral\(\))/;
  if (!repositories.test(buildGradle)) {
    throw new Error("withRuStorePush: в android/build.gradle нет allprojects { repositories { … mavenCentral() … } }");
  }
  return buildGradle.replace(repositories, (block) => `${block}\n    maven { url '${REPOSITORY}' }`);
}

/** @param {import('expo/config').ExpoConfig} config @param {{ projectId?: string }} options */
module.exports = function withRuStorePush(config, { projectId } = {}) {
  config = withProjectBuildGradle(config, (mod) => {
    mod.modResults.contents = addRepository(mod.modResults.contents);
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    if (projectId) AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, PROJECT_ID_KEY, projectId);
    else AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(application, PROJECT_ID_KEY);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, ICON_KEY, "@drawable/notification_icon", "resource");
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, COLOR_KEY, "@color/notification_icon_color", "resource");
    return mod;
  });
};

module.exports.addRepository = addRepository;
