// server/types/shims.d.ts
// Temporary shims to keep TS happy if node_modules types aren't available yet.
// Remove this file once @types/node and @types/multer are installed cleanly.

declare module "multer" {
  import type { RequestHandler } from "express";
  interface MulterOptions { storage?: any; fileFilter?: any; limits?: { fileSize?: number }; }
  interface DiskStorageOptions { destination?: any; filename?: any; }
  interface MulterInstance {
    (opts?: MulterOptions): any;
    single(field: string): RequestHandler;
    array(field: string, maxCount?: number): RequestHandler;
    fields(fields: { name: string; maxCount?: number }[]): RequestHandler;
    none(): RequestHandler;
  }
  interface MulterNamespace extends MulterInstance {
    diskStorage(opts: DiskStorageOptions): any;
  }
  const multer: MulterNamespace;
  export default multer;
}

declare module "fs" {
  const anything: any;
  export = anything;
}

declare module "path" {
  const anything: any;
  export = anything;
}

declare var process: any;
