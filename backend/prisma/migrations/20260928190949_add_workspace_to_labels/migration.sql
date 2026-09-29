-- Add workspaceId as nullable first
ALTER TABLE "Label"
ADD COLUMN "workspaceId" TEXT;

-- Assign existing labels to the current workspace
UPDATE "Label"
SET "workspaceId" = '9434a92f-4742-45a0-a48c-84774f451f4e'
WHERE "workspaceId" IS NULL;

-- Make workspaceId required
ALTER TABLE "Label"
ALTER COLUMN "workspaceId" SET NOT NULL;

-- Create unique constraint
CREATE UNIQUE INDEX "Label_workspaceId_name_key"
ON "Label"("workspaceId", "name");

-- Add foreign key
ALTER TABLE "Label"
ADD CONSTRAINT "Label_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "Workspace"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;