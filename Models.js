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

//Skapa bokning via ID och system 
const createEntry = (system, room_id, create_by, name, start_time, end_time) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `INSERT INTO mrbs_entry (room_id, create_by, name, start_time, end_time, entry_type, type, status)
                      VALUES (?, ?, ?, ?, ?, 0, 'I', 0)`;
      params = [room_id, create_by, name, start_time, end_time]
      connection.query(query, params, (err, results, fields) => {
        if (err) {
          console.error("Error executing query:", err);
          return reject(err.message);
        }
        if (results.affectedRows > 0) {
          const insertId = results.insertId;
          const selectQuery = `SELECT * FROM mrbs_entry WHERE id = ?`;
          connection.query(selectQuery, [insertId], (err, rows) => {
            connection.end();
            if (err) {
              console.error("Error fetching new entry:", err);
              return reject(err.message);
            }
            if (rows.length > 0) {
              resolve({ success: true, entry: rows[0] });
            } else {
              resolve({ success: false });
            }
          });
        } else {
          connection.end();
          resolve({ success: false });
        }
      });
  })
};

//Uppdatera entry med ny sluttid
const updateEntryEndTime = (system, entry_id, end_time) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const selectCurrentEndTimeQuery = `SELECT end_time FROM mrbs_entry WHERE id = ?`;

    connection.query(selectCurrentEndTimeQuery, [entry_id], (err, rows) => {
      if (err) {
        console.error("Error fetching current end_time:", err);
        connection.end();
        return reject(err.message);
      }

      if (rows.length === 0) {
        connection.end();
        return resolve({ success: false, message: "Entry not found" });
      }

      const currentEndTime = rows[0].end_time;

      // Kontrollera om den nya sluttiden är senare än den existerande
      if (end_time >= currentEndTime) {
        connection.end();
        return resolve({ success: false, message: "New end_time is later than the current end_time. No update needed." });
      }

      const query = `UPDATE mrbs_entry
                      SET end_time = ?
                      WHERE id = ?`;
      params = [end_time, entry_id]
      connection.query(query, params, (err, results, fields) => {
        if (err) {
          console.error('Error executing query:', err);
          reject(err.message)
        }
        if (results.affectedRows > 0) {
          const selectQuery = `SELECT * FROM mrbs_entry WHERE id = ?`;
          connection.query(selectQuery, [entry_id], (err, rows) => {
            connection.end();
            if (err) {
              console.error("Error fetching new entry:", err);
              return reject(err.message);
            }
            if (rows.length > 0) {
              resolve({ success: true, entry: rows[0] });
            } else {
              resolve({ success: false });
            }
          });
        } else {
          connection.end();
          resolve({ success: false });
        }
      });
    })
  })
};
//Hämta bokning via user, room och system 
const readEntryByUserAndRoom = (system, user_id, room_id) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `SELECT * FROM mrbs_entry
                   WHERE create_by = ? AND room_id = ?`;
      params = [user_id, room_id]
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

//Hämta antal minuter för användarens bokningar för angivet intervall. Via system, create_by
const readBookingMinutesPerInterval = (system, create_by, interval_start_time, interval_end_time) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query =  `SELECT SUM((end_time-start_time)/60) as summa				 
                        FROM mrbs_entry E
                        JOIN mrbs_room R ON E.room_id = R.id
                        WHERE E.start_time<?
                          AND E.end_time>?
                          AND E.create_by=?
                          AND R.disabled=0 
                          AND type != 'C'`;
      params = [interval_end_time, interval_start_time, create_by]
      connection.query(query, params, (err, results, fields) => {
          if (err) {
            console.error('Error executing query:', err);
            reject(err.message)
          }
          connection.end();
          if (results && results.length > 0) {
            // If rows are returned, resolve with the results
            resolve(results);
          } else {
            // If no rows are returned, resolve with a default value where summa is 0
            resolve([{ summa: 0 }]);
          }
        });
  })
};

//Kontrollera om bokning finns inom intervall via room, system 
const readEntryByRoomAndTimestamps = (system, room_id, start_time, end_time) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `SELECT * FROM mrbs_entry
                   WHERE start_time <= ? and end_time >= ? AND room_id = ?`;
      params = [start_time, end_time, room_id]
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

