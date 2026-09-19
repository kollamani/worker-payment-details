require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');
const transactionRoutes = require('./routes/transactions');
const taskNoteRoutes = require('./routes/task-notes');

const app = express();

// Connect to MongoDB
connectDB();

// Allowed Origins List (Local & Production Vercel URL)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://worker-payment-details.vercel.app',
  process.env.CLIENT_URL
].filter(Boolean); // undefined విలువలను తొలగిస్తుంది

// Updated CORS Middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // Postman లేదా Mobile Apps వంటి direct requests కోసం (!origin) అనుమతిస్తుంది
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS Not Allowed'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Keep this before route registration so Render logs show the exact path
// reaching the deployed Express process during route troubleshooting.
app.use((req, res, next) => {
  console.log(`[request] ${req.method} ${req.originalUrl}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Financial Ledger API is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/transactions', transactionRoutes);
// taskNoteRoutes uses relative paths: GET/POST "/" => /api/task-notes.
app.use('/api/task-notes', taskNoteRoutes);

// Error handling (must be last)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  console.log('Task Notes API mounted at /api/task-notes (GET, POST, PUT, DELETE)');
});