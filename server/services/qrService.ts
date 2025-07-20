import QRCode from "qrcode";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { storage } from "../storage";

export class QRService {
  static async generateStorePDF(storeId: number): Promise<Buffer> {
    const store = await storage.getStore(storeId);
    if (!store || !store.qrCode) {
      throw new Error("Store or QR code not found");
    }
    
    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Add header
    page.drawText("RestaurantTask Check-In", {
      x: 50,
      y: 750,
      size: 24,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    
    // Add store information
    page.drawText(`Store: ${store.name}`, {
      x: 50,
      y: 700,
      size: 16,
      font: boldFont,
    });
    
    if (store.address) {
      page.drawText(`Address: ${store.address}`, {
        x: 50,
        y: 675,
        size: 12,
        font,
      });
    }
    
    // Add instructions
    const instructions = [
      "To check in and access your tasks:",
      "1. Open the RestaurantTask app on your mobile device",
      "2. Tap 'Scan QR Code' or use your device's camera",
      "3. Point your camera at the QR code below",
      "4. Enter your 4-digit PIN when prompted",
      "5. You'll see your assigned tasks and can start working",
    ];
    
    instructions.forEach((instruction, index) => {
      page.drawText(instruction, {
        x: 50,
        y: 620 - (index * 20),
        size: 10,
        font: index === 0 ? boldFont : font,
      });
    });
    
    // Convert QR code data URL to buffer and embed
    const qrCodeBuffer = Buffer.from(
      store.qrCode.replace(/^data:image\/png;base64,/, ""),
      "base64"
    );
    
    const qrImage = await pdfDoc.embedPng(qrCodeBuffer);
    const qrDims = qrImage.scale(2); // Scale to 2x for better quality
    
    // Center the QR code
    const pageWidth = page.getWidth();
    const qrX = (pageWidth - qrDims.width) / 2;
    
    page.drawImage(qrImage, {
      x: qrX,
      y: 300,
      width: qrDims.width,
      height: qrDims.height,
    });
    
    // Add footer with generation info
    const now = new Date();
    page.drawText(`Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, {
      x: 50,
      y: 50,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    if (store.qrCodeExpiresAt) {
      page.drawText(`Expires: ${store.qrCodeExpiresAt.toLocaleDateString()}`, {
        x: 50,
        y: 35,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
    
    // Add warning about security
    page.drawText("⚠️ Keep this QR code secure - it provides access to your store's task system", {
      x: 50,
      y: 20,
      size: 8,
      font: boldFont,
      color: rgb(0.8, 0.3, 0.3),
    });
    
    return Buffer.from(await pdfDoc.save());
  }
  
  static async generateMultipleQRCodes(storeId: number, count: number = 3): Promise<Buffer> {
    const store = await storage.getStore(storeId);
    if (!store || !store.qrCode) {
      throw new Error("Store or QR code not found");
    }
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Add header
    page.drawText(`${store.name} - Check-In QR Codes`, {
      x: 50,
      y: 750,
      size: 16,
      font: boldFont,
    });
    
    const qrCodeBuffer = Buffer.from(
      store.qrCode.replace(/^data:image\/png;base64,/, ""),
      "base64"
    );
    
    const qrImage = await pdfDoc.embedPng(qrCodeBuffer);
    
    // Create multiple QR codes on the page
    const qrSize = 150;
    const pageWidth = page.getWidth();
    const spacing = 50;
    
    for (let i = 0; i < count && i < 6; i++) { // Max 6 QR codes per page
      const row = Math.floor(i / 2);
      const col = i % 2;
      
      const x = 50 + col * (qrSize + spacing * 2);
      const y = 600 - row * (qrSize + spacing);
      
      page.drawImage(qrImage, {
        x,
        y,
        width: qrSize,
        height: qrSize,
      });
      
      // Add label
      page.drawText(`Station ${i + 1}`, {
        x: x + qrSize / 2 - 25,
        y: y - 20,
        size: 10,
        font: boldFont,
      });
    }
    
    return Buffer.from(await pdfDoc.save());
  }
}