//Hämta bokning via room och system 
const readEntryByRoomAndCurrentTime = (system, room_id) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      let currenttimestamp = Math.floor(Date.now() / 1000);
      const query = `SELECT * FROM mrbs_entry
                   WHERE FROM_UNIXTIME(start_time) <= now() and FROM_UNIXTIME(end_time) >= now() AND room_id = ?`;
      params = [room_id]
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
                     WHERE area_id = ?
                     ORDER BY sort_key`;
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

//Hämta ett rum för area via room_ID, area_ID och system 
const readRoom = (system, area_id, room_id) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `SELECT * FROM mrbs_room
                   WHERE area_id = ?
                   AND id = ?
                   ORDER BY sort_key`;
      params = [area_id, room_id]
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

//Hämta ett rum för area via room_ID, area_ID och system 
const readRoomByNumber = (system, area_id, room_number) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `SELECT * FROM mrbs_room
                   WHERE area_id = ?
                   AND room_number = ?
                   ORDER BY sort_key`;
      params = [area_id, room_number]
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

//Hämta bokningsstatus för ett rum via room_ID, timestamp och system 
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

const readRoomBookingsForToday = (system, area_id, room_number) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `SELECT R.room_name,
                    R.id AS room_id,
                    CONVERT_TZ(FROM_UNIXTIME(start_time), 'UTC', 'Europe/Stockholm') as start_time,
                    CONVERT_TZ(FROM_UNIXTIME(end_time), 'UTC', 'Europe/Stockholm') as end_time,
                    name, repeat_id,
                    E.id AS entry_id,
                    type,E.description AS entry_description,
                    status,
                    E.create_by AS entry_create_by
                    FROM mrbs_entry E, mrbs_room R
                    WHERE E.room_id = R.id
                    AND R.area_id = ?
                    AND R.room_number = ?
                    AND R.disabled = 0
                    AND start_time <= UNIX_TIMESTAMP(CONCAT(CURDATE(), ' 23:00:00')) AND end_time > UNIX_TIMESTAMP(CONCAT(CURDATE(), ' 05:00:00'))
                    ORDER BY start_time`;
      params = [area_id,room_number]

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

//Uppdatera entry som reminded via ID och system 
const updateEntrySetReminded = (system, id) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `UPDATE mrbs_entry
                      SET reminded = 1
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

//Hämta öppettider för ett rums veckodagar via id(librarycode) och system 
const readRoomStartEndWeek = (system, librarycode) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `SELECT 
                        concat(DATE_FORMAT(concat(CURDATE() , ' ', morningstarts_monday,'.',morningstarts_minutes_monday),'%k.%i'),'–',
                        DATE_FORMAT(date_add(concat(CURDATE() , ' ', eveningends_monday, '.', eveningends_minutes_monday),interval 30 minute),'%k.%i')) 
                        as monday,
                        concat(DATE_FORMAT(concat(CURDATE() , ' ', morningstarts_tuesday,'.',morningstarts_minutes_tuesday),'%k.%i'),'–', 
                        DATE_FORMAT(date_add(concat(CURDATE() , ' ', eveningends_tuesday, '.', eveningends_minutes_tuesday),interval 30 minute),'%k.%i')) 
                        as tuesday,
                        concat(DATE_FORMAT(concat(CURDATE() , ' ', morningstarts_wednesday,'.',morningstarts_minutes_wednesday),'%k.%i'),'–', 
                        DATE_FORMAT(date_add(concat(CURDATE() , ' ', eveningends_wednesday, '.', eveningends_minutes_wednesday),interval 30 minute),'%k.%i')) 
                        as wednesday,
                        concat(DATE_FORMAT(concat(CURDATE() , ' ', morningstarts_thursday,'.',morningstarts_minutes_thursday),'%k.%i'),'–', 
                        DATE_FORMAT(date_add(concat(CURDATE() , ' ', eveningends_thursday, '.', eveningends_minutes_thursday),interval 30 minute),'%k.%i')) 
                        as thursday,
                        concat(DATE_FORMAT(concat(CURDATE() , ' ', morningstarts_friday,'.',morningstarts_minutes_friday),'%k.%i'),'–', 
                        DATE_FORMAT(date_add(concat(CURDATE() , ' ', eveningends_friday, '.', eveningends_minutes_friday),interval 30 minute),'%k.%i')) 
                        as friday,
                        concat(DATE_FORMAT(concat(CURDATE() , ' ', morningstarts_saturday,'.',morningstarts_minutes_saturday),'%k.%i'),'–', 
                        DATE_FORMAT(date_add(concat(CURDATE() , ' ', eveningends_saturday, '.', eveningends_minutes_saturday),interval 30 minute),'%k.%i')) 
                        as saturday,
                        concat(DATE_FORMAT(concat(CURDATE() , ' ', morningstarts_sunday,'.',morningstarts_minutes_sunday),'%k.%i'),'–', 
                        DATE_FORMAT(date_add(concat(CURDATE() , ' ', eveningends_sunday, '.', eveningends_minutes_sunday),interval 30 minute),'%k.%i')) 
                        as sunday
                    FROM mrbs_room
                    WHERE id = ?`;
      params = [librarycode]

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

