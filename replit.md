# Restaurant Task Management System

## Overview

This is a full-stack web application designed for restaurant task management, built with React (TypeScript), Express.js, and PostgreSQL. The system enables restaurant staff to manage tasks, check-in via QR codes, track completion times, and generate reports. It features role-based access control and real-time updates via WebSockets.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for client-side routing
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Module System**: ES modules (type: "module" in package.json)
- **Real-time Communication**: WebSocket server for live updates
- **Session Management**: Express sessions with in-memory storage
- **File Upload**: Multer for handling image uploads
- **API Design**: RESTful API with role-based endpoints

### Database Layer
- **Primary Database**: PostgreSQL with Neon serverless driver
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Management**: Drizzle migrations in `/migrations` directory
- **Connection Pooling**: Neon serverless connection pool

## Key Components

### Authentication & Authorization
- **Multi-modal Authentication**: Email/password for admins, PIN-based for employees
- **Role-based Access Control**: Four roles (master_admin, admin, store_manager, employee)
- **QR Code Check-in**: Location-based verification for store access
- **Session-based Authentication**: Express sessions with secure cookies

### Task Management System
- **Task Templates**: Reusable task definitions with estimated durations
- **Dynamic Task Creation**: Tasks generated from templates with scheduling
- **Status Tracking**: Comprehensive lifecycle (pending → available → claimed → completed)
- **Photo Requirements**: Configurable photo capture for task verification
- **Geolocation Validation**: Location-based task claiming and completion

### Real-time Features
- **WebSocket Integration**: Live task updates and notifications
- **Connection Management**: User-specific WebSocket connections
- **Event Broadcasting**: Task status changes, assignments, and completions

### File Upload System
- **Image Processing**: Photo upload with geolocation stamping
- **Storage**: Local file storage in `/uploads` directory
- **Validation**: File type and size restrictions (10MB max, images only)

## Data Flow

### Task Lifecycle
1. **Template Creation**: Admins define reusable task templates
2. **Task Generation**: Tasks created from templates with specific scheduling
3. **Assignment**: Tasks assigned to roles or specific users
4. **Claiming**: Available tasks claimed by eligible employees
5. **Execution**: Tasks marked in-progress with optional photo requirements
6. **Completion**: Tasks completed with validation and photo verification

### Authentication Flow
1. **Login**: Email/password or PIN-based authentication
2. **Session Creation**: Server-side session establishment
3. **QR Verification**: Store-specific QR code scanning for location verification
4. **Check-in**: Geolocation-based store check-in process

### Real-time Updates
1. **WebSocket Connection**: Client establishes authenticated WebSocket connection
2. **Event Subscription**: User subscribes to relevant task and notification events
3. **Server Broadcasting**: Server broadcasts updates to connected clients
4. **Client State Sync**: React Query cache updates from WebSocket events

## External Dependencies

### Core Framework Dependencies
- **@neondatabase/serverless**: PostgreSQL serverless connection
- **drizzle-orm**: Type-safe database operations
- **@tanstack/react-query**: Server state management
- **@radix-ui/***: Accessible UI primitives for shadcn/ui
- **wouter**: Lightweight client-side routing

### Utility Libraries
- **bcrypt**: Password hashing and verification
- **qrcode**: QR code generation for store check-ins
- **pdf-lib**: PDF generation for QR code printouts
- **multer**: File upload handling
- **ws**: WebSocket server implementation

### Development Tools
- **vite**: Build tool and development server
- **tsx**: TypeScript execution for development
- **esbuild**: Production build bundling
- **tailwindcss**: Utility-first CSS framework

## Deployment Strategy

### Build Process
- **Frontend**: Vite builds React app to `/dist/public`
- **Backend**: esbuild bundles server code to `/dist/index.js`
- **Assets**: Static files served from build output directory

### Environment Configuration
- **Database**: Requires `DATABASE_URL` environment variable
- **Session Security**: Uses `SESSION_SECRET` for session encryption
- **Development Mode**: Automatic Vite dev server integration

### Production Considerations
- **Static File Serving**: Express serves built frontend in production
- **WebSocket Integration**: WebSocket server runs alongside HTTP server
- **Database Migrations**: Drizzle push command for schema updates
- **File Storage**: Local upload directory requires persistent storage

### Replit-Specific Features
- **Development Banner**: Replit development mode indicator
- **Runtime Error Overlay**: Development error reporting
- **Cartographer Integration**: Replit code mapping for debugging