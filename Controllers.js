require('dotenv').config()

const Model = require('./Models');

const axios = require('axios')
const fs = require("fs");
const path = require('path');

const translations = require('./translations/translations.json');
const cookieParser = require('cookie-parser');
const { get } = require('http');

async function readEntry(req, res) {
    try {
        let result = await Model.readEntry(req.params.system, req.params.id)
        res.send(result)
    } catch (err) {
        res.send("error: " + err)
    }
}

async function getRoomsAvailability(req, res) {
    try {
        //Hämta area
        let area = await Model.readArea(req.params.system, req.params.area_id)

        //Hämta rum för arean
        let rooms = await Model.readRooms(req.params.system, req.params.area_id)

        //Gå igenom alla rum och kontrollera status för aktuell timme
        let roomjson = [];
        for (i = 0; i < rooms.length; i++) {
            let status;
            //Hämta aktuellt rums bokningar för angiven timme(via timestamp)
            let roombookings = await Model.readBookingsForHour(req.params.system, rooms[i].id, req.params.timestamp)
            let roombookingrow
            //om timmen i timestamp är utanför öppettider(<$area->morningstarts ELLER >$area->eveningends) för rummen så returnera status unavailable
            let timestamphour = new Date(req.params.timestamp * 1000).toLocaleTimeString("sv-SE", { hour: "2-digit" })
            if (timestamphour < area[0].morningstarts || timestamphour > area[0].eveningends) {
                roomjson.push({ 'room_number': rooms[i].room_number, 'room_name': rooms[i].room_name, 'disabled': rooms[i].disabled, 'availability': true, 'status': 'unavailable' });
            } else {
                if (roombookings.length > 0) {
                    roombookings.forEach(row => {
                        roombookingrow = row;
                    });
                    //4=preliminär, 0=kvitterad
                    if (roombookingrow.status == 0) {
                        // om type = "C"(closed) så returnera status unavailable
                        if (roombookingrow.type == 'C') {
                            status = "unavailable";
                        } else {
                            status = "confirmed";
                        }
                    }
                    if (roombookingrow.status == 4) {
                        //om inom 15 minuter före/efter starttiden
                        if (req.params.timestamp < roombookingrow.start_time + 15 * 60) {
                            status = "tobeconfirmed";
                        } else {
                            status = "tentative";
                        }
                    }
                    roomjson.push({ 'room_number': rooms[i].room_number, 'room_name': rooms[i].room_name, 'disabled': rooms[i].disabled, 'availability': false, 'status': status });
                } else {
                    roomjson.push({ 'room_number': rooms[i].room_number, 'room_name': rooms[i].room_name, 'disabled': rooms[i].disabled, 'availability': true, 'status': 'free' });
                }
            }
        }

        res.send(roomjson)
    } catch (err) {
        res.send("error: " + err)
    }
}

async function getRoomBookingsForToday(req, res) {
    try {
        const roomjson = await Model.readRoomBookingsForToday(req.params.system, req.params.area_id, req.params.room_number)

        const room = await Model.readRoomByNumber(req.params.system, req.params.area_id, req.params.room_number)

        const roominfo = room[0]

        const today = new Date();
        const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });

        const todayDay = today.getDate();
        const todayMonth = today.getMonth() + 1; 
    
        const morningstarts = roominfo['morningstarts_' + dayName.toLowerCase()]

        const eveningends = roominfo['eveningends_' + dayName.toLowerCase()]

        const schedule = {};

        // Initialize the schedule with empty slots
        for (let hour = morningstarts; hour <= eveningends; hour++) {
            schedule[hour] = [];
        }
        // Fill in booked slots
        roomjson.forEach(entry => {
            const startTime = new Date(entry.start_time);
            const endTime = new Date(entry.end_time);

            const startHour = startTime.getHours();
            const endHour = endTime.getHours();

            let userAlreadyAdded = false;
            const rowspan = endHour - startHour;

            for (let hour = startHour; hour < endHour; hour++) {
                if (!userAlreadyAdded) {
                    // Add the user's information only once for the entire booking duration
                    schedule[hour].push({ name: entry.name, start_time: entry.start_time, end_time: entry.end_time, rowspan, status: entry.status });
                    userAlreadyAdded = true;
                } else {
                    // If user information is already added, mark the remaining hours as "Booked"
                    schedule[hour].push({ name: 'Booked', rowspan: 0 });
                }
            }
        });

        res.render('pages/roombookingsfortoday', { roominfo, morningstarts, eveningends, schedule, dayName, todayDay, todayMonth });
    } catch (err) {
        res.send("error: " + err)
    }
}

/**
 * Valdiera en bokning utifrån user_id, rum_id, system id och aktuell tid
 * @param {*} req 
 * @param {*} res 
 */
async function validateBooking(req, res) {

    try {
        let entry = await Model.readEntryByRoomAndCurrentTime(req.params.system, req.params.room_id)
        if (entry.length > 0 && entry[0].create_by == req.params.user_id) {
            res.status(200).json({ valid: true, reservation: entry[0] }); 
        } else {
            //Hittar ingen bokning
            res.status(200).json({ valid: false });
        }
    }
    catch (err) {
        res.status(200).json({ valid: false });
        console.log(err);
    }
}

/**
 * Kontrollera om det finns en bokning utifrån rum_id, system id och aktuell tid
 * @param {*} req 
 * @param {*} res 
 */
