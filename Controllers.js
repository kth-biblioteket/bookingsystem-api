require('dotenv').config()

const eventModel = require('./Models');

const axios = require('axios')
const fs = require("fs");
const path = require('path');


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

        //Gå igenom alla rum och kontrollera om status för aktuell timme
        let roomjson;
        //for(i=0 ; i < rooms.length; i++) {
        rooms.forEach(async room => {
            let status;
            //Hämta aktuellt rums bokningar för angiven timme(via timestamp)
            let roombooking = await eventModel.readBookingsForHour(req.params.system, room.id, req.params.timestamp)
            //om timmen i timestamp är utanför öppettider(<$area->morningstarts ELLER >$area->eveningends) för rummen så returnera status unavailable
            let timestamphour = new Date(1590127200 * 1000).toLocaleTimeString("sv-SE")
            if(timestamphour < area.morningstarts || timestamphour > area.eveningends ){
                roomjson = {'room_number' : room.room_number, 'room_name' : room.room_name, 'disabled' : room.disabled, 'availability' : true, 'status' : 'unavailable'};
            } else {
                if (roombooking){
                    roomjson = {'room_number' : room.room_number, 'room_name' : room.room_name, 'disabled' : room.disabled, 'availability' : true, 'status' : 'unavailable'};
                } else {
                    //4=preliminär, 0=kvitterad
                    if (roombooking.status == 0 ){
                        // om type = "C" så returnera status unavailable
                        if (roombooking.type == 'C' ){
                            status = "unavailable";
                        } else {
                            status = "confirmed";
                        } 
                    }
                    if (roombooking.status == 4 ){
                        //om inom 15 minuter före/efter starttiden
                        //if ($timestamp > $roomwithroomname->start_time -15*60 && $timestamp < $roomwithroomname->start_time +15*60) {
                        if (req.params.timestamp < roombooking.start_time +15*60) {
                            status = "tobeconfirmed";
                        } else {
                            status = "tentative";
                        }
                    }
                    roomjson = {'room_number' : room.room_number, 'room_name' : room.room_name, 'disabled' : room.disabled, 'availability' : false, 'status' : status};
                }
            }
        });

        res.send(roomjson)
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

function truncate(str, max, suffix) {
    return str.length < max ? str : `${str.substr(0, str.substr(0, max - suffix.length).lastIndexOf(' '))}${suffix}`;
}

module.exports = {
    readEntry,
    getRoomsAvailability,
    substrInBetween,
    truncate
};
