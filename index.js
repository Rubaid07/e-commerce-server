const express = require('express');
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

const port = 5000;
const uri = process.env.MONGODB_URI;
const dbName = "e-commerce";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000,
});

// MIDDLEWARE
const authMiddleware = require('./middleware/auth');
const adminMiddleware = require('./middleware/admin');

// MAIN CONNECT FUNCTION
async function connectDB() {
  try {
    await client.connect();
    console.log("🔥 MongoDB Connected Successfully!");
    
    // Check if wishlist collection exists, if not create it
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    console.log("Available collections:", collectionNames);
    
    if (!collectionNames.includes('wishlist')) {
      console.log("Creating wishlist collection...");
      await db.createCollection('wishlist');
      console.log("Wishlist collection created");
    }
    
    return db;
  } catch (err) {
    console.error("❌ MongoDB Connection Failed:", err.message);
    console.log("⏳ Retrying in 3 seconds...");
    await new Promise(res => setTimeout(res, 3000));
    return connectDB();
  }
}

async function startServer() {
  const db = await connectDB();
  app.locals.db = db;

  // ---- ROUTES ----
  app.get('/', (req, res) => {
    res.send("Server Running with Stable MongoDB Connection!");
  });

  app.get('/api/products', async (req, res) => {
    try {
      const { category } = req.query;
      let q = {};
      if (category && category !== "All") q.category = category;

      const products = await db.collection("products").find(q).toArray();
      res.json(products);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.post('/api/users/sync', async (req, res) => {
    try {
      const { email } = req.body;
      let user = await db.collection("users").findOne({ email });
      if (!user) {
        user = { email, role: "user" };
        await db.collection("users").insertOne(user);
      }
      res.json(user);
    } catch {
      res.status(500).json({ message: "User sync failed" });
    }
  });

  app.post('/api/products', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const newProd = { ...req.body, price: Number(req.body.price), inStock: true };
      const result = await db.collection("products").insertOne(newProd);
      res.status(201).json({ _id: result.insertedId, ...newProd });
    } catch {
      res.status(500).json({ message: "Failed to add product" });
    }
  });

  app.put('/api/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      const result = await db.collection("products").updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body }
      );
      if (!result.matchedCount) return res.status(404).json({ message: "Not found" });
      res.json({ message: "Updated" });
    } catch {
      res.status(500).json({ message: "Failed to update" });
    }
  });

  app.delete('/api/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      const result = await db.collection("products").deleteOne({ _id: new ObjectId(id) });
      if (!result.deletedCount) return res.status(404).json({ message: "Not found" });
      res.json({ message: "Deleted" });
    } catch {
      res.status(400).json({ message: "Invalid ID" });
    }
  });

  app.get('/api/products/:id', async (req, res) => {
    try {
      const product = await db.collection("products").findOne({ _id: new ObjectId(req.params.id) });
      if (!product) return res.status(404).json({ message: "Not found" });
      res.json(product);
    } catch {
      res.status(500).json({ message: "Error" });
    }
  });

  app.post("/api/orders", authMiddleware, async (req, res) => {
    const { items, total, ...data } = req.body;
    try {
      const order = { ...data, items, total, userEmail: req.user.email, createdAt: new Date() };
      const result = await db.collection("orders").insertOne(order);
      res.status(201).json({ id: result.insertedId });
    } catch (err) {
      res.status(500).json({ message: "Order failed" });
    }
  });

  // Wishlist API Routes
  app.get('/api/wishlist/check/:productId', authMiddleware, async (req, res) => {
    try {
      console.log("Checking wishlist for product:", req.params.productId);
      console.log("User email:", req.user.email);
      
      // Convert productId to ObjectId if it's in ObjectId format
      let productId;
      try {
        productId = new ObjectId(req.params.productId);
      } catch {
        productId = req.params.productId;
      }
      
      const item = await db.collection("wishlist").findOne({
        userEmail: req.user.email,
        productId: productId
      });
      
      console.log("Found item:", item);
      
      res.json({ 
        exists: !!item,
        itemId: item?._id 
      });
    } catch (error) {
      console.error("Error checking wishlist:", error);
      res.status(500).json({ message: "Failed to check wishlist" });
    }
  });

  app.get('/api/wishlist', authMiddleware, async (req, res) => {
    try {
      console.log("Fetching wishlist for user:", req.user.email);
      
      const wishlist = await db.collection("wishlist")
        .find({ userEmail: req.user.email })
        .toArray();
      
      console.log("Found wishlist items:", wishlist.length);
      
      // Fetch product details for each wishlist item
      const wishlistWithProducts = await Promise.all(
        wishlist.map(async (item) => {
          let productId;
          try {
            productId = new ObjectId(item.productId);
          } catch {
            productId = item.productId;
          }
          
          const product = await db.collection("products").findOne({ 
            _id: productId 
          });
          return {
            ...item,
            product: product || null
          };
        })
      );
      
      res.json(wishlistWithProducts);
    } catch (error) {
      console.error("Error fetching wishlist:", error);
      res.status(500).json({ message: "Failed to fetch wishlist" });
    }
  });

  app.post('/api/wishlist', authMiddleware, async (req, res) => {
    try {
      const { productId } = req.body;
      console.log("Adding to wishlist:", { productId, user: req.user.email });
      
      // Check if already in wishlist
      const existing = await db.collection("wishlist").findOne({
        userEmail: req.user.email,
        productId: productId
      });
      
      if (existing) {
        console.log("Already in wishlist");
        return res.status(400).json({ message: "Already in wishlist" });
      }
      
      const wishlistItem = {
        userEmail: req.user.email,
        productId: productId,
        notes: "",
        addedAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await db.collection("wishlist").insertOne(wishlistItem);
      
      console.log("Added to wishlist, ID:", result.insertedId);
      
      res.status(201).json({ 
        _id: result.insertedId, 
        ...wishlistItem 
      });
    } catch (error) {
      console.error("Error adding to wishlist:", error);
      res.status(500).json({ message: "Failed to add to wishlist" });
    }
  });

  app.delete('/api/wishlist/:id', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      console.log("Removing from wishlist:", { id, user: req.user.email });
      
      // Check if it's a valid ObjectId
      let query;
      try {
        query = { 
          _id: new ObjectId(id),
          userEmail: req.user.email 
        };
      } catch (error) {
        query = { 
          _id: id,
          userEmail: req.user.email 
        };
      }
      
      const result = await db.collection("wishlist").deleteOne(query);
      
      if (!result.deletedCount) {
        console.log("Item not found in wishlist");
        return res.status(404).json({ message: "Item not found in wishlist" });
      }
      
      console.log("Removed from wishlist");
      res.json({ message: "Removed from wishlist" });
    } catch (error) {
      console.error("Error removing from wishlist:", error);
      res.status(500).json({ message: "Failed to remove from wishlist" });
    }
  });

  app.put('/api/wishlist/:id', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      
      let query;
      try {
        query = { 
          _id: new ObjectId(id),
          userEmail: req.user.email 
        };
      } catch (error) {
        query = { 
          _id: id,
          userEmail: req.user.email 
        };
      }
      
      const result = await db.collection("wishlist").updateOne(
        query,
        { 
          $set: { 
            notes: notes || "",
            updatedAt: new Date()
          } 
        }
      );
      
      if (!result.matchedCount) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      res.json({ message: "Updated" });
    } catch (error) {
      console.error("Error updating wishlist:", error);
      res.status(500).json({ message: "Failed to update" });
    }
  });

  app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
}

startServer();