//Hämta öppettider för ett rums veckodag via id(librarycode) och system 
const readRoomStartEndDay = (system, dayname, librarycode) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `SELECT 
                      morningstarts_${dayname} as morningstarts,
                      morningstarts_minutes_${dayname} as morningstarts_minutes,
                      eveningends_${dayname} as eveningends,
                      eveningends_minutes_${dayname} eveningends_minutes
                    FROM mrbs_room
                    WHERE id = ?`;
      params = [librarycode]

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

//Hämta stängda dagar för vecka
const readRoomClosedDays = (system, librarycode, week_start, week_end) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `SELECT DATE_FORMAT(FROM_UNIXTIME(mrbs_entry.start_time),'%Y-%m-%d') as datetoget
                      FROM mrbs_entry 
                      WHERE DATE_FORMAT(FROM_UNIXTIME(mrbs_entry.start_time),'%Y-%m-%d') >= ?
                      AND DATE_FORMAT(FROM_UNIXTIME(mrbs_entry.start_time),'%Y-%m-%d') <= ?
                      AND room_id = ?
                      GROUP BY datetoget`;
      params = [week_start, week_end, librarycode]

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

//Hämta resolution för area
const readResolution = (system, librarycode) => {
  return new Promise(function (resolve, reject) {
      const connection = database.createConnection(system);
      const query = `SELECT resolution
                    FROM mrbs_area 
                    WHERE id = ?`;
      params = [librarycode]

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

//Kolla om slot är ledig
const checkifslotisfree = (system, datetocheck, librarycode, slotinseconds) => {
  return new Promise(function (resolve, reject) {

      // slotinseconds = tid(8:30) omgjord till sekunder(30600)
      // Lägg till datum till angivna slotinseconds (2023-07-12 08:30)
      const dateTime = new Date(0);
      dateTime.setUTCSeconds(slotinseconds);
      const timeString = dateTime.toLocaleTimeString('sv-SE', {
        hour12: false,
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC'
      });

      const dateTimeString = datetocheck + ' ' + timeString;
      const dt = new Date(dateTimeString);
      const unixTimestamp = dt.getTime()/1000;

      const connection = database.createConnection(system);
      const query = `SELECT * FROM mrbs_entry
                      WHERE room_id = ?
                      AND start_time <= ${unixTimestamp}
                      AND end_time > ${unixTimestamp}`;
      params = [librarycode]

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

//Kolla om aktuell dag är stängd via stängda perioder för arean
const readClosedPeriod = async (system, area_id, date_to_check) => {
  try {
    const connection = database.createConnection(system);
    const query = `
      SELECT * 
      FROM mrbs_kth_closed_periods
      WHERE 
      from_date <= ? AND to_date >= ? 
      AND area_id = ?`;

    const params = [date_to_check, date_to_check, area_id];

    return new Promise((resolve, reject) => {
      connection.query(query, params, (err, results) => {
        connection.end();
        if (err) {
          console.error('Database Error:', err);
          return reject(err.message);
        }
        if (results.length > 0) {
          //Dagen är stängd
          return resolve(true);
        }
  
        resolve(false);
      });
    });
  } catch (error) {
    console.error('Parsing Error:', error);
    throw error;
  }
};

module.exports = {
    readEntry,
    createEntry,
    updateEntryEndTime,
    readEntryByUserAndRoom,
    readBookingMinutesPerInterval,
    readEntryByRoomAndCurrentTime,
    readArea,
    readRooms,
    readRoom,
    readRoomByNumber,
    readBookingsForHour,
    readRoomBookingsForToday,
    readEntryFromConfirmationCode,
    readEntryWithRoomAndArea,
    updateEntryConfirmed,
    readReminderBookings,
    updateEntryConfirmationCode,
    updateEntrySetReminded,
    readRoomStartEndWeek,
    readRoomStartEndDay,
    readRoomClosedDays,
    readResolution,
    readClosedPeriod,
    checkifslotisfree
};