async function checkBooking(req, res) {

    try {
        let entry = await Model.readEntryByRoomAndCurrentTime(req.params.system, req.params.room_id)
        if (entry.length > 0 ) {
            res.status(200).json({ valid: true, reservation: entry[0] }); 
        } else {
            //Hittar ingen bokning
            res.status(200).json({ valid: false });
        }
    }
    catch (err) {
        res.status(200).json({ valid: false });
        console.log(err);
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

    if (!req.params.confirmation_code) {
        confirmation = false;
        res.render('pages/confirmbooking', { confirmdata: { 'message': 'confirmcodemissing', 'confirmation': confirmation, 'name': '', 'start_time': '', 'end_time': '', 'area_id': '', 'view': 'day' } })
    }

    try {
        let entry = await Model.readEntryFromConfirmationCode(req.params.system, req.params.confirmation_code)
        if (entry.length > 0) {
            entry.forEach(async entryrow => {
                let currenttimestamp = Math.floor(Date.now() / 1000);
                let slotinseconds = entryrow.start_time;
                //Kvittera bara om inom intervallet 15 min före/efter start_time
                if (currenttimestamp >= slotinseconds - 15 * 60 && currenttimestamp <= slotinseconds + 15 * 60) {
                    //Uppdatera bokning till confirmed(status = noll)
                    let updateEntry = await Model.updateEntryConfirmed(req.params.system, entryrow.confirmation_code)
                    if (updateEntry.affectedRows != 1) {
                        confirmation = false;
                        res.render('pages/confirmbooking', {
                            confirmdata: {
                                'message': 'somethingwrong',
                                'confirmation': confirmation,
                                'name': '',
                                'start_time': '',
                                'end_time': '',
                                'area_id': '',
                                'view': 'day',
                                'lang': lang,
                                'translations': translations[lang]
                            }
                        })
                    } else {
                        //
                        let EntryWithRoomAndArea = await Model.readEntryWithRoomAndArea(req.params.system, entryrow.id)
                        let view = 'day'
                        EntryWithRoomAndArea.forEach(EntryWithRoomAndArea_row => {
                            if (EntryWithRoomAndArea_row.default_view == 0) {
                                view = "day";
                            } else {
                                view = "week";
                            }
                            let start_time_time = new Date(EntryWithRoomAndArea_row.start_time * 1000).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
                            let start_time_date = new Date(EntryWithRoomAndArea_row.start_time * 1000).toLocaleDateString("sv-SE")
                            let end_time_time = new Date(EntryWithRoomAndArea_row.end_time * 1000).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
                            let end_time_date = new Date(EntryWithRoomAndArea_row.end_time * 1000).toLocaleDateString("sv-SE")
                            res.render('pages/confirmbooking', {
                                confirmdata: {
                                    'message': 'confirmnotfound',
                                    'confirmation': confirmation,
                                    'name': EntryWithRoomAndArea_row.room_name,
                                    'start_time': start_time_date + ' ' + start_time_time,
                                    'end_time': end_time_date + ' ' + end_time_time,
                                    'area_id': EntryWithRoomAndArea_row.area_id,
                                    'view': view,
                                    'lang': lang,
                                    'translations': translations[lang]
                                }
                            })
                        })
                    }
                } else {
                    confirmation = false;
                    res.render('pages/confirmbooking', {
                        confirmdata: {
                            'message': 'notinconfirmperiod',
                            'confirmation': confirmation,
                            'name': '',
                            'start_time': '',
                            'end_time': '',
                            'area_id': '',
                            'view': 'day',
                            'lang': lang,
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
                    'message': 'confirmnotfound',
                    'confirmation': confirmation,
                    'name': '',
                    'start_time': '',
                    'end_time': '',
                    'area_id': '',
                    'view': 'day',
                    'lang': lang,
                    'translations': translations[lang]
                }
            })
        }
    }
    catch (err) {
        confirmation = false;
        res.render('pages/confirmbooking', {
            confirmdata: {
                'message': err.message,
                'confirmation': confirmation,
                'name': '',
                'start_time': '',
                'end_time': '',
                'area_id': '',
                'view': 'day',
                'lang': lang,
                'translations': translations[lang]
            }
        })
    }
}

async function getReminderBookings(req, res) {
    try {
        let bookings = await Model.readReminderBookings(req.params.system, req.params.fromtime, req.params.totime, req.params.status, req.params.type)
        res.send(bookings)
    } catch (err) {
        res.send("error: " + err)
    }
}

async function updateEntryConfirmationCode(req, res) {
    try {
        let result = await Model.updateEntryConfirmationCode(req.params.system, req.params.id, req.params.confirmationcode)
        res.send(result)
    } catch (err) {
        res.send("error: " + err)
    }
}

async function updateEntrySetReminded(req, res) {
    try {
        let result = await Model.updateEntrySetReminded(req.params.system, req.params.id)
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

async function getOpeningHours_html_new(req, res) {
    const lang = req.params.lang || 'en';
    const givenDate = new Date(req.params.datetoget);
    let week_start = getFirstDayOfWeek(givenDate)
    let week_end = getLastDayOfWeek(givenDate);
    let week_start_current = getFirstDayOfWeek(new Date())
    let prevdate
    let nextdate

    //Datum för bläddringsknappar
    //Visa inte föregåendeknapp om aktuell vecka visas.
    if (week_start_current == week_start) {
        prevdate = "";
    } else {
        let pd = new Date(req.params.datetoget);
        pd.setDate(pd.getDate() - 7)
        prevdate = pd.toLocaleDateString("sv-SE")
    }

    let nd = new Date(req.params.datetoget);
    nd.setDate(nd.getDate() + 7)
    nextdate = nd.toLocaleDateString("sv-SE")

    try {
        //hämta resolution för area(id = 1)
        let resolution_res = await Model.readResolution(req.params.system, 1);
        if (resolution_res.length > 0) {
            for (let i = 0; i < resolution_res.length; i++) {
                resolution = resolution_res[i]['resolution'];
            }
        }

        //Gå igenom veckan
        var from = new Date(week_start);
        var to = new Date(week_end);
        let openinghoursarr
        let openingmorehoursarr
        let libraryname;
        let openinfotext_1;
        let openinfotext_2;
        let closedtext;
        if (req.params.librarycode == process.env.MAIN_LIBRARY_CODE) {
            if (lang == 'en') {
                libraryname = "Main Library";
                openinfotext_1 = "* Note! Access with KTH access card mornings 8–9";
                openinfotext_2 = "";
                closedtext = "Closed";
            } else {
                libraryname = "Huvudbiblioteket";
                openinfotext_1 = "* Obs! Morgnar 8–9";
                openinfotext_2 = "krävs KTH passerkort";
                closedtext = "Stängt";
            }
        }

        //Skapa html som kan hämtas och visas på öppettidersidan i polopoly
        let week_start_date = formatDateForHTMLWeekDays(new Date(week_start))
        let week_end_date = formatDateForHTMLWeekDays(new Date(week_end))

        let html = `<div class="openhourscontainer">
                    <div>
                        <div class="weekheader">Vecka 04</div>
                        <span class="weekdates">${week_start_date}-${week_end_date}</span>
                    </div>`
        for (var day = from; day <= to; day.setDate(day.getDate() + 1)) {
            moreopen = false;
            openinghoursarr = await getNonDefaultOpeninghours(req.params.system, day.toLocaleDateString(), req.params.librarycode, resolution)
            openingmorehoursarr = await getNonDefaultOpeninghours(req.params.system, day.toLocaleDateString(), req.params.librarymorecode, resolution)
            openinghoursarr[0] != "" && openinghoursarr[0] != null ? ismanned = true : ismanned = false;
            openingmorehoursarr[0] != "" && openingmorehoursarr[0] != null ? ismoreopen = true : ismoreopen = false;
            !ismoreopen && !ismanned ? libaryclosed = true : libaryclosed = false;
            //Dagens första tid
            if (openinghoursarr[0] != "" && openinghoursarr[0] != null) {
                //finns det en meröppettid?
                if (openingmorehoursarr[0] != "" && openingmorehoursarr[0] != null) {
                    moreopen = true;
                    if (parseFloat(openinghoursarr[0]) < parseFloat(openingmorehoursarr[0])) {
                        firsthour = openinghoursarr[0];
                    } else {
                        firsthour = openingmorehoursarr[0];
                    }
                } else {
                    //ingen meröppettid finns alltså är vanliga öppettiden första
                    firsthour = openinghoursarr[0];
                }
            } else {
                //finns det en meröppettid så gäller den som första
                if (openingmorehoursarr[0] != "" && openingmorehoursarr[0] != null) {
                    firsthour = openingmorehoursarr[0];
                }
            }

            //Dagens sista tid
            if (openinghoursarr[1] != "" && openinghoursarr[1] != null) {
                //finns det en meröppettid?
                if (openingmorehoursarr[1] != "" && openingmorehoursarr[1] != null) {
                    moreopen = true;
                    if (parseFloat(openinghoursarr[1]) > parseFloat(openingmorehoursarr[1])) {
                        lasthour = openinghoursarr[1];
                    } else {
                        lasthour = openingmorehoursarr[1];
                    }
                } else {
                    //ingen meröppettid finns alltså är vanliga öppettiden sista
                    lasthour = openinghoursarr[1];
                }
            } else {
                //finns det en meröppettid så gäller den som sista
                if (openingmorehoursarr[1] != "" && openingmorehoursarr[1] != null) {
                    lasthour = openingmorehoursarr[1];
                }
            }

            // Södertälje
            if (req.params.librarycode == process.env.SODERTALJE_LIBRARY_CODE) {
                if (lang == 'en') {
                    libraryname = "Södertälje";
                    mannedtext = "Note! Manned";
                    unmannedtext = "Note! Unmanned";
                    openinfotext_2 = "";
                    closedtext = "Closed";
                } else {
                    libraryname = "Södertälje";
                    mannedtext = "Obs! Bemannat";
                    unmannedtext = "Obs! Obemannat";
                    openinfotext_2 = "";
                    closedtext = "Stängt";
                }
                if (!libaryclosed) {
                    if (ismanned) {

                        html += `<div>${libraryname}: ${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}</div>`;
                        //html +=  `<div class='openinghoursinfo'>${mannedtext}: ${openinghoursarr[0].replaceAll('.00','')}–${openinghoursarr[1].replaceAll('.00','')}${openinfotext_2}</div>`;
                    } else {
                        html += `<div>${libraryname}: ${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}</div>`;
                        //html += `<div class='openinghoursinfo'>${unmannedtext}</div>`;
                    }
                } else {
                    html += `<div>${closedtext}</div>`;
                }
            }

            // Main Library
            if (req.params.librarycode == process.env.MAIN_LIBRARY_CODE) {
                if (!libaryclosed) {
                    if (ismanned) {
                        html += `<div class="weekdays">${day.toLocaleDateString(req.params.lang, { weekday: 'long' })} <span class="openhours">${firsthour.replaceAll('.00', '')}${moreopen ? '*' : ''}–${lasthour.replaceAll('.00', '')}</span></div>`
                    } else {

                    }
                } else {
                    html += `<div class="weekdays">${day.toLocaleDateString(req.params.lang, { weekday: 'long' })} <span class="openhours">${closedtext}</span></div>`;
                }
            }

        }
        html += `<div class="navigatedays">`;
        if (prevdate != "") {
            html +=
                `<div class="previousweek">
                <a onclick="getopenhours('${prevdate}','${req.params.librarycode}','${req.params.librarymorecode} ', '${req.params.lang}')">${translations[lang]["prevtext"]}</a>
                </div>`;
        }

        //Inga meröppettider existerar - visa ingen mertext
        if (html.indexOf("*") === -1) {
            openinfotext_1 = "";
        }

        html +=
            `<div class="nextweek">
                <a onclick="getopenhours('${nextdate}','${req.params.librarycode}','${req.params.librarymorecode} ', '${req.params.lang}')">${translations[lang]["nexttext"]}</a>
                </div>
        </div>
        <div id="moretext">${openinfotext_1} ${openinfotext_2}</div>
    </div>`

        res.send(html)
    } catch (err) {
        res.send("error: " + err)
    }
}

async function getOpeningHours_html(req, res) {
    const lang = req.params.lang || 'en';
    closedtext = translations[lang]["closedtext"]
    unmannedtext = translations[lang]["unmannedtext"]
    let dayarray = {};
    let daymorearray = {};
    dayarray["monday"] = closedtext;
    dayarray["tuesday"] = closedtext;
    dayarray["wednesday"] = closedtext;
    dayarray["thursday"] = closedtext;
    dayarray["friday"] = closedtext;
    dayarray["saturday"] = closedtext;
    dayarray["sunday"] = closedtext;
    daymorearray["monday"] = '';
    daymorearray["tuesday"] = '';
    daymorearray["wednesday"] = '';
    daymorearray["thursday"] = '';
    daymorearray["friday"] = '';
    daymorearray["saturday"] = '';
    daymorearray["sunday"] = '';
    let resolution

    const givenDate = new Date(req.params.datetoget);
    let week_start = getFirstDayOfWeek(givenDate)
    let week_end = getLastDayOfWeek(givenDate);
    let week_start_current = getFirstDayOfWeek(new Date())
    let prevdate
    let nextdate

    //Datum för bläddringsknappar
    //Visa inte föregåendeknapp om aktuell vecka visas.
    if (week_start_current == week_start) {
        prevdate = "";
    } else {
        let pd = new Date(req.params.datetoget);
        pd.setDate(pd.getDate() - 7)
        prevdate = pd.toLocaleDateString("sv-SE")
    }

    let nd = new Date(req.params.datetoget);
    nd.setDate(nd.getDate() + 7)
    nextdate = nd.toLocaleDateString("sv-SE")

    try {
        //hämta resolution för area(id = 1)
        let resolution_res = await Model.readResolution(req.params.system, 1);
        if (resolution_res.length > 0) {
            for (let i = 0; i < resolution_res.length; i++) {
                resolution = resolution_res[i]['resolution'];
            }
        }
        let roomstartend = await Model.readRoomStartEndWeek(req.params.system, req.params.librarycode)
        if (roomstartend.length > 0) {
            for (let i = 0; i < roomstartend.length; i++) {
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

        let roomcloseddays = await Model.readRoomClosedDays(req.params.system, req.params.librarycode, week_start, week_end)

        if (roomcloseddays.length > 0) {
            for (let i = 0; i < roomcloseddays.length; i++) {
                let non_default_openinghours = await getNonDefaultOpeninghours(req.params.system, roomcloseddays[i].datetoget, req.params.librarycode, resolution)
                let d = new Date(roomcloseddays[i].datetoget)
                let dayname = d.toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase();
                if (non_default_openinghours.length == 0) {
                    dayarray[dayname] = closedtext;
                } else {
                    if (non_default_openinghours[0] == "") {
                        dayarray[dayname] = closedtext;
                    } else {
                        dayarray[dayname] = non_default_openinghours[0] + "–" + non_default_openinghours[1];
                    }
                }

            }
        }

        // Meröppet
        let roomstartendmore = await Model.readRoomStartEndWeek(req.params.system, req.params.librarymorecode)
        if (roomstartendmore.length > 0) {
            for (let i = 0; i < roomstartendmore.length; i++) {
                roomstartendmore[i]["monday"] !== null ? daymorearray["monday"] = ' (' + roomstartendmore[i]["monday"] + '*)' : 0
                roomstartendmore[i]["tuesday"] !== null ? daymorearray["tuesday"] = ' (' + roomstartendmore[i]["tuesday"] + '*)' : 0
                roomstartendmore[i]["wednesday"] !== null ? daymorearray["wednesday"] = ' (' + roomstartendmore[i]["wednesday"] + '*)' : 0
                roomstartendmore[i]["thursday"] !== null ? daymorearray["thursday"] = ' (' + roomstartendmore[i]["thursday"] + '*)' : 0
                roomstartendmore[i]["friday"] !== null ? daymorearray["friday"] = ' (' + roomstartendmore[i]["friday"] + '*)' : 0
                roomstartendmore[i]["saturday"] !== null ? daymorearray["saturday"] = ' (' + roomstartendmore[i]["saturday"] + '*)' : 0
                roomstartendmore[i]["sunday"] !== null ? daymorearray["sunday"] = ' (' + roomstartendmore[i]["sunday"] + '*)' : 0
            };
        } else {
            // Settings för rummets start och end saknas!
        }
        let roomcloseddaysmore = await Model.readRoomClosedDays(req.params.system, req.params.librarymorecode, week_start, week_end)
        if (roomcloseddaysmore.length > 0) {
            for (let i = 0; i < roomcloseddaysmore.length; i++) {
                let non_default_openinghours = await getNonDefaultOpeninghours(req.params.system, roomcloseddaysmore[i].datetoget, req.params.librarymorecode, resolution)
                let d = new Date(roomcloseddaysmore[i].datetoget)
                let dayname = d.toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase();
                if (non_default_openinghours.length == 0) {
                    daymorearray[dayname] = '';
                } else {
                    daymorearray[dayname] = ' (' + non_default_openinghours[0] + "–" + non_default_openinghours[1] + '*)';
                }

            }
        }
        // Ändra till "ej bemannat" som text för meröppetdagar utan personal
        weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        weekdays.forEach(weekday => {
            if (dayarray[weekday] == closedtext) {
                daymorearray[weekday] == '' ? 0 : dayarray[weekday] = unmannedtext;
            }
        });

        // 3 = Kista, 5 = Södertälje
        let moretext = translations[lang]["moretext"]
        req.params.librarycode == 3 ? moretext = translations[lang]["moretext_kista"] : 0;
        req.params.librarycode == 5 ? moretext = translations[lang]["moretext_telge"] : 0;

        //Skapa html som kan hämtas och visas på öppettidersidan i polopoly
        let week_start_date = formatDateForHTMLWeekDays(new Date(week_start))
        let week_end_date = formatDateForHTMLWeekDays(new Date(week_end))

        let html_ = `
    <div class="openhourscontainer">
        <div>
            <div class="weekheader">Vecka 04</div>
            <span class="weekdates">${week_start_date}-${week_end_date}</span>
        </div>
        <div class="weekdays">${translations[lang]["dayNames"][1]} <span class="openhours">${dayarray["monday"].replaceAll('.00', '') + daymorearray["monday"].replaceAll('.00', '')}</span>
        </div>
        <div class="weekdays">${translations[lang]["dayNames"][2]} <span class="openhours">${dayarray["tuesday"].replaceAll('.00', '') + daymorearray["tuesday"].replaceAll('.00', '')}</span>
        </div>
        <div class="weekdays">${translations[lang]["dayNames"][3]} <span class="openhours">${dayarray["wednesday"].replaceAll('.00', '') + daymorearray["wednesday"].replaceAll('.00', '')}</span>
        </div>
        <div class="weekdays">${translations[lang]["dayNames"][4]} <span class="openhours">${dayarray["thursday"].replaceAll('.00', '') + daymorearray["thursday"].replaceAll('.00', '')}</span>
        </div>
        <div class="weekdays">${translations[lang]["dayNames"][5]} <span class="openhours">${dayarray["friday"].replaceAll('.00', '') + daymorearray["friday"].replaceAll('.00', '')}</span>
        </div>
        <div class="weekdays">${translations[lang]["dayNames"][6]} <span class="openhours">${dayarray["saturday"].replaceAll('.00', '') + daymorearray["saturday"].replaceAll('.00', '')}</span>
        </div>
        <div class="weekdays">${translations[lang]["dayNames"][0]} <span class="openhours closed">${dayarray["sunday"].replaceAll('.00', '') + daymorearray["sunday"].replaceAll('.00', '')}</span>
        </div>
        <div class="navigatedays">`;
        if (prevdate != "") {
            html_ +=
                `<div class="previousweek">
                <a onclick="getopenhours('${prevdate}','${req.params.librarycode}','${req.params.librarymorecode} ', '${req.params.lang}')">${translations[lang]["prevtext"]}</a>
                </div>`;
        }

        //Inga meröppettider existerar - visa ingen mertext
        if (html_.indexOf("*") === -1) {
            moretext = "";
        }

        html_ +=
            `<div class="nextweek">
                <a onclick="getopenhours('${nextdate}','${req.params.librarycode}','${req.params.librarymorecode} ', '${req.params.lang}')">${translations[lang]["nexttext"]}</a>
                </div>
        </div>
        <div id="moretext">${moretext}</div>
    </div>`
        res.send(html_)
    } catch (err) {
        res.send("error: " + err)
    }
}

async function getOpeningHours_html_start(req, res) {
    const lang = req.params.lang || 'en';
    closedtext = translations[lang]["closedtext"]
    unmannedtext = translations[lang]["unmannedtext"]
    let resolution

    try {
        //hämta resolution för area(id = 1)
        let resolution_res = await Model.readResolution(req.params.system, 1);
        if (resolution_res.length > 0) {
            for (let i = 0; i < resolution_res.length; i++) {
                resolution = resolution_res[i]['resolution'];
            }
        }

        let moreopen = false;
        let ismanned;
        let ismoreopen;
        let libaryclosed;
        let firsthour = "";
        let lasthour = "";

        let openinghoursarr = await getNonDefaultOpeninghours(req.params.system, req.params.datetoget, req.params.librarycode, resolution)
        let openingmorehoursarr = await getNonDefaultOpeninghours(req.params.system, req.params.datetoget, req.params.librarymorecode, resolution)
        openinghoursarr[0] != "" && openinghoursarr[0] != null ? ismanned = true : ismanned = false;
        openingmorehoursarr[0] != "" && openingmorehoursarr[0] != null ? ismoreopen = true : ismoreopen = false;
        !ismoreopen && !ismanned ? libaryclosed = true : libaryclosed = false;
        //Dagens första tid
        //Finns det en tid?
        if (openinghoursarr[0] != "" && openinghoursarr[0] != null) {
            //finns det en meröppettid?
            if (openingmorehoursarr[0] != "" && openingmorehoursarr[0] != null) {
                moreopen = true;
                if (parseFloat(openinghoursarr[0]) < parseFloat(openingmorehoursarr[0])) {
                    firsthour = openinghoursarr[0];
                } else {
                    firsthour = openingmorehoursarr[0];
                }
            } else {
                //ingen meröppettid finns alltså är vanliga öppettiden första
                firsthour = openinghoursarr[0];
            }
        } else {
            //finns det en meröppettid så gäller den som första
            if (openingmorehoursarr[0] != "" && openingmorehoursarr[0] != null) {
                firsthour = openingmorehoursarr[0];
            }
        }

        //Dagens sista tid
        //Finns det en tid?
        if (openinghoursarr[1] != "" && openinghoursarr[1] != null) {
            //finns det en meröppettid?
            if (openingmorehoursarr[1] != "" && openingmorehoursarr[1] != null) {
                moreopen = true;
                if (parseFloat(openinghoursarr[1]) > parseFloat(openingmorehoursarr[1])) {
                    lasthour = openinghoursarr[1];
                } else {
                    lasthour = openingmorehoursarr[1];
                }
            } else {
                //ingen meröppettid finns alltså är vanliga öppettiden sista
                lasthour = openinghoursarr[1];
            }
        } else {
            //finns det en meröppettid så gäller den som sista
            if (openingmorehoursarr[1] != "" && openingmorehoursarr[1] != null) {
                lasthour = openingmorehoursarr[1];
            }
        }

        let libraryname;
        let mannedtext;
        let unmannedtext
        let openinfotext_1;
        let openinfotext_2;
        let closedtext;
        let html = "";

        // Södertälje
        if (req.params.librarycode == process.env.SODERTALJE_LIBRARY_CODE) {
            if (lang == 'en') {
                libraryname = "Södertälje";
                mannedtext = "Note! Manned";
                unmannedtext = "Note! Unmanned";
                openinfotext_2 = "";
                closedtext = "Closed";
            } else {
                libraryname = "Södertälje";
                mannedtext = "Obs! Bemannat";
                unmannedtext = "Obs! Obemannat";
                openinfotext_2 = "";
                closedtext = "Stängt";
            }
            if (!libaryclosed) {
                if (ismanned) {
                    html += `<div>${libraryname}: ${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}</div>`;
                    html += `<div class='openinghoursinfo'>${mannedtext}: ${openinghoursarr[0].replaceAll('.00', '')}–${openinghoursarr[1].replaceAll('.00', '')}${openinfotext_2}</div>`;
                } else {
                    html += `<div>${libraryname}: ${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}</div>`;
                    html += `<div class='openinghoursinfo'>${unmannedtext}</div>`;
                }
            } else {
                html += `<div>${libraryname}: ${closedtext}</div>`;
            }
        }

        // Main Library
        if (req.params.librarycode == process.env.MAIN_LIBRARY_CODE) {
            if (lang == 'en') {
                libraryname = "Main Library";
                openinfotext_1 = "Note! Access with KTH access card mornings";
                openinfotext_2 = "";
                closedtext = "Closed";
            } else {
                libraryname = "Huvudbiblioteket";
                openinfotext_1 = "Obs! Morgnar";
                openinfotext_2 = "krävs KTH passerkort";
                closedtext = "Stängt";
            }
            if (!libaryclosed) {
                if (ismanned) {
                    html += `<div>${libraryname}: ${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}</div>`;
                    if (moreopen) {
                        html += `<div class='openinghoursinfo'>${openinfotext_1} ${openingmorehoursarr[0].replaceAll('.00', '')}–${openingmorehoursarr[1].replaceAll('.00', '')} ${openinfotext_2}</div>`;
                    }
                } else {

                }
            } else {
                html += `<div>${libraryname}: ${closedtext}</div>`;
            }
        }
        res.send(html)
    } catch (err) {
        res.send("error: " + err)
    }
}

async function getOpeningHours_json(req, res) {
    let json;
    const lang = req.params.lang || 'en';
    const givenDate = new Date(req.params.datetoget);
    let week_start = getFirstDayOfWeek(givenDate)
    let week_end = getLastDayOfWeek(givenDate);
    let week_start_current = getFirstDayOfWeek(new Date())
    let prevdate
    let nextdate

    //Datum för bläddringsknappar
    //Visa inte föregåendeknapp om aktuell vecka visas.
    if (week_start_current == week_start) {
        prevdate = "";
    } else {
        let pd = new Date(req.params.datetoget);
        pd.setDate(pd.getDate() - 7)
        prevdate = pd.toLocaleDateString("sv-SE")
    }

    let nd = new Date(req.params.datetoget);
    nd.setDate(nd.getDate() + 7)
    nextdate = nd.toLocaleDateString("sv-SE")

    try {
        //hämta resolution för area(id = 1)
        let resolution_res = await Model.readResolution(req.params.system, 1);
        if (resolution_res.length > 0) {
            for (let i = 0; i < resolution_res.length; i++) {
                resolution = resolution_res[i]['resolution'];
            }
        }

        //Gå igenom veckan
        var from = new Date(week_start);
        var to = new Date(week_end);
        let openinghoursarr = {}
        let openingmorehoursarr = {}
        let libraryname;
        let name;
        let langcode;
        let weekdatesheader;
        let openinfotext_1;
        let openinfotext_2;
        let closedtext;
        let openinfotext_1_startpage;
        let openinfotext_2_startpage;
        let closedtext_startpage;
        let mannedtext;
        let mannedtext_startpage;
        let unmannedtext_startpage;
        let unmannedtext;
        let opentodaymoretext_start;
        let opentodayhours_start;
        let ismoreopen;
        let moreopen;

        //Hämta texter från translations.json
        unmannedtext = translations[lang]["unmannedtext"]
        langcode = translations[lang]["langcode"];
        weekdatesheader = translations[lang]["room"][req.params.librarycode]["weekdatesheader"];
        name = translations[lang]["room"][req.params.librarycode]["name"];
        openinfotext_1 = translations[lang]["room"][req.params.librarycode]["openinfotext_1"];
        openinfotext_2 = translations[lang]["room"][req.params.librarycode]["openinfotext_2"];
        closedtext = translations[lang]["room"][req.params.librarycode]["closedtext"];
        openinfotext_1_startpage = translations[lang]["room"][req.params.librarycode]["openinfotext_1_startpage"];
        openinfotext_2_startpage = translations[lang]["room"][req.params.librarycode]["openinfotext_2_startpage"];
        closedtext_startpage = translations[lang]["room"][req.params.librarycode]["closedtext_startpage"];
        mannedtext = translations[lang]["room"][req.params.librarycode]["mannedtext"];
        mannedtext_startpage = translations[lang]["room"][req.params.librarycode]["mannedtext_startpage"];
        unmannedtext_startpage = translations[lang]["room"][req.params.librarycode]["unmannedtext_startpage"];
       
        
        //Skapa html som kan hämtas och visas på öppettidersidan i polopoly
        let week_start_date = formatDateForHTMLWeekDays(new Date(week_start))
        let week_end_date = formatDateForHTMLWeekDays(new Date(week_end))

        //Dagens öppettider
        let todaysdate = new Date();
        let opentodayhours;
        let opentoday = true;
        let ismanned;
        moreopen = false;
        openinghoursarr = await getNonDefaultOpeninghours(req.params.system, todaysdate.toLocaleDateString(), req.params.librarycode, resolution)
        openinghoursarr[0] != "" && openinghoursarr[0] != null ? ismanned = true : ismanned = false;
        if(req.params.librarymorecode != 0) {
            openingmorehoursarr = await getNonDefaultOpeninghours(req.params.system, todaysdate.toLocaleDateString(), req.params.librarymorecode, resolution)
            openingmorehoursarr[0] != "" && openingmorehoursarr[0] != null ? ismoreopen = true : ismoreopen = false;
        }

        //Om det inte är meröppet och inte bemannat så är det stängt
        !ismoreopen && !ismanned ? libaryclosed = true : libaryclosed = false;

        //Dagens första tid
        if (openinghoursarr[0] != "" && openinghoursarr[0] != null) {
            //finns det en meröppettid?
            if (openingmorehoursarr[0] != "" && openingmorehoursarr[0] != null) {
                moreopen = true;
                if (parseFloat(openinghoursarr[0]) < parseFloat(openingmorehoursarr[0])) {
                    firsthour = openinghoursarr[0];
                } else {
                    firsthour = openingmorehoursarr[0];
                }
            } else {
                //ingen meröppettid finns alltså är vanliga öppettiden första
                firsthour = openinghoursarr[0];
            }
        } else {
            //finns det en meröppettid så gäller den som första
            if (openingmorehoursarr[0] != "" && openingmorehoursarr[0] != null) {
                firsthour = openingmorehoursarr[0];
            }
        }

        //Dagens sista tid
        if (openinghoursarr[1] != "" && openinghoursarr[1] != null) {
            //finns det en meröppettid?
            if (openingmorehoursarr[1] != "" && openingmorehoursarr[1] != null) {
                moreopen = true;
                if (parseFloat(openinghoursarr[1]) > parseFloat(openingmorehoursarr[1])) {
                    lasthour = openinghoursarr[1];
                } else {
                    lasthour = openingmorehoursarr[1];
                }
            } else {
                //ingen meröppettid finns alltså är vanliga öppettiden sista
                lasthour = openinghoursarr[1];
            }
        } else {
            //finns det en meröppettid så gäller den som sista
            if (openingmorehoursarr[1] != "" && openingmorehoursarr[1] != null) {
                lasthour = openingmorehoursarr[1];
            }
        }

        libraryclosed = Model.readClosedPeriod(req.params.system, req.params.librarycode, todaysdate.toLocaleDateString("sv-SE"))

        // Main Library
        if (req.params.librarycode == process.env.MAIN_LIBRARY_CODE) {
            if (!libaryclosed) {
                if (ismanned) {
                    opentodayhours_start = `${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}`
                    if (moreopen) {
                        opentodaymoretext_start = `${openinfotext_1_startpage} ${openingmorehoursarr[0].replaceAll('.00', '')}–${openingmorehoursarr[1].replaceAll('.00', '')} ${openinfotext_2_startpage}`
                    } else {
                        opentodaymoretext_start = ""
                    }
                    opentodayhours = `${firsthour.replaceAll('.00', '')}${moreopen ? '*' : ''}–${lasthour.replaceAll('.00', '')}`;
                }
            } else {
                opentodaymoretext_start = ""
                opentodayhours_start = closedtext
                opentodayhours = closedtext
                opentoday = false
            }
        }

        // Södertälje
        if (req.params.librarycode == process.env.SODERTALJE_LIBRARY_CODE) {
            if (!libaryclosed) {
                if (ismanned) {
                    opentodayhours_start = `${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}`
                    opentodaymoretext_start = `${mannedtext_startpage} ${openinghoursarr[0].replaceAll('.00', '')}–${openinghoursarr[1].replaceAll('.00', '')}${openinfotext_2_startpage}`
                    opentodayhours = `${openingmorehoursarr[0].replaceAll('.00', '')}–${openingmorehoursarr[1].replaceAll('.00', '')} (${mannedtext} ${openinghoursarr[0].replaceAll('.00', '')}–${openinghoursarr[1].replaceAll('.00', '')})`
                } else {
                    opentodayhours_start = `${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}`
                    opentodaymoretext_start = `${unmannedtext_startpage} ${openinfotext_2_startpage}`
                    opentodayhours = `${openingmorehoursarr[0].replaceAll('.00', '')}–${openingmorehoursarr[1].replaceAll('.00', '')} (${unmannedtext})`
                }
            } else {
                opentodayhours_start = closedtext
                opentodaymoretext_start = ""
                opentodayhours = closedtext
                opentoday = false
            }
        }

        //Chat
        if (req.params.librarycode == process.env.CHAT_CODE) {
            if (!libaryclosed) {
                opentodayhours_start = `${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}`
                opentodaymoretext_start = ""
                opentodayhours = `${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}`;
            } else {
                opentodayhours_start = closedtext
                opentodayhours = closedtext
                opentoday = false
            }
        }

        //Phone
        if (req.params.librarycode == process.env.PHONE_CODE) {
            if (!libaryclosed) {
                opentodayhours_start = `${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}`
                opentodaymoretext_start = ""
                opentodayhours = `${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}`;
            } else {
                opentodayhours_start = closedtext
                opentodayhours = closedtext
                opentoday = false
            }
        }

        json = `{
        "name" : "${name}",
        "todaysdate" : "${todaysdate.toLocaleDateString(langcode,{})}",
        "ismanned" : ${ismanned},
        "opentoday" : ${opentoday},
        "opentodaymoretext_startpage" : "${opentodaymoretext_start}",
        "opentodayhours_startpage" : "${opentodayhours_start}",
        "opentodaytext" : "${(opentoday ? "Öppet idag " : "Stängt idag ") + todaysdate.toLocaleDateString(langcode,{weekday: 'long',month: 'long',day: 'numeric'})}",
        "opentodayhours" : "${opentodayhours}",
        "weekdatesheader" : "${weekdatesheader}",
        "week" : "${week_start_date}–${week_end_date}",
        "days" : [`

        //Öppettider för veckan för givet datum
        let dayindex = 0;
        for (var day = from; day <= to; day.setDate(day.getDate() + 1)) {

            if (dayindex == 0) {
                json += `{`
            } else {
                json += `,{`
            }
            dayindex++
            moreopen = false;
            openinghoursarr = await getNonDefaultOpeninghours(req.params.system, day.toLocaleDateString(), req.params.librarycode, resolution)
            openinghoursarr[0] != "" && openinghoursarr[0] != null ? ismanned = true : ismanned = false;
            if(req.params.librarymorecode != 0) {
                openingmorehoursarr = await getNonDefaultOpeninghours(req.params.system, day.toLocaleDateString(), req.params.librarymorecode, resolution)
                openingmorehoursarr[0] != "" && openingmorehoursarr[0] != null ? ismoreopen = true : ismoreopen = false;
            }
            !ismoreopen && !ismanned ? libaryclosed = true : libaryclosed = false;
            //Dagens första tid
            //Finns det en tid?
            if (openinghoursarr[0] != "" && openinghoursarr[0] != null) {
                //finns det en meröppettid?
                if (openingmorehoursarr[0] != "" && openingmorehoursarr[0] != null) {
                    moreopen = true;
                    if (parseFloat(openinghoursarr[0]) < parseFloat(openingmorehoursarr[0])) {
                        firsthour = openinghoursarr[0];
                    } else {
                        firsthour = openingmorehoursarr[0];
                    }
                } else {
                    //ingen meröppettid finns alltså är vanliga öppettiden första
                    firsthour = openinghoursarr[0];
                }
            } else {
                //finns det en meröppettid så gäller den som första
                if (openingmorehoursarr[0] != "" && openingmorehoursarr[0] != null) {
                    firsthour = openingmorehoursarr[0];
                }
            }

            //Dagens sista tid
            //Finns det en tid?
            if (openinghoursarr[1] != "" && openinghoursarr[1] != null) {
                //finns det en meröppettid?
                if (openingmorehoursarr[1] != "" && openingmorehoursarr[1] != null) {
                    moreopen = true;
                    if (parseFloat(openinghoursarr[1]) > parseFloat(openingmorehoursarr[1])) {
                        lasthour = openinghoursarr[1];
                    } else {
                        lasthour = openingmorehoursarr[1];
                    }
                } else {
                    //ingen meröppettid finns alltså är vanliga öppettiden sista
                    lasthour = openinghoursarr[1];
                }
            } else {
                //finns det en meröppettid så gäller den som sista
                if (openingmorehoursarr[1] != "" && openingmorehoursarr[1] != null) {
                    lasthour = openingmorehoursarr[1];
                }
            }

            // Main Library
            if (req.params.librarycode == process.env.MAIN_LIBRARY_CODE) {
                if (!libaryclosed) {
                    if (ismanned) {
                        json += `
                        "date" : "${day.toLocaleDateString(req.params.lang)}",
                        "name" : "${day.toLocaleDateString(req.params.lang, { weekday: 'long' })}",
                        "hours" : "${firsthour.replaceAll('.00', '')}${moreopen ? '*' : ''}–${lasthour.replaceAll('.00', '')}"`
                    }
                } else {
                    json += `
                    "date" : "${day.toLocaleDateString(req.params.lang)}",
                    "name" : "${day.toLocaleDateString(req.params.lang, { weekday: 'long' })}",
                    "hours" : "${closedtext}"`
                }
            }

            // Södertälje
            if (req.params.librarycode == process.env.SODERTALJE_LIBRARY_CODE) {
                if (!libaryclosed) {
                    if (ismanned) {
                        json += `
                        "date" : "${day.toLocaleDateString(req.params.lang)}",
                        "name" : "${day.toLocaleDateString(req.params.lang, { weekday: 'long' })}",
                        "hours" : "${openingmorehoursarr[0].replaceAll('.00', '')}–${openingmorehoursarr[1].replaceAll('.00', '')} (${mannedtext} ${openinghoursarr[0].replaceAll('.00', '')}–${openinghoursarr[1].replaceAll('.00', '')})"`
                    } else {
                        json += `
                        "date" : "${day.toLocaleDateString(req.params.lang)}",
                        "name" : "${day.toLocaleDateString(req.params.lang, { weekday: 'long' })}",
                        "hours" : "${openingmorehoursarr[0].replaceAll('.00', '')}–${openingmorehoursarr[1].replaceAll('.00', '')}${moreopen ? '*' : ''} (${unmannedtext})"`
                    }
                } else {
                    json += `
                    "date" : "${day.toLocaleDateString(req.params.lang)}",
                    "name" : "${day.toLocaleDateString(req.params.lang, { weekday: 'long' })}",
                    "hours" : "${closedtext}"`
                }
            }

            // Chat
            if (req.params.librarycode == process.env.CHAT_CODE) {
                json += `
                "date" : "${day.toLocaleDateString(req.params.lang)}",
                "name" : "${day.toLocaleDateString(req.params.lang, { weekday: 'long' })}",
                "hours" : "${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}"`
            }

            // Phone
            if (req.params.librarycode == process.env.PHONE_CODE) {
                json += `
                "date" : "${day.toLocaleDateString(req.params.lang)}",
                "name" : "${day.toLocaleDateString(req.params.lang, { weekday: 'long' })}",
                "hours" : "${firsthour.replaceAll('.00', '')}–${lasthour.replaceAll('.00', '')}"`
            }

            json += `}`

        } // Slut loop days
        json += `
        ],
        "previous" : "${prevdate != "" ? "true" : "false"}",
        "next" : "true",`

        //Inga meröppettider existerar - visa ingen mertext
        if (json.indexOf("*") === -1) {
            openinfotext_1 = "";
            openinfotext_2 = "";
        }

        json += `
        "moretext" : "${openinfotext_1} ${openinfotext_2}",
        "prevdate" : "${prevdate}",
        "nextdate" : "${nextdate}"}`

        res.send(JSON.parse(json))
    } catch (err) {
        res.send("error: " + err)
    }
}

async function getNonDefaultOpeninghours(system, datetocheck, room_id, resolution) {
    try {
        let d = new Date(datetocheck)
        let dayname = d.toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase();
        let RoomStartEndDay = await Model.readRoomStartEndDay(system, dayname, room_id);
        let n_time_slots
        let morning_slot_seconds
        if (RoomStartEndDay.length > 0) {
            for (let i = 0; i < RoomStartEndDay.length; i++) {
                if (RoomStartEndDay[i]["morningstarts"] == null) {
                    morning_slot_seconds = false;
                }
                n_time_slots = get_n_time_slots(RoomStartEndDay[i]["morningstarts"], RoomStartEndDay[i]["morningstarts_minutes"], RoomStartEndDay[i]["eveningends"], RoomStartEndDay[i]["eveningends_minutes"], resolution);
                morning_slot_seconds = ((RoomStartEndDay[i]["morningstarts"] * 60) + RoomStartEndDay[i]["morningstarts_minutes"]) * 60;
            }
        }
        let evening_slot_seconds = morning_slot_seconds + ((n_time_slots - 1) * resolution);
        let openinghour = "";
        let closehour = "";
        let openinghourisset = false;

        if (morning_slot_seconds) {
            for (let s = morning_slot_seconds; s <= evening_slot_seconds; s += resolution) {
                let slot_free_res = await Model.checkifslotisfree(system, datetocheck, room_id, s);
                // om inga rader returneras så är sloten ledig
                if (slot_free_res.length == 0) {
                    //om fri = spara som öppningstid för dagen
                    if (openinghourisset == false) {
                        openinghourisset = true;
                        let ss = new Date(s * 1000)
                        openinghour = ss.toLocaleTimeString("sv-SE", { hour: "numeric", minute: "2-digit", timeZone: 'UTC' }) // ex: 8:30
                    } else {
                        //fortsätt och hitta den sista fria vars sluttid då blir stängningstid för dagen
                        let ss = new Date((s + resolution) * 1000)
                        closehour = ss.toLocaleTimeString("sv-SE", { hour: "numeric", minute: "2-digit", timeZone: 'UTC' }) // ex: 8:30
                    }
                }
            }
        }

        let hours = []
        if (openinghourisset) {
            hours = [openinghour.replace(':', '.'), closehour.replace(':', '.')];
        }
        return hours;
    } catch (err) {
        console.log(err)
        return
    }

}

function truncate(str, max, suffix) {
    return str.length < max ? str : `${str.substr(0, str.substr(0, max - suffix.length).lastIndexOf(' '))}${suffix}`;
}

function formatDateForHTMLWeekDays(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}/${month}`;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getFirstDayOfWeek(date) {
    const dateCopy = new Date(date); // Create a copy of the date
    const day = dateCopy.getDay();
    const diff = (day + 6) % 7; // Assuming Monday as the first day of the week
    dateCopy.setDate(dateCopy.getDate() - diff);
    return formatDate(dateCopy);
}

function getLastDayOfWeek(date) {
    const firstDayOfWeek = new Date(getFirstDayOfWeek(date));
    const lastDayOfWeek = new Date(firstDayOfWeek);
    lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
    return formatDate(lastDayOfWeek);
}

function get_n_time_slots(morningstarts, morningstarts_minutes, eveningends, eveningends_minutes, resolution) {
    let seconds_per_day = 24 * 60 * 60
    let start_first = ((morningstarts * 60) + morningstarts_minutes) * 60;
    let end_last = (((eveningends * 60) + eveningends_minutes) * 60) + resolution;
    end_last = end_last % seconds_per_day;
    let n_slots = (end_last - start_first) / resolution;

    return n_slots;
}

module.exports = {
    readEntry,
    getRoomsAvailability,
    getRoomBookingsForToday,
    validateBooking,
    checkBooking,
    confirmBooking,
    getReminderBookings,
    updateEntryConfirmationCode,
    updateEntrySetReminded,
    substrInBetween,
    getOpeningHours_html_new,
    getOpeningHours_json,
    getOpeningHours_html,
    getOpeningHours_html_start,
    truncate
};
