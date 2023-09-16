// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");

// The Firebase Admin SDK to access Firestore.
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");

initializeApp();

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
    const listingsDocument = await getFirestore()
        .collection("listings");
        .where("offersDelivery", "==", "isDelivery")

})