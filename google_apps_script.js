/**
 * Warikan Hub: Multi-User Roommate Mobile Sync Script
 * 
 * Paste this script inside your Google Sheet:
 * Extensions > Apps Script
 * Then Deploy as a Web App to create a secure endpoint.
 */

// 1. HANDLE RETRIEVING DATA (GET request from mobile phones to sync ledger)
function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const rows = sheet.getDataRange().getValues();
    
    // If sheet is empty or only has headers
    if (rows.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const headers = rows[0];
    const ledgerData = [];
    
    // Parse every row into a clean JSON array
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      // Parse dates safely
      let dateString = new Date().toISOString().slice(0, 10);
      if (row[5]) {
        try {
          dateString = new Date(row[5]).toISOString().slice(0, 10);
        } catch (err) {}
      }
      
      // Parse split assignments
      let assignedTo = "shared";
      const rawSplit = String(row[1]).toLowerCase();
      if (rawSplit.includes("bishnu")) assignedTo = "Bishnu";
      else if (rawSplit.includes("radha")) assignedTo = "Radha";
      
      // Parse paidBy and split details
      let paidBy = String(row[4]);
      if (paidBy.includes("Bishnu")) paidBy = "Bishnu";
      else if (paidBy.includes("Radha")) paidBy = "Radha";
      else if (paidBy.includes("Custom")) paidBy = "Custom";

      let paidB = row[7] ? parseInt(row[7]) || 0 : 0;
      let paidR = row[8] ? parseInt(row[8]) || 0 : 0;
      
      // Fallback 50/50 split for legacy Custom rows
      if (paidBy === "Custom" && paidB === 0 && paidR === 0) {
        const totalCost = parseInt(row[3]) || 0;
        paidB = Math.round(totalCost / 2);
        paidR = totalCost - paidB;
      }
      
      // Reconstruct transaction object
      ledgerData.push({
        store: String(row[0]) + (row[2] ? " - " + row[2] : ""), // Title + description
        assignedTo: assignedTo,
        cost: parseInt(row[3]) || 0,
        paidBy: paidBy,
        paidB: paidB,
        paidR: paidR,
        date: dateString,
        receiptId: row[6] ? String(row[6]) : "" // 7th Column: Receipt ID
      });
    }
    
    // Return ledger data as JSON
    return ContentService.createTextOutput(JSON.stringify(ledgerData))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Helper to find or create the Google Drive receipts folder
function getOrCreateFolder() {
  const folderName = "Warikan Receipts";
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  const newFolder = DriveApp.createFolder(folderName);
  // Set sharing to "Anyone with link can view" so roommate devices can load the images
  newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return newFolder;
}

