require('dotenv').config()

const eventModel = require('./Models');

const axios = require('axios')
const fs = require("fs");
const path = require('path');

const translations = require('./translations/translations.json')

async function readEntry(req, res) {
    try {
        let result = await eventModel.readEntry(req.params.system, req.params.id)
        res.send(result)
    } catch (err) {
        res.send("error: " + err)
    }
}

async function getRoomsAvailability(req, res) {
    try {
        //Hämta area
        let area = await eventModel.readArea(req.params.system, req.params.area_id)
        
        //Hämta rum för arean
        let rooms = await eventModel.readRooms(req.params.system, req.params.area_id)

        //Gå igenom alla rum och kontrollera status för aktuell timme
        let roomjson = [];
        for(i=0 ; i < rooms.length; i++) {
            let status;
            //Hämta aktuellt rums bokningar för angiven timme(via timestamp)
            let roombookings = await eventModel.readBookingsForHour(req.params.system, rooms[i].id, req.params.timestamp)
            let roombookingrow
            //om timmen i timestamp är utanför öppettider(<$area->morningstarts ELLER >$area->eveningends) för rummen så returnera status unavailable
            let timestamphour = new Date(req.params.timestamp * 1000).toLocaleTimeString("sv-SE", { hour: "2-digit"})
            if(timestamphour < area.morningstarts || timestamphour > area.eveningends ){
                roomjson.push({'room_number' : rooms[i].room_number, 'room_name' : rooms[i].room_name, 'disabled' : rooms[i].disabled, 'availability' : true, 'status' : 'unavailable'});
            } else {
                if (roombookings.length > 0) {
                    roombookings.forEach(row => {
                        roombookingrow = row;     
                    });
                    //4=preliminär, 0=kvitterad
                    if (roombookingrow.status == 0 ){
                        // om type = "C"(closed) så returnera status unavailable
                        if (roombookingrow.type == 'C' ){
                            status = "unavailable";
                        } else {
                            status = "confirmed";
                        } 
                    }
                    if (roombookingrow.status == 4 ){
                        //om inom 15 minuter före/efter starttiden
                        if (req.params.timestamp < roombookingrow.start_time +15*60) {
                            status = "tobeconfirmed";
                        } else {
                            status = "tentative";
                        }
                    }
                    roomjson.push({'room_number' : rooms[i].room_number, 'room_name' : rooms[i].room_name, 'disabled' : rooms[i].disabled, 'availability' : false, 'status' : status});
                } else {
                    roomjson.push({'room_number' : rooms[i].room_number, 'room_name' : rooms[i].room_name, 'disabled' : rooms[i].disabled, 'availability' : true, 'status' : 'free'});
                }
            }
        }

        res.send(roomjson)
    } catch (err) {
        res.send("error: " + err)
    }
}

/*
Funktion som kvitterar en preliminär bokning utifrån den token som satts på bokningen
preliminär: status = 4
kvitterad: status = 0
*/
async function confirmBooking(req, res) {
    let confirmation = true;

    const lang = req.query.lang || 'en';

    if(!req.params.confirmation_code)
    {
        confirmation = false;
        res.render('pages/confirmbooking', {confirmdata: {'message' : 'confirmcodemissing', 'confirmation' : confirmation, 'name': '', 'start_time' :'', 'end_time' : '', 'area_id' : '', 'view' : 'day' }})
    }

    try {
        let entry = await eventModel.readEntryFromConfirmationCode(req.params.system, req.params.confirmation_code)
        if (entry.length > 0) {
            entry.forEach(async entryrow => {
                let currenttimestamp = Math.floor(Date.now() /1000);
                let slotinseconds =  entryrow.start_time;
                //Kvittera bara om inom intervallet 15 min före/efter start_time
                if (currenttimestamp >= slotinseconds - 15 * 60 && currenttimestamp <= slotinseconds + 15 * 60 ) {
                    //Uppdatera bokning till confirmed(status = noll)
                    let updateEntry = await eventModel.updateEntryConfirmed(req.params.system, entryrow.confirmation_code)
                    if (updateEntry.affectedRows != 1) {
                        confirmation = false;
                        res.render('pages/confirmbooking', {
                            confirmdata: {
                                'message' : 'somethingwrong', 
                                'confirmation' : confirmation, 
                                'name': '', 
                                'start_time' :'', 
                                'end_time' : '', 
                                'area_id' : '', 
                                'view' : 'day',
                                'lang' : lang,
                                'translations': translations[lang]
                            }
                        }) 
                    } else {
                        //
                        let EntryWithRoomAndArea = await eventModel.readEntryWithRoomAndArea(req.params.system, entryrow.id)
                        let view = 'day'
                        EntryWithRoomAndArea.forEach(EntryWithRoomAndArea_row => {
                            if (EntryWithRoomAndArea_row.default_view == 0) {
                                view = "day";
                            } else {
                                view = "week";
                            }
                            let start_time_time = new Date(EntryWithRoomAndArea_row.start_time * 1000).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit"})
                            let start_time_date = new Date(EntryWithRoomAndArea_row.start_time * 1000).toLocaleDateString("sv-SE")
                            let end_time_time = new Date(EntryWithRoomAndArea_row.end_time * 1000).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit"})
                            let end_time_date = new Date(EntryWithRoomAndArea_row.end_time * 1000).toLocaleDateString("sv-SE")
                            res.render('pages/confirmbooking', {confirmdata: {
                                'message' : 'confirmnotfound', 
                                'confirmation' : confirmation, 
                                'name': EntryWithRoomAndArea_row.room_name, 
                                'start_time' : start_time_date + ' ' + start_time_time, 
                                'end_time' : end_time_date + ' ' + end_time_time,
                                'area_id' : EntryWithRoomAndArea_row.area_id, 
                                'view' : view,
                                'lang' : lang,
                                'translations': translations[lang]
                            }})
                        })
                    }
                } else {
                    confirmation = false;
                    res.render('pages/confirmbooking', {
                        confirmdata: {
                            'message' : 'notinconfirmperiod', 
                            'confirmation' : confirmation, 
                            'name': '', 
                            'start_time' :'', 
                            'end_time' : '', 
                            'area_id' : '', 
                            'view' : 'day',
                            'lang' : lang,
                            'translations': translations[lang]
                        }
                    })
                }
            });
        } else {
            //Hittar ingen bokning med angiven kod
            confirmation = false;
            res.render('pages/confirmbooking', {
                confirmdata: {
                    'message' : 'confirmnotfound', 
                    'confirmation' : confirmation, 
                    'name': '', 
                    'start_time' :'', 
                    'end_time' : '', 
                    'area_id' : '', 
                    'view' : 'day',
                    'lang' : lang,
                    'translations': translations[lang]
                }
            })
        }
    }
    catch (err) {
        confirmation = false;
        res.render('pages/confirmbooking', {
            confirmdata: {
                'message' : err.message, 
                'confirmation' : confirmation, 
                'name': '', 
                'start_time' :'', 
                'end_time' : '', 
                'area_id' : '', 
                'view' : 'day',
                'lang' : lang,
                'translations': translations[lang]
            }
        })
    }
}

