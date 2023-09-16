// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");

// The Firebase Admin SDK to access Firestore.
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");

initializeApp();


function haversineDistance(geo1, geo2) {
    const R = 3958.8;
    const dLat = toRad(geo2.latitude - geo1.latitude);
    const dLon = toRad(geo2.longitude - geo1.longitude);
    const lat1 = toRad(geo1.latitude);
    const lat2 = toRad(geo2.latitude);
  
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
}

exports.foo = onDocumentCreated("/orders/{orderId}", async (event) => {
    const orderDocument = event.data.data();
    console.log("this is the orderId: " + orderId);

    if(orderDocument.isDelivery == false) {
        const listingDocument = await getFirestore()
            .collection("listings")
            .where("diningCourt", "==", orderDocument.diningCourt)
            .where("latestTime", ">=", orderDocument.timeListed)
            .orderBy("basePrice");
    }
    else{
        const listingDocument = await getFirestore()
            .collection("listings")
            .where("offersDelivery", "==", "isDelivery")
            .where("diningCourt", "==", orderDocument.diningCourt)
            .where("latestTime", ">=", orderDocument.timeListed)
        let validListings = [];
        for(let listing of listingDocument){
            let distanceToLocation = haversineDistance(locationTable[listing.diningCourt], orderDocument.location);
            if(distanceToLocation>range){
                continue;
            }
            let realPrice = listing.basePrice+distanceToLocation*listing.milePrice;
            listing.add(realPrice);
            validListings.append(listing);
        }
        validListings.orderBy("realPrice");
    }
        

});
