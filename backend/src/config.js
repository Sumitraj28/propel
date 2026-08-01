require('dotenv').config();

module.exports = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'kspdb_admin',
    password: process.env.POSTGRES_PASSWORD || 'kspdb_secret_pass',
    database: process.env.POSTGRES_DB || 'kspdb',
    connectionString: process.env.DATABASE_URL
  },
  geminiApiKey: process.env.GEMINI_API_KEY || ''
};