async function getReminderBookings(req, res) {
    try {
        let bookings = await eventModel.readReminderBookings(req.params.system, req.params.fromtime, req.params.totime, req.params.status, req.params.type )
        res.send(bookings)
    } catch (err) {
        res.send("error: " + err)
    }
}

async function updateEntryConfirmationCode(req, res) {
    try {
        let result = await eventModel.updateEntryConfirmationCode(req.params.system, req.params.id, req.params.confirmationcode)
        res.send(result)
    } catch (err) {
        res.send("error: " + err)
    }
}

async function updateEntrySetReminded(req, res) {
    try {
        let result = await eventModel.updateEntrySetReminded(req.params.system, req.params.id)
        res.send(result)
    } catch (err) {
        res.send("error: " + err)
    }
}

function substrInBetween(whole_str, str1, str2) {
    if (whole_str.indexOf(str1) === -1 || whole_str.indexOf(str2) === -1) {
        return undefined;
    }
    return whole_str.substring(
        whole_str.indexOf(str1) + str1.length,
        whole_str.indexOf(str2)
    );
}

async function getOpeningHours(req, res) {
    console.log("getOpeningHours")
    const lang = req.query.lang || 'en';
    closedtext = translations[lang]["closedtext"]
    let dayarray = {};
    dayarray["monday"] = closedtext;
    dayarray["tuesday"] = closedtext;
    dayarray["wednesday"] = closedtext;
    dayarray["thursday"] = closedtext;
    dayarray["friday"] = closedtext;
    dayarray["saturday"] = closedtext;
    dayarray["sunday"] = closedtext;
    try {
        //hämta resolution för area(id = 1)
        let resolution = eventModel.readResolution(system, 1);
        let roomstartend = await eventModel.readRoomStartEndWeek(req.params.system, req.params.librarycode)
        if (roomstartend.length > 0) {
            for(i=0;i<roomstartend.length;i++) {
                roomstartend[i]["monday"] !== null ? dayarray["monday"] = roomstartend[i]["monday"] : 0
                roomstartend[i]["tuesday"] !== null ? dayarray["tuesday"] = roomstartend[i]["tuesday"] : 0
                roomstartend[i]["wednesday"] !== null ? dayarray["wednesday"] = roomstartend[i]["wednesday"] : 0
                roomstartend[i]["thursday"] !== null ? dayarray["thursday"] = roomstartend[i]["thursday"] : 0
                roomstartend[i]["friday"] !== null ? dayarray["friday"] = roomstartend[i]["friday"] : 0
                roomstartend[i]["saturday"] !== null ? dayarray["saturday"] = roomstartend[i]["saturday"] : 0
                roomstartend[i]["sunday"] !== null ? dayarray["sunday"] = roomstartend[i]["sunday"] : 0
            };
        } else {
            // Settings för rummets start och end saknas!
        }

        //Kontrollera om det finns stängda dagar/timmar för veckan
        //De öppna timmarna bör vara i ett block, dvs stäng början och slutet på en dag(eller stäng en hel dag) 
        //Inte att det är öppet exempelvis 10-12 och 14-18 på en dag
        //Finns det bokningar på dagen så hämta det lediga blocket
        //Hitta första lediga tid och sista lediga tid
        //Ta bort möjligheterna till seriebokningar(mrbs config)
        const givenDate = new Date(req.params.datetoget);
        let week_start = getFirstDayOfWeek(givenDate)
        let week_end = getLastDayOfWeek(givenDate);
        let roomcloseddays = await eventModel.readRoomClosedDays(req.params.system, req.params.librarycode, week_start, week_end)
        console.log(roomcloseddays)
        if (roomcloseddays.length > 0) {
            for(i=0;i<roomcloseddays.length;i++) {
                let non_default_openinghours = getNonDefaultOpeninghours(roomcloseddays[i].datetoget, req.params.librarycode, resolution )
                let d = new Date(roomcloseddays[i].datetoget)
                let dayname = d.toLocaleDateString('en-GB', {  weekday: 'long'}).toLowerCase();
                if(!non_default_openinghours) {
                    dayarray[dayname] = closedtext;
                } else {
                    if(non_default_openinghours[0] == "") {
                        dayarray[$dayname] = closedtext;
                    } else {
                        dayarray[$dayname] = non_default_openinghours[0] + "–" + non_default_openinghours[1];
                    }
                }
            }
        }
        console.log(dayarray)
        res.send('OK')
    } catch (err) {
        res.send("error: " + err)
    }
}

