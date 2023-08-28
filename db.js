require('dotenv').config()
const mysql = require('mysql');

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
};


function createConnection(system) {
  const connectionConfig = {
    ...dbConfig,
    //host: `${system}-db`,
    host: 'apps-old.lib.kth.se'
  };
  return mysql.createConnection(connectionConfig);
}

module.exports = {
  createConnection
};
