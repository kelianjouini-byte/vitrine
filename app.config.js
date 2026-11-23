// Réglages de l'appli. La base est dans app.json ; ce fichier ne change qu'une chose :
// pour les applis des stores (VITRINE_STORE_APP=1), l'appli est rangée à la racine (et pas dans « /app »).
module.exports = ({ config }) => {
  if (!process.env.VITRINE_STORE_APP) return config;
  const { baseUrl, ...experiments } = config.experiments ?? {};
  return { ...config, experiments };
};
