const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();

// CORS configuration
// Extra origins (comma separated) for local tooling, e.g. E2E: CORS_EXTRA_ORIGINS=http://localhost:4300
const extraOrigins = (process.env.CORS_EXTRA_ORIGINS || '')
  .split(',').map((o) => o.trim()).filter(Boolean);

const corsOptions = {
  origin: [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'https://spanish-now.vercel.app',
    /^https:\/\/.*\.vercel\.app$/,  // Permitir preview deployments de Vercel
    ...extraOrigins
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
};

// Middlewares
app.use(cors(corsOptions));

// Stripe signs the exact bytes it sends, so this route reads the raw body and must come before express.json().
const payments = require('./config/payments');
payments.assertSafe();
app.use('/api/payments', require('./routes/payments.routes'));
app.use(express.json({ charset: 'utf-8', limit: '2mb' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));

// Static files need their media type (audio, images) instead of JSON.
app.use('/uploads', express.static('uploads'));
const fakeUploads = require('./config/fakeUploads');
fakeUploads.assertSafe();
if (fakeUploads.enabled()) app.use('/uploads-dev', express.static(fakeUploads.DIR)); // local stand-in for Cloudinary (dev/E2E only)
const features = require('./config/features');
features.assertSafe();

// Set charset for API responses
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/courses', require('./routes/courseStudents.routes'));
app.use('/api/courses', require('./routes/courseMaterials.routes'));
app.use('/api/courses', require('./routes/course.routes'));
app.use('/api/public', require('./routes/public.routes'));
app.use('/api/public', require('./routes/publicAffiliates.routes'));
app.use('/api/checkout', require('./routes/checkout.routes'));
app.use('/api/teacher', require('./routes/teacherSales.routes'));
app.use('/api/teacher', require('./routes/teacherCoupons.routes'));
app.use('/api/teacher', require('./routes/teacherAffiliates.routes'));
app.use('/api/teacher', require('./routes/teacherComments.routes'));
app.use('/api/images', require('./routes/imageSearch.routes'));
app.use('/api/live-classes', require('./routes/liveClass.routes'));
app.use('/api/me', require('./routes/me.routes'));
app.use('/api/units', require('./routes/unitQuiz.routes'));
app.use('/api/units', require('./routes/unit.routes'));
app.use('/api/materials', require('./routes/material.routes'));
app.use('/api/stories', require('./routes/storyComments.routes'));
app.use('/api/comments', require('./routes/comment.routes'));
app.use('/api/stories', require('./routes/story.routes'));
app.use('/api/lesson-plans', require('./routes/lessonPlan.routes'));
app.use('/api/enrollments', require('./routes/enrollment.routes'));
app.use('/api/questions', require('./routes/question.routes'));
app.use('/api/vocabulary', require('./routes/vocabulary.routes'));
app.use('/api/repetition-activities', require('./routes/repetitionActivity.routes'));
app.use('/api/tooltips', require('./routes/tooltip.routes'));

// Health check
// Which class/chat modules are on (public: the frontend hides what is off).
app.get('/api/features', (req, res) => res.json(features.all()));

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

module.exports = app;
