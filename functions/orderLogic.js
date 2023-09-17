// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");

// The Firebase Admin SDK to access Firestore.
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");

initializeApp();

// geo1, geo2 fields = latitude, longitude
// returns miles between two points
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

// map dining court to lat long
const locationTable = {
    "wiley": {"latitude": 40.42865980957039,"longitude": -86.92071621514745},
    "winsdor": {"latitude": 40.42758749736161, "longitude": -86.92044085397546},
    "hillenbrand": {"latitude": 40.42671182373336, "longitude": -86.92711379129472},
    "ford": {"latitude": 40.43219870311529, "longitude": -86.91946084396353},
    "earhart": {"latitude": 40.42572918099655, "longitude": -86.92510820350142}
}

// find seller on new order added to orders table
exports.findSeller = onDocumentCreated("/orders/{orderId}", async (event) => {
    const orderDocument = event.data.data();
    console.log("this is the orderId: " + orderId);
    // not delivery
    if(orderDocument.isDelivery == false) {
        const listingDocument = await getFirestore()
            .collection("listings")
            .where("diningCourt", "==", orderDocument.diningCourt)
            .where("latestTime", ">=", orderDocument.timeListed)
            .orderBy("basePrice")
            .get();
        // add potential matches to queuedJobs table
        let i = 0;
        let batch = await getFirestore().batch();
        listingDocument.forEach(async (listing) => {
            // listing["queueNum"] = i;
            let doc = {
                "listingId": listing.id,
                "queueNum" : i,
                "orderId": listing.orderId
            };
            const docRef = await getFirestore().collection("queuedJobs").doc();
            batch.set(docRef, doc);
        });
        batch.commit().then(() => {
            console.log("Added potential matches to queuedJobs table for ", orderId);
        });
    }
    // delivery selected
    else{
        // get potential orders
        const listingDocument = await getFirestore()
            .collection("listings")
            .where("offersDelivery", "==", "isDelivery")
            .where("diningCourt", "==", orderDocument.diningCourt)
            .where("latestTime", ">=", orderDocument.timeListed)
            .get();

        // checking if order is within range
        let validListings = [];
        for(let listing of listingDocument){
            let distanceToLocation = haversineDistance(locationTable[listing.diningCourt], orderDocument.location);
            // if we are within range, append listing to validListings
            if(distanceToLocation <= listing.range){
                let realPrice = listing.basePrice + distanceToLocation * listing.milePrice;
                listing["realPrice"] = realPrice;
                validListings.append(listing);
            }
        }
        // sort by price ascending
        function sortByKey(array, key) {
            return array.sort(function(a, b) {
                var x = a[key]; var y = b[key];
                return ((x < y) ? -1 : ((x > y) ? 1 : 0));
            });
        }
        sortByKey(validListings, "realPrice")

        // add potential matches to queuedJobs table
        let i = 0;
        let batch = await getFirestore().batch();
        validListings.forEach(async (listing) => {
            // listing["queueNum"] = i;
            let doc = {
                "listingId": listing.id,
                "queueNum" : i,
                "orderId": listing.orderId
            };
            const docRef = await getFirestore().collection("queuedJobs").doc();
            batch.set(docRef, doc);
        });
        batch.commit().then(() => {
            console.log("Added potential matches to queuedJobs table for ", orderId);
        });
    }
    
});


/*
Up until this point we have code that can:
 - Wait for an order to appear in the orders table
 - Logic to match the order to sellers
 - Put the sellers in the queuedJobs table as a listing with an extra new field (queueNumber)
 
 Now every seller client (frontend) would listen for changes to the queuedJobs table:
 every a doc is added queuedJobs is added:
 - check if it is this client's listing (check if diningCourt and sellerID match any of client's listings)
 - if it is my listing and queueNum == 0, then display accept/reject in UI
 - once they click accept or reject hit the following endpoint:
*/

// REST API endpoint the client would hit to say whether they accept a job or not.
exports.sellerAccepted = onRequest(async (req, res) => {
    /*
    Schema of res (passed from client)
    req = {
        sellerId: sellerId,
        orderId: orderId,
        listingId: listingId,
        accepted: true/false
    }*/

    const sellerId = res.query.sellerId;
    const orderId = res.query.orderId;
    const listingId = res.query.listingId;

    // order accepted!
    if(res.query.accepted){
        // remove every queuedJobs doc with orderId
        let batch = await getFirestore().batch();
        const queuedJobsToRemove = await getFirestore().collection("queuedJobs")
        .where("orderId","==", orderId)
        .get();
        queuedJobsToRemove.forEach(async (doc) => {
            batch.delete(doc.ref, doc);
        })
        batch.commit().then(() => {
            console.log("Removed every doc from queuedJobs with orderId ", orderId);
        });

        // remove this listing from listings (query for sellerId, dining court to narrow down )
        const res = await getFirestore().collection("listings").doc(listingId).delete();
        // const listingsToRemove = await getFirestore().collection("listings")
        // .where("listingId", "==", listingId);
        // listingsToRemove.forEach(async (doc) => {
        // });
        
        // update order.status -> pending and order.sellerId -> sellerId
        const res1 = await getFirestore().collection("orders").doc(orderId).update({status: "pending", sellerId: sellerId});
    }
    // order rejected
    else{
        // go to the next guy
        // decrement all the q numebrs for a given order id
        let batch = await getFirestore().batch();

        const ordersToUpdate = await getFirestore().collection("orders")
        .where("orderId", "==", "orderId")
        .get();

        ordersToUpdate.forEach(async (doc) => {
            batch.update(doc.ref, {queueNum: queueNum-1})
        });

        batch.commit().then(() => {
            console.log("Decremented all q numbers for order id ", orderId);
        });


        // orders.where("orderId", "==", orderId).get().then(snapshots => {
        //     if(snapshots.size > 0) {
        //         snapshots.forEach(orderItem => {
        //             orders.doc(orderItem.id).update({queueNum: queueNum + 1})
        //         })
        //     }
        // });
    }
});