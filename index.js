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


  // 1. GET all products (no auth required for viewing)
  app.get('/api/products', async (req, res) => {
    try {
      const { category, limit } = req.query;
      let query = {};
      if (category && category !== "All") query.category = category;

      let productsQuery = db.collection("products").find(query);

      if (limit) {
        productsQuery = productsQuery.limit(parseInt(limit));
      }

      const products = await productsQuery.toArray();
      res.json(products);
    } catch (error) {
      // console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // 2. GET single product (no auth required)
  app.get('/api/products/:id', async (req, res) => {
    try {
      const product = await db.collection("products").findOne({
        _id: new ObjectId(req.params.id)
      });

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // 3. POST create product (requires auth & admin)
  app.post('/api/products', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      // console.log("Creating new product:", req.body);

      const productData = {
        ...req.body,
        price: parseFloat(req.body.price),
        inStock: req.body.inStock !== false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Validate required fields
      if (!productData.name || !productData.price || !productData.category) {
        return res.status(400).json({
          message: "Missing required fields: name, price, category"
        });
      }

      const result = await db.collection("products").insertOne(productData);

      // console.log("Product created with ID:", result.insertedId);

      res.status(201).json({
        _id: result.insertedId,
        ...productData
      });
    } catch (error) {
      // console.error("Error creating product:", error);
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  // 4. PUT update product (requires auth & admin)
  app.put('/api/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      // console.log("Updating product:", id, "Data:", req.body);

      const updateData = {
        ...req.body,
        updatedAt: new Date()
      };

      // Convert price to number if present
      if (updateData.price !== undefined) {
        updateData.price = parseFloat(updateData.price);
      }

      const result = await db.collection("products").updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      if (!result.matchedCount) {
        return res.status(404).json({ message: "Product not found" });
      }

      // console.log("Product updated:", result.modifiedCount, "documents");

      res.json({ message: "Product updated successfully" });
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  // 5. DELETE product (requires auth & admin)
  app.delete('/api/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      // console.log("Deleting product:", id);

      const result = await db.collection("products").deleteOne({
        _id: new ObjectId(id)
      });

      if (!result.deletedCount) {
        return res.status(404).json({ message: "Product not found" });
      }

      // console.log("Product deleted");

      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(400).json({ message: "Failed to delete product" });
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
      // console.log("Checking wishlist for product:", req.params.productId);
      // console.log("User email:", req.user.email);

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

      // console.log("Found item:", item);

      res.json({
        exists: !!item,
        itemId: item?._id
      });
    } catch (error) {
      // console.error("Error checking wishlist:", error);
      res.status(500).json({ message: "Failed to check wishlist" });
    }
  });

  app.get('/api/wishlist', authMiddleware, async (req, res) => {
    try {
      // console.log("Fetching wishlist for user:", req.user.email);

      const wishlist = await db.collection("wishlist")
        .find({ userEmail: req.user.email })
        .toArray();

      // console.log("Found wishlist items:", wishlist.length);

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
      // console.error("Error fetching wishlist:", error);
      res.status(500).json({ message: "Failed to fetch wishlist" });
    }
  });

  app.post('/api/wishlist', authMiddleware, async (req, res) => {
    try {
      const { productId } = req.body;
      // console.log("Adding to wishlist:", { productId, user: req.user.email });

      // Check if already in wishlist
      const existing = await db.collection("wishlist").findOne({
        userEmail: req.user.email,
        productId: productId
      });

      if (existing) {
        // console.log("Already in wishlist");
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

      // console.log("Added to wishlist, ID:", result.insertedId);

      res.status(201).json({
        _id: result.insertedId,
        ...wishlistItem
      });
    } catch (error) {
      // console.error("Error adding to wishlist:", error);
      res.status(500).json({ message: "Failed to add to wishlist" });
    }
  });

  app.delete('/api/wishlist/:id', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      // console.log("Removing from wishlist:", { id, user: req.user.email });

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
        // console.log("Item not found in wishlist");
        return res.status(404).json({ message: "Item not found in wishlist" });
      }

      // console.log("Removed from wishlist");
      res.json({ message: "Removed from wishlist" });
    } catch (error) {
      // console.error("Error removing from wishlist:", error);
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
      // console.error("Error updating wishlist:", error);
      res.status(500).json({ message: "Failed to update" });
    }
  });

  app.delete('/api/wishlist/by-product/:productId', authMiddleware, async (req, res) => {
    try {
      const { productId } = req.params;
      const userEmail = req.user.email;

      const result = await db.collection("wishlist").deleteOne({
        userEmail: userEmail,
        productId: productId
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ message: "Item not found in wishlist" });
      }

      res.json({
        message: "Removed from wishlist",
        success: true
      });
    } catch (error) {
      console.error("Error removing by product:", error);
      res.status(500).json({ message: "Failed to remove from wishlist" });
    }
  });


  app.get('/api/orders', authMiddleware, async (req, res) => {
    try {
      // Check if user is admin
      const user = await db.collection("users").findOne({
        email: req.user.email
      });

      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const orders = await db.collection("orders")
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      res.json(orders);
    } catch (error) {
      // console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Get order statistics
  app.get('/api/orders/stats', authMiddleware, async (req, res) => {
    try {
      // Check if user is admin
      const user = await db.collection("users").findOne({
        email: req.user.email
      });

      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get total orders
      const totalOrders = await db.collection("orders").countDocuments();

      // Get total revenue
      const revenueResult = await db.collection("orders").aggregate([
        { $match: { total: { $exists: true, $ne: null } } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]).toArray();

      const totalRevenue = revenueResult[0]?.total || 0;

      // Get orders by status
      const ordersByStatus = await db.collection("orders").aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      // Convert to array format for frontend
      const statusDistribution = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map(status => {
        const statusData = ordersByStatus.find(s => s._id === status);
        return {
          status,
          count: statusData?.count || 0
        };
      });

      // Get recent monthly stats (last 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const monthlyStats = await db.collection("orders").aggregate([
        {
          $match: {
            createdAt: { $gte: sixMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" }
            },
            count: { $sum: 1 },
            revenue: { $sum: "$total" }
          }
        },
        {
          $sort: {
            "_id.year": 1,
            "_id.month": 1
          }
        }
      ]).toArray();

      res.json({
        totalOrders,
        totalRevenue,
        ordersByStatus: statusDistribution,
        monthlyStats: monthlyStats.map(stat => ({
          month: `${stat._id.year}-${String(stat._id.month).padStart(2, '0')}`,
          count: stat.count,
          revenue: stat.revenue || 0
        }))
      });
    } catch (error) {
      // console.error("Error fetching order stats:", error);
      res.status(500).json({ message: "Failed to fetch order statistics" });
    }
  });

  // Update order status
  app.put('/api/orders/:id', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // Check if user is admin
      const user = await db.collection("users").findOne({
        email: req.user.email
      });

      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const result = await db.collection("orders").updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: status,
            updatedAt: new Date()
          }
        }
      );

      if (!result.matchedCount) {
        return res.status(404).json({ message: "Order not found" });
      }

      res.json({ message: "Order status updated successfully" });
    } catch (error) {
      // console.error("Error updating order:", error);
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  // Delete order
  app.delete('/api/orders/:id', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;

      // Check if user is admin
      const user = await db.collection("users").findOne({
        email: req.user.email
      });

      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const result = await db.collection("orders").deleteOne({
        _id: new ObjectId(id)
      });

      if (!result.deletedCount) {
        return res.status(404).json({ message: "Order not found" });
      }

      res.json({ message: "Order deleted successfully" });
    } catch (error) {
      // console.error("Error deleting order:", error);
      res.status(500).json({ message: "Failed to delete order" });
    }
  });

  // Get order by ID
  app.get('/api/orders/:id', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;

      const order = await db.collection("orders").findOne({
        _id: new ObjectId(id)
      });

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      res.json(order);
    } catch (error) {
      // console.error("Error fetching order:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
}

startServer();