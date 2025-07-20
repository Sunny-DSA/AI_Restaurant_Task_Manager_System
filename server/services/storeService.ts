import { storage } from "../storage";
import { InsertStore } from "@shared/schema";
import QRCode from "qrcode";
import crypto from "crypto";

export class StoreService {
  static async createStore(storeData: InsertStore) {
    const store = await storage.createStore(storeData);
    
    // Generate QR code for the new store
    await this.generateQRCode(store.id);
    
    return store;
  }
  
  static async generateQRCode(storeId: number) {
    const store = await storage.getStore(storeId);
    if (!store) {
      throw new Error("Store not found");
    }
    
    // Generate secret token
    const secret = crypto.randomBytes(32).toString("hex");
    
    // QR code contains store ID and secret
    const qrData = {
      storeId: store.id,
      secret,
      version: 1,
    };
    
    const qrCodeData = JSON.stringify(qrData);
    const qrCode = await QRCode.toDataURL(qrCodeData);
    
    // Set expiration (30 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    // Update store with new QR code
    await storage.updateStore(storeId, {
      qrCode,
      qrCodeSecret: secret,
      qrCodeExpiresAt: expiresAt,
    });
    
    return qrCode;
  }
  
  static async verifyQRCode(qrData: string): Promise<{ storeId: number; isValid: boolean }> {
    try {
      const parsed = JSON.parse(qrData);
      const { storeId, secret } = parsed;
      
      if (!storeId || !secret) {
        return { storeId: 0, isValid: false };
      }
      
      const store = await storage.getStore(storeId);
      if (!store || !store.qrCodeSecret || !store.qrCodeExpiresAt) {
        return { storeId, isValid: false };
      }
      
      // Check if QR code is expired
      if (new Date() > store.qrCodeExpiresAt) {
        return { storeId, isValid: false };
      }
      
      // Verify secret
      const isValid = crypto.timingSafeEqual(
        Buffer.from(store.qrCodeSecret),
        Buffer.from(secret)
      );
      
      return { storeId, isValid };
    } catch (error) {
      return { storeId: 0, isValid: false };
    }
  }
  
  static async validateGeofence(
    storeId: number,
    userLatitude: number,
    userLongitude: number
  ): Promise<{ isValid: boolean; distance?: number; allowedRadius?: number }> {
    const store = await storage.getStore(storeId);
    if (!store || !store.latitude || !store.longitude) {
      return { isValid: false };
    }
    
    const distance = this.calculateDistance(
      Number(store.latitude),
      Number(store.longitude),
      userLatitude,
      userLongitude
    );
    
    const allowedRadius = store.geofenceRadius || 100; // default 100 meters
    const isValid = distance <= allowedRadius;
    
    return {
      isValid,
      distance: Math.round(distance),
      allowedRadius,
    };
  }
  
  private static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
  
  static async getStoreStats(storeId: number) {
    const [taskStats, userStats] = await Promise.all([
      storage.getTaskStats(storeId),
      storage.getUserStats(storeId),
    ]);
    
    return {
      ...taskStats,
      ...userStats,
    };
  }
}
