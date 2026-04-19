const admin = require("firebase-admin");

const serviceAccount = {
  projectId: "worshipflow-1fbe0",
  clientEmail: "firebase-adminsdk-fbsvc@worshipflow-1fbe0.iam.gserviceaccount.com",
  privateKey: `-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDUl0cWPGgFNCMc\nJ2TVXgg7U3j9Lp9NQieTFwPnK+FFCo3yC7g8mN/xOH1rykjgQOp6QaVTxsB4Lcee\nWUqImD40eVIFjSi89TJGdAmrtDf6TsUqR/UgtxwU3EoiPMD8t819KWkEfEsNc4wL\npmoK9GxHjALu5mCjCdgJGObjet2eiwJk04vTiDhnN4mboFWg5tX/cjQwADwx6FXQ\nO20rxL6k+/cqQuKiDNnCHZWqhTmxhuUEpuF64ZL2xd4u3f6Q7A/WMdcu9E90Wwc2\nrUF3jk3Aq7cKL4ZpR/VfzINfvZNdpHCaK6Ovj3PYxY0XiQzywCOGggcwguoI+O0q\nqF+tHGtbAgMBAAECggEAA4rKqlQ3IkhlRkyVEY4/o1Sd9G11eQrFxfdFcFf8/iG8\nUlUF/c3RnawklcX1xVvZI8gC1J/zURf42KqfeJmBl4/m3Nx7wJW2f8TiuQgL22Sp\nmb6VH5NSz7D4FgxJTBl4T1eIl9n5HtRsRNcoXYApjQldjFichyA+w1pw9zZ7b9Vu\nM8M+pdzlYk+9sdqvCWc2gKgXQQvD8HhuHxKVcu92YYEvq28Gu01tgc6H5NTf+6hC\nboUW6os4K4A+13e6cQulYUI+1jsJEW5AGqqEe+gU87MOIjn5Pd4jCudhc31Uzc6h\n+4+Eb10jwPqp+pMyxaf7bdZTMuXJnh1E+N1fGlfdJQKBgQDrTpUuZ1W1dT81WJ8N\nPB58jXYp2uokMq7IHcRKfRYWrEzWOh9I1KuDQErhW4WjG/SFfih2Ftu/PwV9OiOk\n6h41vO9brQ1PxM617E9bXt0ogPWgpXWg6ixZWAheoKtEZU61/ShRfV0MXsPk0EyZ\nWO9TAAEbz0aWDIb6js/4ng7qrQKBgQDnSUsjr66e23s/F82JTCGjYQM+MoZ+yE2F\nl7ryKB6C3A0XFkCF6kHNuCI/3RFy9yKuVUWvPMruwG4QnEnvMOROJyHve342ZW3/\nEZibN/tk9VBtQe8DJLaKThOxCrivDskbVjZYC704LY02nOfY06mgp/oHu9+Ei77M\n0yOsSwm3JwKBgQDnkNMQ8pKPW84Tgp4r2SErc894iz5m1xXYTCrzHzxQncmT/Wjy\nNJCBPxExy+6swQMXKDtLU114TN3rCf8v+VI3kjKAJsJ14PmIYQELq0S76oVPTeV/\nsVRprE+4SCejzIr0YCmAYH3kgZIIqNDpDHOhW9y7cHVHjxZ6l3aldW66lQKBgQDl\n6AuTK73PF6nJq+WaR11gxLyuhRcAzCeTVqJ0uMCroAY7HtmAxL4oupMBHMWNnHCT\nDxy39xxafFpslI9B/z3TGj83iXCKrgTLejhSgzGYx+ns0Y+/di0mCjq00E2JZo8u\nZ2KZ3wF26IDo+svU04JYuuFl8rFbVnaRsIhTajv8HQKBgD+UDZzt+5+SXiWTqn+i\nhCKZOUfzfq6zPsr5JsDKO+mTV4wCY3Hc+TA+Up0gh7kVWL8md40MjocExwVXv0W/\nXdfYAjoTKV6Lqj97KsUjaCG0VpQdnQineEAYHXPnj65bCM8XzHISMuf2f0V6fpJM\nET1jipbJwisOtR/iR/Sm/fLY\n-----END PRIVATE KEY-----\n`,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function checkPersonalNotes() {
  console.log("🔍 Fetching all users from Firestore...\n");

  // Get all users
  const usersSnap = await db.collection("users").get();

  if (usersSnap.empty) {
    console.log("No users found in the database.");
    return;
  }

  const results = [];

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const userId = userDoc.id;
    const displayName = userData.name || userData.displayName || userData.email || userId;

    // Check if this user has any personal notes
    const notesSnap = await db
      .collection("users")
      .doc(userId)
      .collection("personalNotes")
      .limit(1)
      .get();

    const hasNotes = !notesSnap.empty;

    if (hasNotes) {
      // Count total notes
      const allNotesSnap = await db
        .collection("users")
        .doc(userId)
        .collection("personalNotes")
        .get();
      const noteCount = allNotesSnap.docs.filter(d => !d.data().deletedAt).length;
      results.push({ name: displayName, email: userData.email || "—", noteCount });
    }
  }

  console.log("=".repeat(55));
  console.log("  TEAM MEMBERS WHO HAVE SAVED PERSONAL NOTES");
  console.log("=".repeat(55));

  if (results.length === 0) {
    console.log("\n  No team member has saved a personal note yet.\n");
  } else {
    results.forEach((r, i) => {
      console.log(`\n  ${i + 1}. ${r.name}`);
      console.log(`     Email     : ${r.email}`);
      console.log(`     Notes     : ${r.noteCount} note(s) saved`);
    });
    console.log(`\n  Total: ${results.length} member(s) with personal notes`);
  }

  console.log("\n" + "=".repeat(55));
  console.log("  (Note contents are private and not shown here)");
  console.log("=".repeat(55) + "\n");
}

checkPersonalNotes().catch(console.error).finally(() => process.exit(0));
