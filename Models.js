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

//Hämta area via ID och system 
const readArea = (system, id) => {
    return new Promise(function (resolve, reject) {
        const connection = database.createConnection(system);
        const query = `SELECT * FROM mrbs_area
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

//Hämta rum för area via area_ID och system 
const readRooms = (system, area_id) => {
    return new Promise(function (resolve, reject) {
        const connection = database.createConnection(system);
        const query = `SELECT * FROM mrbs_room
                     WHERE area_id = ?`;
        params = [area_id]
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

//Hämta bokningsstatus för ett rum via room_ID, timestamo och system 
const readBookingsForHour = (system, room_id, timestamp) => {
    return new Promise(function (resolve, reject) {
        const connection = database.createConnection(system);
        const query = `SELECT * FROM mrbs_entry
                        INNER JOIN mrbs_room 
                            ON mrbs_entry.room_id = mrbs_room.id
                        INNER JOIN mrbs_area
                            ON mrbs_room.area_id = mrbs_area.id
                        WHERE mrbs_room.id = ?
                        AND mrbs_entry.start_time <= ?
                        AND mrbs_entry.end_time > ?`;
        params = [room_id, timestamp, timestamp]

        connection.query(query, params, (err, results, fields) => {
            if (err) {
              console.error('Error executing query:', err);
              reject(err.message)
            }
            const successMessage = "Success"
            connection.end();
            resolve(results);
          });
    })
};

//Hämta bokning via ID och system 
const readEntryFromConfirmationCode = (system, confirmation_code) => {
    return new Promise(function (resolve, reject) {
        const connection = database.createConnection(system);
        const query = `SELECT * FROM mrbs_entry
                     WHERE confirmation_code = ?`;
        params = [confirmation_code]
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

//Hämta bokning med area och rum via entry_id
const readEntryWithRoomAndArea = (system, id) => {
    return new Promise(function (resolve, reject) {
        const connection = database.createConnection(system);
        const query = `SELECT mrbs_entry.*, mrbs_room.room_name, mrbs_room.area_id, mrbs_area.default_view
                        FROM mrbs_entry
                        INNER JOIN mrbs_room 
                            ON mrbs_entry.room_id = mrbs_room.id
                        INNER JOIN mrbs_area
                            ON mrbs_room.area_id = mrbs_area.id
                        WHERE mrbs_entry.id = ?`;
        params = [id]

        connection.query(query, params, (err, results, fields) => {
            if (err) {
              console.error('Error executing query:', err);
              reject(err.message)
            }
            const successMessage = "Success"
            connection.end();
            resolve(results);
          });
    })
};

module.exports = {
    readEntry,
    readArea,
    readRooms,
    readBookingsForHour,
    readEntryFromConfirmationCode,
    readEntryWithRoomAndArea
};