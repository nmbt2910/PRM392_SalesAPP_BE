const sql = require('mssql');

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: parseInt(process.env.DB_PORT, 10),
  options: {
    encrypt: true, // For Azure SQL or if you have SSL configured
    trustServerCertificate: true, // Change to true for local dev / self-signed certs
  },
};

const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then(pool => {
    console.log('Connected to SQL Server');
    return pool;
  })
  .catch(err => console.log('Database Connection Failed! Bad Config: ', err));

module.exports = {
  sql,
  poolPromise,
  connectDB: async () => {
    try {
      await poolPromise;
    } catch (err) {
      console.error(err);
      process.exit(1); // Exit process with failure
    }
  },
};