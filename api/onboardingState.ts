import { neon } from '@neondatabase/serverless';
import { getAuthenticatedUserId } from './_auth.js';
import type { ApiHandlerRequest, ApiHandlerResponse } from './_http.js';

type OnboardingStateBody = {
    homeTutorialCompleted?: unknown;
    flowStage?: unknown;
    manageQuizSetId?: unknown;
};

type OnboardingStateRow = {
    home_tutorial_completed: boolean | null;
    completed_at: string | Date | null;
    flow_stage: string | null;
    manage_quiz_set_id: number | null;
};

let onboardingStateSchemaEnsured = false;

function toIsoOrNull(value: string | Date | null): string | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

async function ensureOnboardingStateSchema(sql: ReturnType<typeof neon>) {
    if (onboardingStateSchemaEnsured) return;

    await sql`
        CREATE TABLE IF NOT EXISTS user_onboarding_states (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            home_tutorial_completed BOOLEAN DEFAULT FALSE,
            flow_stage VARCHAR(32) DEFAULT 'home',
            manage_quiz_set_id INTEGER,
            completed_at TIMESTAMP WITH TIME ZONE,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `;
    await sql`ALTER TABLE user_onboarding_states ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`;
    await sql`ALTER TABLE user_onboarding_states ADD COLUMN IF NOT EXISTS home_tutorial_completed BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE user_onboarding_states ADD COLUMN IF NOT EXISTS flow_stage VARCHAR(32) DEFAULT 'home'`;
    await sql`ALTER TABLE user_onboarding_states ADD COLUMN IF NOT EXISTS manage_quiz_set_id INTEGER`;
    await sql`ALTER TABLE user_onboarding_states ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE`;
    await sql`ALTER TABLE user_onboarding_states ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`;

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

    onboardingStateSchemaEnsured = true;
}

function normalizeFlowStage(raw: unknown): 'home' | 'manage' | 'completed' {
    if (raw === 'manage' || raw === 'completed' || raw === 'home') {
        return raw;
    }
    return 'home';
}

function normalizeManageQuizSetId(raw: unknown): number | null {
    if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
        return raw;
    }
    return null;
}

