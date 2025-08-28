// client/src/types/zxing.d.ts
declare module "@zxing/library" {
  // Minimal shape we use in the login page
  export interface Result {
    getText(): string;
  }
  export type BarcodeFormat = any;
  export type BarcodeStringFormat = any;
}
