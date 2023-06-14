require('dotenv').config()

const eventModel = require('./Models');

const axios = require('axios')
const fs = require("fs");
const path = require('path');

const i18next = require('i18next');
const backend = require('i18next-fs-backend');


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

    const language = req.query.lang || 'en';

    i18next.changeLanguage(language);


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
                    entryrow.status = 0;
                    entryrow.confirmation_code = null;
                    //let updateEntry = await eventModel.updateEntryConfirm(req.params.system, entryrow.confirmation_code)
                } else {
                    confirmation = false;
                    res.render('pages/confirmbooking', {confirmdata: {'message' : 'notinconfirmperiod', 'confirmation' : confirmation, 'name': '', 'start_time' :'', 'end_time' : '', 'area_id' : '', 'view' : 'day' }})
                }
                //
                let EntryWithRoomAndArea = await eventModel.readEntryWithRoomAndArea(req.params.system, entryrow.id)
                let view = 'day'
                EntryWithRoomAndArea.forEach(EntryWithRoomAndArea_row => {
                    if (EntryWithRoomAndArea_row.default_view == 0) {
                        view = "day";
                    } else {
                        view = "week";
                    }
                    res.render('pages/confirmbooking', {confirmdata: {'message' : 'confirmnotfound', 'confirmation' : confirmation, 'name': EntryWithRoomAndArea_row.room_name, 'start_time' : EntryWithRoomAndArea_row.start_time, 'end_time' : EntryWithRoomAndArea_row.end_time, 'area_id' : EntryWithRoomAndArea_row.area_id, 'view' : view}})
                })
            });
        } else {
            //Hittar ingen bokning med angiven kod
            confirmation = false;
            res.render('pages/confirmbooking', {confirmdata: {'message' : 'confirmnotfound', 'confirmation' : confirmation, 'name': '', 'start_time' :'', 'end_time' : '', 'area_id' : '', 'view' : 'day' }})
        }
    }
    catch (err) {
        confirmation = false;
        res.render('pages/confirmbooking', {confirmdata: {'message' : err.message, 'confirmation' : confirmation, 'name': '', 'start_time' :'', 'end_time' : '', 'area_id' : '', 'view' : 'day' }})
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

function truncate(str, max, suffix) {
    return str.length < max ? str : `${str.substr(0, str.substr(0, max - suffix.length).lastIndexOf(' '))}${suffix}`;
}

module.exports = {
    readEntry,
    getRoomsAvailability,
    confirmBooking,
    substrInBetween,
    truncate
};
