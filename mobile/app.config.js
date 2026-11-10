const { existsSync } = require('node:fs');

const { withGradleProperties } = require('expo/config-plugins');

/**
 * Estende o app.json com o que só existe no build do APK (workflow apk.yml): a chave do
 * Google Maps para Android, o google-services.json do Firebase (push via FCM) e a versão
 * tirada da tag. No Expo Go nada disso é usado e o app.json vale como está.
 */

/**
 * Release sem minificação (R8). O template do Expo SDK 58 liga o R8 no release, e ele remove a
 * classe gerada do banco interno do WorkManager (usado pelas notificações), que é carregada por
 * reflexão: o APK fechava ao abrir ("Failed to create an instance of WorkDatabase"). Regras de
 * keep por biblioteca seriam frágeis; o custo de desligar é alguns MB a mais no APK.
 */
function semMinificacao(config) {
  return withGradleProperties(config, (cfg) => {
    const definir = (chave, valor) => {
      cfg.modResults = cfg.modResults.filter(
        (item) => !(item.type === 'property' && item.key === chave),
      );
      cfg.modResults.push({ type: 'property', key: chave, value: valor });
    };
    definir('android.enableMinifyInReleaseBuilds', 'false');
    definir('android.enableShrinkResourcesInReleaseBuilds', 'false');
    return cfg;
  });
}
module.exports = ({ config }) => {
  const plugins = [...(config.plugins ?? [])];
  const chaveMaps = process.env.GOOGLE_MAPS_ANDROID_KEY;
  if (chaveMaps) plugins.push(['react-native-maps', { androidGoogleMapsApiKey: chaveMaps }]);

  const googleServices =
    process.env.GOOGLE_SERVICES_JSON ??
    (existsSync('./google-services.json') ? './google-services.json' : undefined);
  const versao = process.env.ECOPULSE_VERSAO;
  const codigo = Number(process.env.ECOPULSE_VERSION_CODE);

  return semMinificacao({
    ...config,
    version: versao || config.version,
    android: {
      ...config.android,
      ...(googleServices ? { googleServicesFile: googleServices } : {}),
      ...(Number.isInteger(codigo) && codigo > 0 ? { versionCode: codigo } : {}),
    },
    plugins,
  });
};
