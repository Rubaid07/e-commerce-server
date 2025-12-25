# 🛒 E-commerce REST API

A production-ready REST API for an e-commerce platform built with Node.js, Express, MongoDB Atlas, and Firebase Admin SDK.

## ✨ Features

| Module     | End-points                                                                                              | Auth         | Notes                          |
|------------|---------------------------------------------------------------------------------------------------------|--------------|--------------------------------|
| Products   | `GET /api/products` <br> `GET /api/products/:id`                                                       | ❌ Public    | Public catalogue               |
|            | `POST /api/products` <br> `PUT /api/products/:id` <br> `DELETE /api/products/:id`                       | ✅ Admin only| CRUD operations                |
| Orders     | `POST /api/orders`                                                                                      | ✅ User      | Create order                   |
|            | `GET /api/orders` <br> `GET /api/orders/:id` <br> `PUT /api/orders/:id` <br> `DELETE /api/orders/:id` <br> `GET /api/orders/stats` | ✅ Admin only | Manage orders & analytics      |
| Wishlist   | `GET /api/wishlist` <br> `POST /api/wishlist` <br> `DELETE /api/wishlist/:id` <br> `PUT /api/wishlist/:id` <br> `GET /api/wishlist/check/:productId` <br> `DELETE /api/wishlist/by-product/:productId` | ✅ User      | Per-user favourites            |
| Users      | `POST /api/users/sync`                                                                                  | ✅ (auto)    | Auto-create on login           |

## 🚀 Quick Start (Local)

### 1. Clone & Install

```bash
git clone https://github.com/Rubaid07/e-commerce-server.git
cd e-commerce-server
npm install
```

### 2. Environment Variables
Create .env file in the root directory:
```typescript
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/e-commerce?retryWrites=true&w=majority
FB_SERVICE_KEY=<base64-string>
```

### 3. Firebase Private Key → Base64
Go to Firebase Console → Project Settings → Service Accounts

Click "Generate new private key"

Save as serviceAccount.json

Encode on Linux/macOS:

```bash
base64 -w 0 serviceAccount.json
```
Encode on Windows (PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("serviceAccount.json"))
```
Copy the entire output into the FB_SERVICE_KEY variable in your .env file.

### 4. Run the Server
```bash
npm start
# or
node index.js
```
Server will start on: http://localhost:5000

## 📦 Deploy to Vercel

### 1. Push code to GitHub
Ensure your code is pushed to a GitHub repository.

### 2. Vercel Dashboard Import
- Go to [Vercel Dashboard](https://vercel.com)
- Click **"Add New..."** → **"Project"**
- Import your GitHub repository
- Connect to your GitHub account if not already connected

### 3. Configure Project

**Build Settings:**
- **Framework Preset:** Other
- **Build Command:** (Leave empty)
- **Output Directory:** (Leave empty)
- **Install Command:** `npm install`

### 4. Environment Variables:
Click **"Environment Variables"** and add:

```env
MONGODB_URI=your_mongodb_connection_string
FB_SERVICE_KEY=your_base64_encoded_firebase_key
```
### 5. Deploy
- Click "Deploy"
- Vercel will automatically build and deploy your application
- You'll receive a live URL (e.g., `https://your-project.vercel.app`)

⚠️ Important: Add 0.0.0.0/0 to MongoDB Atlas → Network Access or add Render's outbound IPs.

## 🔐 Authentication Flow
### 1. Clients log in via Firebase Authentication (front-end)

### 2. Send Firebase ID token in the header:

```text
Authorization: Bearer <idToken>
```
### 3. Server middleware (auth.js) verifies the token with Firebase Admin

### 4. Sets req.user.email for authenticated requests

## 📚 API Reference

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/api/products` | Get all products (optional query: `?category=Shoes&limit=10`) |
| `GET` | `/api/products/:id` | Get single product by ID |

### Authenticated (User) Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/orders` | Create order `{ items:[], total, address, phone }` |
| `GET` | `/api/wishlist` | Get user's wishlist |
| `POST` | `/api/wishlist` | Add to wishlist `{ productId }` |
| `DELETE` | `/api/wishlist/:id` | Remove item from wishlist |

### Admin Only Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/products` | Create product `{ name, price, category, imageUrl, inStock }` |
| `PUT` | `/api/products/:id` | Update product |
| `DELETE` | `/api/products/:id` | Delete product |
| `GET` | `/api/orders` | Get all orders |
| `PUT` | `/api/orders/:id` | Update order status |
| `GET` | `/api/orders/stats` | Get analytics `{ totalOrders, totalRevenue, ordersByStatus[], monthlyStats[] }` |

🗂️ Project Structure
```text
.
├── index.js            # Entry point, routes, DB connection
├── middleware/
│   ├── auth.js         # Firebase token verification
│   └── admin.js        # Role check (admin guard)
├── package.json
├── .env               # Environment variables
└── README.md
```
## 🛠️ Tech Stack

- Node.js 22.x
- Express
- MongoDB Atlas (Native Driver)
- Firebase Admin SDK
- dotenv
- cors
- Base64 encoded service keys
