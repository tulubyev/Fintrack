/**
 * RuStore Push (E2.2-T3) — нативные настройки для модуля modules/fintrack-push:
 * - репозиторий RuStore с SDK в корневом android/build.gradle (SDK нет в Maven Central);
 * - ID проекта из RuStore Консоли в манифесте: по нему SDK инициализируется сам при запуске.
 *   Без ID (сборка play, локальная сборка без переменной) SDK не запускается и RuStore Push недоступен.
 */
const { AndroidConfig, withAndroidManifest, withProjectBuildGradle } = require("expo/config-plugins");

const REPOSITORY = "https://artifactory-external.vkpartner.ru/artifactory/maven";
const PROJECT_ID_KEY = "ru.rustore.sdk.pushclient.project_id";

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
    return mod;
  });
};

module.exports.addRepository = addRepository;
