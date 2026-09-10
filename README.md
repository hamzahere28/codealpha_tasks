# CodeAlpha Ecommerce Store

A full-stack ecommerce storefront with a professional responsive UI, product catalog, authentication, cart, checkout, and order history.

## Live Demo

https://codealpha-ecommerce-store-5574484.netlify.app

## Features

- Responsive ecommerce storefront
- Product catalog with search and category filters
- Product detail modal
- Sign in and create account flow
- Shopping cart with quantity controls
- Checkout with address and payment selection
- Order history for signed-in users
- Netlify Functions API for products, auth, checkout, and orders

## Tech Stack

- HTML
- CSS
- JavaScript
- Node.js
- Netlify Functions

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Netlify Deployment

The project includes `netlify.toml` and a backend function at `netlify/functions/api.js`.

Build settings:

- Publish directory: `public`
- Functions directory: `netlify/functions`

