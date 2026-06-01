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
      
      // Reconstruct transaction object
      ledgerData.push({
        store: String(row[0]) + (row[2] ? " - " + row[2] : ""), // Title + description
        assignedTo: assignedTo,
        cost: parseInt(row[3]) || 0,
        paidBy: String(row[4]).includes("Bishnu") ? "Bishnu" : "Radha",
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

// 2. HANDLE WRITING DATA (POST request when Bishnu or Radha adds/deletes/clears an expense)
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Set headers if empty sheet
    if (sheet.getLastRow() === 0) {
      const headers = ["Item Description", "Split Assignment", "Raw Description", "Cost (Yen)", "Paid By", "Date Added", "Receipt ID"];
      sheet.appendRow(headers);
      
      // Apply styling to header
      const headerRange = sheet.getRange(1, 1, 1, 7);
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
        const rowPaidBy = String(row[4]).includes("Bishnu") ? "Bishnu" : "Radha";
        
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
    
    // C. DEFAULT: APPEND NEW TRANSACTION ROW
    sheet.appendRow([
      data.store,
      data.assignedTo,
      data.description || "",
      data.cost,
      data.paidBy,
      data.date,
      data.receiptId || "" // Store local unique Receipt ID association if present
    ]);
    
    // Align values
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 4).setHorizontalAlignment("right"); // Cost
    sheet.getRange(lastRow, 5).setHorizontalAlignment("center"); // Paid By
    sheet.getRange(lastRow, 6).setHorizontalAlignment("center"); // Date
    sheet.getRange(lastRow, 7).setHorizontalAlignment("center"); // Receipt ID
    
    return ContentService.createTextOutput(JSON.stringify({status: "success"}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