export default async function handler(req: ApiHandlerRequest<OnboardingStateBody>, res: ApiHandlerResponse) {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });
    const sql = neon(databaseUrl);

    try {
        await ensureOnboardingStateSchema(sql);

        if (req.method === 'GET') {
            const rows = (await sql`
                SELECT home_tutorial_completed, completed_at, flow_stage, manage_quiz_set_id
                FROM user_onboarding_states
                WHERE user_id = ${userId}
                LIMIT 1
            `) as OnboardingStateRow[];

            if (rows.length === 0) {
                return res.status(200).json({
                    homeTutorialCompleted: false,
                    completedAt: null,
                    flowStage: 'home',
                    manageQuizSetId: null,
                });
            }

            const isCompleted = rows[0].home_tutorial_completed === true;

            return res.status(200).json({
                homeTutorialCompleted: isCompleted,
                completedAt: toIsoOrNull(rows[0].completed_at),
                flowStage: isCompleted ? 'completed' : normalizeFlowStage(rows[0].flow_stage),
                manageQuizSetId: isCompleted ? null : normalizeManageQuizSetId(rows[0].manage_quiz_set_id),
            });
        }

        if (req.method === 'PUT') {
            const hasHomeTutorialCompleted = req.body?.homeTutorialCompleted !== undefined;
            const hasFlowStage = req.body?.flowStage !== undefined;
            const hasManageQuizSetId = req.body?.manageQuizSetId !== undefined;
            if (!hasHomeTutorialCompleted && !hasFlowStage && !hasManageQuizSetId) {
                return res.status(400).json({ error: 'No updatable fields provided' });
            }

            const existingRows = (await sql`
                SELECT home_tutorial_completed, completed_at, flow_stage, manage_quiz_set_id
                FROM user_onboarding_states
                WHERE user_id = ${userId}
                LIMIT 1
            `) as OnboardingStateRow[];

            const existing = existingRows[0];
            const baseHomeTutorialCompleted = existing?.home_tutorial_completed === true;
            const baseFlowStage = normalizeFlowStage(existing?.flow_stage);
            const baseManageQuizSetId = normalizeManageQuizSetId(existing?.manage_quiz_set_id);
            const baseCompletedAt = toIsoOrNull(existing?.completed_at ?? null);

            let nextHomeTutorialCompleted = baseHomeTutorialCompleted;
            let nextFlowStage = baseFlowStage;
            let nextManageQuizSetId = baseManageQuizSetId;

            if (hasHomeTutorialCompleted) {
                if (typeof req.body?.homeTutorialCompleted !== 'boolean') {
                    return res.status(400).json({ error: 'homeTutorialCompleted must be boolean' });
                }
                nextHomeTutorialCompleted = req.body.homeTutorialCompleted;
            }

            if (hasFlowStage) {
                const flowStage = req.body?.flowStage;
                if (flowStage !== 'home' && flowStage !== 'manage' && flowStage !== 'completed') {
                    return res.status(400).json({ error: 'flowStage must be one of home/manage/completed' });
                }
                nextFlowStage = flowStage;
            }

            if (hasManageQuizSetId) {
                const manageQuizSetIdRaw = req.body?.manageQuizSetId;
                if (manageQuizSetIdRaw === null) {
                    nextManageQuizSetId = null;
                } else if (typeof manageQuizSetIdRaw === 'number' && Number.isInteger(manageQuizSetIdRaw) && manageQuizSetIdRaw > 0) {
                    nextManageQuizSetId = manageQuizSetIdRaw;
                } else {
                    return res.status(400).json({ error: 'manageQuizSetId must be null or positive integer' });
                }
            }

            if (nextHomeTutorialCompleted || nextFlowStage === 'completed') {
                nextHomeTutorialCompleted = true;
                nextFlowStage = 'completed';
                nextManageQuizSetId = null;
            } else if (nextFlowStage === 'home') {
                nextManageQuizSetId = null;
            } else if (nextFlowStage === 'manage' && nextManageQuizSetId === null) {
                return res.status(400).json({ error: 'manage stage requires manageQuizSetId' });
            }

            const nextCompletedAt = nextHomeTutorialCompleted
                ? (baseCompletedAt || new Date().toISOString())
                : null;

            await sql`
                INSERT INTO user_onboarding_states (
                    user_id,
                    home_tutorial_completed,
                    flow_stage,
                    manage_quiz_set_id,
                    completed_at,
                    updated_at
                )
                VALUES (
                    ${userId},
                    ${nextHomeTutorialCompleted},
                    ${nextFlowStage},
                    ${nextManageQuizSetId},
                    ${nextCompletedAt},
                    NOW()
                )
                ON CONFLICT (user_id)
                DO UPDATE SET
                    home_tutorial_completed = EXCLUDED.home_tutorial_completed,
                    flow_stage = EXCLUDED.flow_stage,
                    manage_quiz_set_id = EXCLUDED.manage_quiz_set_id,
                    completed_at = EXCLUDED.completed_at,
                    updated_at = NOW()
            `;

            const rows = (await sql`
                SELECT home_tutorial_completed, completed_at, flow_stage, manage_quiz_set_id
                FROM user_onboarding_states
                WHERE user_id = ${userId}
                LIMIT 1
            `) as OnboardingStateRow[];

            const isCompleted = rows[0]?.home_tutorial_completed === true;

            return res.status(200).json({
                homeTutorialCompleted: isCompleted,
                completedAt: toIsoOrNull(rows[0]?.completed_at ?? null),
                flowStage: isCompleted ? 'completed' : normalizeFlowStage(rows[0]?.flow_stage),
                manageQuizSetId: isCompleted ? null : normalizeManageQuizSetId(rows[0]?.manage_quiz_set_id),
            });
        }

        res.setHeader('Allow', ['GET', 'PUT']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    } catch (err) {
        console.error('onboardingState API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