// 2. HANDLE WRITING DATA (POST request when Bishnu or Radha adds/deletes/clears an expense)
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Set headers if empty sheet
    if (sheet.getLastRow() === 0) {
      const headers = ["Item Description", "Split Assignment", "Raw Description", "Cost (Yen)", "Paid By", "Date Added", "Receipt ID", "Bishnu Paid", "Radha Paid"];
      sheet.appendRow(headers);
      
      // Apply styling to header
      const headerRange = sheet.getRange(1, 1, 1, 9);
      headerRange.setFontWeight("bold");
      headerRange.setFontColor("#ffffff");
      headerRange.setBackgroundColor("#4f46e5");
      headerRange.setHorizontalAlignment("center");
      
      sheet.setColumnWidth(1, 200);
      sheet.setColumnWidth(2, 140);
      sheet.setColumnWidth(3, 260);
      sheet.setColumnWidth(4, 120);
      sheet.setColumnWidth(5, 120);
      sheet.setColumnWidth(6, 160);
      sheet.setColumnWidth(7, 180);
      sheet.setColumnWidth(8, 120);
      sheet.setColumnWidth(9, 120);
    }

    // A. HANDLE DELETION
    if (data.action === "delete") {
      const item = data.item;
      const rows = sheet.getDataRange().getValues();
      let deletedCount = 0;
      
      // Loop from bottom to top to find the most recent match and delete it
      for (let i = rows.length - 1; i >= 1; i--) {
        const row = rows[i];
        
        let dateString = "";
        if (row[5]) {
          try {
            dateString = new Date(row[5]).toISOString().slice(0, 10);
          } catch (err) {}
        }
        
        const rowStoreMerged = String(row[0]) + (row[2] ? " - " + row[2] : "");
        const rowCost = parseInt(row[3]) || 0;
        
        let rowPaidBy = String(row[4]);
        if (rowPaidBy.includes("Bishnu")) rowPaidBy = "Bishnu";
        else if (rowPaidBy.includes("Radha")) rowPaidBy = "Radha";
        else if (rowPaidBy.includes("Custom")) rowPaidBy = "Custom";
        
        if (rowStoreMerged === item.store &&
            rowCost === item.cost &&
            rowPaidBy === item.paidBy &&
            (dateString === item.date || !item.date)) {
          sheet.deleteRow(i + 1); // 1-indexed in spreadsheet
          deletedCount++;
          break; // Only delete the single matching record
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({status: "success", deletedCount: deletedCount}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // B. HANDLE CLEAR LEDGER
    if (data.action === "clear") {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.deleteRows(2, lastRow - 1);
      }
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Sheet cleared successfully"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // D. RETROACTIVELY UPLOAD OFFLINE PHOTO TO GOOGLE DRIVE
    if (data.action === "upload_photo") {
      Logger.log("Triggered upload_photo action for ID: " + data.receiptId);
      if (!data.receiptPhoto) {
        Logger.log("Error: No photo data provided");
        return ContentService.createTextOutput(JSON.stringify({status: "error", message: "No photo data provided"}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      try {
        const folder = getOrCreateFolder();
        Logger.log("Drive folder: " + folder.getName());
        const base64Data = data.receiptPhoto.split(',')[1] || data.receiptPhoto;
        const decoded = Utilities.base64Decode(base64Data);
        const blob = Utilities.newBlob(decoded, 'image/jpeg', 'receipt_' + Date.now() + '.jpg');
        
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        const fileId = file.getId();
        const photoLink = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1600";
        Logger.log("File uploaded to Drive successfully. Link: " + photoLink);
        
        // Find all rows matching the old local receiptId and update Column 7
        const rows = sheet.getDataRange().getValues();
        Logger.log("Total rows found in sheet: " + rows.length);
        let updatedCount = 0;
        for (let i = 1; i < rows.length; i++) {
          const sheetId = String(rows[i][6]).trim();
          const targetId = String(data.receiptId).trim();
          if (sheetId === targetId) {
            sheet.getRange(i + 1, 7).setValue(photoLink);
            updatedCount++;
            Logger.log("Match found at row " + (i + 1) + ". Updated Column G to: " + photoLink);
          }
        }
        Logger.log("Scan complete. Total rows updated: " + updatedCount);
        
        return ContentService.createTextOutput(JSON.stringify({
          status: "success", 
          photoLink: photoLink, 
          updatedRows: updatedCount
        })).setMimeType(ContentService.MimeType.JSON);
        
      } catch (err) {
        Logger.log("Crash inside upload_photo action: " + err.toString());
        return ContentService.createTextOutput(JSON.stringify({status: "error", message: err.toString()}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // E. HANDLE EDIT / UPDATE TRANSACTION
    if (data.action === "edit") {
      const originalItem = data.originalItem;
      const newItem = data.newItem;
      const rows = sheet.getDataRange().getValues();
      let updated = false;
      
      for (let i = rows.length - 1; i >= 1; i--) {
        const row = rows[i];
        
        let dateString = "";
        if (row[5]) {
          try {
            dateString = new Date(row[5]).toISOString().slice(0, 10);
          } catch (err) {}
        }
        
        const rowStoreMerged = String(row[0]);
        const rowCost = parseInt(row[3]) || 0;
        
        let rowPaidBy = String(row[4]);
        if (rowPaidBy.includes("Bishnu")) rowPaidBy = "Bishnu";
        else if (rowPaidBy.includes("Radha")) rowPaidBy = "Radha";
        else if (rowPaidBy.includes("Custom")) rowPaidBy = "Custom";
        
        if (rowStoreMerged === originalItem.store &&
            rowCost === originalItem.cost &&
            rowPaidBy === originalItem.paidBy &&
            (dateString === originalItem.date || !originalItem.date)) {
          
          const rowIndex = i + 1; // 1-indexed in sheet
          sheet.getRange(rowIndex, 1).setValue(newItem.store);
          sheet.getRange(rowIndex, 2).setValue(newItem.assignedTo);
          sheet.getRange(rowIndex, 3).setValue(newItem.description || "");
          sheet.getRange(rowIndex, 4).setValue(newItem.cost);
          sheet.getRange(rowIndex, 5).setValue(newItem.paidBy);
          sheet.getRange(rowIndex, 6).setValue(newItem.date);
          // Column 7 (Receipt ID) remains unchanged
          sheet.getRange(rowIndex, 8).setValue(newItem.paidB || 0);
          sheet.getRange(rowIndex, 9).setValue(newItem.paidR || 0);
          
          // Format alignments
          sheet.getRange(rowIndex, 4).setHorizontalAlignment("right"); // Cost
          sheet.getRange(rowIndex, 5).setHorizontalAlignment("center"); // Paid By
          sheet.getRange(rowIndex, 6).setHorizontalAlignment("center"); // Date
          sheet.getRange(rowIndex, 8).setHorizontalAlignment("right"); // Bishnu Paid
          sheet.getRange(rowIndex, 9).setHorizontalAlignment("right"); // Radha Paid
          
          updated = true;
          break; // Only update the first match
        }
      }
      return ContentService.createTextOutput(JSON.stringify({status: "success", updated: updated}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // C. DEFAULT: APPEND NEW TRANSACTION ROW
    let photoLink = data.receiptId || "";
    
    // If a base64 photo buffer is provided, save it directly to Google Drive
    if (data.receiptPhoto) {
      try {
        const folder = getOrCreateFolder();
        const base64Data = data.receiptPhoto.split(',')[1] || data.receiptPhoto;
        const decoded = Utilities.base64Decode(base64Data);
        const blob = Utilities.newBlob(decoded, 'image/jpeg', 'receipt_' + Date.now() + '.jpg');
        
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        const fileId = file.getId();
        photoLink = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1600";
      } catch (err) {
        Logger.log("Google Drive photo upload failed: " + err.toString());
      }
    }

    sheet.appendRow([
      data.store,
      data.assignedTo,
      data.description || "",
      data.cost,
      data.paidBy,
      data.date,
      photoLink, // Save either Google Drive direct download link or unique local ID
      data.paidB || 0, // Column 8: Bishnu Paid
      data.paidR || 0  // Column 9: Radha Paid
    ]);
    
    // Align values
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 4).setHorizontalAlignment("right"); // Cost
    sheet.getRange(lastRow, 5).setHorizontalAlignment("center"); // Paid By
    sheet.getRange(lastRow, 6).setHorizontalAlignment("center"); // Date
    sheet.getRange(lastRow, 7).setHorizontalAlignment("center"); // Receipt ID
    sheet.getRange(lastRow, 8).setHorizontalAlignment("right"); // Bishnu Paid
    sheet.getRange(lastRow, 9).setHorizontalAlignment("right"); // Radha Paid
    
    return ContentService.createTextOutput(JSON.stringify({status: "success"}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
