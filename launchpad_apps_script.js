// launchpad_apps_script.js
// Paste this script inside your Google Sheets Extensions > Apps Script panel to link your Premium Web Launchpad.

// 1. GET REQUEST: Serves saved web platforms to the dashboard (Two-Way Sync - JSONP Compatible)
function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const range = sheet.getDataRange();
    const rows = range.getValues();
    const formulas = range.getFormulas();
    
    // If empty or only headers
    if (rows.length <= 1) {
      return respondJson([], e);
    }
    
    const platforms = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const formula = formulas[i] ? formulas[i][3] : "";
      
      // Parse formula URL if present (extracts URL from =HYPERLINK("url", "text"))
      let url = String(row[3]);
      if (formula && formula.includes("HYPERLINK")) {
        const match = formula.match(/"([^"]+)"/);
        if (match && match[1]) {
          url = match[1];
        }
      }
      
      platforms.push({
        title: String(row[0]),
        category: String(row[1]),
        description: String(row[2]),
        url: url,
        domain: String(row[4]),
        timestamp: row[5] ? new Date(row[5]).toISOString() : new Date().toISOString(),
        isFavorite: row[6] ? (String(row[6]).toLowerCase() === "true") : false
      });
    }
    
    return respondJson(platforms, e);
      
  } catch (error) {
    return respondJson({status: "error", message: error.toString()}, e);
  }
}

// Helper to support both standard JSON and CORS-safe JSONP
function respondJson(data, e) {
  const jsonString = JSON.stringify(data);
  const callback = e && e.parameter && e.parameter.callback;
  
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + jsonString + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    return ContentService.createTextOutput(jsonString)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. POST REQUEST: Saves, edits, deletes, or favorites websites from Chrome Extension or Mobile browser (Duplicate-Safe)
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Set headers if empty sheet
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Website Name", "Category", "Description", "Clickable Launch Link", "Domain Key", "Date Added", "Favorite"]);
      sheet.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#e0e7ff");
    }
    
    // 1. ACTION: FAVORITE
    if (data.action === "favorite") {
      const rows = sheet.getDataRange().getValues();
      let updated = false;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][4]).toLowerCase() === String(data.domain).toLowerCase()) {
          sheet.getRange(i + 1, 7).setValue(data.isFavorite ? "TRUE" : "FALSE");
          updated = true;
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Favorite updated"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 2. ACTION: DELETE
    if (data.action === "delete") {
      const rows = sheet.getDataRange().getValues();
      let deletedCount = 0;
      for (let i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][4]).toLowerCase() === String(data.domain).toLowerCase()) {
          sheet.deleteRow(i + 1);
          deletedCount++;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: `Deleted ${deletedCount} rows`}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 3. ACTION: EDIT / UPDATE
    if (data.action === "edit") {
      const rows = sheet.getDataRange().getValues();
      let updated = false;
      const originalDomain = data.originalDomain || data.domain;
      
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][4]).toLowerCase() === String(originalDomain).toLowerCase()) {
          const rowIndex = i + 1;
          const linkFormula = `=HYPERLINK("${data.url}", "Launch Site")`;
          
          sheet.getRange(rowIndex, 1).setValue(data.title);
          sheet.getRange(rowIndex, 2).setValue(data.category);
          sheet.getRange(rowIndex, 3).setValue(data.description);
          sheet.getRange(rowIndex, 4).setValue(linkFormula);
          sheet.getRange(rowIndex, 5).setValue(data.domain);
          sheet.getRange(rowIndex, 6).setValue(new Date(data.timestamp).toLocaleString());
          sheet.getRange(rowIndex, 7).setValue(data.isFavorite ? "TRUE" : "FALSE");
          
          updated = true;
          break;
        }
      }
      
      if (updated) {
        return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Platform updated in sheet"}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // 4. FALLBACK: STANDARD DUPLICATE-SAFE ADD
    const rows = sheet.getDataRange().getValues();
    let isDuplicate = false;
    let duplicateRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][4]).toLowerCase() === String(data.domain).toLowerCase()) {
        isDuplicate = true;
        duplicateRowIndex = i + 1;
        break;
      }
    }
    
    if (isDuplicate) {
      sheet.getRange(duplicateRowIndex, 1).setValue(data.title);
      sheet.getRange(duplicateRowIndex, 3).setValue(data.description);
      sheet.getRange(duplicateRowIndex, 6).setValue(new Date(data.timestamp).toLocaleString());
      sheet.getRange(duplicateRowIndex, 7).setValue(data.isFavorite ? "TRUE" : "FALSE");
      
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Duplicate domain updated"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const linkFormula = `=HYPERLINK("${data.url}", "Launch Site")`;
    sheet.appendRow([
      data.title,
      data.category,
      data.description,
      linkFormula,
      data.domain,
      new Date(data.timestamp).toLocaleString(),
      data.isFavorite ? "TRUE" : "FALSE"
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({status: "success"}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
