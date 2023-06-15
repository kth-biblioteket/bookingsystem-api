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
            connection.end();
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
            connection.end();
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
            connection.end();
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
            connection.end();
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

//Uppdatera entry till att vara confirmed via confirmationcode och system 
const updateEntryConfirmed = (system, confirmation_code) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `UPDATE mrbs_entry
                      SET status = 0, confirmation_code = null
                      WHERE confirmation_code = ?`;
      params = [confirmation_code]
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

//Hämta bokningsstatus för ett rum via room_ID, timestamo och system 
const readReminderBookings = (system, fromtime, totime, status, type) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `SELECT start_time, end_time, E.name, repeat_id,
                        E.id AS entry_id, E.type,
                        E.description AS entry_description, E.status,
                        E.create_by AS entry_create_by,
                        E.lang,
                        room_number,
                        room_name,
                        room_name_english,
                        area_map,
                        area_map_image,
                        mailtext,
                        mailtext_en
                      FROM mrbs_entry E
                      INNER JOIN mrbs_room 
                        ON mrbs_room.id = E.room_id
                      INNER JOIN mrbs_area 
                        ON mrbs_area.id = mrbs_room.area_id
                      WHERE E.status IN (?)
                      AND E.type = ?
                      AND mrbs_area.reminder_email_enabled = true
                      AND start_time >= ?
                      AND start_time <= ?
                      AND (isnull(E.reminded) OR E.reminded = 0)`;
      params = [status, type, fromtime, totime]

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

//Uppdatera entry med confirmationcode via ID och system 
const updateEntryConfirmationCode = (system, id, confirmation_code) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `UPDATE mrbs_entry
                      SET confirmation_code = ?
                      WHERE id = ?`;
      params = [confirmation_code, id]
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
    readEntryWithRoomAndArea,
    updateEntryConfirmed,
    readReminderBookings,
    updateEntryConfirmationCode
};