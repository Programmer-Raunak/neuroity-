// index.js
// Neuroity Research Labs — Dataset Order Backend
// Express + Mongoose, deployed as a single Vercel serverless function.

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// ---------- Middleware ----------
app.use(cors()); // allow requests from your frontend domain (lock this down in production, see notes below)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- MongoDB connection (cached for serverless) ----------
const MONGODB_URI = 'mongodb+srv://thetraderyt77_db_user:tj9NAIMVnMLjYCeM@cluster0.p4jnhhb.mongodb.net/neuroity?appName=Cluster0';

let isConnected = false;

async function connectToDatabase() {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI, {
      // modern mongoose (6+/7+/8+) doesn't need useNewUrlParser/useUnifiedTopology, kept out intentionally
      serverSelectionTimeoutMS: 8000,
    });
    isConnected = true;
    console.log('MongoDB connected');
  } catch (err) {
    isConnected = false;
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
}

// Middleware to ensure DB is connected before handling any /api request
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Database connection failed' });
  }
});

// ---------- Schema ----------
const orderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    company: { type: String, trim: true, default: '' },
    dataType: {
      type: String,
      required: true,
      enum: ['text', 'image', 'audio', 'video', 'tabular', 'other'],
    },
    format: {
      type: String,
      required: true,
      enum: ['csv', 'json', 'parquet', 'hdf5', 'image-archive', 'other'],
    },
    sizeGB: { type: Number, required: true, min: 1 },
    deadline: { type: Date },
    details: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'reviewing', 'in_progress', 'delivered', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

// ---------- Helpers ----------
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- Routes ----------

// Health check
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Neuroity Research Labs API is running' });
});

app.get('/api', (req, res) => {
  res.json({ success: true, message: 'Neuroity Research Labs API is running' });
});

// Create a new dataset order
// POST /api/orders/dataset
app.post('/api/orders/dataset', async (req, res) => {
  try {
    const { name, email, phone, company, dataType, format, sizeGB, deadline, details } = req.body;

    // Basic validation
    if (!name || !email || !phone || !dataType || !format || !sizeGB || !details) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, email, phone, dataType, format, sizeGB, details',
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    const sizeNum = Number(sizeGB);
    if (Number.isNaN(sizeNum) || sizeNum <= 0) {
      return res.status(400).json({ success: false, message: 'sizeGB must be a positive number' });
    }

    const order = await Order.create({
      name,
      email,
      phone,
      company: company || '',
      dataType,
      format,
      sizeGB: sizeNum,
      deadline: deadline ? new Date(deadline) : undefined,
      details,
    });

    return res.status(201).json({
      success: true,
      message: 'Order submitted successfully',
      orderId: order._id,
    });
  } catch (err) {
    console.error('Error creating order:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// List all orders (for admin/internal use)
// GET /api/orders/dataset
app.get('/api/orders/dataset', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    return res.json({ success: true, count: orders.length, orders });
  } catch (err) {
    console.error('Error fetching orders:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get a single order by ID
// GET /api/orders/dataset/:id
app.get('/api/orders/dataset/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    return res.json({ success: true, order });
  } catch (err) {
    console.error('Error fetching order:', err);
    return res.status(400).json({ success: false, message: 'Invalid order ID' });
  }
});

// Update order status (for admin/internal use)
// PATCH /api/orders/dataset/:id/status
app.patch('/api/orders/dataset/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ['pending', 'reviewing', 'in_progress', 'delivered', 'cancelled'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    return res.json({ success: true, order });
  } catch (err) {
    console.error('Error updating order:', err);
    return res.status(400).json({ success: false, message: 'Invalid order ID' });
  }
});

// Delete an order (for admin/internal use)
// DELETE /api/orders/dataset/:id
app.delete('/api/orders/dataset/:id', async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    return res.json({ success: true, message: 'Order deleted' });
  } catch (err) {
    console.error('Error deleting order:', err);
    return res.status(400).json({ success: false, message: 'Invalid order ID' });
  }
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ---------- Local dev server ----------
// This only runs when you do `node index.js` locally. Vercel ignores this and
// calls the exported app directly as a serverless function.
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectToDatabase()
    .then(() => {
      app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}

module.exports = app;
        
