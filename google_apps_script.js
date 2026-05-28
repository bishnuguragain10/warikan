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
        date: dateString
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

// 2. HANDLE WRITING DATA (POST request when Bishnu or Radha adds an expense)
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Set headers if empty sheet
    if (sheet.getLastRow() === 0) {
      const headers = ["Item Description", "Split Assignment", "Raw Description", "Cost (Yen)", "Paid By", "Date Added"];
      sheet.appendRow(headers);
      
      // Apply styling to header
      const headerRange = sheet.getRange(1, 1, 1, 6);
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
    }
    
    // Append the row securely
    sheet.appendRow([
      data.store,
      data.assignedTo,
      data.description || "",
      data.cost,
      data.paidBy,
      data.date
    ]);
    
    // Align values
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 4).setHorizontalAlignment("right"); // Cost
    sheet.getRange(lastRow, 5).setHorizontalAlignment("center"); // Paid By
    sheet.getRange(lastRow, 6).setHorizontalAlignment("center"); // Date
    
    return ContentService.createTextOutput(JSON.stringify({status: "success"}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
