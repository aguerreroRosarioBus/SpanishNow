const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:4200', 'http://127.0.0.1:4200'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
};

// Middlewares
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploads
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/courses', require('./routes/course.routes'));
app.use('/api/units', require('./routes/unit.routes'));
app.use('/api/stories', require('./routes/story.routes'));
app.use('/api/enrollments', require('./routes/enrollment.routes'));
app.use('/api/questions', require('./routes/question.routes'));
app.use('/api/question-responses', require('./routes/questionResponse.routes'));
app.use('/api/vocabulary', require('./routes/vocabulary.routes'));
app.use('/api/repetition-activities', require('./routes/repetitionActivity.routes'));
app.use('/api/activity-configs', require('./routes/activityConfig.routes'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'SpanishNow API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});