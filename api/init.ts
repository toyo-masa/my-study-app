import { neon } from '@neondatabase/serverless';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretToken = process.env.API_SECRET_TOKEN;
  const clientToken = req.headers['x-sync-token'];

  if (secretToken && clientToken !== secretToken) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  // Expects DATABASE_URL locally or in Vercel environment
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!databaseUrl) {
    return res.status(500).json({ error: 'Database URL not found in environment' });
  }

  try {
    const sql = neon(databaseUrl);

    // Create quiz_sets table
    await sql`
      CREATE TABLE IF NOT EXISTS quiz_sets (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        type VARCHAR(50) DEFAULT 'quiz',
        is_deleted BOOLEAN DEFAULT FALSE,
        is_archived BOOLEAN DEFAULT FALSE,
        tags JSONB DEFAULT '[]'::jsonb
      );
    `;

    // Create questions table
    await sql`
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        quiz_set_id INTEGER REFERENCES quiz_sets(id) ON DELETE CASCADE,
        category VARCHAR(255),
        text TEXT NOT NULL,
        options JSONB NOT NULL,
        correct_answers JSONB NOT NULL,
        explanation TEXT
      );
    `;

    // Create histories table
    await sql`
      CREATE TABLE IF NOT EXISTS histories (
        id SERIAL PRIMARY KEY,
        quiz_set_id INTEGER REFERENCES quiz_sets(id) ON DELETE CASCADE,
        date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        correct_count INTEGER,
        total_count INTEGER,
        duration_seconds INTEGER,
        answers JSONB,
        marked_question_ids JSONB,
        memos JSONB,
        confidences JSONB,
        question_ids JSONB,
        mode VARCHAR(50),
        memorization_detail JSONB
      );
    `;

    // Create review_schedules table
    await sql`
      CREATE TABLE IF NOT EXISTS review_schedules (
        id SERIAL PRIMARY KEY,
        question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
        quiz_set_id INTEGER REFERENCES quiz_sets(id) ON DELETE CASCADE,
        interval_days INTEGER,
        next_due DATE,
        last_reviewed_at TIMESTAMP WITH TIME ZONE,
        consecutive_correct INTEGER
      );
    `;

    // Create review_logs table
    await sql`
      CREATE TABLE IF NOT EXISTS review_logs (
        id SERIAL PRIMARY KEY,
        question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
        quiz_set_id INTEGER REFERENCES quiz_sets(id) ON DELETE CASCADE,
        reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        is_correct BOOLEAN,
        confidence VARCHAR(50),
        interval_days INTEGER,
        next_due DATE,
        memo TEXT,
        duration_seconds INTEGER,
        session_id VARCHAR(255)
      );
    `;

    return res.status(200).json({ message: 'Neon database tables initialized successfully' });
  } catch (error) {
    console.error('Failed to initialize Neon DB:', error);
    return res.status(500).json({ error: 'Failed to initialize database', details: (error as Error).message });
  }
}
