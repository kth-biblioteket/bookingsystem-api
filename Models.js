const database = require('./db');

//Hämta bokning via ID och system 
const readEntry = (system, id) => {
    return new Promise(function (resolve, reject) {
        const connection = database.createConnection(system);
        const query = `SELECT * FROM mrbs_entry
                     WHERE id = ?`;
        params = [id]
        connection.query(query, params, (err, results, fields) => {
            if (err) {
              console.error('Error executing query:', err);
              reject(err.message)
            }
            const successMessage = "Success"
            resolve(results);
          });
    })
};

module.exports = {
    readEntry
};