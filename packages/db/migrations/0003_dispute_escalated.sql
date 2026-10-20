-- SPEC §2 (Codex review R6): supplier silence escalates a dispute to ops instead of suspending the line.
ALTER TYPE "dispute_status" RENAME VALUE 'SUSPENDED' TO 'ESCALATED';
