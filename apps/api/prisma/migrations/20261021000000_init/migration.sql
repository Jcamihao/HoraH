-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('DONO', 'PROFISSIONAL');

-- CreateEnum
CREATE TYPE "StatusAssinatura" AS ENUM ('TESTE', 'ATIVA', 'TOLERANCIA', 'BLOQUEADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "estabelecimentos" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fusoHorario" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "antecedenciaMinMin" INTEGER NOT NULL DEFAULT 60,
    "prazoCancelamentoMin" INTEGER NOT NULL DEFAULT 120,
    "onboardingConcluidoEm" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "estabelecimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familia" UUID NOT NULL,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,
    "revogadoEm" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profissionais" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "usuarioId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profissionais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicos" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "duracaoMin" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "servicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profissional_servicos" (
    "profissionalId" UUID NOT NULL,
    "servicoId" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "precoCentavos" INTEGER NOT NULL,

    CONSTRAINT "profissional_servicos_pkey" PRIMARY KEY ("profissionalId","servicoId")
);

-- CreateTable
CREATE TABLE "horarios_funcionamento" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "diaSemana" SMALLINT NOT NULL,
    "inicioMin" SMALLINT NOT NULL,
    "fimMin" SMALLINT NOT NULL,

    CONSTRAINT "horarios_funcionamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horarios_trabalho" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "profissionalId" UUID NOT NULL,
    "diaSemana" SMALLINT NOT NULL,
    "inicioMin" SMALLINT NOT NULL,
    "fimMin" SMALLINT NOT NULL,

    CONSTRAINT "horarios_trabalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convites" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "profissionalId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,
    "usadoEm" TIMESTAMPTZ(3),
    "revogadoEm" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "status" "StatusAssinatura" NOT NULL DEFAULT 'TESTE',
    "testeFimEm" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estabelecimentos_slug_key" ON "estabelecimentos"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_estabelecimentoId_idx" ON "usuarios"("estabelecimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_id_estabelecimentoId_key" ON "usuarios"("id", "estabelecimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_usuarioId_idx" ON "refresh_tokens"("usuarioId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familia_idx" ON "refresh_tokens"("familia");

-- CreateIndex
CREATE UNIQUE INDEX "profissionais_usuarioId_key" ON "profissionais"("usuarioId");

-- CreateIndex
CREATE INDEX "profissionais_estabelecimentoId_idx" ON "profissionais"("estabelecimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "profissionais_id_estabelecimentoId_key" ON "profissionais"("id", "estabelecimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "profissionais_usuarioId_estabelecimentoId_key" ON "profissionais"("usuarioId", "estabelecimentoId");

-- CreateIndex
CREATE INDEX "servicos_estabelecimentoId_idx" ON "servicos"("estabelecimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "servicos_id_estabelecimentoId_key" ON "servicos"("id", "estabelecimentoId");

-- CreateIndex
CREATE INDEX "profissional_servicos_estabelecimentoId_idx" ON "profissional_servicos"("estabelecimentoId");

-- CreateIndex
CREATE INDEX "profissional_servicos_servicoId_idx" ON "profissional_servicos"("servicoId");

-- CreateIndex
CREATE INDEX "horarios_funcionamento_estabelecimentoId_diaSemana_idx" ON "horarios_funcionamento"("estabelecimentoId", "diaSemana");

-- CreateIndex
CREATE INDEX "horarios_trabalho_estabelecimentoId_idx" ON "horarios_trabalho"("estabelecimentoId");

-- CreateIndex
CREATE INDEX "horarios_trabalho_profissionalId_diaSemana_idx" ON "horarios_trabalho"("profissionalId", "diaSemana");

-- CreateIndex
CREATE UNIQUE INDEX "convites_tokenHash_key" ON "convites"("tokenHash");

-- CreateIndex
CREATE INDEX "convites_estabelecimentoId_idx" ON "convites"("estabelecimentoId");

-- CreateIndex
CREATE INDEX "convites_profissionalId_idx" ON "convites"("profissionalId");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_estabelecimentoId_key" ON "assinaturas"("estabelecimentoId");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissionais" ADD CONSTRAINT "profissionais_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissionais" ADD CONSTRAINT "profissionais_usuarioId_estabelecimentoId_fkey" FOREIGN KEY ("usuarioId", "estabelecimentoId") REFERENCES "usuarios"("id", "estabelecimentoId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicos" ADD CONSTRAINT "servicos_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissional_servicos" ADD CONSTRAINT "profissional_servicos_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissional_servicos" ADD CONSTRAINT "profissional_servicos_profissionalId_estabelecimentoId_fkey" FOREIGN KEY ("profissionalId", "estabelecimentoId") REFERENCES "profissionais"("id", "estabelecimentoId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissional_servicos" ADD CONSTRAINT "profissional_servicos_servicoId_estabelecimentoId_fkey" FOREIGN KEY ("servicoId", "estabelecimentoId") REFERENCES "servicos"("id", "estabelecimentoId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horarios_funcionamento" ADD CONSTRAINT "horarios_funcionamento_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horarios_trabalho" ADD CONSTRAINT "horarios_trabalho_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horarios_trabalho" ADD CONSTRAINT "horarios_trabalho_profissionalId_estabelecimentoId_fkey" FOREIGN KEY ("profissionalId", "estabelecimentoId") REFERENCES "profissionais"("id", "estabelecimentoId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convites" ADD CONSTRAINT "convites_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convites" ADD CONSTRAINT "convites_profissionalId_estabelecimentoId_fkey" FOREIGN KEY ("profissionalId", "estabelecimentoId") REFERENCES "profissionais"("id", "estabelecimentoId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Regras que o Prisma não expressa no schema: valem no banco, não só na aplicação.
-- ---------------------------------------------------------------------------

ALTER TABLE "estabelecimentos"
  ADD CONSTRAINT "estabelecimentos_slug_formato_chk"
    CHECK (char_length("slug") BETWEEN 3 AND 40 AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "estabelecimentos_regras_chk"
    CHECK ("antecedenciaMinMin" >= 0 AND "prazoCancelamentoMin" >= 0);

ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_email_minusculo_chk" CHECK ("email" = lower("email"));

ALTER TABLE "servicos"
  ADD CONSTRAINT "servicos_duracao_chk" CHECK ("duracaoMin" BETWEEN 5 AND 1440);

ALTER TABLE "profissional_servicos"
  ADD CONSTRAINT "profissional_servicos_preco_chk" CHECK ("precoCentavos" >= 0);

ALTER TABLE "horarios_funcionamento"
  ADD CONSTRAINT "horarios_funcionamento_faixa_chk"
    CHECK ("diaSemana" BETWEEN 0 AND 6 AND "inicioMin" >= 0 AND "fimMin" <= 1440 AND "fimMin" > "inicioMin");

ALTER TABLE "horarios_trabalho"
  ADD CONSTRAINT "horarios_trabalho_faixa_chk"
    CHECK ("diaSemana" BETWEEN 0 AND 6 AND "inicioMin" >= 0 AND "fimMin" <= 1440 AND "fimMin" > "inicioMin");
