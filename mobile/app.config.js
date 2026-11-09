const { existsSync } = require('node:fs');

/**
 * Estende o app.json com o que só existe no build do APK (workflow apk.yml): a chave do
 * Google Maps para Android, o google-services.json do Firebase (push via FCM) e a versão
 * tirada da tag. No Expo Go nada disso é usado e o app.json vale como está.
 */
module.exports = ({ config }) => {
  const plugins = [...(config.plugins ?? [])];
  const chaveMaps = process.env.GOOGLE_MAPS_ANDROID_KEY;
  if (chaveMaps) plugins.push(['react-native-maps', { androidGoogleMapsApiKey: chaveMaps }]);

  const googleServices =
    process.env.GOOGLE_SERVICES_JSON ??
    (existsSync('./google-services.json') ? './google-services.json' : undefined);
  const versao = process.env.ECOPULSE_VERSAO;
  const codigo = Number(process.env.ECOPULSE_VERSION_CODE);

  return {
    ...config,
    version: versao || config.version,
    android: {
      ...config.android,
      ...(googleServices ? { googleServicesFile: googleServices } : {}),
      ...(Number.isInteger(codigo) && codigo > 0 ? { versionCode: codigo } : {}),
    },
    plugins,
  };
};
