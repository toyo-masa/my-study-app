import { neon } from '@neondatabase/serverless';
import type { ApiHandlerRequest, ApiHandlerResponse } from './_http.js';

export default async function handler(req: ApiHandlerRequest, res: ApiHandlerResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const initTokenHeader = req.headers['x-init-token'];
  const providedToken = Array.isArray(initTokenHeader) ? initTokenHeader[0] : initTokenHeader;
  const configuredToken = process.env.INIT_API_TOKEN;
  const isProduction = process.env.NODE_ENV === 'production';

  // Protect schema initialization in production, and optionally in other envs when token is set.
  if (isProduction && !configuredToken) {
    console.error('INIT_API_TOKEN is not configured in production. /api/init is disabled.');
    return res.status(503).json({ error: 'Initialization endpoint is disabled' });
  }
  if (configuredToken && providedToken !== configuredToken) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!databaseUrl) {
    return res.status(500).json({ error: 'Database URL not found in environment' });
  }

  try {
    const sql = neon(databaseUrl);

    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create sessions table
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create quiz_sets table
    await sql`
      CREATE TABLE IF NOT EXISTS quiz_sets (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        type VARCHAR(50) DEFAULT 'quiz',
        is_deleted BOOLEAN DEFAULT FALSE,
        is_archived BOOLEAN DEFAULT FALSE,
        exclude_from_review BOOLEAN DEFAULT FALSE,
        tags JSONB DEFAULT '[]'::jsonb,
        user_id INTEGER REFERENCES users(id)
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
        feedback_mode VARCHAR(30),
        memorization_detail JSONB,
        daily_study_stats JSONB,
        user_id INTEGER REFERENCES users(id)
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
        consecutive_correct INTEGER,
        user_id INTEGER REFERENCES users(id)
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
        session_id VARCHAR(255),
        user_id INTEGER REFERENCES users(id)
      );
    `;

    // Create suspended_sessions table
    await sql`
      CREATE TABLE IF NOT EXISTS suspended_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        quiz_set_id INTEGER REFERENCES quiz_sets(id) ON DELETE CASCADE,
        session_key VARCHAR(50) DEFAULT 'default',
        session_data JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create user_onboarding_states table
    await sql`
      CREATE TABLE IF NOT EXISTS user_onboarding_states (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        home_tutorial_completed BOOLEAN DEFAULT FALSE,
        flow_stage VARCHAR(32) DEFAULT 'home',
        manage_quiz_set_id INTEGER,
        completed_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Add columns to existing tables if they don't exist
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE`;
    await sql`ALTER TABLE quiz_sets ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
    await sql`ALTER TABLE quiz_sets ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE quiz_sets ADD COLUMN IF NOT EXISTS exclude_from_review BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE quiz_sets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`;
    await sql`ALTER TABLE histories ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
    await sql`ALTER TABLE histories ADD COLUMN IF NOT EXISTS feedback_mode VARCHAR(30)`;
    await sql`ALTER TABLE histories ADD COLUMN IF NOT EXISTS memorization_detail JSONB`;
    await sql`ALTER TABLE histories ADD COLUMN IF NOT EXISTS daily_study_stats JSONB`;
    await sql`ALTER TABLE review_schedules ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
    await sql`ALTER TABLE review_logs ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
    await sql`ALTER TABLE suspended_sessions ADD COLUMN IF NOT EXISTS session_key VARCHAR(50) DEFAULT 'default'`;
    await sql`ALTER TABLE user_onboarding_states ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`;
    await sql`ALTER TABLE user_onboarding_states ADD COLUMN IF NOT EXISTS home_tutorial_completed BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE user_onboarding_states ADD COLUMN IF NOT EXISTS flow_stage VARCHAR(32) DEFAULT 'home'`;
    await sql`ALTER TABLE user_onboarding_states ADD COLUMN IF NOT EXISTS manage_quiz_set_id INTEGER`;
    await sql`ALTER TABLE user_onboarding_states ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE`;
    await sql`ALTER TABLE user_onboarding_states ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`;

    // Phase 1: question_type カラムを追加（混合学習セット対応の基盤）
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(50) DEFAULT 'quiz'`;

    // Phase 1: 既存 memorization セットの問題に question_type = 'memorization' をセット
    await sql`
      UPDATE questions
      SET question_type = 'memorization'
      WHERE question_type = 'quiz'
        AND quiz_set_id IN (SELECT id FROM quiz_sets WHERE type = 'memorization')
    `;

    // Phase 1: memorization 問題の options の内容を correct_answers に移動し、options を空配列にする
    // （既に移行済みのものは skip: correct_answers が配列で最初の要素が文字列かどうかで判定）
    await sql`
      UPDATE questions
      SET correct_answers = options,
          options = '[]'::jsonb
      WHERE question_type = 'memorization'
        AND jsonb_array_length(options) > 0
        AND (
          jsonb_array_length(correct_answers) = 0
          OR jsonb_typeof(correct_answers->0) = 'number'
        )
    `;

    // Remove duplicated schedules before applying the unique index.
    await sql`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id, question_id
                 ORDER BY COALESCE(last_reviewed_at, to_timestamp(0)) DESC, id DESC
               ) AS rn
        FROM review_schedules
        WHERE user_id IS NOT NULL AND question_id IS NOT NULL
      )
      DELETE FROM review_schedules
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    `;

    // Ensure one schedule per user/question and speed up hot query paths.
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS review_schedules_user_question_unique_idx
      ON review_schedules (user_id, question_id)
      WHERE user_id IS NOT NULL AND question_id IS NOT NULL
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS questions_quiz_set_id_idx
      ON questions (quiz_set_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS quiz_sets_user_archive_delete_idx
      ON quiz_sets (user_id, is_deleted, is_archived)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS histories_user_quiz_date_idx
      ON histories (user_id, quiz_set_id, date DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS review_schedules_user_quiz_due_idx
      ON review_schedules (user_id, quiz_set_id, next_due)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS review_logs_user_question_reviewed_idx
      ON review_logs (user_id, question_id, reviewed_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS review_logs_user_quiz_reviewed_idx
      ON review_logs (user_id, quiz_set_id, reviewed_at DESC)
    `;
    await sql`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id
                 ORDER BY COALESCE(updated_at, completed_at, to_timestamp(0)) DESC, id DESC
               ) AS rn
        FROM user_onboarding_states
        WHERE user_id IS NOT NULL
      )
      DELETE FROM user_onboarding_states
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS user_onboarding_states_user_unique_idx
      ON user_onboarding_states (user_id)
    `;
    await sql`
      UPDATE suspended_sessions
      SET session_key = 'default'
      WHERE session_key IS NULL OR session_key = ''
    `;
    await sql`DROP INDEX IF EXISTS suspended_sessions_user_quiz_unique_idx`;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS suspended_sessions_user_quiz_session_unique_idx
      ON suspended_sessions (user_id, quiz_set_id, session_key)
    `;

    return res.status(200).json({ message: 'Database tables initialized successfully' });
  } catch (error) {
    console.error('Failed to initialize DB:', error);
    return res.status(500).json({ error: 'Failed to initialize database' });
  }
}
