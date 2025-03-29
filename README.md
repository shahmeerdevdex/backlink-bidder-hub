
# Auction Platform

A modern web application for online auctions with real-time bidding, user authentication, and payment processing.

## Project Overview

This is a full-stack auction platform built with React, TypeScript, and Supabase. The application allows users to:

- Browse available auctions
- Create new auctions
- Place bids on active auctions
- Process payments for won auctions
- Manage their auction listings and bids
- Receive notifications about bid activity

## Technology Stack

- **Frontend**: React with TypeScript, Vite
- **UI Components**: shadcn/ui, Tailwind CSS
- **State Management**: React Query for server state
- **Authentication**: Supabase Auth (email, GitHub, Google)
- **Database**: PostgreSQL via Supabase
- **Payments**: Stripe integration
- **Real-time Updates**: Supabase Realtime

## Project Structure

### Core Components

- **AuthProvider.tsx**: Manages user authentication state and provides auth context to the application
- **AuctionCard.tsx**: Displays auction information in a card format
- **NavBar.tsx**: Navigation bar with authentication status and links
- **ProtectedRoute.tsx**: Wrapper component to restrict access to authenticated users
- **Notifications.tsx**: Handles user notifications for bidding activity

### Pages

- **Index.tsx**: Home page with auction listings
- **Auth.tsx**: Authentication page with sign in/sign up functionality
- **AuctionDetail.tsx**: Detailed view of a single auction with bidding functionality
- **AuctionManagement.tsx**: Interface for users to manage their auctions
- **AdminDashboard.tsx**: Dashboard for administrators to manage the platform
- **PaymentPage.tsx**: Payment processing for auction winners
- **UserDashboard.tsx**: User dashboard to view bidding history and notifications
- **PasswordRecovery.tsx**: Password reset functionality

### Backend Services (Supabase)

- **Database Tables**: 
  - `auctions`: Stores auction details
  - `bids`: Records user bids
  - `profiles`: User profile information
  - `notifications`: User notification system
  - `payments`: Payment records
  - `auction_winners`: Records of auction winners

- **Edge Functions**:
  - `process-missed-payments`: Handles missed payment deadlines
  - `create-checkout-session`: Creates Stripe checkout sessions
  - `stripe-webhook`: Processes Stripe payment webhooks
  - `bid-notification-email`: Sends email notifications for bid activity
  - `process-auction-winners`: Determines auction winners

## Authentication

The application supports multiple authentication methods:

- Email/Password with email verification
- GitHub OAuth integration
- Google OAuth integration

The authentication flow is managed by the `AuthProvider` component, which provides context for user authentication status throughout the application.

## Auction System

### Auction Lifecycle

1. **Creation**: Auctions are created with title, description, starting price, and end date
2. **Active Period**: Users can place bids during this period
3. **Ending**: When an auction ends, winners are determined
4. **Payment**: Winners must complete payment within a set timeframe
5. **Completed/Failed**: Auction is marked as completed after payment or failed if payment deadline is missed

### Bidding System

- Users can place bids on active auctions
- Each auction has a `max_spots` parameter determining how many winners can be selected
- Winners are determined by highest bid amounts
- If a winner fails to complete payment, the next highest bidder is selected

## Payment Processing

Payment is handled through Stripe integration:

1. When a user wins an auction, they receive a notification
2. The user navigates to the payment page
3. A Stripe checkout session is created
4. Upon successful payment, the auction win is confirmed
5. If payment is missed, the slot becomes available to the next highest bidder

## Admin Features

Administrators have access to:

- User management (including ban functionality)
- Auction management
- Transaction history
- System statistics

## Deployment

The application can be deployed through Lovable's publishing feature or connected to a custom domain.

## Getting Started

### Development Environment

```sh
# Clone the repository
git clone <repository-url>

# Navigate to project directory
cd auction-platform

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Configuration

The application requires a connected Supabase project with the following environment variables:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_PUBLISHABLE_KEY`: Your Supabase anon/public key
- `STRIPE_SECRET_KEY`: For payment processing
- `STRIPE_WEBHOOK_SECRET`: For secure webhook handling

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