async function getNonDefaultOpeninghours(datetocheck, room_id, resolution) {
    let d = new Date(datetocheck)

    let dayname = d.toLocaleDateString('en-GB', {  weekday: 'long'}).toLowerCase();
    let RoomStartEndDay = await eventModel.readRoomStartEndDay(system, dayname, room_id);
    let n_time_slots
    let morning_slot_seconds
    if (RoomStartEndDay.length > 0) {
        for(i=0;i<RoomStartEndDay.length;i++) {
            n_time_slots = get_n_time_slots(RoomStartEndDay[i]["morningstarts"], RoomStartEndDay[i]["morningstarts_minutes"], RoomStartEndDay[i]["eveningends"], RoomStartEndDay[i]["eveningends_minutes"], resolution);
            morning_slot_seconds = ((RoomStartEndDay[i]["morningstarts"] * 60) + RoomStartEndDay[i]["morningstarts_minutes"]) * 60;
        }
    }
    
    let evening_slot_seconds = morning_slot_seconds + ((n_time_slots - 1) * resolution); 
    let openinghour = "";
    let closehour = "";
    let openinghourisset = FALSE;
    for (s = morning_slot_seconds;s <= evening_slot_seconds;s += resolution) {
        let slot_free = await checkifslotisfree(datetocheck, room_id ,s);
        // om inga rader returneras så är sloten ledig
        if (slot_free.length = 0) {
            //om fri = spara som öppningstid för dagen
            if (openinghourisset == FALSE) {
                openinghourisset = TRUE;
                let ss = new Date(s * 1000)
                openinghour = ss.toLocaleTimeString("sv-SE", { hour: "numeric", minute: "2-digit"}) // ex: 8:30
            } else {
                //fortsätt och hitta den sista fria vars sluttid då blir stängningstid för dagen
                let ss = new Date((s + resolution) * 1000)
                closehour = ss.toLocaleTimeString("sv-SE", { hour: "numeric", minute: "2-digit"}) // ex: 8:30
            }
        }
    }

    let hours = [openinghour, closehour] ;
    return hours;

}

function truncate(str, max, suffix) {
    return str.length < max ? str : `${str.substr(0, str.substr(0, max - suffix.length).lastIndexOf(' '))}${suffix}`;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getFirstDayOfWeek(date) {
    const day = date.getDay();
    const diff = (day + 6) % 7;
    date.setDate(date.getDate() - diff);
    return formatDate(date);
}

function getLastDayOfWeek(date) {
    const firstDayOfWeek = new Date(getFirstDayOfWeek(date));
    const lastDayOfWeek = new Date(firstDayOfWeek);
    lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
    return formatDate(lastDayOfWeek);
}

function get_n_time_slots(morningstarts, morningstarts_minutes, eveningends, eveningends_minutes, resolution) { 
    let seconds_per_day = 24*60*60
    let start_first = ((morningstarts * 60) + morningstarts_minutes) * 60;
    let end_last = (((eveningends * 60) + eveningends_minutes) * 60) + resolution;
    end_last = end_last % seconds_per_day;
    let n_slots = (end_last - start_first)/resolution;
  
    return n_slots;
}

module.exports = {
    readEntry,
    getRoomsAvailability,
    confirmBooking,
    getReminderBookings,
    updateEntryConfirmationCode,
    updateEntrySetReminded,
    substrInBetween,
    getOpeningHours,
    truncate
};
