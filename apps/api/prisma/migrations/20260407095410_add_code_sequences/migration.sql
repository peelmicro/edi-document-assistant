-- CreateTable
CREATE TABLE "code_sequences" (
    "id" UUID NOT NULL,
    "prefix" VARCHAR(20) NOT NULL,
    "year_month" VARCHAR(7) NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "code_sequences_prefix_year_month_key" ON "code_sequences"("prefix", "year_month");
