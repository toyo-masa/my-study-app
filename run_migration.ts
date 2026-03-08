import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) {
        console.error('DATABASE_URL is not set');
        process.exit(1);
    }
    const sql = neon(databaseUrl);

    console.log('Adding last_accessed_at column to users table...');
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE;`;
    console.log('Done.');
}

main().catch(console.error);
